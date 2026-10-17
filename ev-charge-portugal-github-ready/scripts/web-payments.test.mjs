import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../assets/payments.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../assets/chargevoy.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../assets/web-app-ui.js',import.meta.url),'utf8');
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
function context(store=storage()){const c=vm.createContext({localStorage:store});vm.runInContext(source,c);return c;}
test('selection survives restart, empty selection allows no providers, All is explicit',()=>{
 const store=storage(),p=context(store).ChargeVoyPayments;
 assert(p.includes('a'));p.save('selected',['b']);assert(!p.includes('a'));assert(p.includes('b'));
 assert(context(store).ChargeVoyPayments.includes('b'));assert(!context(store).ChargeVoyPayments.includes('a'));
 p.save('selected',[]);assert(!p.includes('b'));p.save('all');assert(p.includes('a'));
});
test('guest choices never populate an account; accounts and logout remain isolated',()=>{
 const p=context().ChargeVoyPayments;p.save('selected',['guest-card']);p.setOwner('alice');assert.equal(p.get().mode,'all');
 p.save('selected',['alice-card']);p.setOwner('bob');p.save('selected',['bob-card']);p.setOwner('alice');assert(p.includes('alice-card'));assert(!p.includes('bob-card'));
 p.removeOwner('alice');p.setOwner('alice');assert.equal(p.get().mode,'all');p.setOwner(null);assert(p.includes('guest-card'));assert(!p.includes('bob-card'));
});
test('failed persistence never reports or applies an accepted selection',()=>{
 const p=context({getItem:()=>null,setItem:()=>{throw Error('full');},removeItem:()=>{}}).ChargeVoyPayments;
 assert.throws(()=>p.save('selected',[]));assert.equal(p.get().mode,'all');
 assert.throws(()=>p.save('selected',['bad/id']));
});
test('actual recommendation and calculator honour selected provider, never fallback to cheaper unselected offers',()=>{
 const c=context();Object.assign(c,{currentVehicle:{max_ac_power_kw:11,max_dc_power_kw:100},operatorMap:new Map(),selectedStation:null,scenario:{period:'fora_vazio'},cache:new Map(),connectorCategory:x=>x,compatibleConnectors:s=>s.connectors||[]});
 const extract=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));
 vm.runInContext(extract('function operatorDisplayName(','function cardSourceLink('),c);
 vm.runInContext(extract('function calculateCardPrice(','function adHocPriceMarkup('),c);
 vm.runInContext(ui.slice(ui.indexOf('function priced('),ui.indexOf('function openStation(')),c);
 c.cemeCards=[{id:'cheap',pricing_mode:'final_fixed',fixed_fast_eur_kwh:.1,network_scope:'national_fast',valid_to:'2099-12-31'},{id:'mine',pricing_mode:'final_fixed',fixed_fast_eur_kwh:.5,network_scope:'national_fast',valid_to:'2099-12-31'}];
 const station={id:'nap-test',source:'nap-mobie',connectors:[{type:'CCS',power_kw:100}]},row={station,energy:20,total:null,card:null};
 assert.equal(c.priced(row).total,2);c.ChargeVoyPayments.save('selected',['mine']);assert.equal(c.priced(row).total,10);assert.equal(c.priced(row).card.id,'mine');
 assert.equal(c.calculateCardPrice(c.cemeCards[0],{connector_type:'CCS',power_kw:100},{energyKwh:20},'fora_vazio',station),null);
 c.ChargeVoyPayments.save('selected',[]);assert.equal(c.priced(row).total,null);
 c.ChargeVoyPayments.save('selected',['unknown']);assert.equal(c.priced(row).total,null);
});
