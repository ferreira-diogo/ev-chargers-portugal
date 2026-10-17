import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('./src/account.js',import.meta.url),'utf8');
test('late 401 from previous session never clears a newer account session',async()=>{
 let storedToken='old',release,clears=0;const headers=[];
 const window={ChargeVoyAndroidConfig:{accountApi:'https://accounts.test'},Capacitor:{Plugins:{ChargeVoyIdentity:{async getSession(){return {token:storedToken};},async clearSession(){clears++;}}}},dispatchEvent(){}};
 const fetch=async(url,options)=>{
  headers.push(options.headers.Authorization);
  if(headers.length===1)return new Promise(resolve=>{release=resolve;});
  return Response.json({user:{id:'new-user'}});
 };
 vm.runInContext(code,vm.createContext({window,fetch,Event,AbortSignal}));
 const old=window.ChargeVoyAccount.restore();await new Promise(resolve=>setImmediate(resolve));
 storedToken='new';await window.ChargeVoyAccount.restore();
 release(Response.json({error:'expired'},{status:401}));await assert.rejects(old);
 assert.equal(clears,0);await window.ChargeVoyAccount.request('/preferences');assert.equal(headers.at(-1),'Bearer new');
});
test('CAS errors preserve revision snapshot and current-session 401 still logs out',async()=>{
 let clears=0,status=409;
 const data={error:'conflict',revision:3,preferences:{language:'en'}};
 const window={ChargeVoyAndroidConfig:{accountApi:'https://accounts.test'},Capacitor:{Plugins:{ChargeVoyIdentity:{async clearSession(){clears++;}}}},dispatchEvent(){}};
 vm.runInContext(code,vm.createContext({window,fetch:async()=>Response.json(data,{status}),Event,AbortSignal}));
 await assert.rejects(window.ChargeVoyAccount.request('/preferences'),e=>e.status===409 && e.data.revision===3);
 assert.equal(clears,0);status=401;await assert.rejects(window.ChargeVoyAccount.request('/me'));assert.equal(clears,1);
});
