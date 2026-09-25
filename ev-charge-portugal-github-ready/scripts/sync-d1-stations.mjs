import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const outputDir = process.env.D1_SQL_DIR || "tmp/d1-sync";
const pageSize = 500;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

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
  if (value == null) return "NULL";
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function sqlNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : "NULL";
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
    sqlString(
      row.amenities == null
        ? null
        : typeof row.amenities === "string"
          ? row.amenities
          : JSON.stringify(row.amenities),
    ),
    sqlString(new Date().toISOString()),
  ].join(", ");
}

async function fetchPage(offset) {
  const query = new URLSearchParams({
    select: fields.join(","),
    order: "id.asc",
    limit: String(pageSize),
    offset: String(offset),
  });
  const response = await fetch(
    `${supabaseUrl}/rest/v1/charging_stations?${query}`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok)
    throw new Error(
      `Supabase charging_stations HTTP ${response.status}: ${await response.text()}`,
    );
  return response.json();
}

const stations = [];
for (let offset = 0; ; offset += pageSize) {
  const page = await fetchPage(offset);
  stations.push(...page);
  console.log(`Fetched ${stations.length} stations`);
  if (page.length < pageSize) break;
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

await writeFile(
  join(outputDir, "001_prepare.sql"),
  "CREATE TABLE IF NOT EXISTS station_cache_next AS SELECT * FROM station_cache WHERE 0;\\nDELETE FROM station_cache_next;\\n",
);

const chunkSize = 100;
for (let index = 0; index < stations.length; index += chunkSize) {
  const chunk = stations.slice(index, index + chunkSize);
  const values = chunk.map((row) => `(${rowValues(row)})`).join(",\\n");
  const sql = `INSERT INTO station_cache_next (${fields.join(", ")}, synced_at) VALUES\\n${values};\\n`;
  await writeFile(
    join(outputDir, `${String(index / chunkSize + 2).padStart(3, "0")}_stations.sql`),
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

console.log(`Prepared ${stations.length} stations in ${outputDir}`);
