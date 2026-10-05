import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
for (const path of ['../assets/chargevoy.js','../../apps/chargevoy-android/src/chargevoy.js']) {
 const source=await readFile(new URL(path,import.meta.url),'utf8');
 const helpers=source.slice(source.indexOf('function stationLocationKey('),source.indexOf('function markerColor('));
 const station=(id,overrides={})=>({id,source:'nap-mobie',operator_id:'acciona',name:'Vila Real 1',address:'A4, 5000-751 Lamares, Portugal',city:'Vila Real',latitude:41.324436,longitude:-7.640977,max_power_kw:150,...overrides});
 const setup=stations=>{const connectorMap=new Map(stations.map(s=>[s.id,[0,1].map(n=>({id:s.id+'-'+n,station_id:s.id,type:'CCS',quantity:1,available_count:n===0?1:0}))]));const context=vm.createContext({allStations:stations,connectorMap});vm.runInContext(helpers,context);return context;};
 test(path+': Vila Real has four CCS while the southern site stays separate',()=>{
 const stations=[station('61'),station('62',{name:'Vila Real Norte 2',latitude:41.324417,longitude:-7.640926,max_power_kw:200}),station('63',{name:'Vila Real Sur',latitude:41.323715,longitude:-7.641127}),station('64',{name:'Vila Real Sur',latitude:41.323715,longitude:-7.641127,max_power_kw:200})];
 const c=setup(stations),groups=c.groupStationLocations(stations);assert.equal(groups.length,2);
 const north=c.resolveStationLocation(stations[1]);assert.equal(north._location_members.length,2);assert.equal(north.name,'Vila Real Norte');assert.equal(north.max_power_kw,200);
 const rows=c.stationConnectorRows(north);assert.equal(rows.length,4);assert.equal(rows.reduce((n,r)=>n+r.available_count,0),2);assert.equal(new Set(rows.map(r=>r.id)).size,4);
 assert.equal(groups.reduce((n,g)=>n+c.stationConnectorRows(g).length,0),8);
 });
 test(path+': Antua charger indices can vary without changing the motorway site',()=>{
 const stations=[5,6,7,8].map(n=>station('edp-'+n,{operator_id:'edp',name:'AS Repsol Antuã SN',address:'A1, KM 254.9, sentido Sul-Norte '+n,latitude:40.755447,longitude:-8.53537}));
 const c=setup(stations);assert.equal(c.groupStationLocations(stations).length,1);assert.equal(c.stationConnectorRows(c.resolveStationLocation(stations[3])).length,8);
 });
 test(path+': opposing directions, operators, house numbers and unknown coordinates stay separate',()=>{
 const stations=[station('1',{name:'Site Norte'}),station('2',{name:'Site Sul'}),station('3',{operator_id:'other'}),station('4',{address:'Rua A 137'}),station('5',{address:'Rua A 139'}),station('6',{latitude:null}),station('7',{source:'openchargemap'})];
 const c=setup(stations);assert.equal(c.groupStationLocations(stations).length,7);
 });
 test(path+': complete site diameter prevents chains joining distant sites',()=>{
 const stations=[0,1,2].map(n=>station(String(n),{name:'Shopping #'+n,latitude:41+n*.0006}));
 const c=setup(stations);assert.equal(c.groupStationLocations(stations).length,2);assert.equal(stations.length,3);
 assert.deepEqual(JSON.parse(JSON.stringify(c.groupStationLocations([...stations].reverse()))),JSON.parse(JSON.stringify(c.groupStationLocations(stations))));
 });
}
