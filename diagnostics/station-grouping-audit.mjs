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
const groups=new Map();for(const s of data.stations){if(s.source!=='nap-mobie'||!s.operator_id||!s.address||!Number.isFinite(s.latitude)||!Number.isFinite(s.longitude))continue;const key=[normalize(s.operator_id),normalize(s.address),normalize(s.city)].join('|');const g=groups.get(key)||[];g.push(s);groups.set(key,g);}
const baseName=s=>normalize(s.name).replace(/\s*(?:#\s*)?\d+\s*$/,'').trim();
const pairs=[];
for(const stations of groups.values())for(let i=0;i<stations.length;i++)for(let j=i+1;j<stations.length;j++){const a=stations[i],b=stations[j],d=distance(a,b);if(d>150||api.stationLocationKey(a)===api.stationLocationKey(b))continue;pairs.push({a:a.id,b:b.id,distance_m:Math.round(d*10)/10,same_base_name:baseName(a)===baseName(b),name_a:a.name,name_b:b.name,address:a.address,city:a.city,operator:a.operator_name,connectors_a:(connectorMap.get(a.id)||[]).reduce((n,c)=>n+(Number(c.quantity)||1),0),connectors_b:(connectorMap.get(b.id)||[]).reduce((n,c)=>n+(Number(c.quantity)||1),0)});}
const likely=pairs.filter(p=>p.same_base_name&&p.distance_m<=80);
function components(pairs){const nodes=new Map();for(const p of pairs){for(const [a,b]of [[p.a,p.b],[p.b,p.a]]){const list=nodes.get(a)||[];list.push(b);nodes.set(a,list);}}const seen=new Set(),out=[];for(const id of nodes.keys()){if(seen.has(id))continue;const group=[],todo=[id];while(todo.length){const x=todo.pop();if(seen.has(x))continue;seen.add(x);group.push(x);todo.push(...nodes.get(x));}out.push(group);}return out;}
const clusters=components(likely);const summary={publication_time:data.publication_time,records:data.stations.length,connectors:data.connectors.length,current_locations:api.groupStationLocations(data.stations).length,target:describe(target),candidate_pairs_150m:pairs.length,likely_same_name_pairs_80m:likely.length,likely_split_groups:clusters.length,likely_affected_charger_records:new Set(likely.flatMap(p=>[p.a,p.b])).size,counts_are_candidates_not_verified_physical_sites:true};
console.log('SUMMARY '+JSON.stringify(summary));console.log('EXAMPLES '+JSON.stringify(likely.slice(0,25)));
await writeFile('station-grouping-audit.json',JSON.stringify({summary,target_neighbors:neighbors.map(describe),likely_split_groups:clusters,likely_pairs:likely,other_candidate_pairs:pairs.filter(p=>!likely.includes(p))},null,2));
let n=0;for(const match of xml.matchAll(/<(?:[\w.-]+:)?energyInfrastructureSite\b[\s\S]*?<\/(?:[\w.-]+:)?energyInfrastructureSite>/g)){const fragment=match[0];if(neighbors.some(s=>fragment.includes('id="'+s.external_id+'"'))){console.log('RAW_SITE '+fragment.slice(0,18000));n++;}}
console.log('RAW_MATCHED_SITES '+n);
