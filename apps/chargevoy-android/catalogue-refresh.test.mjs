import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./src/catalogue-refresh.js',import.meta.url),'utf8');
function snapshot(date='2026-10-12T00:00:00Z') {
 return {publication_time:date,stations:Array.from({length:8000},(_,i)=>({id:'s'+i,latitude:39,longitude:-8})),connectors:Array.from({length:17000},(_,i)=>({id:'c'+i,station_id:'s'+i%8000}))};
}
function setup(fetch) {
 const database={value:null};
 const indexedDB={open(){const request={};queueMicrotask(()=>{request.result={transaction(){const tx={objectStore(){return {put(value){database.value=value;return{}},get(){return {get result(){return database.value}}}}}};queueMicrotask(()=>tx.oncomplete());return tx},close(){}};request.onsuccess();});return request;}};
 const values=new Map(),context=vm.createContext({Date,AbortSignal,fetch,indexedDB,console:{warn(){}},localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}});
 vm.runInContext(source,context);return {context,api:context.ChargeVoyCatalogue,values};
}
test('rejects partial, duplicate, orphan, invalid coordinates, older and regressive catalogues',()=>{
 const {api}=setup(),good=snapshot();assert(api.validate(good));
 for(const mutate of [s=>s.stations.pop(),s=>s.stations[1].id=s.stations[0].id,s=>s.connectors[1].id=s.connectors[0].id,s=>s.connectors[0].station_id='missing',s=>s.stations[0].latitude=null,s=>s.stations[0].longitude=0,s=>s.publication_time='bad']) {
  const bad=structuredClone(good);mutate(bad);assert.equal(api.validate(bad),false);
 }
 assert.equal(api.validate(snapshot('2026-10-11T00:00:00Z'),good),false);
 const bigger=structuredClone(good);bigger.stations.push(...Array.from({length:1000},(_,i)=>({id:'extra'+i,latitude:39,longitude:-8})));
 assert.equal(api.validate(good,bigger),false);
});
test('background update installs only a complete newer payload and checks at most once per day',async()=>{
 let requests=0,installed=0;const newer=snapshot();const {api}=setup(async()=>{requests++;return{ok:true,json:async()=>newer}});
 assert(await api.refresh(snapshot('2026-10-10T00:00:00Z'),()=>installed++));
 assert.equal(installed,1);assert.equal(await api.refresh(newer,()=>installed++),false);assert.equal(requests,1);
});
test('offline or invalid responses retain the previous copy and do not record a successful check',async()=>{
 for(const fetch of [async()=>{throw Error('offline')},async()=>({ok:true,json:async()=>({stations:[]})}),async()=>({ok:true,json:async()=>snapshot('2026-10-10T00:00:00Z')})]) {
  const {api,values}=setup(fetch);assert.equal(await api.refresh(snapshot(),()=>{throw Error('must not install')}),false);assert.equal(values.size,0);
 }
});
test('native catalogue GET uses Capacitor HTTP with bounded timeouts, without D1 or authentication',async()=>{
 const {context,api}=setup(()=>{throw Error('browser fetch not expected')});let calls=0;
 context.Capacitor={isNativePlatform:()=>true,Plugins:{CapacitorHttp:{get:async options=>{calls++;assert(options.url.endsWith('/assets/stations-snapshot.json'));assert.equal(options.readTimeout,15000);assert.equal(options.connectTimeout,15000);return {status:200,data:snapshot()}}}}};
 assert(await api.refresh(null,()=>{}));assert.equal(calls,1);
});

test('failed persistent cache does not suppress the next-launch refresh',async()=>{
 let installs=0;const {context,api,values}=setup(async()=>({ok:true,json:async()=>snapshot()}));context.indexedDB=null;
 assert(await api.refresh(null,()=>installs++));assert.equal(installs,1);assert.equal(values.size,0);
});
