import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const [html, js, routeJs, worker, staticWorker, packageJson, schema, mappingScript, refreshWorkflow] = await Promise.all([
  readFile(resolve(root, "index.html"), "utf8"),
  readFile(resolve(root, "assets/chargevoy.js"), "utf8"),
  readFile(resolve(root, "assets/route-corridor.js"), "utf8"),
  readFile(resolve(root, "service-worker.js"), "utf8"),
  readFile(resolve(root, "worker/index.js"), "utf8"),
  readFile(resolve(root, "package.json"), "utf8"),
  readFile(resolve(root, "cloudflare/d1/schema.sql"), "utf8"),
  readFile(resolve(root, "scripts/build-nap-d1-mapping.mjs"), "utf8"),
  readFile(resolve(root, "../.github/workflows/refresh-nap-availability.yml"), "utf8"),
]);

const canParse = (source) => { try { new Function(source); return true; } catch (error) { console.error(error.message); return false; } };
const canParseWorkerModule = (source) => canParse(source.replace(/export\s+default/, "return"));
const canParseModuleWithoutImports = (source) => canParse(source.replace(/^import .*;$/gm, "").replace(/^const response = await /m, "const response = "));
const npmTest = JSON.parse(packageJson).scripts?.test || "";

const checks = [
  ["HTML references extracted CSS", html.includes("./assets/chargevoy.css")],
  ["HTML references extracted JavaScript", html.includes("./assets/chargevoy.js")],
  ["No inline stylesheet remains", !html.includes("<style>")],
  ["No inline application script remains", !html.includes("    <script>\\n")],
  ["PWA shell caches extracted CSS", worker.includes("./assets/chargevoy.css")],
  ["PWA shell caches extracted JavaScript", worker.includes("./assets/chargevoy.js")],
  ["PWA shell caches corridor planner", worker.includes("./assets/route-corridor.js")],
  ["PWA cache version is current", worker.includes("ev-charge-shell-v12")],
  ["Route timeout helper is present", js.includes("fetchWithTimeout")],
  ["Application JavaScript syntax is valid", canParse(js)],
  ["Route corridor JavaScript syntax is valid", canParse(routeJs)],
  ["Service Worker syntax is valid", canParse(worker)],
  ["Static Worker syntax is valid", canParseWorkerModule(staticWorker)],
  ["Static Worker injects corridor planner", staticWorker.includes("route-corridor.js")],
  ["Corridor planner requests route bounds", routeJs.includes("min_lat") && routeJs.includes("max_lat") && routeJs.includes("min_lon") && routeJs.includes("max_lon")],
  ["Corridor planner keeps local fallback", routeJs.includes('corridorSource = "local-fallback"')],
  ["D1 has explicit NAP mapping table", schema.includes("CREATE TABLE IF NOT EXISTS nap_connector_mapping")],
  ["NAP mapping requires connector IDs", schema.includes("connector_id TEXT NOT NULL")],
  ["Worker reads explicit NAP mapping", staticWorker.includes("FROM nap_connector_mapping")],
  ["Worker enforces five minute freshness", staticWorker.includes("snapshot.age_minutes <= 5")],
  ["Worker exposes five minute max age", staticWorker.includes("availability_max_age_minutes:5")],
  ["Legacy mapping is fallback only", staticWorker.includes("legacyNapKey") && staticWorker.includes("mapping ?")],
  ["NAP mapping generator has expected safety bound", mappingScript.includes("rows.length < 15000") && mappingScript.includes("rows.length > 100000")],
  ["Availability workflow runs every five minutes", refreshWorkflow.includes('cron: "*/5 * * * *"')],
  ["Package exposes npm test", npmTest.split(/\s*&&\s*/).includes("node scripts/verify-web.mjs") && npmTest.includes("node scripts/verify-live-map-contract.mjs")],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
if (failed.length) process.exitCode = 1;
