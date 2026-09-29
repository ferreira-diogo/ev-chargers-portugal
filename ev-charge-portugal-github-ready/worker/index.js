async function readAvailabilitySnapshot(env) {
  if (!env.AVAILABILITY_KV) return null;
  try {
    const snapshot = await env.AVAILABILITY_KV.get("mobie_nap_current", "json");
    if (!snapshot?.statuses) return null;
    const published = Date.parse(snapshot.publication_time || snapshot.refreshed_at || "");
    return { ...snapshot, age_minutes: Number.isFinite(published) ? Math.max(0, (Date.now() - published) / 60000) : null };
  } catch (error) { console.error("NAP snapshot:", error); return null; }
}

async function readNapMappings(db, rows) {
  const ids = rows.map(row => row.id).filter(Boolean);
  const mappings = new Map();
  if (!db || !ids.length) return mappings;
  try {
    for (let offset = 0; offset < ids.length; offset += 80) {
      const batch = ids.slice(offset, offset + 80);
      const placeholders = batch.map(() => "?").join(", ");
      const result = await db.prepare(`SELECT connector_id, site_id, point_id FROM nap_connector_mapping WHERE connector_id IN (${placeholders})`).bind(...batch).all();
      for (const row of result.results || []) mappings.set(row.connector_id, { site_id: row.site_id, point_id: row.point_id });
    }
  } catch (error) {
    // Allows a safe deployment order: Worker can be deployed before the D1 migration.
    console.warn("NAP mapping unavailable; using legacy ID fallback:", error);
  }
  return mappings;
}

function legacyNapKey(connector, statuses) {
  const site = String(connector.station_id || "").replace(/^nap-/, "");
  const external = String(connector.external_id || connector.id || "").replace(/^nap-/, "");
  let point = external.startsWith(site + "-") ? external.slice(site.length + 1) : external;
  if (statuses[site + "|" + point]) return site + "|" + point;
  while (/-\d+$/.test(point)) {
    point = point.replace(/-\d+$/, "");
    if (statuses[site + "|" + point]) return site + "|" + point;
  }
  return null;
}

async function mergeAvailability(rows, env, snapshot = null, knownMappings = null) {
  if (!rows.length) return rows;
  snapshot ||= await readAvailabilitySnapshot(env);
  if (!snapshot?.statuses) return rows;
  const fresh = snapshot.age_minutes != null && snapshot.age_minutes <= 5;
  const mappings = knownMappings ?? await readNapMappings(env.CHARGEVOY_DB, rows);
  for (const connector of rows) {
    const mapping = mappings.get(connector.id);
    const mappedKey = mapping ? mapping.site_id + "|" + mapping.point_id : null;
    const key = mappedKey && snapshot.statuses[mappedKey] ? mappedKey : legacyNapKey(connector, snapshot.statuses);
    const status = key ? snapshot.statuses[key] : null;
    if (!status) continue;
    connector.status = fresh ? status : "unknown";
    connector.availability_updated_at = snapshot.publication_time || snapshot.refreshed_at || null;
    // The web UI consumes this stable public source name. Mapping provenance stays internal
    // to the Worker/API implementation so live readings are not discarded by the browser.
    connector.availability_source = fresh ? "mobie_nap" : "mobie_nap_stale";
    connector.last_known_status = status;
    connector.last_known_available_count = status === "available" ? 1 : ["charging", "outOfOrder", "blocked", "inoperative", "reserved"].includes(status) ? 0 : null;
    connector.available_count = !fresh ? null : status === "available" ? 1 : ["charging", "outOfOrder", "blocked", "inoperative", "reserved"].includes(status) ? 0 : null;
  }
  return rows;
}

const fields = ["id","external_id","source","name","address","city","latitude","longitude","max_power_kw","status","operator_id","amenities"].join(", ");
function json(body, status = 200, cacheControl = "no-store") { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cacheControl, "access-control-allow-origin": "*", "access-control-allow-methods": "GET,OPTIONS", "access-control-allow-headers": "Content-Type" } }); }
function numberParam(url, name) { const raw=url.searchParams.get(name); if(raw==null||raw.trim()==="") return null; const n=Number(raw); return Number.isFinite(n)?n:null; }
async function cachedStationPage(key, loader) {
  const cache = key && globalThis.caches?.default;
  if (cache) {
    try { const hit = await cache.match(key); if (hit) return hit.json(); }
    catch (error) { console.warn("Station cache read:", error); }
  }
  const page = await loader();
  if (cache) {
    try {
      await cache.put(key, new Response(JSON.stringify(page), {
        headers: { "content-type": "application/json", "cache-control": "public, max-age=21600" },
      }));
    } catch (error) { console.warn("Station cache write:", error); }
  }
  return page;
}
async function staticNapCatalogue(request, env) {
  const asset = new URL("/assets/stations-snapshot.json", request.url);
  const response = await env.ASSETS.fetch(new Request(asset));
  if (!response.ok) throw new Error(`NAP snapshot asset HTTP ${response.status}`);
  const catalogue = await response.json();
  if (!Array.isArray(catalogue.stations) || !Array.isArray(catalogue.connectors) || catalogue.stations.length < 8000)
    throw new Error("NAP snapshot asset is incomplete");
  return catalogue;
}
async function staticStations(request, env, url, limit, offset, hasBounds, minLat, maxLat, minLon, maxLon) {
  const catalogue = await staticNapCatalogue(request, env);
  const selected = (hasBounds ? catalogue.stations.filter(s =>
    s.latitude >= minLat && s.latitude <= maxLat && s.longitude >= minLon && s.longitude <= maxLon
  ) : catalogue.stations).slice(offset, offset + limit);
  const ids = new Set(selected.map(s => s.id));
  const connectors = catalogue.connectors.filter(c => ids.has(c.station_id));
  const snapshot = await readAvailabilitySnapshot(env);
  await mergeAvailability(connectors, env, snapshot, new Map());
  const fresh = snapshot?.age_minutes != null && snapshot.age_minutes <= 5;
  return json({ source: "nap-snapshot+kv", stale: !fresh,
    availability_publication_time: snapshot?.publication_time || null,
    availability_age_minutes: snapshot?.age_minutes ?? null, availability_max_age_minutes: 5,
    stations: selected, connectors });
}
async function stations(request, env) {
  const db=env.CHARGEVOY_DB;
  const url=new URL(request.url);
  const minLat=numberParam(url,"min_lat"), maxLat=numberParam(url,"max_lat"), minLon=numberParam(url,"min_lon"), maxLon=numberParam(url,"max_lon");
  const hasBounds=[minLat,maxLat,minLon,maxLon].every(v=>v!==null)&&minLat<=maxLat&&minLon<=maxLon;
  const limit=Math.min(Math.max(Number(url.searchParams.get("limit")||1500),1),1500);
  const offset=Math.min(Math.max(Number(url.searchParams.get("offset")||0),0),30000);
  try {
    if (!db) throw new Error("D1 binding unavailable");
    const cacheKey = hasBounds ? null : new Request(`${url.origin}/__chargevoy_station_page_v2?limit=${limit}&offset=${offset}`);
    const page = await cachedStationPage(cacheKey, async () => {
      let stmt;
      if(hasBounds) stmt=db.prepare(`SELECT ${fields} FROM station_cache_v2 WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? ORDER BY max_power_kw DESC, rowid ASC LIMIT ? OFFSET ?`).bind(minLat,maxLat,minLon,maxLon,limit,offset);
      else stmt=db.prepare(`SELECT ${fields} FROM station_cache_v2 ORDER BY max_power_kw DESC, rowid ASC LIMIT ? OFFSET ?`).bind(limit,offset);
      const result=await stmt.all(), stationRows=result.results||[], connectorRows=[];
      const stationIds=stationRows.map(s=>s.id).filter(Boolean);
      for(let i=0;i<stationIds.length;i+=80){const batch=stationIds.slice(i,i+80);const placeholders=batch.map(()=>"?").join(", ");const r=await db.prepare(`SELECT id, station_id, type, power_kw, quantity, available_count, status, availability_updated_at, availability_source FROM connectors WHERE station_id IN (${placeholders})`).bind(...batch).all();connectorRows.push(...(r.results||[]));}
      const mappings = await readNapMappings(db, connectorRows);
      return { stations: stationRows, connectors: connectorRows, mappings: [...mappings] };
    });
    const stationRows=page.stations, connectorRows=page.connectors;
    const snapshot=await readAvailabilitySnapshot(env); await mergeAvailability(connectorRows,env,snapshot,new Map(page.mappings));
    const fresh = snapshot?.age_minutes != null && snapshot.age_minutes <= 5;
    return json({source:"cloudflare-d1+kv",stale:!fresh,availability_publication_time:snapshot?.publication_time||null,availability_age_minutes:snapshot?.age_minutes??null,availability_max_age_minutes:5,stations:stationRows,connectors:connectorRows});
  } catch(error){
    console.error("D1 stations; using NAP snapshot:",error);
    try { return await staticStations(request,env,url,limit,offset,hasBounds,minLat,maxLat,minLon,maxLon); }
    catch(fallbackError) { console.error("NAP snapshot:",fallbackError); return json({stations:[],connectors:[],error:"D1 and NAP snapshot unavailable"},503); }
  }
}
export default {async fetch(request,env){
  const url=new URL(request.url);
  if(request.method==="OPTIONS")return new Response(null,{headers:{"access-control-allow-origin":"*","access-control-allow-methods":"GET,OPTIONS","access-control-allow-headers":"Content-Type"}});
  if(url.pathname==="/api/stations"||url.pathname.startsWith("/api/stations/"))return stations(request,env);
  if(url.pathname==="/api/connectors"){
    const stationId=url.searchParams.get("station_id");if(!stationId||stationId.length>180)return json({connectors:[],error:"station_id inválido"},400);
    try{if(!env.CHARGEVOY_DB)throw new Error("D1 binding unavailable");const result=await env.CHARGEVOY_DB.prepare("SELECT id, station_id, type, power_kw, quantity, available_count, status, availability_updated_at, availability_source FROM connectors WHERE station_id = ? ORDER BY id").bind(stationId).all();const snapshot=await readAvailabilitySnapshot(env);const connectors=await mergeAvailability(result.results||[],env,snapshot);const fresh=snapshot?.age_minutes!=null&&snapshot.age_minutes<=5;return json({source:"cloudflare-d1+kv",stale:!fresh,availability_publication_time:snapshot?.publication_time||null,availability_age_minutes:snapshot?.age_minutes??null,availability_max_age_minutes:5,connectors});}catch(error){console.error("D1 connectors; using NAP snapshot:",error);try{const catalogue=await staticNapCatalogue(request,env);const connectors=catalogue.connectors.filter(c=>c.station_id===stationId);const snapshot=await readAvailabilitySnapshot(env);await mergeAvailability(connectors,env,snapshot,new Map());const fresh=snapshot?.age_minutes!=null&&snapshot.age_minutes<=5;return json({source:"nap-snapshot+kv",stale:!fresh,availability_publication_time:snapshot?.publication_time||null,availability_age_minutes:snapshot?.age_minutes??null,availability_max_age_minutes:5,connectors});}catch(fallbackError){console.error("NAP snapshot:",fallbackError);return json({connectors:[],error:"D1 and NAP snapshot unavailable"},503);}}
  }
  return env.ASSETS.fetch(request);
}};

