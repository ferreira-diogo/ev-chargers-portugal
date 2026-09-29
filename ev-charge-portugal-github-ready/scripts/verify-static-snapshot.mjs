import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "assets/stations-snapshot.json");
const bytes = await readFile(source);
const maxBytes = 25 * 1024 * 1024;
if (bytes.length > maxBytes) throw new Error(`Snapshot exceeds Cloudflare's 25 MiB asset limit: ${bytes.length}`);
const data = JSON.parse(bytes.toString("utf8"));
if (!Array.isArray(data.stations) || data.stations.length < 8000 ||
    !Array.isArray(data.connectors) || data.connectors.length < 15000)
  throw new Error("National station snapshot is incomplete");
const ids = new Set();
for (const station of data.stations) {
  if (!station.id || ids.has(station.id) ||
      !Number.isFinite(Number(station.latitude)) || !Number.isFinite(Number(station.longitude)))
    throw new Error(`Invalid or duplicate station: ${station.id}`);
  ids.add(station.id);
}
const connectorIds = new Set();
for (const connector of data.connectors) {
  if (!connector.id || connectorIds.has(connector.id) || !ids.has(connector.station_id))
    throw new Error(`Invalid or orphan connector: ${connector.id}`);
  connectorIds.add(connector.id);
}
const manifest = {
  publication_time: data.publication_time || null,
  stations: ids.size,
  connectors: connectorIds.size,
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
};
await writeFile(resolve(root, "assets/stations-manifest.json"), JSON.stringify(manifest));
console.log(JSON.stringify(manifest));
