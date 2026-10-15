import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {SignJWT, generateKeyPair} from 'jose';
import {createWorker, verifyGoogle} from './index.mjs';
function environment() {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec(readFileSync(new URL('./migrations/0001_accounts.sql', import.meta.url),'utf8')); sqlite.exec(readFileSync(new URL('./migrations/0002_preferences.sql', import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('./migrations/0003_web_account_data.sql', import.meta.url),'utf8'));
  const db = {prepare(sql) {let args=[]; const statement=sqlite.prepare(sql); return {bind(...values){args=values;return this;}, async first(){return statement.get(...args)||null;},async all(){return {results:statement.all(...args)};},async run(){return statement.run(...args);}};}, async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  return {ACCOUNTS_DB:db,GOOGLE_CLIENT_ID:'client-id',AUTH_LIMITER:{async limit(){return {success:true};}}};
}
async function call(worker,env,path,method='GET',token,body) {return worker.fetch(new Request('https://account.test'+path,{method,headers:{Origin:'https://localhost','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);}
async function login(worker,env,name) {const c=await (await call(worker,env,'/challenge','POST')).json(); const r=await call(worker,env,'/google','POST',null,{idToken:name,nonce:c.nonce});assert.equal(r.status,200);return (await r.json()).token;}
const fixtureVerify = async (token,audience,nonce) => ({sub:token,email:token+'@example.test',name:token});
test('anonymous users and cross-account favourites are isolated; logout revokes access',async()=>{
  const env=environment(),w=createWorker(fixtureVerify);
  assert.equal((await call(w,env,'/favorites')).status,401);
  const a=await login(w,env,'alice'),b=await login(w,env,'bob');
  assert.equal((await call(w,env,'/favorites/nap-test','PUT',a)).status,200);
  assert.deepEqual((await (await call(w,env,'/favorites','GET',b)).json()).favorites,[]);
  await call(w,env,'/favorites/nap-test','DELETE',b);
  assert.deepEqual((await (await call(w,env,'/favorites','GET',a)).json()).favorites,['nap-test']);
  await call(w,env,'/logout','POST',a);
  assert.equal((await call(w,env,'/me','GET',a)).status,401);
});
test('account deletion removes favourites and all sessions without affecting another user',async()=>{
 const env=environment(),w=createWorker(fixtureVerify),a=await login(w,env,'alice'),a2=await login(w,env,'alice'),b=await login(w,env,'bob');
 await call(w,env,'/favorites/nap-test','PUT',a);
 assert.equal((await call(w,env,'/me','DELETE',a)).status,200);
 assert.equal((await call(w,env,'/me','GET',a2)).status,401);
 assert.equal((await call(w,env,'/me','GET',b)).status,200);
 const anew=await login(w,env,'alice');assert.deepEqual((await (await call(w,env,'/favorites','GET',anew)).json()).favorites,[]);
});
test('nonce cannot be reused and invalid tokens are rejected',async()=>{
 const env=environment(),w=createWorker(fixtureVerify),c=await (await call(w,env,'/challenge','POST')).json();
 const body={idToken:'alice',nonce:c.nonce};assert.equal((await call(w,env,'/google','POST',null,body)).status,200);
 assert.equal((await call(w,env,'/google','POST',null,body)).status,401);
 const denied=createWorker(async()=>{throw Error('bad signature');});
 assert.equal((await call(denied,env,'/google','POST',null,{...body,nonce:'a'.repeat(43)})).status,401);
});
test('fails closed without rate limiter and refuses unknown origins',async()=>{
 const env=environment(),w=createWorker(fixtureVerify);delete env.AUTH_LIMITER;
 assert.equal((await call(w,env,'/challenge','POST')).status,503);
 assert.equal((await w.fetch(new Request('https://account.test/me',{headers:{Origin:'https://evil.test'}}),env)).status,403);
});
test('Google signature, nonce, audience, expiry and verification must be valid',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256');
 const make=(claims={})=>new SignJWT({sub:'alice',email:'alice@example.test',email_verified:true,nonce:'nonce',...claims}).setProtectedHeader({alg:'RS256'}).setIssuer('https://accounts.google.com').setAudience('client-id').setIssuedAt().setExpirationTime('5m').sign(privateKey);
 await verifyGoogle(await make(),'client-id','nonce',publicKey);
 await assert.rejects(verifyGoogle(await make(),'wrong-client','nonce',publicKey));
 await assert.rejects(verifyGoogle(await make(),'client-id','wrong-nonce',publicKey));
 await assert.rejects(verifyGoogle(await make({email_verified:false}),'client-id','nonce',publicKey));
 const expired=await new SignJWT({sub:'alice',email:'x',email_verified:true,nonce:'nonce'}).setProtectedHeader({alg:'RS256'}).setIssuer('https://accounts.google.com').setAudience('client-id').setIssuedAt(Math.floor(Date.now()/1000)-600).setExpirationTime(Math.floor(Date.now()/1000)-1).sign(privateKey);
 await assert.rejects(verifyGoogle(expired,'client-id','nonce',publicKey));
 const {publicKey:wrong}=await generateKeyPair('RS256');await assert.rejects(verifyGoogle(await make(),'client-id','nonce',wrong));
});
test('expired sessions, forbidden methods, malformed IDs and favourite limits fail safely',async()=>{
 const env=environment(),w=createWorker(fixtureVerify),a=await login(w,env,'alice');
 assert.equal((await call(w,env,'/favorites/%2Fbad','PUT',a)).status,400);
 assert.equal((await call(w,env,'/challenge','GET')).status,405);
 for(let i=0;i<200;i++)assert.equal((await call(w,env,'/favorites/nap-'+i,'PUT',a)).status,200);
 assert.equal((await call(w,env,'/favorites/nap-overflow','PUT',a)).status,409);
 assert.equal((await call(w,env,'/favorites/nap-0','PUT',a)).status,200);
 await env.ACCOUNTS_DB.prepare('UPDATE sessions SET expires_at=0').run();
 assert.equal((await call(w,env,'/favorites','GET',a)).status,401);
});
test('preferences require login and remain isolated by verified account, never by supplied owner',async()=>{
 const env=environment(),w=createWorker(fixtureVerify);
 assert.equal((await call(w,env,'/preferences')).status,401);
 const a=await login(w,env,'alice'),b=await login(w,env,'bob');
 assert.equal((await call(w,env,'/preferences','PUT',a,{baseRevision:0,changes:{language:'en'}})).status,200);
 assert.deepEqual(await (await call(w,env,'/preferences','GET',b)).json(),{revision:0,preferences:{},updatedAt:null});
 assert.equal((await call(w,env,'/preferences','PUT',b,{userId:'alice',baseRevision:0,changes:{language:'pt'}})).status,400);
});
test('preferences CAS rejects stale devices, including simultaneous initial writes, and preserves other fields',async()=>{
 const env=environment(),w=createWorker(fixtureVerify),a=await login(w,env,'alice');
 const put=(baseRevision,changes)=>call(w,env,'/preferences','PUT',a,{baseRevision,changes});
 const initial=await Promise.all([put(0,{language:'en'}),put(0,{battery:{start:20,target:80}})]);
 assert.deepEqual(initial.map(r=>r.status).sort(),[200,409]);
 const first=await (await call(w,env,'/preferences','GET',a)).json();
 assert.equal(first.revision,1);
 assert.equal((await put(0,{language:'pt'})).status,409);
 const second=await (await put(1,{vehicle:{id:'tesla-model-3',specs:{consumption_wh_km:160}}})).json();
 assert.equal(second.revision,2);assert.deepEqual(second.preferences,{...first.preferences,vehicle:{id:'tesla-model-3',specs:{consumption_wh_km:160}}});
 const cleared=await (await put(2,{vehicle:null})).json();assert.equal(cleared.revision,3);assert(!('vehicle' in cleared.preferences));
});
test('invalid preference fields, types, unknown keys and battery/spec limits cannot be persisted',async()=>{
 const env=environment(),w=createWorker(fixtureVerify),a=await login(w,env,'alice');
 for(const changes of [{language:'es'},{owner:'bob'},{battery:{start:80,target:20}},{battery:{start:20.5,target:80}},{vehicle:{id:'x',specs:{max_dc_power_kw:999}}},{vehicle:{id:'x',specs:{},google_sub:'bob'}},{filters:{powers:['500+'],operators:[],connectors:[],statuses:[]}},{filters:{powers:[],operators:[],connectors:[],statuses:['bad']}},{}])assert.equal((await call(w,env,'/preferences','PUT',a,{baseRevision:0,changes})).status,400,JSON.stringify(changes));
 assert.equal((await call(w,env,'/preferences','PUT',a,{baseRevision:-1,changes:{language:'en'}})).status,400);
 assert.equal((await call(w,env,'/preferences','PUT',a,{baseRevision:0,changes:{filters:{powers:['0-50','50-150'],operators:['Powerdot'],connectors:['CCS'],statuses:['available','unknown']}}})).status,200);
});
test('preference writes are throttled and deletion removes account data without harming another account',async()=>{
 const env=environment(),w=createWorker(fixtureVerify),a=await login(w,env,'alice'),b=await login(w,env,'bob');
 await call(w,env,'/preferences','PUT',a,{baseRevision:0,changes:{language:'en'}});
 await call(w,env,'/preferences','PUT',b,{baseRevision:0,changes:{language:'pt'}});
 env.AUTH_LIMITER.limit=async()=>({success:false});
 assert.equal((await call(w,env,'/preferences','PUT',a,{baseRevision:1,changes:{language:'pt'}})).status,429);
 assert.equal((await call(w,env,'/me','DELETE',a)).status,200);
 assert.equal((await env.ACCOUNTS_DB.prepare('SELECT count(*) AS n FROM user_preferences').first()).n,1);
 assert.equal((await (await call(w,env,'/preferences','GET',b)).json()).preferences.language,'pt');
});

test('web and native sessions resolve the same Google subject without linking matching emails',async()=>{
 const env=environment(),w=createWorker(async(token)=>({sub:token,email:'same@example.test',name:token}));
 const a=await login(w,env,'subject-a'),a2=await login(w,env,'subject-a'),b=await login(w,env,'subject-b');
 const me=async t=>(await (await call(w,env,'/me','GET',t)).json()).user.id;
 assert.equal(await me(a),await me(a2));assert.notEqual(await me(a),await me(b));
 await call(w,env,'/favorites/nap-shared','PUT',a);
 assert.deepEqual((await (await call(w,env,'/favorites','GET',a2)).json()).favorites,['nap-shared']);
});
test('expected owner prevents stale tabs from writing with a different account cookie',async()=>{
 const env=environment(),w=createWorker(fixtureVerify),a=await login(w,env,'alice');
 const r=await w.fetch(new Request('https://account.test/favorites/nap-other',{method:'PUT',headers:{Authorization:'Bearer '+a,'X-ChargeVoy-Expected-User':'bob'}}),env);
 assert.equal(r.status,409);assert.deepEqual((await (await call(w,env,'/favorites','GET',a)).json()).favorites,[]);
});
test('history is bounded to twenty summaries, isolated and validates client-supplied fields',async()=>{
 const env=environment(),w=createWorker(fixtureVerify),a=await login(w,env,'alice'),b=await login(w,env,'bob');
 const route={origin_label:'Marinha Grande',destination_label:'Lisboa',distance_km:135.5,charging_minutes:12};
 assert.equal((await call(w,env,'/history','POST',null,route)).status,401);
 for(const invalid of [{...route,user_id:'bob'},{...route,origin_lat:39},{...route,distance_km:-1},{...route,charging_minutes:1.5},{...route,origin_label:'a'.repeat(301)}])assert.equal((await call(w,env,'/history','POST',a,invalid)).status,400);
 for(let i=0;i<25;i++)assert.equal((await call(w,env,'/history','POST',a,{...route,origin_label:String(i)})).status,200);
 assert.equal((await (await call(w,env,'/history','GET',a)).json()).history.length,20);
 assert.equal((await env.ACCOUNTS_DB.prepare('SELECT count(*) AS n FROM account_route_history').first()).n,20);
 assert.deepEqual((await (await call(w,env,'/history','GET',b)).json()).history,[]);
});
test('public reviews expose no identities, validate ratings and account deletion removes all new private data',async()=>{
 const env=environment(),w=createWorker(fixtureVerify),a=await login(w,env,'alice'),b=await login(w,env,'bob');
 assert.equal((await call(w,env,'/reviews/nap-1','PUT',null,{rating:5,comment:'bom'})).status,401);
 for(const review of [{rating:6,comment:null},{rating:4,comment:'a'.repeat(1001)},{rating:5,comment:null,user_id:'bob'}])assert.equal((await call(w,env,'/reviews/nap-1','PUT',a,review)).status,400);
 await call(w,env,'/reviews/nap-1','PUT',a,{rating:5,comment:'ótimo'});
 await call(w,env,'/reviews/nap-1','PUT',a,{rating:3,comment:'atualizado'});
 await call(w,env,'/reviews/nap-1','PUT',b,{rating:5,comment:null});
 const publicData=await (await call(w,env,'/reviews/nap-1')).json();assert.equal(publicData.summary.review_count,2);assert.equal(publicData.summary.average_rating,4);
 assert(publicData.reviews.every(x=>!('user_id' in x)&&!('email' in x)));
 await call(w,env,'/history','POST',a,{origin_label:'a',destination_label:'b',distance_km:1,charging_minutes:0});
 await call(w,env,'/me','DELETE',a);
 assert.equal((await env.ACCOUNTS_DB.prepare('SELECT count(*) AS n FROM account_route_history').first()).n,0);
 assert.equal((await (await call(w,env,'/reviews/nap-1')).json()).summary.review_count,1);
});

test('health is ready only after all additive account tables exist',async()=>{
 const env=environment(),w=createWorker(fixtureVerify);
 assert.equal((await call(w,env,'/health')).status,200);
 await env.ACCOUNTS_DB.prepare('DROP TABLE account_route_history').run();
 const r=await call(w,env,'/health');assert.equal(r.status,503);assert.equal((await r.json()).schemaReady,false);
});
