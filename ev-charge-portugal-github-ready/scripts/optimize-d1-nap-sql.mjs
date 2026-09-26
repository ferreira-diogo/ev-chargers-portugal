import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const dir = process.env.D1_SQL_DIR || "tmp/d1-nap-sync";
const files = await readdir(dir);
let removedLegacyFiles = 0;
let optimizedFiles = 0;

// Never clear the catalogue before a refresh. Besides consuming the D1 write quota,
// that creates an avoidable empty-catalogue window if a later batch fails.
await rm(join(dir, "001_reset.sql"), { force: true });

for (const name of files) {
  const path = join(dir, name);
  if (name.includes("_station_cache.sql") && !name.includes("_station_cache_v2.sql")) {
    // station_cache_v2 is the production source used by the API Worker. The legacy
    // station_cache copy doubled station writes without serving production traffic.
    await rm(path, { force: true });
    removedLegacyFiles += 1;
    continue;
  }

  if (name.includes("_station_cache_v2.sql")) {
    let sql = await readFile(path, "utf8");
    sql = sql.replace("INSERT OR REPLACE INTO station_cache_v2", "INSERT INTO station_cache_v2");
    sql = sql.replace(/;\s*$/, `\nON CONFLICT(id) DO UPDATE SET\n  external_id=excluded.external_id, source=excluded.source, name=excluded.name, address=excluded.address, city=excluded.city,\n  latitude=excluded.latitude, longitude=excluded.longitude, max_power_kw=excluded.max_power_kw, status=excluded.status,\n  operator_id=excluded.operator_id, amenities=excluded.amenities, synced_at=excluded.synced_at\nWHERE station_cache_v2.external_id IS NOT excluded.external_id\n   OR station_cache_v2.source IS NOT excluded.source OR station_cache_v2.name IS NOT excluded.name\n   OR station_cache_v2.address IS NOT excluded.address OR station_cache_v2.city IS NOT excluded.city\n   OR station_cache_v2.latitude IS NOT excluded.latitude OR station_cache_v2.longitude IS NOT excluded.longitude\n   OR station_cache_v2.max_power_kw IS NOT excluded.max_power_kw OR station_cache_v2.operator_id IS NOT excluded.operator_id\n   OR station_cache_v2.amenities IS NOT excluded.amenities;\n`);
    await writeFile(path, sql);
    optimizedFiles += 1;
  } else if (name.includes("_connectors.sql")) {
    let sql = await readFile(path, "utf8");
    sql = sql.replace("INSERT OR REPLACE INTO connectors", "INSERT INTO connectors");
    // Availability is deliberately not updated here: live MOBI.E state belongs to KV.
    sql = sql.replace(/;\s*$/, `\nON CONFLICT(id) DO UPDATE SET\n  station_id=excluded.station_id, type=excluded.type, power_kw=excluded.power_kw, quantity=excluded.quantity, updated_at=excluded.updated_at\nWHERE connectors.station_id IS NOT excluded.station_id OR connectors.type IS NOT excluded.type\n   OR connectors.power_kw IS NOT excluded.power_kw OR connectors.quantity IS NOT excluded.quantity;\n`);
    await writeFile(path, sql);
    optimizedFiles += 1;
  } else if (name.includes("_operators.sql")) {
    let sql = await readFile(path, "utf8");
    sql = sql.replace("INSERT OR REPLACE INTO operators", "INSERT INTO operators");
    sql = sql.replace(/;\s*$/, `\nON CONFLICT(id) DO UPDATE SET name=excluded.name, external_id=excluded.external_id, source=excluded.source, updated_at=excluded.updated_at\nWHERE operators.name IS NOT excluded.name OR operators.external_id IS NOT excluded.external_id OR operators.source IS NOT excluded.source;\n`);
    await writeFile(path, sql);
    optimizedFiles += 1;
  } else if (name === "0001_nap_mapping.sql") {
    let sql = await readFile(path, "utf8");
    sql = sql.replace(/^DELETE FROM nap_connector_mapping;\s*/m, "");
    sql = sql.replaceAll("INSERT OR REPLACE INTO nap_connector_mapping", "INSERT OR IGNORE INTO nap_connector_mapping");
    await writeFile(path, sql);
    optimizedFiles += 1;
  }
}

console.log(JSON.stringify({ incremental: true, optimized_files: optimizedFiles, removed_legacy_station_cache_files: removedLegacyFiles }, null, 2));
