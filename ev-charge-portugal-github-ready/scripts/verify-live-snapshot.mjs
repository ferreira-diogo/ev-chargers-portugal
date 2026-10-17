import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function verifyLiveSnapshot({site = process.env.CHARGEVOY_SITE_URL || "https://chargevoy.pt",
  api = process.env.CHARGEVOY_API_URL || "https://chargevoy-api.zombid.workers.dev",
  fetchImpl = fetch, now = Date.now, warn = console.warn, reportError = console.error} = {}) {
  site = site.replace(/\/$/, ""); api = api.replace(/\/$/, "");
  async function get(url) {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) {
      const headers = Object.fromEntries(["cf-ray", "cf-mitigated", "server", "content-type"]
        .map(name => [name, response.headers.get(name)]).filter(([,value]) => value));
      const body = (await response.text()).replace(/\s+/g, " ").slice(0, 300);
      reportError(JSON.stringify({url,status:response.status,headers,body_excerpt:body}));
      throw new Error(`${url} HTTP ${response.status}`);
    }
    return response;
  }
  const home = await (await get(site + "/")).text();
  if (!home.includes("chargevoy.js")) throw new Error("The public homepage is missing the application");
  const manifest = await (await get(site + "/assets/stations-manifest.json")).json();
  const bytes = Buffer.from(await (await get(site + "/assets/stations-snapshot.json")).arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (manifest.sha256 !== checksum || manifest.bytes !== bytes.length)
    throw new Error("The national snapshot does not match the published manifest");
  const catalogue = JSON.parse(bytes.toString("utf8"));
  if (!Array.isArray(catalogue.stations) || !Array.isArray(catalogue.connectors) ||
      catalogue.stations.length < 8000 || catalogue.connectors.length < 15000 ||
      catalogue.stations.length !== manifest.stations || catalogue.connectors.length !== manifest.connectors)
    throw new Error("The published national catalogue is incomplete");
  const live = await (await get(api + "/api/availability")).json();
  const published = Date.parse(live.publication_time || live.refreshed_at || "");
  const ageMinutes = (now() - published) / 60000;
  if (!Number.isFinite(ageMinutes) || ageMinutes < -5 || ageMinutes > 20 ||
      Object.keys(live.statuses || {}).length < 10000)
    throw new Error("Availability source missing or older than twenty minutes");
  if (ageMinutes > 5) warn("MOBI.E is older than five minutes; the UI must label it as the last reading");
  return {ok:true, stations:manifest.stations, connectors:manifest.connectors,
    snapshot_bytes:manifest.bytes, availability_age_minutes:ageMinutes, live_points:Object.keys(live.statuses).length};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyLiveSnapshot().then(result=>console.log(JSON.stringify(result))).catch(error=>{
    console.error(error.message); process.exitCode=1;
  });
}
