import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('./src/preferences-sync.js',import.meta.url),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
function fixture(request,stored=new Map()) {
 const context=vm.createContext({});vm.runInContext(code,context);
 const applied=[],statuses=[];
 const storage={getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
 return {engine:context.ChargeVoyPreferences.create({request,storage,apply:p=>applied.push(plain(p)),status:s=>statuses.push(s)}),applied,statuses,stored,storage};
}
const reply=(revision,preferences)=>({revision,preferences});
test('guest settings never upload automatically and owners restore only their own queued preferences',async()=>{
 const calls=[];const f=fixture(async(path,opts)=>{calls.push(opts);return reply(0,{});});
 f.engine.change({language:'en'});await f.engine.sync();assert.equal(calls.length,0);
 f.engine.attach('alice');f.engine.change({language:'en'});
 f.engine.attach('bob');assert.deepEqual(f.applied.at(-1),{});
 await f.engine.sync();assert.equal(calls.length,1);assert.equal(calls[0],undefined);
 f.engine.attach('alice');assert.deepEqual(f.applied.at(-1),{language:'en'});
});
test('offline changes survive process restart and replay after reading latest server revision',async()=>{
 const f=fixture(async()=>{throw Error('offline');});f.engine.attach('alice');f.engine.change({battery:{start:20,target:80}});await f.engine.sync();assert.equal(f.statuses.at(-1),'pending');
 const calls=[];const restart=fixture(async(path,opts)=>{calls.push(opts);return opts?reply(5,{language:'en',battery:{start:20,target:80}}):reply(4,{language:'en'});},f.stored);
 restart.engine.attach('alice');await restart.engine.sync();
 assert.deepEqual(JSON.parse(calls[1].body),{baseRevision:4,changes:{battery:{start:20,target:80}}});
 assert.deepEqual(restart.applied.at(-1),{language:'en',battery:{start:20,target:80}});assert.equal(restart.statuses.at(-1),'synced');
 assert.deepEqual(JSON.parse([...f.stored.values()][0]).pending,{});
});
test('a revision conflict rebases only dirty groups and never discards unrelated remote settings',async()=>{
 let puts=0;const changes=[];
 const f=fixture(async(path,opts)=>{
  if(!opts)return reply(1,{language:'pt'});
  changes.push(JSON.parse(opts.body));
  if(!puts++)throw Object.assign(Error('conflict'),{status:409,data:reply(2,{language:'pt',battery:{start:35,target:90}})});
  return reply(3,{language:'en',battery:{start:35,target:90}});
 });
 f.engine.attach('alice');f.engine.change({language:'en'});await f.engine.sync();
 assert.deepEqual(changes,[{baseRevision:1,changes:{language:'en'}},{baseRevision:2,changes:{language:'en'}}]);
 assert.deepEqual(f.applied.at(-1),{language:'en',battery:{start:35,target:90}});
});
test('late response after account switch cannot apply, write or change new owner status',async()=>{
 let release;const f=fixture(()=>new Promise(resolve=>{release=resolve;}));
 f.engine.attach('alice');const pending=f.engine.sync();f.engine.attach('bob');const count=f.applied.length;
 release(reply(3,{language:'en'}));await pending;
 assert.equal(f.applied.length,count);assert.equal(f.stored.size,0);assert.equal(f.statuses.at(-1),'local');
});
test('edits during a request are retained, repeated conflicts and retries are bounded',async()=>{
 let release;let puts=0;
 const f=fixture(async(path,opts)=>{
  if(!opts)return reply(1,{});
  if(++puts===1)return new Promise(resolve=>{release=resolve;});
  throw Object.assign(Error('conflict'),{status:409,data:reply(3,{})});
 });
 f.engine.attach('alice');f.engine.change({language:'en'});const sync=f.engine.sync();
 await new Promise(resolve=>setImmediate(resolve));f.engine.change({language:'pt'});release(reply(2,{language:'en'}));await sync;
 assert.equal(puts,2);assert.equal(f.statuses.at(-1),'pending');assert.equal(JSON.parse([...f.stored.values()][0]).pending.language,'pt');
});
test('cache deletion, malformed responses, expired login and unavailable old service stay explicit',async()=>{
 for(const [error,expected] of [[{status:401},'login-required'],[{status:404},'unavailable'],[{},'pending']]) {
  const f=fixture(async()=>{throw error;});f.engine.attach('alice');f.engine.change({language:'en'});await f.engine.sync();assert.equal(f.statuses.at(-1),expected);
  f.engine.remove('alice');assert.equal(f.stored.size,0);
 }
 const f=fixture(async()=>({revision:-1,preferences:{}}));f.engine.attach('alice');await f.engine.sync();assert.equal(f.statuses.at(-1),'pending');
});
test('storage failure never reports a durable save or silently queues an unpersisted change',()=>{
 const f=fixture(async()=>reply(0,{}));f.engine.attach('alice');f.storage.setItem=()=>{throw Error('quota');};
 assert.throws(()=>f.engine.change({language:'en'}),/quota/);assert.equal(f.statuses.at(-1),'storage-error');
 f.storage.setItem=(k,v)=>f.stored.set(k,v);f.engine.change({battery:{start:20,target:80}});
 assert.deepEqual(JSON.parse([...f.stored.values()][0]).pending,{battery:{start:20,target:80}});
});
