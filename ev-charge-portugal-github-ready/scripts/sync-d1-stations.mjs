import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outputDir = process.env.D1_SQL_DIR || "tmp/d1-sync";
const pageSize = 100;
const PORTUGAL_BBOX = "35.8,-9.6,42.2,-6.0";
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const fields = [
  "id", "external_id", "source", "name", "address", "city",
  "latitude", "longitude", "max_power_kw", "status", "operator_id", "amenities",
];

function sqlString(value) {
  if (value == null) return "NULL";
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function sqlNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : "NULL";
}

function powerKw(tags) {
  const raw = String(tags.maxpower ?? tags.capacity ?? "").replace(",", ".");
  const match = raw.match(/[0-9]+(?:\.[0-9]+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  if (!Number.isFinite(value)) return null;
  return String(raw).toLowerCase().includes("mw") ? value * 1000 : value;
}

function normalize(element) {
  const tags = element.tags || {};
  const latitude = Number(element.lat ?? element.center?.lat);
  const longitude = Number(element.lon ?? element.center?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const externalId = `osm-${element.type}-${element.id}`;
  const address = [tags["addr:street"], tags["addr:housenumber"], tags["addr:postcode"]]
    .filter(Boolean).join(" ");
  const city = tags["addr:city"] || tags["addr:town"] || tags["addr:municipality"] || "";

  return {
    id: externalId,
    external_id: String(element.id),
    source: "openstreetmap",
    name: tags.name || tags.ref || "Posto de carregamento",
    address,
    city,
    latitude,
    longitude,
    max_power_kw: powerKw(tags),
    status: "unknown",
    operator_id: tags.operator || null,
    amenities: JSON.stringify({
      source: "OpenStreetMap",
      socket: tags.socket || null,
      sockets: tags.sockets || null,
      opening_hours: tags.opening_hours || null,
      access: tags.access || null,
    }),
    synced_at: new Date().toISOString(),
  };
}

async function fetchOverpass() {
  const query = `[out:json][timeout:100];nwr[amenity=charging_station](${PORTUGAL_BBOX});out center tags;`;
  let lastError;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`Downloading OSM snapshot from ${endpoint}`);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          "user-agent": "ChargeVoy/1.0 (evchargeportugal@gmail.com)",
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok) throw new Error(`${endpoint} HTTP ${response.status}`);
      const payload = JSON.parse(await response.text());
      const rows = (payload.elements || []).map(normalize).filter(Boolean);
      if (rows.length < 10) throw new Error(`${endpoint} returned only ${rows.length} stations`);
      return rows;
    } catch (error) {
      lastError = error;
      console.warn(String(error));
    }
  }
  throw lastError || new Error("No Overpass endpoint available");
}

function rowValues(row) {
  return [
    sqlString(row.id), sqlString(row.external_id), sqlString(row.source),
    sqlString(row.name), sqlString(row.address), sqlString(row.city),
    sqlNumber(row.latitude), sqlNumber(row.longitude), sqlNumber(row.max_power_kw),
    sqlString(row.status), sqlString(row.operator_id), sqlString(row.amenities),
    sqlString(row.synced_at),
  ].join(", ");
}

const stations = await fetchOverpass();
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

await writeFile(
  join(outputDir, "001_prepare.sql"),
  "CREATE TABLE IF NOT EXISTS station_cache_next AS SELECT * FROM station_cache WHERE 0;\\nDELETE FROM station_cache_next;\\n",
);

for (let index = 0; index < stations.length; index += pageSize) {
  const chunk = stations.slice(index, index + pageSize);
  const values = chunk.map((row) => `(${rowValues(row)})`).join(",\\n");
  const sql = `INSERT INTO station_cache_next (${fields.join(", ")}, synced_at) VALUES\\n${values};\\n`;
  await writeFile(
    join(outputDir, `${String(index / pageSize + 2).padStart(3, "0")}_stations.sql`),
    sql,
  );
}

await writeFile(
  join(outputDir, "999_promote.sql"),
  `BEGIN TRANSACTION;
DELETE FROM station_cache;
INSERT INTO station_cache (${fields.join(", ")}, synced_at)
SELECT ${fields.join(", ")}, synced_at FROM station_cache_next;
DELETE FROM station_cache_next;
COMMIT;
`,
);

console.log(`Prepared ${stations.length} OSM stations in ${outputDir}`);
