import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
test('recommendation prices use candidate operator even when a different station is open',async()=>{
 const web=await readFile(new URL('../assets/chargevoy.js',import.meta.url),'utf8');const cards=JSON.parse(await readFile(new URL('../assets/ceme-cards.json',import.meta.url),'utf8'));
 class PricingDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-03T12:00:00Z']))}}
 const ctx=vm.createContext({Date:PricingDate,currentVehicle:{max_dc_power_kw:100},operatorMap:new Map([['atlante','Atlante'],['other','Other']]),selectedStation:{operator_id:'atlante'}});
 const extract=(a,b)=>web.slice(web.indexOf(a),web.indexOf(b,web.indexOf(a)));
 vm.runInContext(extract('function cardEnergyRate(','function cardSourceLink('),ctx);vm.runInContext(extract('function calculateCardPrice(','function adHocPriceMarkup('),ctx);
 const card=cards.find(x=>x.id==='myatlante'),opc={connector_type:'CCS',power_kw:50};const other=ctx.calculateCardPrice(card,opc,{energyKwh:20},'fora_vazio',{operator_id:'other'}),own=ctx.calculateCardPrice(card,opc,{energyKwh:20},'fora_vazio',{operator_id:'atlante'});
 assert.equal(other.cashback,1.1);assert.equal(own.cashback,2.75);assert.equal(ctx.calculateCardPrice(card,{connector_type:'Type 2',power_kw:50},{energyKwh:20},'fora_vazio',{operator_id:'other'}),null);
});
