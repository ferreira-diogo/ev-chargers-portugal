import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const app=readFileSync(new URL('./src/chargevoy.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('./src/android-ui.js',import.meta.url),'utf8');
const continente=JSON.parse(readFileSync(new URL('./src/continente-tariff.json',import.meta.url),'utf8'));
const extract=(name,end)=>app.slice(app.indexOf('function '+name+'('),app.indexOf(end,app.indexOf('function '+name+'(')));
function pricing(){const c=vm.createContext({currentVehicle:{max_ac_power_kw:11,max_dc_power_kw:170},selectedStation:null,operatorMap:new Map([['mch','Modelo Continente Hipermercados, S.A.'],['edp','EDP']])});vm.runInContext(extract('operatorDisplayName','function cardSourceLink('),c);vm.runInContext(extract('calculateCardPrice','function adHocPriceMarkup('),c);return c;}
test('multiple ranges are OR, with non-overlapping edges and All keeping unknown power visible',()=>{
 const c=vm.createContext({selectedPower:'0-50|150-250'});vm.runInContext(extract('matchesPower','function stationMaxPowerKw'),c);
 for(const p of [1,22,50,151,250])assert(c.matchesPower(p),String(p));for(const p of [0,51,150,251])assert(!c.matchesPower(p),String(p));
 c.selectedPower='50-150|250+';for(const p of [51,150,251,350])assert(c.matchesPower(p));for(const p of [50,151,250])assert(!c.matchesPower(p));
 c.selectedPower='all';assert(c.matchesPower(0));
});
test('Continente identity is an operator alias, never inferred from a supermarket station name',()=>{
 const c=pricing();for(const name of ['Modelo Continente Hipermercados, S.A.','Continente Hipermercados, S.A.','Continente Plug&Charge'])assert.equal(c.operatorDisplayName(name),'Continente Plug&Charge');
 assert(!c.isContinenteStation({operator_id:'edp',name:'Continente Leiria'}));assert(c.isContinenteStation({operator_id:'mch'}));
});
test('Continente actual payment excludes conditional cashback and includes no extra OPC or taxes',()=>{
 const c=pricing(),s={operator_id:'mch'},scenario={energyKwh:20};
 for(const [type,power,rate] of [['Type 2',22,.35],['CCS',50,.41],['CHAdeMO',120,.41]]){
 const p=c.calculateCardPrice(continente,{connector_type:type,power_kw:power},scenario,'fora_vazio',s);assert.equal(p.total,20*rate);assert.equal(p.conditionalBenefit,2);assert.equal(p.opcCost,0);assert.equal(p.tar,0);assert.equal(p.iec,0);assert.equal(p.cashback,0);
 }
});
test('uncertain ultrafast, unknown power, incompatible network and non-Continente CEME are excluded',()=>{
 const c=pricing(),s={operator_id:'mch'},scenario={energyKwh:20};
 for(const [type,power] of [['CCS',150],['CCS',350],['CCS',0],['Type 2',43],['Tesla',120]])assert.equal(c.calculateCardPrice(continente,{connector_type:type,power_kw:power},scenario,'fora_vazio',s),null);
 assert.equal(c.calculateCardPrice(continente,{connector_type:'CCS',power_kw:50},scenario,'fora_vazio',{operator_id:'edp'}),null);
 assert.equal(c.calculateCardPrice({id:'ceme',pricing_mode:'final_fixed',fixed_fast_eur_kwh:.55,network_scope:'national_fast'},{connector_type:'CCS',power_kw:50},scenario,'fora_vazio',s),null);
 assert.equal(c.calculateCardPrice(continente,{connector_type:'CCS',power_kw:50},{energyKwh:NaN},'fora_vazio',s),null);
});
test('candidate pricing works for Continente AC without OPC and preserves physical member eligibility',()=>{
 const c=pricing();Object.assign(c,{cemeCards:[continente],scenario:{period:'fora_vazio'},cache:new Map(),connectorCategory:x=>x,compatibleConnectors:s=>s.connectors||[]});
 vm.runInContext(ui.slice(ui.indexOf('function priced('),ui.indexOf('function openStation(')),c);
 const station={id:'ac',operator_id:'mch',source:'nap-mobie',connectors:[{type:'Type 2',power_kw:22}]};
 assert.equal(c.priced({station,energy:20,total:null}).total,7);
 assert.equal(c.priced({station:{...station,connectors:[{type:'CCS',power_kw:240}]},energy:20,total:null}).total,null);
 const grouped={_location_members:[{...station,connectors:[]},{id:'edp',operator_id:'edp',source:'nap-mobie',connectors:[{type:'Type 2',power_kw:22}]}]};assert.equal(c.priced({station:grouped,energy:20,total:null}).total,null);
});
