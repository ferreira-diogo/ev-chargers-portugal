import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=n=>readFileSync(new URL(n,import.meta.url),'utf8');
function context(){const c=vm.createContext({Date,console,t:v=>v,currentLanguage:'pt',connectorCategory:v=>v,window:{},connectorMap:new Map()});vm.runInContext(code('src/inventory-evidence.js'),c);vm.runInContext(code('src/inventory.js'),c);c.window.ChargeVoyInventory=c.ChargeVoyInventory;const source=code('src/chargevoy.js');vm.runInContext(source.slice(source.indexOf('      function stationConnectorRows('),source.indexOf('      async function loadLocationConnectors(')),c);vm.runInContext(source.slice(source.indexOf('      function stationAvailability('),source.indexOf('      function escapeHtml(')),c);return c;}
const station={id:'nap-CNT-0269PL0001',source:'nap-mobie',operator_name:'Modelo Continente Hipermercados, S.A.',latitude:39.735325,longitude:-8.933192,amenities:{source_updated_at:'2026-10-14T03:00:04.100Z'}};
const ac=()=>[1,2].map(i=>({id:'ac-'+i,station_id:station.id,type:'Type 2',power_kw:22,quantity:1,available_count:1,availability_source:'mobie_nap',availability_updated_at:new Date().toISOString()}));
test('known missing rapid chargers remain partial without fabricated connectors or availability',()=>{
 const c=context(),rows=ac(),r=c.ChargeVoyInventory.analyze(station,rows);assert.equal(r.reportedCount,2);assert(r.partial&&r.missingRapid);assert.equal(r.supplemental.rapidPlaces,2);assert.equal(r.physicalTotalConfirmed,false);assert.equal(rows.length,2);
 c.connectorMap.set(station.id,rows);const live=c.stationAvailability(rows,station);assert.equal(live.available,2);assert.equal(live.knownTotal,2);assert(live.inventoryPartial);assert.match(live.detail,/Outros equipamentos/);assert.match(live.label,/reportadas/);
});
test('zero available known AC does not imply that unreported rapid chargers are unavailable',()=>{
 const c=context(),rows=ac().map(r=>({...r,available_count:0}));c.connectorMap.set(station.id,rows);assert.equal(c.effectiveStationStatus(station),'unknown');
 const generic={id:'nap-other',source:'nap-mobie'};const rr=rows.map(r=>({...r,station_id:generic.id}));c.connectorMap.set(generic.id,rr);assert.equal(c.effectiveStationStatus(generic),'unavailable');
});
test('supplement requires the reviewed ID, source and physical location',()=>{
 const c=context();for(const s of [{...station,id:'nap-CNT-other'},{...station,source:'openchargemap'},{...station,latitude:41},{...station,latitude:null,longitude:null}])assert.equal(c.ChargeVoyInventory.analyze(s,ac()).supplemental,undefined);
});
test('live values are scoped, stale readings remain stale, absent and future readings cannot become available',()=>{
 const c=context(),rows=ac();c.connectorMap.set(station.id,rows);
 assert.equal(c.stationAvailability(rows.map(r=>({...r,availability_updated_at:new Date(Date.now()-6*60000).toISOString()})),station).kind,'stale');
 assert.equal(c.stationAvailability(rows.map(r=>({...r,available_count:null})),station).kind,'none');
 assert.equal(c.stationAvailability(rows.map(r=>({...r,availability_updated_at:new Date(Date.now()+10*60000).toISOString()})),station).kind,'none');
 assert.equal(c.stationAvailability(rows.map(r=>({...r,available_count:2})),station).kind,'none');
});
test('unknown placeholders and duplicate memberships do not fabricate a physical socket total',()=>{
 const c=context(),r=c.ChargeVoyInventory.analyze(station,[...ac(),ac()[0],{id:'u',station_id:station.id,type:'Unknown',quantity:1}]);assert.equal(r.reportedCount,2);assert.equal(r.unknownRows,1);assert.equal(c.stationAvailability([{type:'Unknown',quantity:1,available_count:1,availability_source:'mobie_nap',availability_updated_at:new Date().toISOString()}]).total,0);
 const grouped={_location_members:[{id:'a',source:'nap-mobie'},{id:'b',source:'nap-mobie'}]};assert.equal(c.ChargeVoyInventory.analyze(grouped,[{id:'1',station_id:'a',type:'CCS',quantity:1},{id:'1',station_id:'b',type:'CCS',quantity:1}]).reportedCount,2);
});
test('new source DC rows clear the missing-rapid alert but do not claim complete physical validation',()=>{
 const c=context(),r=c.ChargeVoyInventory.analyze(station,[...ac(),{id:'dc',station_id:station.id,type:'CCS',power_kw:120,quantity:1}]);assert(!r.missingRapid);assert(!r.partial);assert.equal(r.physicalTotalConfirmed,false);
});
test('five reviewed operator locations retain dates, provenance and distinct parking-place counts',()=>{
 const c=context();assert.equal(c.ChargeVoyInventoryEvidence.length,5);
 for(const row of c.ChargeVoyInventoryEvidence){assert(row.sourceUrl.startsWith('https://feed.continente.pt/plug-charge/'));assert.equal(row.checkedAt,'2026-10-15');assert(row.normalPlaces>0&&row.rapidPlaces>0);assert(!('connectorCount' in row));}
});
