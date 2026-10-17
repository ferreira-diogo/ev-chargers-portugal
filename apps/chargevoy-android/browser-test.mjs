import {existsSync} from 'node:fs';
import {chromium} from 'playwright';import {createServer} from 'node:http';import {readFile,mkdir} from 'node:fs/promises';import {resolve,extname} from 'node:path';import assert from 'node:assert/strict';
const dir=resolve(import.meta.dirname,'dist'),out=resolve(import.meta.dirname,'qa');await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;const file=resolve(dir,'.'+(p==='/'?'/index.html':p));if(!file.startsWith(dir+'/'))throw Error();const data=await readFile(file);res.setHeader('content-type',{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream');res.end(data)}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':chromium.executablePath()),headless:true,args:['--no-sandbox']});
try{const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,geolocation:{latitude:39.743,longitude:-8.807},permissions:['geolocation']});const page=await context.newPage();const errors=[],forbiddenRequests=[];page.on('request',r=>{if(/supabase\.co|supabase-js/i.test(r.url()))forbiddenRequests.push(r.url());});page.on('pageerror',e=>errors.push(e.stack||e.message));const vehicle={id:'ui-test-car',make:'Tesla',model:'Model 3',variant:'RWD',battery_capacity_kwh:60,max_ac_power_kw:11,max_dc_power_kw:170,consumption_wh_km:150,connector_types:['CCS','Type 2'],active:1};const now=new Date().toISOString();const stations=[0,1,2].map(i=>({id:'nap-uitest-'+i,name:['Powerdot · Leiria','Galp · Leiria','EDP · Leiria'][i],operator_id:'op-'+i,operator_name:['Powerdot','Galp','EDP'][i],source:'nap-mobie',latitude:39.749+i*.009,longitude:-8.807+i*.009,max_power_kw:[150,100,50][i],status:'available'}));const connectors=stations.map((s,i)=>({id:'con-'+i,station_id:s.id,type:'CCS',power_kw:s.max_power_kw,quantity:4,available_count:3,status:'available',availability_source:'mobie_nap',availability_updated_at:now}));await context.addInitScript(()=>{if(!localStorage.getItem('ev-charge-vehicle'))localStorage.setItem('ev-charge-vehicle','ui-test-car');localStorage.setItem('analytics-consent','denied')});await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname==='router.project-osrm.org'){await route.fulfill({json:{code:'Ok',routes:[{distance:10000,duration:600,geometry:{type:'LineString',coordinates:[[-8.807,39.743],[-8.75,39.8]]}}]}});return}if(url.hostname==='nominatim.openstreetmap.org'){await route.fulfill({json:[{name:'Porto',display_name:'Porto, Portugal',lat:'41.15',lon:'-8.61',category:'place',type:'city',addresstype:'city',osm_type:'node',address:{country_code:'pt'}}]});return}if(url.hostname==='photon.komoot.io'){await route.fulfill({json:{features:[{properties:{name:'Porto',city:'Porto',state:'Porto',countrycode:'PT'},geometry:{coordinates:[-8.61,41.15]}}]}});return}if(url.pathname==='/api/stations'){await route.fulfill({json:{stations,connectors,source:'cloudflare-d1+kv'}});return}if(url.pathname==='/api/availability'){await route.fulfill({json:{publication_time:now,statuses:{}}});return}if(url.pathname==='/api/catalog'){const table=url.searchParams.get('table');let rows=[];if(table==='vehicle_models')rows=Number(url.searchParams.get('offset')||0)===0?[vehicle]:[];if(table==='operators')rows=stations.map(s=>({id:s.operator_id,name:s.operator_name}));if(table==='official_opc_tariffs'){const s=stations.find(s=>s.id===url.searchParams.get('station_id_eq'));if(s)rows=[{station_id:s.id,connector_type:'CCS',power_kw:s.max_power_kw,voltage_level:'BT',tariff_period:'REGULAR',activation_fee_eur:.1,energy_price_eur_kwh:.1,time_price_eur_min:0,updated_at:now}]}await route.fulfill({json:{rows}});return}if(url.pathname.endsWith('/stations-snapshot.json')){await route.fulfill({status:404,body:''});return}if(url.hostname.endsWith('supabase.co')){await route.fulfill({json:[]});return}await route.continue()});
await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.AndroidChargeVoy&&document.querySelector('#android-hero').textContent.includes('RECOMENDADO PARA SI'),{timeout:45000});assert.equal(errors.length,0,errors.join('\n'));assert.equal(await page.locator('.brand small').textContent(),'Encontre. Compare. Siga viagem.');assert(await page.locator('.brand small').isVisible());assert.equal(await page.locator('.android-filters').evaluate(e=>e.open),false);assert(await page.locator('.android-pin').count()>0);await page.waitForFunction(()=>document.querySelector('#android-vehicle-thumbnail img, #android-vehicle-thumbnail svg'));assert(!(await page.locator('#android-vehicle').textContent()).includes('🚗'));assert(!(await page.locator('#android-hero').textContent()).includes('com o veículo'));assert(await page.locator('#android-hero .android-power strong').count()>0);const nav=await page.locator('.android-bottom-nav').boundingBox();assert(nav.y>700&&nav.y+nav.height<=845,'Bottom navigation must be fixed at viewport bottom');await page.waitForFunction(()=>AndroidChargeVoy.metrics().cacheEntries>=3);const initialTariffRequests=await page.evaluate(()=>AndroidChargeVoy.metrics().tariffRequests);
await page.locator('#language-toggle').click();assert((await page.locator('#android-hero').textContent()).includes('RECOMMENDED FOR YOU'));
assert((await page.locator('[data-choice="cheap"]').textContent()).includes('Cheapest'));assert((await page.locator('#android-note').textContent()).includes('Estimates available for'));
await page.evaluate(()=>renderStations(false));await page.waitForTimeout(700);assert((await page.locator('#android-hero').textContent()).includes('RECOMMENDED FOR YOU'));
assert.equal(await page.evaluate(()=>AndroidChargeVoy.metrics().tariffRequests),initialTariffRequests,'Language changes and cached redraw do not query tariffs');
await page.locator('#android-soc').click();assert((await page.locator('#android-scenario-dialog').textContent()).includes('Your charging session'));await page.locator('.android-close').click();
await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#android-hero').textContent.includes('RECOMMENDED FOR YOU'));
assert.equal(await page.locator('html').getAttribute('lang'),'en');await page.locator('#language-toggle').click();assert((await page.locator('#android-hero').textContent()).includes('RECOMENDADO PARA SI'));
console.log('Android translation regression: EN/PT toggle, dynamic redraw, charging dialog, reload persistence and cache-only rendering passed.');
await page.locator('#android-soc').click();assert.equal(await page.locator('#android-period').count(),0);await page.locator('#android-start').fill('50');await page.locator('#android-save-scenario').click();assert.equal(await page.locator('#android-soc-label').textContent(),'50% → 80%');await page.locator('.android-filters summary').click();await page.locator('#android-all-filters').click();assert(await page.locator('#filter-menu').evaluate(e=>e.classList.contains('mobile-open')));await page.locator('#close-mobile-filters').click();await page.locator('.android-filters summary').click();const legend=await page.locator('.legend').boundingBox(),mapBox=await page.locator('.mapbox').boundingBox(),attribution=await page.locator('.leaflet-control-attribution').boundingBox();assert(legend.y>mapBox.y+mapBox.height/2&&legend.x>mapBox.x+mapBox.width/2,'Legend must be bottom right');assert(legend.y+legend.height<=attribution.y,'Legend must not cover attribution');assert(!(await page.locator('.legend').textContent()).includes('kW'));await page.screenshot({path:resolve(out,'android-mobile.png'),fullPage:true});await page.locator('[data-choice="cheap"]').click();assert((await page.locator('#android-hero').textContent()).includes('MAIS BARATO'));await page.setViewportSize({width:1080,height:800});await page.screenshot({path:resolve(out,'android-tablet.png'),fullPage:true});assert.equal(errors.length,0,errors.join('\n'));await page.evaluate(()=>setRouteMapMode(true));assert.equal(await page.locator('.android-pin').count(),0,'Recommendation pins must be hidden in route mode');await page.evaluate(()=>{renderStations(false);});assert.equal(await page.locator('.android-pin').count(),0,'Refresh must not restore pins in route mode');await page.evaluate(()=>setRouteMapMode(false));assert(await page.locator('.android-pin').count()>0);await page.waitForFunction(()=>document.querySelector('#android-vehicle-thumbnail img, #android-vehicle-thumbnail svg'));assert(!(await page.locator('#android-vehicle').textContent()).includes('🚗'));assert(!(await page.locator('#android-hero').textContent()).includes('com o veículo'));assert(await page.locator('#android-hero .android-power strong').count()>0);await page.locator('#nav-favorites').click();assert((await page.locator('#modal-body').textContent()).includes('Entrar com Google'));assert.equal(await page.locator('#modal-body').getByText('Entrar com email').count(),0);await page.locator('#modal-close').click();await page.locator('#nav-routes').click();await page.locator('#route-origin').fill('A minha localização');await page.locator('#route-origin').click();await page.locator('#route-origin').pressSequentially('Porto');assert.equal(await page.locator('#route-origin').inputValue(),'Porto');await page.locator('#route-origin-suggestions button').first().waitFor();await page.locator('#route-origin-suggestions button').first().click();assert.equal(await page.evaluate(()=>routeOriginOverride.lat),41.15);await page.evaluate(()=>{setRouteMapMode(true);routeLayer.clearLayers();L.polyline([[39.7,-8.9],[41.3,-7.7]]).addTo(routeLayer);});await page.locator('#nav-map').click();assert.equal(await page.evaluate(()=>routeLayer.getLayers().length),1,'Opening Map must retain the planned route');await page.evaluate(()=>setRouteMapMode(false));assert.equal(forbiddenRequests.length,0,'Android must not contact Supabase');assert.equal(errors.length,0,errors.join('\n'));
await page.setViewportSize({width:390,height:640});
await page.locator('#nav-vehicle').click();
const savedVehicleId=await page.locator('#vehicle-select').evaluate(e=>e.options[1]?.value||e.value);
await page.locator('#vehicle-select').selectOption(savedVehicleId);
await page.locator('#android-save-options').scrollIntoViewIfNeeded();
const saveBox=await page.locator('#android-save-options').boundingBox(),navBox=await page.locator('.android-bottom-nav').boundingBox();
assert(saveBox.y>=0&&saveBox.y+saveBox.height<=navBox.y,'Vehicle save must be visible above navigation on a small phone');
await page.screenshot({path:resolve(out,'android-vehicle-save.png'),fullPage:true});
await page.locator('#android-save-options').click();
assert.equal(await page.evaluate(()=>localStorage.getItem('ev-charge-vehicle')),savedVehicleId);
assert(!(await page.locator('#filter-menu').evaluate(e=>e.classList.contains('mobile-open'))));
await page.locator('#map-use-location').click();await page.waitForFunction(()=>!document.querySelector('#map-use-location').disabled);assert.equal(await page.locator('#map-use-location svg').count(),1);
await page.locator('#nav-vehicle').click();const filterGps=await page.locator('#use-location').boundingBox();assert(filterGps.width<=46&&filterGps.height<=46);await page.locator('#use-location').click();await page.waitForFunction(()=>!document.querySelector('#use-location').disabled);assert.equal(await page.locator('#use-location svg').count(),1);await page.locator('#android-save-options').click();
await page.locator('#nav-routes').click();
const gpsBox=await page.locator('#route-use-location').boundingBox();assert(gpsBox.width<=46&&gpsBox.height<=46,'GPS control must be a compact icon button');
await page.locator('#route-use-location').click();await page.waitForFunction(()=>!document.querySelector('#route-use-location').disabled);assert.equal(await page.locator('#route-use-location svg').count(),1,'GPS icon survives location request');
await page.evaluate(()=>{routeOriginOverride={input:'Leiria',label:'Leiria',lat:39.743,lon:-8.807};routeDestinationOverride={input:'Destino teste',label:'Destino teste',lat:39.8,lon:-8.75};document.querySelector('#route-origin').value='Leiria';document.querySelector('#route-destination').value='Destino teste';});
await page.locator('#plan-route').click();await page.locator('#clear-route').waitFor();
assert.equal(await page.evaluate(()=>routeMapActive),true);
assert.equal(await page.locator('.android-pin').count(),0);
await page.screenshot({path:resolve(out,'android-route-clear.png'),fullPage:true});
await page.locator('#clear-route').click();
assert.equal(await page.evaluate(()=>routeMapActive),false);
assert.equal(await page.evaluate(()=>lastPlannedRoute),null);
assert.equal(await page.evaluate(()=>routeLayer.getLayers().length),0);
assert(await page.evaluate(()=>map.hasLayer(stationLayer)));
assert.equal(await page.locator('#route-destination').inputValue(),'');
await page.waitForFunction(()=>document.querySelectorAll('.android-pin').length>0);
await page.setViewportSize({width:844,height:390});await page.waitForFunction(()=>document.body.classList.contains('mobile-landscape'));
await page.locator('#nav-vehicle').click();await page.locator('#android-save-options').scrollIntoViewIfNeeded();
const landscapeSave=await page.locator('#android-save-options').boundingBox(),landscapeNav=await page.locator('.android-bottom-nav').boundingBox();assert(landscapeSave.y+landscapeSave.height<=landscapeNav.y,'Vehicle save remains above navigation in landscape');
await page.locator('#android-save-options').click();await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>!document.body.classList.contains('mobile-landscape'));
await page.evaluate(()=>showLegalPage('privacy'));
assert((await page.locator('#modal-body').textContent()).includes('chargevoy@chargevoy.pt'));assert(await page.locator('#modal-body a[href="https://chargevoy.pt/privacy.html"]').count()>0);assert(await page.locator('#modal-body a[href="https://chargevoy.pt/account-deletion.html"]').count()>0);assert((await page.locator('#modal-body').textContent()).includes('HTTPS'));
assert(!(await page.locator('#modal-body').textContent()).includes('evchargeportugal@gmail.com'));
await page.locator('#modal-close').click();assert.equal(errors.length,0,errors.join('\n'));
console.log('Route clear, pending-route cancellation, vehicle save, compact GPS and contact validated.');
console.log('Android UI: mobile/tablet, route pin isolation, Google-only favourites, GPS replacement and suggestions passed.');console.log('Tariff request counters:',await page.evaluate(()=>window.AndroidChargeVoy.metrics()));await page.route('**/api/catalog**',async route=>{const url=new URL(route.request().url());const table=url.searchParams.get('table');const rows=table==='vehicle_models'?[vehicle]:table==='operators'?stations.map(s=>({id:s.operator_id,name:s.operator_name})):[];await route.fulfill({json:{rows}})});await page.setViewportSize({width:390,height:844});await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('[data-choice="cheap"]')&&!document.querySelector('[data-choice="cheap"]').disabled);await page.locator('[data-choice="cheap"]').click();assert((await page.locator('#android-hero').textContent()).includes('myAtlante'));await page.screenshot({path:resolve(out,'android-no-opc.png'),fullPage:true});assert.equal(errors.length,0,errors.join('\n'));console.log('No OPC rows: eligible fixed offer remains selectable.');await page.locator('#nav-vehicle').click();await page.locator('#power-filter [data-power="50-150"]').click();await page.locator('.connector-filter[value="CCS"]').check();await page.locator('.status-filter[value="unknown"]').uncheck();await page.locator('#operator-choices input[value="Powerdot"]').check();await page.locator('#location-search').fill('Porto');await page.locator('#android-save-options').click();await page.waitForFunction(()=>searchPosition?.lat===41.15);
const savedOptions=await page.evaluate(()=>JSON.parse(localStorage.getItem('chargevoy-android-options')));assert.deepEqual(savedOptions.powers,['50-150']);assert.deepEqual(savedOptions.operators,['Powerdot']);assert(savedOptions.connectors.includes('CCS'));assert(!savedOptions.statuses.includes('unknown'));
await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#operator-filter').value==='Powerdot');assert.equal(await page.evaluate(()=>selectedPower),'50-150');await page.waitForFunction(id=>currentVehicle?.id===id,savedVehicleId);assert.equal(await page.evaluate(()=>localStorage.getItem('ev-charge-vehicle')),savedVehicleId);assert(await page.locator('.connector-filter[value="CCS"]').isChecked());assert(!(await page.locator('.status-filter[value="unknown"]').isChecked()));assert.equal(errors.length,0,errors.join('\n'));console.log('Saved vehicle and filters restored after reload; map and filter GPS icons validated.');
await page.waitForFunction(()=>document.querySelector('#android-filter-summary').textContent.includes('Powerdot'));
if(!(await page.locator('.android-filters').evaluate(e=>e.open)))await page.locator('.android-filters summary').click();await page.locator('#reset-all-filters').click();
assert.equal(await page.locator('#operator-filter').inputValue(),'all');assert(await page.locator('.status-filter[value="unknown"]').isChecked());
assert.equal(await page.evaluate(()=>localStorage.getItem('chargevoy-android-options')),null);
await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.AndroidChargeVoy);
assert.equal(await page.locator('#operator-filter').inputValue(),'all');assert.equal(await page.evaluate(()=>selectedPower),'all');
for(const width of [320,390,780,800,1024,1366]) {
 await page.setViewportSize({width,height:900});await page.evaluate(()=>closeFilterMenu());await page.waitForTimeout(250);
 const overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+.01&&!e.closest('.leaflet-pane')}).slice(0,15).map(e=>({tag:e.tagName,id:e.id,class:e.className,right:e.getBoundingClientRect().right})));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow at '+width+': '+JSON.stringify({overflow,dimensions:await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,inner:innerWidth,body:document.body.scrollWidth}))}));
}
await page.setViewportSize({width:390,height:844});await page.locator('#android-filter-summary').evaluate(e=>{e.style.fontSize='24px';e.textContent='Powerdot · Disponível · Pesquisa personalizada em Portugal';});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'200% summary wraps');
assert.equal(errors.length,0,errors.join('\n'));console.log('P1 Android: active filter reset survives reload, viewport matrix and 200% summary passed.');

const storedCatalogue=await page.evaluate(async()=>{
 const data={publication_time:new Date().toISOString(),stations:Array.from({length:8000},(_,i)=>({id:'cache-site-'+i,latitude:39,longitude:-8,address:'x'.repeat(700)})),connectors:Array.from({length:17000},(_,i)=>({id:'cache-connector-'+i,station_id:'cache-site-'+i%8000}))};
 const bytes=JSON.stringify(data).length;const saved=await ChargeVoyCatalogue.write(data),read=await ChargeVoyCatalogue.read();
 return {bytes,persisted:!!saved,valid:ChargeVoyCatalogue.validate(read),sites:read?.stations.length,connectors:read?.connectors.length};
});
assert(storedCatalogue.bytes>5*1024*1024,'Exercise a catalogue larger than typical localStorage quota');assert(storedCatalogue.persisted&&storedCatalogue.valid);assert.equal(storedCatalogue.sites,8000);assert.equal(storedCatalogue.connectors,17000);console.log('P1 IndexedDB: complete catalogue persists above 5 MiB.',storedCatalogue);
// Phase 1: exercise touch controls, dynamic aliases and migration on real rendered screens.
await page.setViewportSize({width:390,height:844});
const extraStations=[
 {id:'continente-ac',name:'Continente Normal',operator_id:'mch',operator_name:'Modelo Continente Hipermercados, S.A.',source:'nap-mobie',latitude:39.749,longitude:-8.809,max_power_kw:22,status:'available'},
 {id:'continente-fast',name:'Continente Rápido',operator_id:'mch',operator_name:'Modelo Continente Hipermercados, S.A.',source:'nap-mobie',latitude:39.760,longitude:-8.820,max_power_kw:120,status:'available'},
 {id:'continente-ultra',name:'Continente Ultrarrápido',operator_id:'mch',operator_name:'Modelo Continente Hipermercados, S.A.',source:'nap-mobie',latitude:39.770,longitude:-8.830,max_power_kw:240,status:'available'}
];
const phaseStations=[...stations,...extraStations];const phaseConnectors=[...connectors,...extraStations.map((s,i)=>({id:s.id+'-c',station_id:s.id,type:i?'CCS':'Type 2',power_kw:s.max_power_kw,quantity:1,available_count:1,status:'available',availability_source:'mobie_nap',availability_updated_at:now}))];
await page.route('**/api/stations**',route=>route.fulfill({json:{stations:phaseStations,connectors:phaseConnectors,source:'cloudflare-d1+kv'}}));
await page.evaluate(()=>{localStorage.removeItem('chargevoy-nearby-stations-v1');localStorage.removeItem('chargevoy-android-scenario');localStorage.setItem('chargevoy-android-options',JSON.stringify({version:1,power:'0-50',operator:'Modelo Continente Hipermercados, S.A.',connectors:[],statuses:['available','unavailable','unknown']}));return new Promise(resolve=>{const req=indexedDB.deleteDatabase('chargevoy-catalogue');req.onsuccess=req.onerror=req.onblocked=resolve;});});
await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#operator-filter option[value="Continente Plug&Charge"]'));
await page.waitForFunction(()=>selectedOperatorValues().includes('Continente Plug&Charge'));
assert.equal(await page.evaluate(()=>selectedPower),'0-50');
await page.locator('#nav-vehicle').click();
assert(await page.locator('#operator-choices input[value="Continente Plug&Charge"]').isChecked());
assert.equal(await page.locator('#operator-filter option[value="Modelo Continente Hipermercados, S.A."]').count(),0);
await page.locator('#operator-choices input[value="Powerdot"]').check();
await page.locator('#power-filter [data-power="50-150"]').click();
assert.deepEqual(await page.evaluate(()=>selectedOperatorValues().sort()),['Continente Plug&Charge','Powerdot']);
assert.equal(await page.locator('#power-filter .chip.on').count(),2);
assert.equal(await page.locator('#quick-power-filter .chip.on').count(),2);
await page.locator('#operator-search').fill('continente');assert.equal(await page.locator('#operator-choices input').count(),2);
await page.locator('#operator-search').fill('xyz-no-match');assert((await page.locator('#operator-choices').textContent()).includes('Nenhum operador encontrado'));
await page.locator('#operator-search').fill('');assert(await page.locator('#operator-choices input[value="Powerdot"]').isChecked());
await page.locator('#location-search').fill('');await page.locator('#android-save-options').click();
const phaseSaved=await page.evaluate(()=>JSON.parse(localStorage.getItem('chargevoy-android-options')));assert.equal(phaseSaved.version,2);assert.deepEqual(phaseSaved.powers.sort(),['0-50','50-150']);assert.deepEqual(phaseSaved.operators.sort(),['Continente Plug&Charge','Powerdot']);
await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>selectedOperatorValues().length===2);assert.equal(await page.evaluate(()=>selectedPower),'0-50|50-150');
await page.waitForFunction(()=>allStations.some(s=>s.id==='continente-ac'));
await page.evaluate(()=>{document.getElementById('operator-filter').value='Continente Plug&Charge';renderOperatorChoices();renderStations(false);});
await page.waitForFunction(()=>document.querySelector('#android-hero').textContent.includes('Continente'));
assert((await page.locator('#android-hero').textContent()).includes('não deduzido'));
await page.evaluate(()=>{selectStation(allStations.find(s=>s.id==='continente-ac'),operatorMap.get('mch'));});
await page.waitForFunction(()=>document.querySelector('#price-comparison').textContent.includes('Valor a pagar'));
assert((await page.locator('#price-comparison').textContent()).includes('Benefício condicional'));
assert(!(await page.locator('#price-comparison').textContent()).includes('myAtlante'));
await page.evaluate(()=>{selectStation(allStations.find(s=>s.id==='continente-ultra'),operatorMap.get('mch'));});
await page.waitForFunction(()=>document.querySelector('#price-comparison').textContent.includes('0,45 e 0,55'));
assert.equal(await page.locator('#price').textContent(),'Preço por confirmar');
await page.evaluate(()=>closeStationPanel());await page.locator('#nav-vehicle').click();
await page.screenshot({path:resolve(out,'android-phase1-multifilters.png'),fullPage:true});
await page.locator('#operator-choices input[value="all"]').check();await page.locator('#power-filter [data-power="all"]').click();
assert.deepEqual(await page.evaluate(()=>selectedOperatorValues()),[]);assert.equal(await page.evaluate(()=>selectedPower),'all');
await page.locator('#operator-choices input[value="Powerdot"]').check();await page.locator('#operator-choices input[value="Powerdot"]').uncheck();assert(await page.locator('#operator-choices input[value="all"]').isChecked());
await page.locator('#android-save-options').scrollIntoViewIfNeeded();const phaseSave=await page.locator('#android-save-options').boundingBox(),phaseNav=await page.locator('.android-bottom-nav').boundingBox();assert(phaseSave.y+phaseSave.height<=phaseNav.y);
assert.equal(errors.length,0,errors.join('\n'));console.log('Phase 1: v1 alias migration, multiple operators/powers, search, save/reload, All/deselect and Continente AC/ultrafast/payment/cashback UI passed.');

await page.evaluate(()=>{
 const names=['Atlante Infra Portugal S.a','Atlante Infra Portugal S.A','Atlante Infra Portugal S.a.','Atlante Infra Portugal S.A.','Atlante Infra Portugal, S.A','Atlante Infra Portugal, S.A.'];
 const select=document.getElementById('operator-filter');
 for(const name of names){const option=new Option(name,name);option.selected=true;select.add(option);}
 const rows=names.map((operator_name,i)=>({id:'alias-'+i,operator_id:'alias-operator-'+i,operator_name}));
 hydrateStationOperators(rows);hydrateStationOperators(rows);
});
assert.equal(await page.locator('#operator-filter option[value="Atlante"]').count(),1);
assert.equal(await page.locator('#operator-choices input[value="Atlante"]').count(),1);
assert(await page.locator('#operator-choices input[value="Atlante"]').isChecked());
assert.equal(await page.locator('#operator-filter option').evaluateAll(options=>options.filter(o=>o.value.includes('Infra Portugal')).length),0);
await page.locator('#android-save-options').click();await page.reload({waitUntil:'domcontentloaded'});
await page.evaluate(()=>hydrateStationOperators([{operator_id:'real-atlante',operator_name:'Atlante Infra Portugal, S.A.'}]));
await page.waitForFunction(()=>selectedOperatorValues().includes('Atlante'));
console.log('Operator aliases: one choice, repeated hydration and saved selection restore passed.');
const realCatalogue=JSON.parse(await readFile(resolve(dir,'assets/stations-snapshot.json'),'utf8'));
const production=await page.evaluate(payload=>{
 allStations=payload.stations;restoreConnectorRows(payload.connectors);operatorMap=new Map();hydrateStationOperators(allStations);
 const local=allStations.find(s=>s.id==='nap-CNT-0269PL0001');if(!local)return {missing:true};
 document.getElementById('operator-filter').value='all';selectedPower='50-150|150-250';
 const excluded=!stationConnectorRows(local).some(c=>matchesPower(c.power_kw));selectedPower='0-50';
 const included=stationConnectorRows(local).some(c=>matchesPower(c.power_kw));selectedPower='all';renderOperatorChoices();renderStations(false);
 return {excluded,included,name:local.operator_name,power:local.max_power_kw,connectors:stationConnectorRows(local).length,atlanteOptions:[...document.getElementById('operator-filter').options].filter(o=>o.value==='Atlante').length};
},realCatalogue);
assert(!production.missing);assert(production.excluded&&production.included);assert.equal(production.name,'Continente Plug&Charge');assert.equal(production.power,22);assert.equal(production.connectors,2);assert.equal(production.atlanteOptions,1);
await page.screenshot({path:resolve(out,'android-real-catalogue-operators.png'),fullPage:true});
console.log('Real Continente Modelo Marinha Grande: two Type 2 22 kW sockets; included with All/Up to 50; excluded with 50-150/150-250.',production);

// Scope inventory and LIVE readings on the actual reported location; never manufacture missing DC connectors.
await page.route('**/api/connectors**',route=>route.fulfill({status:503,json:{error:'fixture upstream unavailable'}}));
await page.evaluate(()=>{
 const station=allStations.find(s=>s.id==='nap-CNT-0269PL0001');
 for(const c of stationConnectorRows(station)){c.available_count=1;c.availability_source='mobie_nap';c.availability_updated_at=new Date().toISOString();}
 selectStation(station,station.operator_name);
});
await page.waitForFunction(()=>document.getElementById('station-inventory').textContent.includes('Inventário parcial'));
assert((await page.locator('#station-inventory').textContent()).includes('2 lugares normais e 2 rápidos'));
assert((await page.locator('#station-inventory').textContent()).includes('nem a disponibilidade dos rápidos'));
assert.equal(await page.locator('#station-points').textContent(),'2');
assert((await page.locator('#station-status').textContent()).includes('fichas reportadas'));
assert.equal(await page.locator('#station-inventory a').getAttribute('href'),'https://feed.continente.pt/plug-charge/continente-modelo-marinha-grande');
await page.waitForFunction(()=>document.getElementById('station-refresh-message').textContent.includes('Mantidos os conectores'));
assert.equal(await page.locator('#station-connectors').textContent(),'Type 2');
await page.evaluate(()=>setLanguage('en'));
assert((await page.locator('#station-inventory').textContent()).includes('Partial inventory'));
assert((await page.locator('#station-inventory').textContent()).includes('2 normal and 2 rapid parking spaces'));
await page.evaluate(()=>setLanguage('pt'));
await page.screenshot({path:resolve(out,'android-inventory-partial-mobile.png'),fullPage:true});
await page.setViewportSize({width:800,height:1000});await page.screenshot({path:resolve(out,'android-inventory-partial-tablet.png'),fullPage:true});
for(const width of [320,390,800]){await page.setViewportSize({width,height:900});assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'Inventory detail overflow at '+width);}
assert.equal(errors.length,0,errors.join('\n'));
console.log('Inventory: reviewed operator source, scoped AC readings, absent DC availability, PT/EN, retained connectors on upstream failure and viewport matrix passed.');
// Real controls: selection changes estimates but never filters station operators.
await page.locator('#nav-map').click();
await page.evaluate(()=>{currentSession=null;updateAuthUI();});
await page.locator('.android-payments summary').click();
await page.waitForFunction(()=>document.querySelectorAll('#payment-choices input').length>0);
const operatorsBefore=await page.evaluate(()=>selectedOperatorValues().join('|'));
await page.locator('#payment-all').uncheck();
await page.waitForFunction(()=>ChargeVoyPayments.get().mode==='selected'&&ChargeVoyPayments.get().ids.length===0);
assert.equal(await page.evaluate(()=>selectedOperatorValues().join('|')),operatorsBefore);
assert.equal(await page.locator('#android-hero').getByText(/~.*€/).count(),0);
const firstPayment=page.locator('#payment-choices input').first();const chosen=await firstPayment.inputValue();await firstPayment.check();
assert.deepEqual(await page.evaluate(()=>ChargeVoyPayments.get().ids),[chosen]);
await page.screenshot({path:resolve(out,'android-payment-selection.png'),fullPage:true});
await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(id=>ChargeVoyPayments.get().ids.includes(id),chosen);
await page.locator('.android-payments summary').click();assert(await page.locator('#payment-choices input').first().isChecked());
await page.locator('#payment-all').check();assert.equal(await page.evaluate(()=>ChargeVoyPayments.get().mode),'all');
assert.equal(errors.length,0,errors.join('\n'));console.log('Payments: selection, no implicit fallback, station filters independent, persistence and All passed.');
await context.close();const art=await browser.newPage();for(const [name,w,h] of [['icon',512,512],['feature-graphic',1024,500]]){await art.setViewportSize({width:w,height:h});await art.setContent('<style>body{margin:0}</style>'+await readFile(resolve(import.meta.dirname,'play-store/artwork',name+'.svg'),'utf8'));await art.screenshot({path:resolve(out,name+'.png')});}await art.close();}finally{await browser.close();server.close();}
