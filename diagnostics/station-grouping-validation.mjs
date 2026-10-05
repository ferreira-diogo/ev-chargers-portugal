import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const distance=(a,b)=>{const r=Math.PI/180,dlat=(b.latitude-a.latitude)*r,dlon=(b.longitude-a.longitude)*r;const h=Math.sin(dlat/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(dlon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));};
const napResponse=await fetch('https://ev-nap.mobie.pt/integration/nap/evChargingInfra',{signal:AbortSignal.timeout(300000)});if(!napResponse.ok)throw Error('NAP '+napResponse.status);
const xml=await napResponse.text();await writeFile('/tmp/audit-nap.xml',xml);
execFileSync('npm',['ci','--ignore-scripts'],{cwd:'ev-charge-portugal-github-ready',stdio:'inherit'});
execFileSync(process.execPath,['scripts/import-nap-datex.mjs','--web-snapshot','--file=/tmp/audit-nap.xml'],{cwd:'ev-charge-portugal-github-ready',env:{...process.env,NAP_WEB_SNAPSHOT:'/tmp/audit-snapshot.json'},stdio:'inherit'});
const data=JSON.parse(await readFile('/tmp/audit-snapshot.json','utf8'));if(data.stations.length<8000)throw Error('Incomplete catalogue');
const src=await readFile('ev-charge-portugal-github-ready/assets/chargevoy.js','utf8');
const helpers=src.slice(src.indexOf('function stationLocationKey('),src.indexOf('function markerColor('));
const connectorMap=new Map();for(const c of data.connectors){const list=connectorMap.get(c.station_id)||[];list.push(c);connectorMap.set(c.station_id,list);}
const api=new Function('allStations','connectorMap',helpers+';return {stationLocationKey,groupStationLocations,stationConnectorRows};')(data.stations,connectorMap);
const describe=s=>({id:s.id,name:s.name,address:s.address,city:s.city,latitude:s.latitude,longitude:s.longitude,operator:s.operator_name,group_key:api.stationLocationKey(s),connectors:(connectorMap.get(s.id)||[]).map(c=>({id:c.id,type:c.type,power_kw:c.power_kw,quantity:c.quantity}))});
const target=data.stations.find(s=>s.external_id==='ACC-VRL-00062');if(!target)throw Error('Target not found');
const neighbors=data.stations.filter(s=>distance(target,s)<1000).sort((a,b)=>distance(target,a)-distance(target,b));
console.log('TARGET_NEIGHBORS '+JSON.stringify(neighbors.map(s=>({...describe(s),distance_m:Math.round(distance(target,s))}))));

const locations=api.groupStationLocations(data.stations);
const flattened=locations.flatMap(s=>s._location_members||[s]);
if(flattened.length!==data.stations.length||new Set(flattened.map(s=>s.id)).size!==data.stations.length)throw Error('Lost or duplicated station membership');
const counts=locations.reduce((n,s)=>n+api.stationConnectorRows(s).length,0);if(counts!==data.connectors.length)throw Error('Lost connector membership');
const north=locations.find(s=>(s._location_members||[s]).some(m=>m.external_id==='ACC-VRL-00062'));
if(north._location_members?.length!==2||api.stationConnectorRows(north).length!==4||north._location_members.some(s=>['ACC-VRL-00063','ACC-VRL-00064'].includes(s.external_id)))throw Error('Vila Real regression');
const beforeKeys=new Set(data.stations.map(api.stationLocationKey)).size;
const summary={publication_time:data.publication_time,station_records:data.stations.length,connectors:data.connectors.length,previous_locations:beforeKeys,new_locations:locations.length,grouped_locations:locations.filter(s=>s._location_members).length,north:describe(north),north_members:north._location_members.map(describe),all_records_and_connectors_preserved:true};
console.log('NATIONAL_VALIDATION '+JSON.stringify(summary));
await writeFile('station-grouping-audit.json',JSON.stringify(summary,null,2));
