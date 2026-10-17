import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
test('recommendation prices use candidate operator even when a different station is open',async()=>{
 const web=await readFile(new URL('../assets/chargevoy.js',import.meta.url),'utf8');const cards=JSON.parse(await readFile(new URL('../assets/ceme-cards.json',import.meta.url),'utf8'));
 class PricingDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-03T12:00:00Z']))}}
 const ctx=vm.createContext({Date:PricingDate,currentVehicle:{max_dc_power_kw:100},operatorMap:new Map([['atlante','Atlante'],['other','Other']]),selectedStation:{operator_id:'atlante'}});
 const extract=(a,b)=>web.slice(web.indexOf(a),web.indexOf(b,web.indexOf(a)));
 vm.runInContext(extract('function operatorDisplayName(','function cardSourceLink('),ctx);vm.runInContext(extract('function calculateCardPrice(','function adHocPriceMarkup('),ctx);
 const card=cards.find(x=>x.id==='myatlante'),opc={connector_type:'CCS',power_kw:50};const other=ctx.calculateCardPrice(card,opc,{energyKwh:20},'fora_vazio',{operator_id:'other'}),own=ctx.calculateCardPrice(card,opc,{energyKwh:20},'fora_vazio',{operator_id:'atlante'});
 assert.equal(other.cashback,1.1);assert.equal(own.cashback,2.75);assert.equal(ctx.calculateCardPrice(card,{connector_type:'Type 2',power_kw:50},{energyKwh:20},'fora_vazio',{operator_id:'other'}),null);
});

async function recommendationContext() {
 const web=await readFile(new URL('../assets/chargevoy.js',import.meta.url),'utf8');
 const ui=await readFile(new URL('../assets/web-app-ui.js',import.meta.url),'utf8');
 const cards=JSON.parse(await readFile(new URL('../assets/ceme-cards.json',import.meta.url),'utf8'));
 class PricingDate extends Date{constructor(...a){super(...(a.length?a:['2026-10-13T12:00:00Z']))}static now(){return Date.parse('2026-10-13T12:00:00Z')}}
 const c=vm.createContext({Date:PricingDate,Intl,currentVehicle:{max_dc_power_kw:170},selectedStation:null,operatorMap:new Map([['other','Other']]),cache:new Map(),cemeCards:cards,scenario:{period:'fora_vazio'},connectorCategory:x=>x,compatibleConnectors:s=>s.connectors||[]});
 const cut=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
 vm.runInContext(cut(web,'function networkTariff(','let simMode'),c);
 vm.runInContext(cut(web,'function operatorDisplayName(','function cardSourceLink('),c);
 vm.runInContext(cut(web,'function calculateCardPrice(','function adHocPriceMarkup('),c);
 vm.runInContext(cut(ui,'function priced(row)','function openStation('),c);return c;
}
const row=(connectors=[{type:'CCS',power_kw:50}])=>({station:{id:'a',source:'nap-mobie',operator_id:'other',connectors},energy:28.8,total:null});
test('fixed offer remains eligible without OPC and subscriptions stay excluded',async()=>{
 const c=await recommendationContext();const result=c.priced(row());assert(Math.abs(result.total-15.84)<1e-8);assert.equal(result.card.subscription_required,false);
 assert.equal(c.priced(row([{type:'Type 2',power_kw:22}])).total,null);
});
test('a tariff for CCS150 cannot price a CCS50 physical connector',async()=>{
 const c=await recommendationContext();c.cemeCards=c.cemeCards.filter(x=>x.id==='prio-electric-kwh');
 const tariff={connector_type:'CCS',power_kw:150,voltage_level:'BT',updated_at:'2026-10-13T10:00:00Z',time_price_eur_min:1};
 c.cache.set('a',{rows:[tariff]});assert.equal(c.priced(row()).total,null);
 c.cache.set('a',{rows:[{...tariff,power_kw:50}]});const result=c.priced(row());assert(Number.isFinite(result.total));assert.equal(result.minutes,47);
});
test('grouped location never borrows a matching connector from another member',async()=>{
 const c=await recommendationContext();c.cemeCards=c.cemeCards.filter(x=>x.id==='prio-electric-kwh');
 const a=row().station,b={...a,id:'b',connectors:[{type:'CCS',power_kw:150}]};
 c.cache.set('a',{rows:[{connector_type:'CCS',power_kw:150,voltage_level:'BT',updated_at:'2026-10-13T10:00:00Z'}]});
 assert.equal(c.priced({station:{...a,_location_members:[a,b]},energy:28.8,total:null}).total,null);
});
