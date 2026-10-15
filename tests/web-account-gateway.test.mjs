import test from 'node:test';
import assert from 'node:assert/strict';
import {accountGateway} from '../ev-charge-portugal-github-ready/worker/accounts.js';
import website from '../ev-charge-portugal-github-ready/worker/index.js';
const token='a'.repeat(43),origin='https://chargevoy.pt';
const req=(path,method='GET',headers={},body)=>new Request(origin+'/api/account'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
test('published Worker routes login preparation through its service binding, with no public-fetch fallback',async()=>{
 let calls=0;
 const binding={async fetch(url,options){assert.equal(this,binding);calls++;assert.equal(url,'https://chargevoy-android-accounts-staging.zombid.workers.dev/challenge');assert.equal(options.headers.get('Origin'),null);assert.equal(options.headers.get('CF-Connecting-IP'),'192.0.2.44');return Response.json({nonce:'n'.repeat(43)});}};
 const response=await website.fetch(req('/challenge','POST',{'CF-Connecting-IP':'192.0.2.44'},{}),{ACCOUNT_SERVICE:binding});
 assert.equal(response.status,200);assert.equal((await response.json()).nonce.length,43);assert.equal(calls,1);
 assert.equal((await website.fetch(req('/me'),{})).status,503);
});
test('login sets a bounded secure HttpOnly host cookie and never returns its session token to JS',async()=>{
 const response=await accountGateway(req('/google','POST',{}, {idToken:'google-token',nonce:token}),async(url,options)=>{
  assert.equal(url,'https://chargevoy-android-accounts-staging.zombid.workers.dev/google');
  assert(!options.headers.has('Cookie'));assert(!options.headers.has('Origin'));
  return Response.json({token,expiresAt:Math.floor(Date.now()/1000)+999999,user:{id:'alice'}});
 });
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.match(response.headers.get('Set-Cookie'),/^__Host-chargevoy_session=a+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200$/);
 assert.deepEqual(await response.json(),{expiresAt:Math.floor(Date.now()/1000)+999999,user:{id:'alice'}});
});
test('gateway ignores caller authorization; only the protected cookie becomes a native bearer',async()=>{
 const response=await accountGateway(req('/favorites','GET',{Cookie:'other=1; __Host-chargevoy_session='+token,Authorization:'Bearer attacker','X-ChargeVoy-Expected-User':'alice'}),async(url,options)=>{
  assert.equal(options.headers.get('Authorization'),'Bearer '+token);assert.equal(options.headers.get('X-ChargeVoy-Expected-User'),'alice');
  return Response.json({favorites:['nap-test']});
 });assert.equal(response.status,200);
});
test('cross-site mutations, absent Origin, unexpected paths and oversized payloads never reach upstream',async()=>{
 let calls=0;const upstream=async()=>{calls++;return Response.json({});};
 for(const headers of [{Origin:'https://evil.test'},{Origin:'null'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await accountGateway(req('/logout','POST',headers,{}),upstream)).status,403);
 assert.equal((await accountGateway(new Request(origin+'/api/account/logout',{method:'POST'}),upstream)).status,403);
 assert.equal((await accountGateway(req('/../secrets'),upstream)).status,405);
 assert.equal((await accountGateway(req('/favorites/nap-1','POST'),upstream)).status,405);
 assert.equal((await accountGateway(req('/google','POST',{}, {idToken:'a'.repeat(16001)}),upstream)).status,413);
 assert.equal(calls,0);
});
test('logout/deletion clear cookies only on success; a late 401 cannot erase a newer login cookie',async()=>{
 for(const [path,method] of [['/logout','POST'],['/me','DELETE']]){
  const r=await accountGateway(req(path,method,{},method==='POST'?{}:undefined),async()=>Response.json({ok:true}));
  assert.match(r.headers.get('Set-Cookie'),/Max-Age=0/);
 }
 const expired=await accountGateway(req('/favorites'),async()=>Response.json({error:'expired'},{status:401}));
 assert.equal(expired.headers.get('Set-Cookie'),null);
 const failure=await accountGateway(req('/me','DELETE'),async()=>{throw Error('offline');});
 assert.equal(failure.status,503);assert.equal(failure.headers.get('Set-Cookie'),null);
});
