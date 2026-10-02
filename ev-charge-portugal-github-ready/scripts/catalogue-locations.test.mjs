import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { readWranglerJson, rowsWritten } from './read-wrangler-json.mjs';

const web = await readFile(new URL('../assets/chargevoy.js', import.meta.url), 'utf8');
const helpers = web.slice(web.indexOf('function stationLocationKey('), web.indexOf('function markerColor('));
function fatima() {
  const stations = [32,33,34,35,36,37].map((id, index) => ({
    id:`nap-FCT-ORM-000${id}`, source:'nap-mobie', operator_id:'nap-operator-iberdrola-bp-pulse',
    name:`A01 - Nó 8 - Fátima #${index + 1}`, address:'Av. João XXIII 137', city:'Ourém',
    latitude:39.627945, longitude:-8.681254, max_power_kw:index < 3 ? 400 : 300,
  }));
  const connectors = new Map(stations.map((station, index) => [station.id,
    (index < 3 ? ['CCS','CCS'] : ['CCS','CHAdeMO','CCS']).map((type, n) => ({
      id:`${station.id}-${n}`,station_id:station.id,type,quantity:1,power_kw:type === 'CHAdeMO' ? 80 : station.max_power_kw,
    }))]));
  const context = vm.createContext({allStations:stations,connectorMap:connectors, console,
    connectorRequests:new Map(), D1_FALLBACK_URL:'https://site.test/api/stations',D1_API_WORKER_URL:'https://api.test/api/stations'});
  vm.runInContext(helpers,context);
  return {stations, connectors, context};
}

test('Fátima combines six charger records into one location with all 15 connectors', () => {
  const {context,stations,connectors} = fatima();
  const grouped = context.groupStationLocations(stations);
  assert.equal(grouped.length,1);
  assert.equal(grouped[0]._location_members.length,6);
  assert.equal(grouped[0].name,'A01 - Nó 8 - Fátima');
  assert.equal(grouped[0].max_power_kw,400);
  const rows = context.stationConnectorRows(grouped[0]);
  assert.equal(rows.length,15);
  assert.equal(rows.filter(row => row.type === 'CCS').length,12);
  assert.equal(rows.filter(row => row.type === 'CHAdeMO').length,3);
  assert.equal(context.stationConnectorRows(context.resolveStationLocation(stations[5])).length,15);
  assert.equal(stations.length,6);
  assert.equal(connectors.get(stations[0].id).length,2);
});

test('grouping keeps other operators, addresses, opposite sides and incomplete records separate', () => {
  const {context,stations} = fatima();
  const first = stations[0];
  const other = [
    {...first,id:'other-network',operator_id:'other'},
    {...first,id:'other-address',address:'Av. João XXIII 139'},
    {...first,id:'other-side',longitude:-8.680254},
    {...first,id:'no-address',address:null},
    {...first,id:'community-source',source:'openchargemap'},
  ];
  assert.equal(context.groupStationLocations([...stations,...other]).length,6);
});

test('individual live states remain attached to their original connector and are counted once', () => {
  const {context,stations,connectors} = fatima();
  connectors.get(stations[5].id)[1].available_count = 1;
  connectors.get(stations[5].id)[1].availability_source = 'mobie_nap';
  const grouped = context.groupStationLocations(stations)[0];
  const rows = context.stationConnectorRows(grouped);
  assert.equal(rows.filter(row => row.available_count === 1).length,1);
  assert.equal(rows.find(row => row.available_count === 1).station_id,stations[5].id);
  assert.equal(new Set(rows.map(row => row.id)).size,15);
});

test('Fátima detail displays 15 rows, six chargers and individual charger labels', () => {
  const {context,stations} = fatima();
  const nodes = new Map();
  context.document = {getElementById(id) {
    if (!nodes.has(id)) nodes.set(id,{textContent:'',innerHTML:''});
    return nodes.get(id);
  }};
  context.currentLanguage = 'pt';
  context.t = text => text;
  for (const [start,end] of [
    ['function stationAvailability(', 'function effectiveStationStatus('],
    ['function escapeHtml(', 'let toastTimer;'],
    ['function connectorCategory(', 'function isOfficialTeslaStation('],
    ['function renderConnectorMatrix(', 'function selectStation('],
  ]) vm.runInContext(web.slice(web.indexOf(start), web.indexOf(end,web.indexOf(start))),context);
  const location = context.groupStationLocations(stations)[0];
  context.updateStationConnectorPanel(location,context.stationConnectorRows(location));
  assert.equal(nodes.get('station-points').textContent,15);
  assert.equal((nodes.get('connector-matrix').innerHTML.match(/class="connector-row"/g)||[]).length,15);
  assert.match(nodes.get('connector-matrix').innerHTML,/Fátima #6/);
  assert.match(nodes.get('station-capacity-note').textContent,/6 carregador/);
  assert.match(nodes.get('station-capacity-note').textContent,/simultâneo/);
});

test('an older D1 response cannot replace the full catalogue with fewer connectors', async () => {
  const {context,stations,connectors} = fatima();
  context.fetchWithTimeout = async url => ({ok:true,json:async()=>({connectors:[
    {...connectors.get(new URL(url).searchParams.get('station_id'))[0],available_count:1,availability_source:'mobie_nap'},
  ]})});
  const rows = await context.loadLocationConnectors(context.groupStationLocations(stations)[0],true);
  assert.equal(rows.length,15);
  assert.equal(rows.filter(row => row.available_count === 1).length,6);
});

test('Wrangler D1 imports tolerate spinner prefixes without repeating successful writes', () => {
  const result = [{success:true,results:[],meta:{rows_written:17}}];
  const log = '├ Checking if file needs uploading\n│ Uploading complete.\n' + JSON.stringify(result,null,2);
  assert.equal(rowsWritten(readWranglerJson(log)),17);
  assert.equal(rowsWritten(readWranglerJson(JSON.stringify(result))),17);
  assert.equal(rowsWritten([{success:true,meta:{rows_written:0}}]),0);
  assert.throws(()=>readWranglerJson('├ Checking if file needs uploading\n'),/complete JSON/);
  assert.throws(()=>rowsWritten([{success:false,meta:{rows_written:17}}]),/successful D1/);
  assert.throws(()=>rowsWritten([{success:true,meta:{}}]),/row count/);
});
