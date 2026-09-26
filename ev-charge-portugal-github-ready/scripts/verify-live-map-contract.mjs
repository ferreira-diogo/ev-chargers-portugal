import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const [web, worker] = await Promise.all([
  readFile(resolve(root, "assets/chargevoy.js"), "utf8"),
  readFile(resolve(root, "worker/index.js"), "utf8"),
]);

const checks = [
  ["web accepts the public MOBI.E live source", /c\.availability_source\s*===\s*["']mobie_nap["']/.test(web)],
  ["site Worker emits the public MOBI.E live source", /connector\.availability_source\s*=\s*fresh\s*\?\s*["']mobie_nap["']/.test(worker)],
  ["site Worker keeps stale readings non-live", worker.includes('"mobie_nap_stale"')],
  ["national station request defaults to 1500 major stations", /url\.searchParams\.get\(["']limit["']\)\s*\|\|\s*1500/.test(worker)],
  ["explicit route/map bounds remain supported", /if\s*\(hasBounds\)\s*stmt\s*=\s*db\.prepare/.test(worker)],
  ["location hint does not collapse the station catalogue to a local bounding box", !worker.includes("else if(hasLocation)")],
  ["available live stations render green", /if\s*\(status\s*===\s*["']available["']\)\s*return\s*["']#18b978["']/.test(web)],
  ["route planner still consumes allStations", /let\s+candidates\s*=\s*allStations/.test(web)],
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
