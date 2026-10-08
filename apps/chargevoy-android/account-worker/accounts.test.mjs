import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {SignJWT, generateKeyPair} from 'jose';
import {createWorker, verifyGoogle} from './index.mjs';
function environment() {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec(readFileSync(new URL('./migrations/0001_accounts.sql', import.meta.url),'utf8'));
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
