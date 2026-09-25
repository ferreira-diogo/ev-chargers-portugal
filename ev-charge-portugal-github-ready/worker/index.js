async function readAvailabilitySnapshot(env) {
  if (!env.AVAILABILITY_KV) return null;
  try {
    const snapshot = await env.AVAILABILITY_KV.get("mobie_nap_current", "json");
    if (!snapshot?.statuses) return null;
    const published = Date.parse(snapshot.publication_time || snapshot.refreshed_at || "");
    return { ...snapshot, age_minutes: Number.isFinite(published) ? Math.max(0, (Date.now() - published) / 60000) : null };
  } catch (error) {
    console.error("NAP snapshot:", error);
    return null;
  }
}

async function mergeAvailability(rows, env, snapshot = null) {
  if (!rows.length) return rows;
  snapshot ||= await readAvailabilitySnapshot(env);
  if (!snapshot?.statuses) return rows;
  const fresh = snapshot.age_minutes == null || snapshot.age_minutes <= 30;
  for (const connector of rows) {
    const site = String(connector.station_id || "").replace(/^nap-/, "");
    const external = String(connector.external_id || connector.id || "").replace(/^nap-/, "");
    let point = external.startsWith(site + "-") ? external.slice(site.length + 1) : external;
    let status = snapshot.statuses[site + "|" + point];
    while (!status && /-\d+$/.test(point)) {
      point = point.replace(/-\d+$/, "");
      status = snapshot.statuses[site + "|" + point];
    }
    if (!status) continue;
    connector.status = fresh ? status : "unknown";
    connector.availability_updated_at = snapshot.publication_time;
    connector.availability_source = fresh ? "mobie_nap" : "mobie_nap_stale";
    connector.available_count = !fresh ? null : status === "available" ? 1 : ["charging", "outOfOrder", "blocked", "inoperative", "reserved"].includes(status) ? 0 : null;
  }
  return rows;
}

const fields = ["id","external_id","source","name","address","city","latitude","longitude","max_power_kw","status","operator_id","amenities"].join(", ");
function json(body, status = 200, cacheControl = "no-store") {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cacheControl, "access-control-allow-origin": "*", "access-control-allow-methods": "GET,OPTIONS", "access-control-allow-headers": "Content-Type" } });
}
function numberParam(url, name) { const raw=url.searchParams.get(name); if(raw==null||raw.trim()==="") return null; const n=Number(raw); return Number.isFinite(n)?n:null; }
async function stations(request, env) {
  const db=env.CHARGEVOY_DB; if(!db) return json({stations:[],error:"D1 binding unavailable"},503);
  const url=new URL(request.url);
  const minLat=numberParam(url,"min_lat"), maxLat=numberParam(url,"max_lat"), minLon=numberParam(url,"min_lon"), maxLon=numberParam(url,"max_lon");
  const hasBounds=[minLat,maxLat,minLon,maxLon].every(v=>v!==null)&&minLat<=maxLat&&minLon<=maxLon;
  const lat=numberParam(url,"lat"), lon=numberParam(url,"lon");
  const hasLocation=lat!==null&&lon!==null&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180;
  const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||500),1),1500);
  try {
    let stmt;
    if(hasBounds) stmt=db.prepare(`SELECT ${fields} FROM station_cache_v2 WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? ORDER BY COALESCE(max_power_kw,0) DESC LIMIT ?`).bind(minLat,maxLat,minLon,maxLon,limit);
    else if(hasLocation) stmt=db.prepare(`SELECT ${fields} FROM station_cache_v2 WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? ORDER BY COALESCE(max_power_kw,0) DESC LIMIT ?`).bind(lat-.45,lat+.45,lon-.65,lon+.65,limit);
    else stmt=db.prepare(`SELECT ${fields} FROM station_cache_v2 ORDER BY COALESCE(max_power_kw,0) DESC LIMIT ?`).bind(limit);
    const result=await stmt.all(); const stationRows=result.results||[]; let connectorRows=[];
    const stationIds=stationRows.map(s=>s.id).filter(Boolean);
    for(let offset=0;offset<stationIds.length;offset+=80){const batch=stationIds.slice(offset,offset+80);const placeholders=batch.map(()=>"?").join(", ");const r=await db.prepare(`SELECT id, station_id, type, power_kw, quantity, available_count, status, availability_updated_at, availability_source FROM connectors WHERE station_id IN (${placeholders})`).bind(...batch).all();connectorRows.push(...(r.results||[]));}
    const snapshot=await readAvailabilitySnapshot(env); await mergeAvailability(connectorRows,env,snapshot);
    return json({source:"cloudflare-d1+kv",stale:false,availability_publication_time:snapshot?.publication_time||null,availability_age_minutes:snapshot?.age_minutes??null,stations:stationRows,connectors:connectorRows});
  } catch(error){console.error("D1 stations:",error);return json({stations:[],connectors:[],error:"D1 query failed"},503);}
}
export default {async fetch(request,env){const url=new URL(request.url);if(request.method==="OPTIONS")return new Response(null,{headers:{"access-control-allow-origin":"*","access-control-allow-methods":"GET,OPTIONS","access-control-allow-headers":"Content-Type"}});if(url.pathname==="/api/stations"||url.pathname.startsWith("/api/stations/"))return stations(request,env);if(url.pathname==="/api/connectors"){if(!env.CHARGEVOY_DB)return json({connectors:[],error:"D1 binding unavailable"},503);const stationId=url.searchParams.get("station_id");if(!stationId||stationId.length>180)return json({connectors:[],error:"station_id inválido"},400);try{const result=await env.CHARGEVOY_DB.prepare("SELECT id, station_id, type, power_kw, quantity, available_count, status, availability_updated_at, availability_source FROM connectors WHERE station_id = ? ORDER BY id").bind(stationId).all();const snapshot=await readAvailabilitySnapshot(env);const connectors=await mergeAvailability(result.results||[],env,snapshot);return json({source:"cloudflare-d1+kv",availability_publication_time:snapshot?.publication_time||null,availability_age_minutes:snapshot?.age_minutes??null,connectors});}catch(error){console.error("D1 connectors:",error);return json({connectors:[],error:"D1 connector query failed"},503);}}return env.ASSETS.fetch(request);}};
