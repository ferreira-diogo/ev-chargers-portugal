import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const src=name=>readFileSync(new URL('../ev-charge-portugal-github-ready/assets/'+name,import.meta.url),'utf8');
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data};};
function favourites(request,store=storage()){
 const ctx=vm.createContext({});vm.runInContext(src('account-favorites.js'),ctx);let ids=[],status;
 return {client:ctx.ChargeVoyFavorites.create({request,storage:store,apply:value=>{ids=Array.from(value);},status:s=>status=s}),ids:()=>ids,status:()=>status,store};
}
test('guest data is not imported; offline favourite edits persist per account and deletions are not resurrected',async()=>{
 let remote=['nap-1','nap-2'],offline=true;const request=async(path,options)=>{
  if(offline)throw Error('offline');
  if(path==='/favorites')return {favorites:remote};
  const id=path.slice('/favorites/'.length);remote=options.method==='PUT'?[...new Set([...remote,id])]:remote.filter(x=>x!==id);return {ok:true};
 };
 const store=storage();store.setItem('ev-charge-favorites','["nap-guest"]');const f=favourites(request,store);f.client.attach('alice');
 assert.deepEqual(f.ids(),[]);f.client.change('nap-1',false);f.client.change('nap-3',true);await f.client.sync();assert.equal(f.status(),'pending');
 const restarted=favourites(request,store);restarted.client.attach('alice');offline=false;await restarted.client.sync();
 assert.deepEqual(remote.sort(),['nap-2','nap-3']);assert.equal(restarted.status(),'synced');
 restarted.client.attach('bob');assert.deepEqual(restarted.ids(),[]);assert.equal(store.getItem('ev-charge-favorites'),'["nap-guest"]');
});
test('a delayed favourites response from the old account cannot paint or modify the new account cache',async()=>{
 let release;const f=favourites(()=>new Promise(resolve=>{release=resolve;}));f.client.attach('alice');const work=f.client.sync();f.client.attach('bob');release({favorites:['nap-alice']});await work;
 assert.deepEqual(f.ids(),[]);assert.equal(f.store.getItem('chargevoy-favorites-v1:bob'),null);
});
test('storage failure is explicit and cannot show an unsaved favourite as accepted',()=>{
 const f=favourites(async()=>({favorites:[]}),{getItem:()=>null,setItem(){throw Error('full');}});f.client.attach('alice');assert.throws(()=>f.client.change('nap-test',true));assert.equal(f.status(),'storage-error');assert.deepEqual(f.ids(),[]);
});
function browserClient(fetcher,store=storage()){
 const window=new EventTarget();const context=vm.createContext({window,fetch:fetcher,localStorage:store,CustomEvent,AbortSignal,setTimeout,clearTimeout});vm.runInContext(src('account.js'),context);return {account:window.ChargeVoyAccount,window,store};
}
test('browser session requests are same-origin cookies with an expected owner and personal storage is scoped',async()=>{
 const calls=[];const b=browserClient(async(url,options)=>{calls.push({url,options});return Response.json({user:{id:'alice'}});});
 b.store.setItem('ev-charge-vehicle','guest-car');await b.account.restore();b.account.storage.setItem('ev-charge-vehicle','alice-car');await b.account.request('/favorites');
 assert.equal(b.store.getItem('ev-charge-vehicle'),'guest-car');assert.equal(b.store.getItem('chargevoy-web:alice:ev-charge-vehicle'),'alice-car');
 assert.equal(calls[1].options.headers['X-ChargeVoy-Expected-User'],'alice');assert.equal(calls[1].options.credentials,'same-origin');assert(!('Authorization' in calls[1].options.headers));
});
test('an expired response from the old session cannot clear a newer restored account',async()=>{
 let user='alice',release;const b=browserClient(async url=>url.endsWith('/favorites')?new Promise(resolve=>{release=resolve;}):Response.json({user:{id:user}}));
 await b.account.restore();const old=b.account.request('/favorites');user='bob';await b.account.restore();
 // Simulate a new auth generation via a normal logout/restore boundary.
 // Restore itself must also distinguish a verified account change.
 release(Response.json({error:'expired'},{status:401}));await assert.rejects(old);
 assert.equal(b.account.getSession()?.user?.id,'bob');
});

test('failed remote cache writes cannot be reported as locally saved or synced',async()=>{
 const f=favourites(async()=>({favorites:['nap-test']}),{getItem:()=>null,setItem(){throw Error('quota');}});f.client.attach('alice');await f.client.sync();assert.equal(f.status(),'storage-error');
 const context=vm.createContext({});vm.runInContext(src('preferences-sync.js'),context);let status;
 const client=context.ChargeVoyPreferences.create({request:async()=>({revision:1,preferences:{language:'en'}}),storage:{getItem:()=>null,setItem(){throw Error('quota');}},apply(){},status:s=>status=s});
 client.attach('alice');await client.sync();assert.equal(status,'storage-error');
});
