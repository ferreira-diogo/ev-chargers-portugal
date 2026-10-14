import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const android=process.env.CHARGEVOY_PLATFORM==='android';
const base=android?'../apps/chargevoy-android/src/':'../ev-charge-portugal-github-ready/assets/';
const ui=readFileSync(new URL(base+(android?'android-ui.js':'web-app-ui.js'),import.meta.url),'utf8');
const app=readFileSync(new URL(base+'chargevoy.js',import.meta.url),'utf8');
function extract(source,name,next){return source.slice(source.indexOf('function '+name+'('),source.indexOf(next,source.indexOf('function '+name+'(')));}
test('economic search includes a cheaper ninth candidate, bounds count/radius and respects compatibility',()=>{
 const records=Array.from({length:55},(_,i)=>({id:String(i),latitude:i+1,longitude:0,price:i===8?1:10,compatible:true}));
 records.push({id:'far',latitude:90,longitude:0,price:0,compatible:true},{id:'incompatible',latitude:0,price:0});
 const c=vm.createContext({currentVehicle:{},searchPosition:{},records,scenario:{},core:{energyFor:()=>10},stationCompatibleWithVehicle:s=>s.compatible,compatibleConnectors:()=>[{}],effectivePower:()=>50,stationAvailability:()=>({}),distanceKm:(_p,s)=>s.lat});
 vm.runInContext(extract(ui,'baseRows','async function tariffs'),c);
 const rows=c.baseRows();assert.equal(rows.length,40);assert(rows.some(r=>r.id==='8'));assert(!rows.some(r=>r.id==='far'||r.id==='incompatible'));
 assert.equal(rows.sort((a,b)=>a.station.price-b.station.price)[0].id,'8');
});
test('reset all clears operator/text/power/status/connector filters while retaining location and vehicle',()=>{
 const connectors=[{checked:true}],statuses=[{checked:false},{checked:false},{checked:true}],nodes=new Map([['operator-filter',{value:'Powerdot'}],['global-search',{value:'Lisboa'}],['sort-filter',{selectedIndex:2}]]);let renders=0,events=0;
 const c=vm.createContext({selectedPower:'250+',searchPosition:{lat:39},currentVehicle:{id:'car'},document:{querySelectorAll:s=>s==='.connector-filter'?connectors:statuses,getElementById:id=>nodes.get(id)},window:{dispatchEvent:e=>{assert.equal(e.type,'chargevoy-filters-reset');events++;}},Event,renderOperatorChoices(){},renderStations:()=>renders++});
 vm.runInContext(extract(app,'resetAllFilters','      function matchesPower'),c);c.resetAllFilters();
 assert.equal(c.selectedPower,'all');assert.equal(nodes.get('operator-filter').value,'all');assert.equal(nodes.get('global-search').value,'');assert(statuses.every(s=>s.checked));assert(connectors.every(s=>!s.checked));assert.equal(c.currentVehicle.id,'car');assert.equal(c.searchPosition.lat,39);assert.equal(renders,1);assert.equal(events,1);
});
test('filter summary exposes operator and availability restrictions',()=>{
 const nodes=new Map(['android-filter-summary','android-vehicle-label','android-soc-label','operator-filter','global-search'].map(id=>[id,{value:''}]));nodes.get('operator-filter').value='Powerdot';
 const c=vm.createContext({$:id=>nodes.get(id),selectedPower:'all',selectedValues:s=>s==='.status-filter'?['available']:[],document:{querySelectorAll:()=>[1,2,3]},currentVehicle:{make:'Tesla',model:'Model 3'},scenario:{start:32,target:80},syncVehicleThumbnail(){},selectedOperatorValues:()=>[nodes.get('operator-filter').value],t:x=>x});
 vm.runInContext(extract(ui,'summary','function compatibleConnectors'),c);c.summary();assert.match(nodes.get('android-filter-summary').textContent,/Powerdot.*Disponível/);
});
