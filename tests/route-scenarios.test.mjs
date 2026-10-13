import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const android=process.env.CHARGEVOY_PLATFORM==='android';
const prefix=android?'../apps/chargevoy-android/src/':'../ev-charge-portugal-github-ready/assets/';
const routeSource=readFileSync(new URL(prefix+'route-corridor.js',import.meta.url),'utf8');
const app=readFileSync(new URL(prefix+'chargevoy.js',import.meta.url),'utf8');
// Same deterministic scenarios execute the actual planner and scoring in each product.
// Road routing and station projections are fixtures: this is not a live ABRP benchmark.
function functions(start,end){return app.slice(app.indexOf('      function '+start+'('),app.indexOf('      function '+end+'('));}
async function run({distance=577,capacity=60,consumption=145,reverse=false,offline=false,noStations=false}={}) {
 const nodes=new Map(['plan-route','route-result','route-origin','route-destination','route-battery','route-reserve'].map(id=>[id,{value:'',textContent:'',innerHTML:'',classList:{remove(){},add(){}},addEventListener(){}}]));
 nodes.get('route-origin').value=reverse?'Tavira':'Porto';nodes.get('route-destination').value=reverse?'Porto':'Tavira';nodes.get('route-battery').value='80';nodes.get('route-reserve').value='15';
 const stationRows=noStations?[]:Array.from({length:18},(_,i)=>({id:'s'+i,name:'Station '+i,latitude:40,longitude:-8,km:30*(i+1),connectors:[{type:'CCS',power_kw:150}]}));
 const geometry={type:'LineString',coordinates:[[-8.61,41.15],[-7.65,37.13]]};
 const chain={addTo(){return this},bindPopup(){return this},getBounds(){return{}}};
 const c=vm.createContext({document:{getElementById:id=>nodes.get(id)},console:{info(){},warn(){},error(){}},URLSearchParams,
  currentVehicle:{make:'Tesla',model:'Model 3',connector_types:['CCS'],max_ac_power_kw:11,max_dc_power_kw:170,battery_capacity_kwh:capacity,consumption_wh_km:consumption},
  routeOriginOverride:null,routeDestinationOverride:null,routePlanGeneration:0,lastPlannedRoute:null,allStations:stationRows,connectorMap:new Map(),D1_FALLBACK_URL:'https://fixture/api/stations',D1_API_WORKER_URL:'https://fixture2/api/stations',
  geocodePortugal:async text=>text==='Porto'?{lat:41.15,lon:-8.61,label:text}:{lat:37.13,lon:-7.65,label:text},
  fetchWithTimeout:async url=>{if(offline)throw Error('offline');if(url.includes('/api/stations'))throw Error('corridor API unavailable');return{ok:true,json:async()=>({code:'Ok',routes:[{distance:distance*1000,duration:distance*60,geometry}]})}},
  groupStationLocations:rows=>rows,stationConnectorRows:s=>s.connectors,connectorCategory:x=>x,
  buildRouteProfile:()=>({}),stationRoutePosition:s=>({route_km:reverse?distance-s.km:s.km,distance:0}),stationAvailability:()=>({kind:'unknown',available:0}),
  distanceKm:()=>100,isTeslaVehicle:()=>false,isOfficialTeslaStation:()=>false,vehicleUsesGenericRouteProfile:()=>false,
  notifyUser(){},escapeHtml:x=>String(x),saveRouteToUserHistory(){},setRouteMapMode(){},requestAnimationFrame:f=>f(),
  routeLayer:{clearLayers(){},addTo(){}},map:{fitBounds(){},invalidateSize(){}},L:{geoJSON:()=>chain,marker:()=>chain,circleMarker:()=>chain}});
 vm.runInContext(functions('chargingTimeMinutes','formatDuration')+functions('formatDuration','openRoutePlanner')+functions('routeAvailabilityPenalty','findFallbackStation'),c);
 // Alternatives are deliberately too far away: there must be no unchecked fallback.
 c.findFallbackStation=()=>null;
 vm.runInContext(routeSource,c);await c.planRoute();return {route:c.lastPlannedRoute,html:nodes.get('route-result').innerHTML};
}
test('Porto–Tavira produces a feasible plan and multiple charging stops without a pricing API',async()=>{
 const r=await run();assert.equal(r.route.distanceKm,577);assert(r.route.stops.length>=2);assert.match(r.html,/Plano recomendado/);assert.match(r.html,/Destino:.*chegada estimada com/);assert(!r.html.includes('<b>Plano B:</b>'));
});
test('short route needs no charging stop',async()=>{const r=await run({distance:40});assert.equal(r.route.stops.length,0);assert.match(r.html,/sem carregamento intermédio/);});
test('small battery needs more stops and the reverse route remains feasible',async()=>{
 const small=await run({capacity:35,consumption:180});assert(small.route.stops.length>=3);assert.match(small.html,/Plano recomendado/);
 const reverse=await run({reverse:true});assert.match(reverse.html,/Plano recomendado/);assert.equal(reverse.route.origin.label,'Tavira');assert.equal(reverse.route.destination.label,'Porto');
});
test('no routing API gives a recoverable error; no compatible stations cannot be advertised as feasible',async()=>{
 const offline=await run({offline:true});assert.match(offline.html,/Não foi possível calcular a rota/);
 const none=await run({noStations:true});assert.match(none.html,/não foram encontrados postos compatíveis e alcançáveis/);assert(!none.html.includes('Plano recomendado'));
});
