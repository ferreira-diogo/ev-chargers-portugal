import { Readable } from "node:stream";
import { parseAvailability, SOURCE_URL } from "./import-nap-availability.mjs";

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) throw new Error("Cloudflare credentials missing");

const response = await fetch(SOURCE_URL, {
  headers: { Accept: "application/xml", "User-Agent": "ChargeVoy availability refresh/1.0" },
  signal: AbortSignal.timeout(180000),
});
if (!response.ok || !response.body) throw new Error("NAP feed HTTP " + response.status);
const parsed = await parseAvailability(Readable.fromWeb(response.body));
const api = "https://api.cloudflare.com/client/v4/accounts/" + account + "/storage/kv/namespaces";
const headers = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
const listResponse = await fetch(api, { headers });
const list = await listResponse.json();
if (!listResponse.ok || !list.success) throw new Error("KV namespace lookup failed: " + JSON.stringify(list.errors));
const namespace = list.result.find((item) => item.title === "chargevoy-availability");
if (!namespace?.id) throw new Error("Availability namespace missing; deploy the site first");
const statuses = Object.create(null);
for (const row of parsed.rows) statuses[row.site_id + "|" + row.point_id] = row.status;
const snapshot = {
  publication_time: parsed.publication_time,
  refreshed_at: new Date().toISOString(),
  point_count: parsed.rows.length,
  statuses,
};
const put = await fetch(api + "/" + namespace.id + "/values/mobie_nap_current", {
  method: "PUT",
  headers,
  body: JSON.stringify(snapshot),
});
const result = await put.json();
if (!put.ok || !result.success) throw new Error("KV snapshot write failed: " + JSON.stringify(result.errors));
console.log(JSON.stringify({
  publication_time: snapshot.publication_time,
  refreshed_at: snapshot.refreshed_at,
  points: parsed.rows.length,
  sites: parsed.summary.sites,
  snapshot_bytes: Buffer.byteLength(JSON.stringify(snapshot)),
}, null, 2));
