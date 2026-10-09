import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
const ctx=vm.createContext({});vm.runInContext(await readFile(new URL('./src/recommendations.js',import.meta.url),'utf8'),ctx);const {energyFor,choices}=ctx.ChargeVoyRecommendations;
const row=(id,extra={})=>({id,distance:2,power:100,energy:28.8,minutes:20,total:9,live:true,available:2,...extra});
test('energy uses selected battery and SOC without fabricated capacity',()=>{assert.equal(energyFor({battery_capacity_kwh:60},32,80),28.8);assert.equal(energyFor(null,32,80),null);for(const [a,b]of [[80,32],[-1,80],[32,101],[32,32],[NaN,80]])assert.equal(energyFor({battery_capacity_kwh:60},a,b),null)});
test('recommended requires price, fresh availability and valid time',()=>{for(const extra of [{live:false},{available:0},{total:null},{minutes:null},{energy:null},{distance:76},{power:0}])assert.equal(choices([row('a',extra)]).recommended,null);assert.equal(choices([row('a')]).recommended.id,'a')});
test('alternatives can differ and cheapest never treats missing price as zero',()=>{const c=choices([row('cheap',{total:5,minutes:30,distance:4}),row('fast',{total:12,minutes:10,distance:3}),row('near',{total:null,minutes:40,distance:.3})]);assert.equal(c.cheap.id,'cheap');assert.equal(c.fast.id,'fast');assert.equal(c.near.id,'near');assert.equal(c.pricedCount,2)});
test('empty and incompatible/outside candidates give no recommendation',()=>{const c=choices([row('a',{power:0}),row('b',{distance:100})]);assert.equal(c.totalCount,0);assert.equal(c.recommended,null);assert.equal(c.near,null)});

test('Android price calculation uses each candidate network rather than the open station',async()=>{
 const web=await readFile(new URL('./src/chargevoy.js',import.meta.url),'utf8');const cards=JSON.parse(await readFile(new URL('../../ev-charge-portugal-github-ready/assets/ceme-cards.json',import.meta.url),'utf8'));
 class PricingDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-03T12:00:00Z']))}}
 const ctx=vm.createContext({Date:PricingDate,currentVehicle:{max_dc_power_kw:100},operatorMap:new Map([['atlante','Atlante'],['other','Other']]),selectedStation:{operator_id:'atlante'}});
 const extract=(a,b)=>web.slice(web.indexOf(a),web.indexOf(b,web.indexOf(a)));
 vm.runInContext(extract('function cardEnergyRate(','function cardSourceLink('),ctx);vm.runInContext(extract('function calculateCardPrice(','function adHocPriceMarkup('),ctx);
 const card=cards.find(x=>x.id==='myatlante'),opc={connector_type:'CCS',power_kw:50};const other=ctx.calculateCardPrice(card,opc,{energyKwh:20},'fora_vazio',{operator_id:'other'}),own=ctx.calculateCardPrice(card,opc,{energyKwh:20},'fora_vazio',{operator_id:'atlante'});
 assert.equal(other.total,11);assert.equal(own.total,11);assert.equal(other.cashback,1.1);assert.equal(own.cashback,2.75);assert.equal(ctx.calculateCardPrice(card,{connector_type:'Type 2',power_kw:50},{energyKwh:20},'fora_vazio',{operator_id:'other'}),null);
});

// Exercise the Android candidate pricing path with the actual price calculator.
test('fixed final offer survives absent/stale OPC; eligibility and grouped connectors stay separate',async()=>{
 const controller=await readFile(new URL('./src/chargevoy.js',import.meta.url),'utf8'),ui=await readFile(new URL('./src/android-ui.js',import.meta.url),'utf8');
 const cards=JSON.parse(await readFile(new URL('../../ev-charge-portugal-github-ready/assets/ceme-cards.json',import.meta.url),'utf8'));
 const clock={now:'2026-10-09T12:00:00Z'};
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock.now]))}static now(){return Date.parse(clock.now)}}
 const ctx=vm.createContext({Date:ClockDate,currentVehicle:{max_dc_power_kw:170,max_ac_power_kw:11},operatorMap:new Map(),selectedStation:null,cemeCards:cards,cache:new Map(),scenario:{period:'fora_vazio'},connectorCategory:x=>x,compatibleConnectors:s=>s.connectors||[]});
 const extract=(a,b)=>controller.slice(controller.indexOf(a),controller.indexOf(b,controller.indexOf(a)));
 vm.runInContext(extract('function cardEnergyRate(','function cardSourceLink('),ctx);vm.runInContext(extract('function calculateCardPrice(','function adHocPriceMarkup('),ctx);
 vm.runInContext(ui.slice(ui.indexOf('function priced('),ui.indexOf('function openStation(')),ctx);
 const station={id:'nap-test',source:'nap-mobie',connectors:[{type:'CCS',power_kw:150}]},r={energy:28.8,total:null,station};
 assert.equal(ctx.priced(r).total,15.840000000000002);
 ctx.cache.set(station.id,{rows:[{connector_type:'CCS',power_kw:150,updated_at:'2026-09-01T00:00:00Z'}]});
 assert.equal(ctx.priced(r).card.id,'myatlante');
 for(const connectors of [[{type:'Type 2',power_kw:50}],[{type:'CCS',power_kw:22}],[]])assert.equal(ctx.priced({...r,station:{...station,connectors}}).total,null);
 assert.equal(ctx.priced({...r,station:{...station,source:'tesla'}}).total,null);
 assert.equal(ctx.priced({...r,energy:null}).total,null);
 clock.now='2027-01-01T12:00:00Z';assert.equal(ctx.priced(r).total,null);
 // No eligible fast connector on the member owning the tariff: it cannot borrow its neighbour's CCS.
 ctx.cemeCards=cards.filter(c=>c.id==='galp-electric');ctx.networkTariff=()=>0;clock.now='2026-10-09T12:00:00Z';
 ctx.cache.set('ac-member',{rows:[{connector_type:'CCS',power_kw:150,updated_at:clock.now,energy_price_eur_kwh:0.1}]});
 const grouped={_location_members:[{id:'ac-member',source:'nap-mobie',connectors:[{type:'Type 2',power_kw:22}]},{id:'dc-member',source:'nap-mobie',connectors:[{type:'CCS',power_kw:150}]}]};
 assert.equal(ctx.priced({...r,station:grouped}).total,null);
});
