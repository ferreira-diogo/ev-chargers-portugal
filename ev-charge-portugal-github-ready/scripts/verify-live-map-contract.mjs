import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const [web, worker, apiWorker, corridor, serviceWorker] = await Promise.all([
  readFile(resolve(root, "assets/chargevoy.js"), "utf8"),
  readFile(resolve(root, "worker/index.js"), "utf8"),
  readFile(resolve(root, "worker-api/index.js"), "utf8"),
  readFile(resolve(root, "assets/route-corridor.js"), "utf8"),
  readFile(resolve(root, "service-worker.js"), "utf8"),
]);

const checks = [
  ["web accepts the public MOBI.E live source", /c\.availability_source\s*===\s*["']mobie_nap["']/.test(web)],
  ["site Worker emits the public MOBI.E live source", /connector\.availability_source\s*=\s*fresh\s*\?\s*["']mobie_nap["']/.test(worker)],
  ["dedicated API emits the same MOBI.E live source", apiWorker.includes('availability_source=fresh?"mobie_nap":"mobie_nap_stale"')],
  ["site Worker keeps stale readings non-live", worker.includes('"mobie_nap_stale"')],
  ["national station request defaults to 1500 major stations", /url\.searchParams\.get\(["']limit["']\)\s*\|\|\s*1500/.test(worker)],
  ["explicit route/map bounds remain supported", /if\s*\(hasBounds\)\s*stmt\s*=\s*db\.prepare/.test(worker)],
  ["location hint does not collapse the station catalogue to a local bounding box", !worker.includes("else if(hasLocation)")],
  ["available live stations render green", /if\s*\(status\s*===\s*["']available["']\)\s*return\s*["']#18b978["']/.test(web)],
  ["route planner still consumes allStations", /let\s+candidates\s*=\s*allStations/.test(web)],
  ["national map markers survive the nearby sidebar shortlist", /const mapStations\s*=\s*filtered\.slice\(\)/.test(web) && /const markerStations\s*=\s*mapStations\.filter/.test(web)],
  ["browser retries the dedicated API when the site D1 binding is missing", /for\s*\(const endpoint of \[D1_FALLBACK_URL, D1_API_WORKER_URL\]\)/.test(web)],
  ["dedicated API receives a small national seed", /new URLSearchParams\(\{ limit: "300" \}\)/.test(web)],
  ["route requests each section with a dedicated API fallback", corridor.includes("coordinates.slice(start, end + 1)") && corridor.includes("[D1_FALLBACK_URL, D1_API_WORKER_URL]")],
  ["service worker does not replay stale API availability", /if\(url\.pathname\.startsWith\('\/api\/'\)\)\s*\{\s*[^}]*fetch\(event\.request\)/.test(serviceWorker)],
  ["both APIs paginate national stations in a stable order", worker.includes("id ASC LIMIT ? OFFSET ?") && apiWorker.includes("id ASC LIMIT ? OFFSET ?")],
  ["map progressively loads all station pages", web.includes("loadRemainingNationalStations(generation)") && web.includes('offset: String(offset)') && web.includes('offset = 300; offset < 30000; offset += 500')],
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
