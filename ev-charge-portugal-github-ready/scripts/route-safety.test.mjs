import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../assets/route-corridor.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('  function routeChargingPower('),source.indexOf('  function routeBounds('));
function context(overrides={}) {
 const c=vm.createContext({currentVehicle:{connector_types:['CCS','Type 2'],max_ac_power_kw:11,max_dc_power_kw:170},connectorCategory:x=>x,stationConnectorRows:s=>s.connectors||[],distanceKm:()=>1,findFallbackStation:(p,rows)=>rows.find(s=>s.id!==p.id),console:{warn(){}},...overrides});
 vm.runInContext(helpers,c);return c;
}
test('route power follows the compatible physical connector and AC/DC vehicle limit',()=>{
 const c=context();assert.equal(c.routeChargingPower({max_power_kw:43,connectors:[{type:'Type 2',power_kw:43}]}),11);
 assert.equal(c.routeChargingPower({max_power_kw:350,connectors:[{type:'CCS',power_kw:50},{type:'CHAdeMO',power_kw:350}]}),50);
 assert.equal(c.routeChargingPower({connectors:[{type:'CCS',power_kw:250}]}),170);
 assert.equal(c.routeChargingPower({max_power_kw:350}),0);
});
test('unknown/incompatible specifications cannot invent route charging power',()=>{
 assert.equal(context({currentVehicle:{connector_types:['CCS'],max_dc_power_kw:null}}).routeChargingPower({connectors:[{type:'CCS',power_kw:150}]}),0);
 assert.equal(context().routeChargingPower({connectors:[{type:'CHAdeMO',power_kw:150}]}),0);
 assert.equal(context({currentVehicle:{connector_types:'["Type 2"]',max_ac_power_kw:7.4}}).routeChargingPower({connectors:[{type:'Type 2',power_kw:22}]}),7.4);
});
const primary={id:'primary',latitude:40,longitude:-8};
const alt=id=>({id,latitude:40.01,longitude:-8,connectors:[{type:'CCS',power_kw:50}]});
test('a close fallback is rejected when its road detour exceeds remaining range',async()=>{
 const c=context({fetchWithTimeout:async()=>({ok:true,json:async()=>({code:'Ok',routes:[{distance:20000}]})})});
 assert.equal(await c.findReachableFallbackStation(primary,[alt('far-road')],new Set(),170,6,5,.2),null);
});
test('fallback preserves reserve and skips an unreachable first candidate',async()=>{
 let calls=0;const c=context({fetchWithTimeout:async()=>({ok:true,json:async()=>({code:'Ok',routes:[{distance:++calls===1?20000:3000}]})})});
 const result=await c.findReachableFallbackStation(primary,[alt('bad'),alt('good')],new Set(),170,6,5,.2);
 assert.equal(result.id,'good');assert.equal(result.distance_from_primary,3);assert(result.energy_after_detour>=5);assert.equal(result.route_verified,true);
});
test('routing failure/malformed response/used station cannot yield an unchecked fallback',async()=>{
 for(const response of [{ok:false},{ok:true,json:async()=>({code:'Ok',routes:[]})},{ok:true,json:async()=>({code:'Ok',routes:[{distance:null}]})}]) {
  const c=context({fetchWithTimeout:async()=>response});assert.equal(await c.findReachableFallbackStation(primary,[alt('a')],new Set(),170,6,5,.2),null);
 }
 const c=context({fetchWithTimeout:async()=>{throw Error('offline')}});assert.equal(await c.findReachableFallbackStation(primary,[alt('a')],new Set(),170,6,5,.2),null);
 assert.equal(await c.findReachableFallbackStation(primary,[alt('a')],new Set(['a']),170,6,5,.2),null);
});
test('fallback routing request budget is bounded at three alternatives',async()=>{
 let count=0;const c=context({fetchWithTimeout:async()=>{count++;return {ok:false}}});
 assert.equal(await c.findReachableFallbackStation(primary,Array.from({length:8},(_,i)=>alt('a'+i)),new Set(),170,6,5,.2),null);assert.equal(count,3);
});
