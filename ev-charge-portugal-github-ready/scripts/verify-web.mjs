import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const [html, js, worker, packageJson] = await Promise.all([
  readFile(resolve(root, "index.html"), "utf8"),
  readFile(resolve(root, "assets/chargevoy.js"), "utf8"),
  readFile(resolve(root, "service-worker.js"), "utf8"),
  readFile(resolve(root, "package.json"), "utf8"),
]);

const canParse = (source) => {
  try {
    new Function(source);
    return true;
  } catch (error) {
    console.error(error.message);
    return false;
  }
};

const checks = [
  ["HTML references extracted CSS", html.includes("./assets/chargevoy.css")],
  ["HTML references extracted JavaScript", html.includes("./assets/chargevoy.js")],
  ["No inline stylesheet remains", !html.includes("<style>")],
  ["No inline application script remains", !html.includes("    <script>\\n")],
  ["PWA shell caches extracted CSS", worker.includes("./assets/chargevoy.css")],
  ["PWA shell caches extracted JavaScript", worker.includes("./assets/chargevoy.js")],
  ["PWA cache version is current", worker.includes("ev-charge-shell-v4")],
  ["Route timeout helper is present", js.includes("fetchWithTimeout")],
  ["Application JavaScript syntax is valid", canParse(js)],
  ["Service Worker syntax is valid", canParse(worker)],
  ["Package exposes npm test", JSON.parse(packageJson).scripts?.test === "node scripts/verify-web.mjs"],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
if (failed.length) process.exitCode = 1;
