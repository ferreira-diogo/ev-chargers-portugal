import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, writeFile, mkdir, rm, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import siteWorker from '../worker/index.js';
import apiWorker from '../worker-api/index.js';

const web = await readFile(new URL('../assets/chargevoy.js', import.meta.url), 'utf8');
function extract(start, end) { return web.slice(web.indexOf(start), web.indexOf(end, web.indexOf(start))); }

test('six sourced card tariffs preserve period prices and fixed-price eligibility', async () => {
  const cards = JSON.parse(await readFile(new URL('../assets/ceme-cards.json', import.meta.url), 'utf8'));
  assert.equal(new Set(cards.map(card => card.name)).size, 6);
  const context = vm.createContext({ currentVehicle: {max_dc_power_kw: 100}, operatorMap: new Map([['other', 'Other'], ['atlante', 'Atlante']]), selectedStation: {operator_id:'other'} });
  vm.runInContext(extract('function networkTariff(', 'let simMode ='), context);
  vm.runInContext(extract('function cardEnergyRate(', 'function cardSourceLink('), context);
  vm.runInContext(extract('function calculateCardPrice(', 'function adHocPriceMarkup('), context);
  const scenario = { energyKwh: 20 };
  const opc = {connector_type:'CCS',power_kw:50,voltage_level:'BT',activation_fee_eur:0,energy_price_eur_kwh:0.20,time_price_eur_min:0};
  const galp = cards.find(card => card.id === 'galp-electric');
  const prio = cards.find(card => card.id === 'prio-electric-kwh');
  assert.equal(context.cardEnergyRate(galp, 'vazio'), 0.1954);
  assert.equal(context.cardEnergyRate(prio, 'fora_vazio'), 0.1399);
  assert(context.calculateCardPrice(galp, opc, scenario, 'vazio').total < context.calculateCardPrice(galp, opc, scenario, 'fora_vazio').total);
  const atlante = cards.find(card => card.id === 'myatlante');
  context.selectedStation = {operator_id:'atlante'};
  assert.equal(context.calculateCardPrice(atlante, opc, scenario, 'fora_vazio').total, 9.8);
  context.selectedStation = {operator_id:'other'};
  assert.equal(context.calculateCardPrice(atlante, {...opc,power_kw:22}, scenario, 'fora_vazio').finalFixed, undefined);
  assert.equal(cards.find(card => card.id === 'edp-charge').estimate_enabled, false);
});

test('vehicle connector arrays and D1 JSON strings match CCS stations', () => {
  const context = vm.createContext({connectorMap: new Map([['s', [{type:'CCS'}]]])});
  vm.runInContext(extract('function connectorCategory(', 'function isOfficialTeslaStation('), context);
  vm.runInContext(extract('function normalizeVehicle(', 'function populateVehicles('), context);
  vm.runInContext(extract('function stationCompatibleWithVehicle(', 'function routeAvailabilityPenalty('), context);
  for (const types of ['["CCS2","Type 2"]', ['CCS2', 'Type 2']]) {
    context.currentVehicle = context.normalizeVehicle({connector_types:types});
    assert.equal(context.stationCompatibleWithVehicle({id:'s'}), true);
  }
  context.currentVehicle = context.normalizeVehicle({connector_types:['CHAdeMO']});
  assert.equal(context.stationCompatibleWithVehicle({id:'s'}), false);
});

test('Tesla Supercharger filter recognizes boolean amenities and JSON text', () => {
  const context = vm.createContext({});
  vm.runInContext(extract('function isOfficialTeslaStation(', 'function isTeslaVehicle('), context);
  assert.equal(context.isOfficialTeslaStation({amenities:{tesla_official_supercharger:true}}), true);
  assert.equal(context.isOfficialTeslaStation({amenities:'{"tesla_official_supercharger":true}'}), true);
  assert.equal(context.isOfficialTeslaStation({amenities:'{}'}), false);
});

test('power filter uses connector power when station aggregate is missing or lower', () => {
  const context = vm.createContext({connectorMap:new Map([['s',[{power_kw:150},{power_kw:350}]]]), selectedPower:'150-250'});
  vm.runInContext(extract('function matchesPower(', 'function markerCellKey('), context);
  assert.equal(context.matchesPower(context.stationMaxPowerKw({id:'s',max_power_kw:null})), false);
  assert.equal(context.matchesPower(context.stationMaxPowerKw({id:'s',max_power_kw:50})), false);
  assert.equal(context.stationMaxPowerKw({id:'other',max_power_kw:175}), 175);
  context.selectedPower = '0-50';
  assert.equal(context.matchesPower(0), false);
  assert.equal(context.matchesPower(50), true);
});

test('Tesla-only and connector type filters must both match', () => {
  const context = vm.createContext({});
  vm.runInContext(extract('function connectorCategory(', 'function isTeslaVehicle('), context);
  vm.runInContext(extract('function matchesConnectorFilters(', 'function renderStations('), context);
  const official = {amenities:{tesla_official_supercharger:true}};
  const ordinary = {amenities:{}};
  assert.equal(context.matchesConnectorFilters(official, [{type:'CCS2'}], ['Tesla','CCS']), true);
  assert.equal(context.matchesConnectorFilters(official, [{type:'Type 2'}], ['Tesla','CCS']), false);
  assert.equal(context.matchesConnectorFilters(ordinary, [{type:'CCS2'}], ['Tesla','CCS']), false);
});

test('local vehicle catalogue contains battery EVs and the electric GLC', () => {
  const context = vm.createContext({});
  vm.runInContext(extract('const LOCAL_VEHICLE_FALLBACK = [', 'let vehicleModels ='), context);
  const cars = vm.runInContext('LOCAL_VEHICLE_FALLBACK', context);
  assert(cars.some(v => v.make === 'Mercedes-Benz' && v.model === 'GLC' && v.variant.includes('Elétrico')));
  assert(cars.some(v => v.make === 'Renault' && v.model === '4 E-Tech'));
  assert(!cars.some(v => v.variant === '300e'));
});

test('vehicle catalogue merges D1 rows with local fallback and keeps D1 values', () => {
  const elements = new Map();
  function makeElement(id) { if (!elements.has(id)) elements.set(id, {innerHTML:'', value:'', options:[], add(option){this.options.push(option);}}); return elements.get(id); }
  const context = vm.createContext({LOCAL_VEHICLE_FALLBACK:[
    {id:'local-1',source:'local-fallback',make:'Tesla',model:'Model 3',variant:'RWD',model_year_start:2023,max_dc_power_kw:170},
    {id:'local-2',source:'local-fallback',make:'BMW',model:'i4',variant:'eDrive40',model_year_start:2023,max_dc_power_kw:200},
  ], document:{getElementById:makeElement}, localStorage:{getItem(){return null;}}, escapeHtml:s=>String(s), normalizeVehicle:v=>v, applyVehicle(){}});
  vm.runInContext(extract('function populateVehicles(', 'function vehicleIllustration('), context);
  context.renderVehicleOptions = () => {};
  context.populateVehicles([{id:'d1-1',source:'gaia-evdb',make:'Tesla',model:'Model 3',variant:'RWD',model_year_start:2023,max_dc_power_kw:170}]);
  assert.equal(context.vehicleModels.length, 2);
  assert.equal(context.vehicleModels.find(v=>v.make==='Tesla').id, 'd1-1');
  assert.equal(context.vehicleModels.find(v=>v.make==='BMW').id, 'local-2');
});

test('D1 vehicle catalogue pagination is ordered and uses the requested offset', async () => {
  let query = '', args = [];
  const env = {CHARGEVOY_DB:{prepare(sql){query=sql;return {
    bind(...values){args=values;return this;},
    async all(){return {results:[{id:'vehicle-501',make:'Renault'}]};},
  };}}};
  const response = await apiWorker.fetch(new Request('https://test/api/catalog?table=vehicle_models&active_eq=1&limit=500&offset=500'),env);
  assert.equal(response.status,200);
  assert.match(query,/ORDER BY "id" LIMIT 500 OFFSET 500/);
  assert.deepEqual(args,['1']);
  assert.equal((await response.json()).rows[0].id,'vehicle-501');
});

test('D1 export writes every record exactly once across batch boundaries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chargevoy-test-'));
  try {
    const source = await readFile(new URL('./import-nap-datex.mjs', import.meta.url), 'utf8');
    const context = vm.createContext({ process: { env: { D1_SQL_DIR: join(dir, 'sql') } }, rm, mkdir, writeFile, join });
    vm.runInContext(source.slice(source.indexOf('function d1Sql(')), context);
    const stations = Array.from({length: 601}, (_, i) => ({external_id: `site-${i}`, latitude: 39, longitude: -8}));
    const connectors = stations.map(s => ({external_id: `${s.external_id}-point`, station_external_id: s.external_id}));
    await context.writeD1Snapshot({stations, connectors});
    for (const table of ['station_cache_v2', 'connectors']) {
      const files = (await readdir(join(dir, 'sql'))).filter(n => n.endsWith(`_${table}.sql`));
      const sql = (await Promise.all(files.map(n => readFile(join(dir, 'sql', n), 'utf8')))).join('\n');
      const ids = [...sql.matchAll(/^\('([^']+)'/gm)].map(m => m[1]);
      assert.equal(ids.length, 601);
      assert.equal(new Set(ids).size, 601);
      for (let i = 0; i < 601; i++) assert(ids.includes(`nap-site-${i}${table === 'connectors' ? '-point' : ''}`));
    }
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('both APIs and the map distinguish live, previous and expired readings', async () => {
  const now = Date.now();
  const RealDate = Date;
  class Clock extends RealDate { static now() { return now; } }
  const context = vm.createContext({Date: Clock, t: s => s, currentLanguage: 'pt', connectorCategory: s => s});
  vm.runInContext(extract('function stationAvailability(', 'function availabilityHtml('), context);
  for (const worker of [siteWorker, apiWorker]) {
    for (const [minutes, kind] of [[4, 'live'], [6, 'stale'], [19, 'stale'], [21, 'stale']]) {
      const env = {
        CHARGEVOY_DB: { prepare(sql) { return { bind() { return this; }, async all() {
          return {results: sql.includes('nap_connector_mapping') ? [{connector_id: 'c', site_id: 's', point_id: 'p'}] : [{id: 'c', station_id: 'nap-s', type: 'CCS', quantity: 1}]};
        }}; } },
        AVAILABILITY_KV: { async get() { return {publication_time: new Date(now - minutes * 60000).toISOString(), statuses: {'s|p': 'available'}}; } },
      };
      const response = await worker.fetch(new Request('https://test/api/connectors?station_id=nap-s'), env);
      assert.equal(response.status, 200);
      const {connectors} = await response.json();
      const c = connectors[0];
      assert.equal(c.available_count, minutes <= 5 ? 1 : null);
      assert.equal(c.last_known_available_count, 1);
      assert.equal(context.stationAvailability(connectors).kind, kind);
    }
  }
  for (const [age, kind] of [[300000,'live'],[300001,'stale'],[1200000,'stale'],[1200001,'stale']]) {
    assert.equal(context.stationAvailability([{quantity:1, available_count:1, availability_source:'mobie_nap', availability_updated_at:new Date(now-age).toISOString()}]).kind, kind);
  }
});

test('station page cache avoids repeated D1 reads while KV availability remains current', async () => {
  const previousCache = globalThis.caches;
  try {
    for (const worker of [siteWorker, apiWorker]) {
      const pages = new Map();
      globalThis.caches = {default: {
        async match(key) { return pages.get(key.url)?.clone(); },
        async put(key, response) { pages.set(key.url, response.clone()); },
      }};
      let reads = 0, state = 'available';
      const env = {
        CHARGEVOY_DB: {prepare(sql) { return {bind() {return this;}, async all() {
          reads++;
          if (sql.includes('FROM station_cache_v2')) return {results:[{id:'nap-site',name:'Test',latitude:39,longitude:-8,max_power_kw:150}]};
          if (sql.includes('FROM connectors')) return {results:[{id:'nap-connector',station_id:'nap-site',type:'CCS',quantity:1,power_kw:150}]};
          if (sql.includes('FROM nap_connector_mapping')) return {results:[{connector_id:'nap-connector',site_id:'site',point_id:'point'}]};
          throw Error('Unexpected D1 query');
        }};}},
        AVAILABILITY_KV: {async get() {return {publication_time:new Date().toISOString(),statuses:{'site|point':state}};}},
      };
      const request = new Request('https://example.com/api/stations?limit=1');
      const first = await (await worker.fetch(request,env)).json();
      const firstReads = reads;
      state = 'blocked';
      const second = await (await worker.fetch(request,env)).json();
      assert.equal(first.stations.length, 1);
      assert.equal(first.connectors[0].available_count, 1);
      assert.equal(second.connectors[0].available_count, 0);
      assert.equal(reads, firstReads);
      assert(firstReads >= 2);
    }
  } finally { globalThis.caches = previousCache; }
});

test('national NAP snapshot keeps the map and live KV colours working when D1 quota is exhausted', async () => {
  const catalogue = {
    stations: Array.from({length: 8001}, (_, i) => ({
      id: `nap-site-${i}`, name: `Posto ${i}`, latitude: 39, longitude: -8,
      max_power_kw: 150, source: 'nap-mobie',
    })),
    connectors: [{id:'nap-site-0-point-1',station_id:'nap-site-0',type:'CCS',power_kw:150,quantity:1}],
  };
  let d1Reads = 0, assetReads = 0;
  const env = {
    CHARGEVOY_DB: {prepare() { d1Reads++; throw Error("D1 code 7500"); }},
    ASSETS: {async fetch() {assetReads++; return Response.json(catalogue);}},
    AVAILABILITY_KV: {async get() {return {publication_time:new Date().toISOString(),statuses:{'site-0|point': 'available'}};}},
  };
  const first = await (await siteWorker.fetch(new Request('https://example.com/api/stations?limit=300'),env)).json();
  const second = await (await siteWorker.fetch(new Request('https://example.com/api/stations?limit=500&offset=300'),env)).json();
  assert.equal(first.source,'nap-snapshot+kv');
  assert.equal(first.stations.length,300);
  assert.equal(first.connectors[0].available_count,1);
  assert.equal(second.stations.length,500);
  assert.equal(second.stations[0].id,'nap-site-300');
  const selected = await (await siteWorker.fetch(new Request('https://example.com/api/connectors?station_id=nap-site-0'),env)).json();
  assert.equal(selected.connectors[0].available_count,1);
  assert.equal(d1Reads,3);
  assert.equal(assetReads,3);
});

test('the first station page does not wait for a mobile location permission decision', async () => {
  const context = vm.createContext({
    D1_FALLBACK_URL: 'https://example.com/api/stations',
    D1_API_WORKER_URL: 'https://fallback.example.com/api/stations',
    connectorMap: new Map(), URLSearchParams, console,
    fetchWithTimeout: async () => Response.json({stations:[{id:'nap-site'}],connectors:[]}),
  });
  vm.runInContext(extract('async function loadFallbackStations(', 'async function loadRemainingNationalStations('), context);
  const unresolvedLocation = new Promise(() => {});
  const rows = await Promise.race([
    context.loadFallbackStations(unresolvedLocation),
    new Promise((_, reject) => setTimeout(() => reject(Error('waited for geolocation')), 100)),
  ]);
  assert.equal(rows[0].id, 'nap-site');
  assert.match(web, /const stations = await loadFallbackStations\(locationPromise\)/);
  assert.doesNotMatch(web, /const place = await locationPromise;/);
});

test('automatic mobile location keeps the national map in view', async () => {
  const nodes = new Map();
  const document = {getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, {value:'',textContent:'',disabled:false,classList:{add() {}}});
    return nodes.get(id);
  }};
  let zooms = 0, popups = 0;
  const context = vm.createContext({
    document, console, searchLayer:{clearLayers() {}},
    browserPosition: async () => ({lat:39,lon:-8,accuracy:25}),
    L: {circle: () => ({addTo() {}}), marker: () => ({addTo() {return this;},bindPopup() {return this;},openPopup() {popups++;}})},
    map: {setView() {zooms++;}}, renderStations() {},
  });
  vm.runInContext(extract('async function useMyLocation(', 'async function routeToSelectedStation('), context);
  await context.useMyLocation({silent:true,focusMap:false});
  assert.equal(zooms,0);
  assert.equal(popups,0);
  assert.equal(nodes.get('sort-filter').value,'distance-asc');
  await context.useMyLocation();
  assert.equal(zooms,1);
  assert.equal(popups,1);
});

test('restricted mobile storage does not abort the public map script', () => {
  const context = vm.createContext({
    localStorage: {getItem() {throw Error('storage blocked');}},
    console: {warn() {}}, Set, WeakMap,
  });
  vm.runInContext(web.slice(web.indexOf('let favoriteStationIds ='),web.indexOf('let lastPlannedRoute =')),context);
  vm.runInContext(web.slice(web.indexOf('let currentLanguage ='),web.indexOf('const i18nOriginalText =')),context);
  assert.equal(vm.runInContext('favoriteStationIds.size',context),0);
  assert.equal(vm.runInContext('currentLanguage',context),'pt');
  const auth = vm.createContext({window:{},SUPABASE_URL:'https://example.com',SUPABASE_KEY:'public'});
  vm.runInContext(web.slice(web.indexOf('const authClient ='),web.indexOf('const map =')),auth);
  assert.equal(vm.runInContext('authClient == null',auth),true);
});

test('station markers retain last known colour beyond twenty minutes without claiming LIVE', () => {
  const now = Date.now();
  class Clock extends Date { static now() { return now; } }
  const connectorMap = new Map();
  const context = vm.createContext({Date: Clock, t: s => s, currentLanguage: 'pt', connectorCategory: s => s, connectorMap});
  vm.runInContext(extract('function stationAvailability(', 'function escapeHtml('), context);
  const station = {id: 's', status: 'unknown'};
  for (const [minutes, available, expected] of [
    [4, 1, 'available'], [6, 1, 'available'], [19, 0, 'unavailable'],
    [21, 1, 'available'], [180, 0, 'unavailable'],
  ]) {
    connectorMap.set('s', [{quantity: 1, available_count: minutes <= 5 ? available : null,
      last_known_available_count: available,
      availability_source: minutes <= 5 ? 'mobie_nap' : 'mobie_nap_stale',
      availability_updated_at: new Date(now - minutes * 60000).toISOString()}]);
    assert.equal(context.effectiveStationStatus(station), expected);
    assert.equal(context.stationAvailability(connectorMap.get('s')).kind,
      minutes <= 5 ? 'live' : 'stale');
  }
});

test('station refresh requests only the selected station, coalesces and preserves data on failure', async () => {
  const rows = [{id:'c', station_id:'one'}], calls = [];
  let fail = false;
  const connectorMap = new Map([['one', [{id:'old'}]]]);
  const context = vm.createContext({connectorMap, connectorRequests: new Map(), D1_FALLBACK_URL:'https://site/api/stations', D1_API_WORKER_URL:'https://api/api/stations', console: {warn() {}}, encodeURIComponent,
    async fetchWithTimeout(url, options) { calls.push(url); assert.equal(options.cache, 'no-store'); if(fail) throw new Error('offline'); return {ok:true, json:async () => ({connectors: rows})}; }
  });
  vm.runInContext(extract('async function loadStationConnectors(', 'function markerColor('), context);
  await Promise.all([context.loadStationConnectors('one', true), context.loadStationConnectors('one', true)]);
  assert.deepEqual(calls, ['https://site/api/connectors?station_id=one']);
  assert.equal(connectorMap.get('one'), rows);
  fail = true;
  await assert.rejects(context.loadStationConnectors('one', true));
  assert.equal(connectorMap.get('one'), rows);
  assert(calls.every(url => url.endsWith('/api/connectors?station_id=one')));
});

test('manual source refresh is throttled globally and confirms its publication time', async () => {
  const oldFetch = globalThis.fetch;
  const calls = [];
  let lock = null;
  globalThis.fetch = async (url, options) => {
    calls.push({url, options});
    return new Response(null, {status:204});
  };
  try {
    const env = {
      GITHUB_ACTIONS_TOKEN: 'test-only',
      AVAILABILITY_KV: {
        async get(key) {
          if (key === 'mobie_nap_current') return {publication_time:new Date(Date.now()-6*60000).toISOString(),statuses:{}};
          return lock;
        },
        async put(key, value, options) {lock = value; assert.equal(options.expirationTtl,300);},
      },
    };
    const request = () => new Request('https://test/api/refresh-station', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({station_id:'nap-site-123'}),
    });
    const first = await apiWorker.fetch(request(),env);
    assert.equal(first.status,202);
    assert.equal((await first.json()).queued,true);
    const second = await apiWorker.fetch(request(),env);
    assert.equal(second.status,202);
    assert.equal((await second.json()).reason,'already_requested');
    assert.equal(calls.length,1);
    assert.equal((await apiWorker.fetch(new Request('https://test/api/refresh-station',{method:'POST',body:'{"station_id":"bad"}'}),env)).status,400);
  } finally {globalThis.fetch = oldFetch;}
});

test('manual refresh displays a newly published reading for the selected station', async () => {
  const oldTime = new Date(Date.now()-10*60000).toISOString();
  const newTime = new Date().toISOString();
  const station = {id:'nap-one',source:'nap-mobie'};
  const nodes = new Map([
    ['refresh-station',{disabled:false,textContent:''}],
    ['station-refresh-message',{textContent:''}],
  ]);
  const connectorMap = new Map([['nap-one',[{availability_updated_at:oldTime}]]]);
  let reads = 0, rendered = 0, otherRead = false;
  const context = vm.createContext({
    document:{hidden:false,getElementById:id=>nodes.get(id)},
    selectedStation:station, allStations:[station], connectorMap,
    D1_API_WORKER_URL:'https://api/api/stations', t:s=>s,
    currentLanguage:'pt', console, Date, setTimeout:fn=>fn(),
    async fetchWithTimeout(url,options){
      assert.equal(url,'https://api/api/refresh-station');
      assert.equal(options.method,'POST');
      assert.equal(JSON.parse(options.body).station_id,'nap-one');
      return Response.json({queued:true,publication_time:oldTime},{status:202});
    },
    async loadStationConnectors(id) {
      if(id!=='nap-one') otherRead=true;
      const rows=[{availability_updated_at:++reads===1?oldTime:newTime}];
      connectorMap.set(id,rows);
      return rows;
    },
    updateStationConnectorPanel(){rendered++},
    renderStations(){}, notifyUser(){},
  });
  vm.runInContext(extract('let availabilityRefreshBusy = false;', 'document.getElementById("refresh-station").addEventListener'),context);
  await context.refreshAvailability(true);
  assert.equal(reads,2);
  assert.equal(rendered,1);
  assert.equal(otherRead,false);
  assert.match(nodes.get('station-refresh-message').textContent,/Consultado às/);
});
