import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyLiveSnapshot} from './verify-live-snapshot.mjs';
const site='https://web.example',api='https://api.example',clock=Date.parse('2026-10-17T20:00:00Z');
function fixture({age=2,catalogue={stations:Array(8000).fill({}),connectors:Array(15000).fill({})},points=10000,manifestPatch={}}={}){
 const bytes=Buffer.from(JSON.stringify(catalogue));
 const manifest={sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,stations:catalogue.stations?.length,connectors:catalogue.connectors?.length,...manifestPatch};
 const live={publication_time:new Date(clock-age*60000).toISOString(),statuses:Object.fromEntries(Array.from({length:points},(_,i)=>['point-'+i,'available']))};
 const urls=[];const fetchImpl=async url=>{urls.push(url);if(url===site+'/')return new Response('<script src="assets/chargevoy.js"></script>');if(url.endsWith('/stations-manifest.json'))return Response.json(manifest);if(url.endsWith('/stations-snapshot.json'))return new Response(bytes);if(url===api+'/api/availability')return Response.json(live);throw Error('Unexpected URL '+url);};
 return {urls,options:{site:site+'/',api:api+'/',fetchImpl,now:()=>clock,warn:()=>{},reportError:()=>{}}};
}
test('verifies deployed service, exact catalogue hash/counts and the API shared with Android',async()=>{
 const f=fixture(),r=await verifyLiveSnapshot(f.options);assert.equal(r.ok,true);assert.equal(r.stations,8000);assert.equal(r.live_points,10000);assert.equal(r.availability_age_minutes,2);assert.deepEqual(f.urls,[site+'/',site+'/assets/stations-manifest.json',site+'/assets/stations-snapshot.json',api+'/api/availability']);
});
test('a WAF challenge is reported as a challenge, never passed or mistaken for JSON',async()=>{
 const reports=[];let calls=0;const f=fixture();f.options.reportError=x=>reports.push(JSON.parse(x));f.options.fetchImpl=async()=>{calls++;return new Response('Just a moment',{status:403,headers:{'cf-mitigated':'challenge'}});};
 await assert.rejects(verifyLiveSnapshot(f.options),/HTTP 403/);assert.equal(calls,1);assert.equal(reports[0].headers['cf-mitigated'],'challenge');
});
test('checksum mismatch, incomplete catalogue and missing arrays fail closed',async()=>{
 for(const options of [{manifestPatch:{sha256:'wrong'}},{catalogue:{stations:Array(7999).fill({}),connectors:Array(15000).fill({})}},{catalogue:{}}])await assert.rejects(verifyLiveSnapshot(fixture(options).options),/snapshot|catalogue/);
});
test('stale, future, missing or incomplete availability remains a real monitoring failure',async()=>{
 for(const options of [{age:21},{age:-6},{points:9999}])await assert.rejects(verifyLiveSnapshot(fixture(options).options),/Availability source/);
 const f=fixture(),original=f.options.fetchImpl;f.options.fetchImpl=async url=>url.endsWith('/api/availability')?Response.json({statuses:{}}):original(url);await assert.rejects(verifyLiveSnapshot(f.options),/Availability source/);
});
test('five-to-twenty-minute readings are explicitly warned about, not claimed to be live',async()=>{
 const f=fixture({age:8}),warnings=[];f.options.warn=x=>warnings.push(x);const r=await verifyLiveSnapshot(f.options);assert.equal(r.availability_age_minutes,8);assert.equal(warnings.length,1);assert.match(warnings[0],/last reading/);
});
