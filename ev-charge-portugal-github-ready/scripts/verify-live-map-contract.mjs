import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const [web, worker] = await Promise.all([
  readFile(resolve(root, "assets/chargevoy.js"), "utf8"),
  readFile(resolve(root, "worker/index.js"), "utf8"),
]);

const checks = [
  ["web accepts the public MOBI.E live source", web.includes('c.availability_source === "mobie_nap"')],
  ["site Worker emits the public MOBI.E live source", worker.includes('connector.availability_source = fresh ? "mobie_nap"')],
  ["site Worker keeps stale readings non-live", worker.includes('"mobie_nap_stale"')],
  ["national station request defaults to 1500 major stations", worker.includes('url.searchParams.get("limit")||1500')],
  ["explicit route/map bounds remain supported", worker.includes('if(hasBounds) stmt=db.prepare')],
  ["location hint does not collapse the station catalogue to a local bounding box", !worker.includes('else if(hasLocation)')],
  ["available live stations render green", web.includes('if (status === "available") return "#18b978"')],
  ["route planner still consumes allStations", web.includes('let candidates = allStations')],
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
