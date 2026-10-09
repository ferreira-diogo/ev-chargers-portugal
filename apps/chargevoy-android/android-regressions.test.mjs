import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./src/chargevoy.js',import.meta.url),'utf8');
function extract(name,next) {return source.slice(source.indexOf(`      function ${name}`),source.indexOf(`      ${next}`,source.indexOf(`      function ${name}`)+10));}
test('clearing a route cancels pending plans, resets endpoints and restores all station layers',()=>{
 const elements=new Map(['route-origin','route-destination','route-result','plan-route','nav-map'].map(id=>[id,{value:'Porto',disabled:true,textContent:'',classList:{remove(){}},replaceChildren(){this.empty=true;},click(){this.clicked=true;}}]));
 let rendered=false,explore=false;
 const context=vm.createContext({routePlanGeneration:4,lastPlannedRoute:{destination:'Porto'},routeOriginOverride:{},routeDestinationOverride:{},document:{getElementById(id){return elements.get(id);}},setRouteMapMode(active){explore=!active;},renderStations(){rendered=true;},allStations:[]});
 vm.runInContext(extract('clearPlannedRoute','function setRouteMapMode'),context);
 context.clearPlannedRoute();assert.equal(context.routePlanGeneration,5);assert.equal(context.lastPlannedRoute,null);assert.equal(context.routeOriginOverride,null);assert.equal(context.routeDestinationOverride,null);assert.equal(elements.get('route-destination').value,'');assert(elements.get('route-result').empty);assert.equal(elements.get('plan-route').disabled,false);assert(elements.get('nav-map').clicked);assert(rendered&&explore);
});
test('a pending route response cannot restore a route after the user clears it',async()=>{
 const corridor=readFileSync(new URL('./src/route-corridor.js',import.meta.url),'utf8');
 const start=corridor.indexOf('  async function planRouteCorridor()');const end=corridor.indexOf('  // Direct callers',start);
 let release;const response=new Promise(r=>release=r);const button={textContent:'',disabled:false};const result={classList:{remove(){},add(){throw Error('Cancelled result displayed');}}};
 const values={'route-origin':'A','route-destination':'B','route-battery':'80','route-reserve':'15'};
 const context=vm.createContext({routePlanGeneration:0,routeOriginOverride:{input:'A',lat:39,lon:-8},routeDestinationOverride:{input:'B',lat:40,lon:-8},document:{getElementById(id){return id==='plan-route'?button:id==='route-result'?result:{value:values[id]};}},fetchWithTimeout(){return response;},notifyUser(){},console});
 vm.runInContext(corridor.slice(start,end),context);const pending=context.planRouteCorridor();context.routePlanGeneration++;release({ok:true,json:async()=>({code:'Ok',routes:[{}]})});await pending;assert.equal(context.routePlanGeneration,2);
});
test('grouped chargers preserve repeated local IDs and rows without IDs',()=>{
 const context=vm.createContext({connectorMap:new Map([['a',[{id:'1',station_id:'a',type:'CCS'},{station_id:'a',type:'Type 2'}]],['b',[{id:'1',station_id:'b',type:'CCS'},{station_id:'b',type:'Type 2'}]]])});
 vm.runInContext(extract('stationConnectorRows','async function loadLocationConnectors'),context);
 assert.equal(context.stationConnectorRows({_location_members:[{id:'a'},{id:'b'}]}).length,4);
 assert.equal(context.stationConnectorRows({_location_members:[{id:'a'},{id:'a'}]}).length,2);
});
test('route mode hides public layers, emits mode for recommendation pins and restores exploration',()=>{
 const removed=[],events=[],map={removeLayer(layer){removed.push(layer);}},stationLayer={addTo(){this.restored=true;}},searchLayer={addTo(){this.restored=true;}},routeLayer={clearLayers(){this.cleared=true;}};
 const context=vm.createContext({map,stationLayer,searchLayer,routeLayer,window:{dispatchEvent(event){events.push(event.detail.active);}},CustomEvent:class{constructor(name,options){this.detail=options.detail;}},routeMapActive:false});
 vm.runInContext(extract('setRouteMapMode','let currentSession'),context);context.setRouteMapMode(true);assert.deepEqual(removed,[stationLayer,searchLayer]);context.setRouteMapMode(false);assert(stationLayer.restored&&searchLayer.restored&&routeLayer.cleared);assert.deepEqual(events,[true,false]);
});
test('anonymous favourites open login without mutating station state or issuing requests',async()=>{
 let opened=0;const context=vm.createContext({selectedStation:{id:'nap-test'},currentSession:null,showAccount(){opened++;},window:{ChargeVoyAccount:{request(){throw Error('Unexpected API request');}}}});
 const start=source.indexOf('      async function toggleSelectedFavorite()');const end=source.indexOf('      function openModal',start);
 vm.runInContext(source.slice(start,end),context);await context.toggleSelectedFavorite();assert.equal(opened,1);
});
test('no account SDK or provider fallback remains in Android source/build inputs',()=>{
 const html=readFileSync(new URL('./src/index.html',import.meta.url),'utf8');assert(!/supabase|showEmailAuth|signInWithPassword/i.test(source+html));
});

test('Android photo overrides match reviewed lossless cutouts and preserve source attribution', async () => {
  const {createHash}=await import('node:crypto');
  const {readFile}=await import('node:fs/promises');
  const {resolve}=await import('node:path');
  const dir=resolve(import.meta.dirname,'vehicle-images');
  const credits=JSON.parse(await readFile(resolve(dir,'credits.json'),'utf8'));
  const report=JSON.parse(await readFile(resolve(dir,'segmentation-report.json'),'utf8'));
  assert.equal(report.length,47);
  for(const entry of report){
    assert.equal(entry.approved,true);
    const hash=createHash('sha256').update(await readFile(resolve(dir,entry.output))).digest('hex');
    assert.equal(hash,entry.output_sha256);
    const photo=credits.find(photo=>photo.image.endsWith('/'+entry.output));
    assert.ok(photo?.background_removed && photo.android_segmented);
    assert.ok(photo.original_image.endsWith('/'+entry.source));
  }
});
