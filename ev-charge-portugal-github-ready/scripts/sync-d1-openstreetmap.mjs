import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outputDir = process.env.D1_SQL_DIR || "tmp/d1-osm-sync";
const query = `[out:json][timeout:90];
area["ISO3166-1"="PT"][admin_level=2]->.pt;
nwr["amenity"="charging_station"](area.pt);
out center tags;`;

const fields = [
  "id",
  "external_id",
  "source",
  "name",
  "address",
  "city",
  "latitude",
  "longitude",
  "max_power_kw",
  "status",
  "operator_id",
  "amenities",
];

function sqlString(value) {
  if (value == null || value === "") return "NULL";
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function sqlNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : "NULL";
}

function powerFromTags(tags) {
  const values = [
    tags["socket:output"],
    tags["socket:type2:output"],
    tags["socket:ccs:output"],
    tags["charging_station:output"],
  ].filter(Boolean);

  for (const value of values) {
    const match = String(value).match(/[0-9]+(?:[.,][0-9]+)?/);
    if (match) return Number(match[0].replace(",", "."));
  }

  return null;
}

function mapStation(item) {
  const tags = item.tags || {};
  const latitude = Number(item.lat ?? item.center?.lat);
  const longitude = Number(item.lon ?? item.center?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const id = `osm-${item.type}-${item.id}`;
  return {
    id,
    external_id: String(item.id),
    source: "openstreetmap",
    name: tags.name || tags.ref || "Posto de carregamento",
    address: [tags["addr:street"], tags["addr:housenumber"]]
      .filter(Boolean)
      .join(" "),
    city: tags["addr:city"] || tags["addr:municipality"] || "",
    latitude,
    longitude,
    max_power_kw: powerFromTags(tags),
    status: "unknown",
    operator_id: tags.operator || null,
    amenities: JSON.stringify(tags),
  };
}

function rowValues(row) {
  return [
    sqlString(row.id),
    sqlString(row.external_id),
    sqlString(row.source),
    sqlString(row.name),
    sqlString(row.address),
    sqlString(row.city),
    sqlNumber(row.latitude),
    sqlNumber(row.longitude),
    sqlNumber(row.max_power_kw),
    sqlString(row.status),
    sqlString(row.operator_id),
    sqlString(row.amenities),
    sqlString(new Date().toISOString()),
  ].join(", ");
}

const response = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
    "user-agent": "ChargeVoy-D1-Sync/1.0",
  },
  body: new URLSearchParams({ data: query }),
  signal: AbortSignal.timeout(120000),
});

if (!response.ok) {
  throw new Error(`Overpass HTTP ${response.status}: ${await response.text()}`);
}

const payload = await response.json();
const stations = (payload.elements || []).map(mapStation).filter(Boolean);

if (!stations.length) {
  throw new Error("No charging stations returned by OpenStreetMap");
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

await writeFile(
  join(outputDir, "001_prepare.sql"),
  "CREATE TABLE IF NOT EXISTS station_cache_next AS SELECT * FROM station_cache WHERE 0;\nDELETE FROM station_cache_next;\n",
);

const chunkSize = 100;
for (let index = 0; index < stations.length; index += chunkSize) {
  const chunk = stations.slice(index, index + chunkSize);
  const values = chunk.map((row) => `(${rowValues(row)})`).join(",\n");
  await writeFile(
    join(outputDir, `${String(index / chunkSize + 2).padStart(3, "0")}_stations.sql`),
    `INSERT INTO station_cache_next (${fields.join(", ")}, synced_at) VALUES\n${values};\n`,
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

console.log(`Prepared ${stations.length} OpenStreetMap charging stations`);
