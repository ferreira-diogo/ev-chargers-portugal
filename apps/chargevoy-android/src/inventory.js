(function(scope){
 'use strict';
 const evidence=scope.ChargeVoyInventoryEvidence||[];
 const validQuantity=c=>Number.isInteger(Number(c.quantity))&&Number(c.quantity)>0?Number(c.quantity):1;
 const known=c=>!!c.type&&!['unknown','desconhecido'].includes(String(c.type).toLowerCase());
 function distance(a,b){const r=Math.PI/180,h=Math.sin((Number(a.latitude)-b.latitude)*r/2)**2+Math.cos(Number(a.latitude)*r)*Math.cos(b.latitude*r)*Math.sin((Number(a.longitude)-b.longitude)*r/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
 function analyze(station,connectors=[]){
  const members=station?._location_members||[station],seen=new Set(),rows=[];
  for(const c of connectors){const key=String(c.station_id||station?.id||'')+':'+(c.id||c.connector_uid||c.external_id||JSON.stringify(c));if(seen.has(key))continue;seen.add(key);rows.push(c);}
  const reported=rows.filter(known),reportedCount=reported.reduce((n,c)=>n+validQuantity(c),0),unknownRows=rows.length-reported.length;
  const sources=[...new Set(members.map(s=>s?.source).filter(Boolean))];
  const dates=members.map(s=>{let a=s?.amenities;try{if(typeof a==='string')a=JSON.parse(a);}catch{}return a?.source_updated_at;}).filter(d=>Number.isFinite(Date.parse(d)));
  const sourceDate=dates.length?new Date(Math.min(...dates.map(Date.parse))).toISOString():null;
  const supplemental=evidence.find(e=>members.some(s=>s&&s.source==='nap-mobie'&&e.stationIds.includes(s.id)&&Number.isFinite(Number(s.latitude))&&Number.isFinite(Number(s.longitude))&&distance(s,e)<=e.matchRadiusM));
  const hasAc=reported.some(c=>['type 2','type 1','schuko'].includes(String(c.type).toLowerCase()));
  const hasDc=reported.some(c=>['ccs','chademo'].includes(String(c.type).toLowerCase()));
  const missingNormal=!!supplemental?.normalPlaces&&!hasAc,missingRapid=!!supplemental?.rapidPlaces&&!hasDc;
  // A source refresh can fill a previously missing category. It still does not prove every physical socket is covered.
  const partial=missingNormal||missingRapid||unknownRows>0;
  return {reportedCount,unknownRows,recordCount:members.filter(Boolean).length,sources,sourceDate,supplemental,missingNormal,missingRapid,partial,physicalTotalConfirmed:false};
 }
 function summary(station,connectors,english=false){
  const r=analyze(station,connectors);
  if(r.missingRapid)return english?'Partial inventory · rapid charging confirmed by operator':'Inventário parcial · carregamento rápido confirmado pelo operador';
  if(r.partial)return english?'Partial inventory · connector details missing':'Inventário parcial · faltam detalhes de tomadas';
  return english?'Connectors reported by source · physical total unverified':'Tomadas reportadas pela fonte · total físico por confirmar';
 }
 scope.ChargeVoyInventory={analyze,summary};
})(globalThis);
