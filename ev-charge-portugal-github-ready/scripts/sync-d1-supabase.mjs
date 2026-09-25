import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outputDir = process.env.D1_SQL_DIR || "tmp/d1-supabase-sync";
const supabaseUrl = (process.env.SUPABASE_URL || "https://ftnmdgiftdgaycotjixr.supabase.co").replace(/\/$/, "");
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const pageSize = 500;
const chunkSize = 100;
const now = new Date().toISOString();

if (!supabaseKey) throw new Error("SUPABASE_PUBLISHABLE_KEY is required");

const d1Tables = [
  "station_cache_v2", "station_cache", "operators", "connectors", "vehicle_models",
  "ceme_cards", "station_reviews", "station_reliability", "official_opc_tariffs",
  "station_ad_hoc_price_components",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const finite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const int = (value) => {
  const n = finite(value);
  return n === null ? null : Math.trunc(n);
};
const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");

function sql(value) {
  if (value === undefined || value === null) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonValue(value) {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

function stableId(...parts) {
  return parts.map((part) => String(part ?? "").trim()).join(":").slice(0, 180);
}

async function fetchPage(table, offset) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", String(pageSize));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("order", "id.asc");

  let lastError;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Accept: "application/json",
          Prefer: "count=exact",
        },
        signal: AbortSignal.timeout(60000),
      });
      if (response.status === 404) return { rows: [], optional: true };
      if (!response.ok) throw new Error(`${table} HTTP ${response.status}: ${await response.text()}`);
      const rows = await response.json();
      const range = response.headers.get("content-range") || "";
      const total = Number(range.split("/")[1]);
      return { rows, total: Number.isFinite(total) ? total : null };
    } catch (error) {
      lastError = error;
      if (attempt < 12) {
        const delay = Math.min(attempt * 5000, 30000);
        console.warn(`${table}: attempt ${attempt} failed; retrying in ${delay / 1000}s`);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

async function readTable(table, required = false) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchPage(table, offset);
    if (page.optional) {
      if (required) throw new Error(`Required Supabase table not available: ${table}`);
      console.warn(`Optional Supabase table not available: ${table}`);
      return rows;
    }
    rows.push(...page.rows);
    console.log(`${table}: ${rows.length}${page.total ? `/${page.total}` : ""}`);
    if (page.rows.length < pageSize || (page.total !== null && rows.length >= page.total)) break;
  }
  return rows;
}

function station(row) {
  const latitude = finite(first(row.latitude, row.lat));
  const longitude = finite(first(row.longitude, row.lon, row.lng));
  if (latitude === null || longitude === null) return null;
  const id = first(row.id, row.station_id, row.external_id);
  if (!id) return null;
  return {
    id: String(id),
    external_id: String(first(row.external_id, row.site_id, row.id)),
    source: String(first(row.source, "supabase-canonical")),
    name: first(row.name, row.station_name, "Posto de carregamento"),
    address: first(row.address, row.street_address, ""),
    city: first(row.city, row.municipality, row.town, ""),
    latitude,
    longitude,
    max_power_kw: finite(first(row.max_power_kw, row.max_power, row.power_kw)),
    status: first(row.status, "unknown"),
    operator_id: first(row.operator_id, row.operator, null),
    amenities: jsonValue(first(row.amenities, row.metadata, {})),
    synced_at: first(row.updated_at, row.created_at, now),
  };
}

function operator(row) {
  const id = first(row.id, row.operator_id, row.external_id);
  return id ? {
    id: String(id), name: first(row.name, row.operator_name, "Operador"),
    external_id: first(row.external_id, row.id), source: first(row.source, "supabase"),
    updated_at: first(row.updated_at, row.created_at, now),
  } : null;
}

function connector(row) {
  const id = first(row.id, row.connector_id, row.external_id);
  const stationId = first(row.station_id, row.charging_station_id);
  return id && stationId ? {
    id: String(id), station_id: String(stationId), type: first(row.type, row.connector_type, "unknown"),
    power_kw: finite(first(row.power_kw, row.max_power_kw)), quantity: int(first(row.quantity, 1)),
    available_count: int(row.available_count), status: first(row.status, "unknown"),
    availability_updated_at: row.availability_updated_at ?? null,
    availability_source: row.availability_source ?? null,
    updated_at: first(row.updated_at, row.created_at, now),
  } : null;
}

function vehicle(row) {
  const id = first(row.id, row.external_id);
  return id ? {
    id: String(id), external_id: row.external_id ?? null, source: row.source ?? null,
    make: row.make ?? null, model: row.model ?? null, variant: row.variant ?? null,
    model_year_start: int(row.model_year_start), model_year_end: int(row.model_year_end),
    battery_capacity_kwh: finite(row.battery_capacity_kwh), consumption_wh_km: finite(row.consumption_wh_km),
    wltp_range_km: finite(row.wltp_range_km), max_ac_power_kw: finite(row.max_ac_power_kw),
    max_dc_power_kw: finite(row.max_dc_power_kw), connector_types: jsonValue(row.connector_types),
    active: row.active === false ? 0 : 1, body_style: row.body_style ?? null,
    data_quality: row.data_quality ?? null, consumption_basis: row.consumption_basis ?? null,
    updated_at: first(row.updated_at, row.created_at, now),
  } : null;
}

function card(row) {
  const id = first(row.id, row.external_id);
  return id ? {
    id: String(id), name: first(row.name, "Cartão"), energy_price_eur_kwh: finite(row.energy_price_eur_kwh),
    session_fee_eur: finite(row.session_fee_eur), includes_tar: row.includes_tar ? 1 : 0,
    vat_rate: finite(row.vat_rate), iec_eur_kwh: finite(row.iec_eur_kwh), conditions: row.conditions ?? null,
    source_url: row.source_url ?? null, valid_from: row.valid_from ?? null, valid_to: row.valid_to ?? null,
    pricing_mode: row.pricing_mode ?? null, network_scope: row.network_scope ?? null,
    cashback_own_rate: finite(row.cashback_own_rate), cashback_other_rate: finite(row.cashback_other_rate),
    active: row.active === false ? 0 : 1, updated_at: first(row.updated_at, row.created_at, now),
  } : null;
}

function review(row) {
  const id = first(row.id, row.review_id);
  const stationId = first(row.station_id, row.charging_station_id);
  return id && stationId ? {
    id: String(id), station_id: String(stationId), rating: finite(row.rating),
    comment: row.comment ?? null, created_at: first(row.created_at, row.updated_at, now),
  } : null;
}

function reliability(row) {
  const id = first(row.station_id, row.id);
  return id ? {
    station_id: String(id), review_count: int(row.review_count) ?? 0,
    average_rating: finite(row.average_rating), snapshot_count: int(row.snapshot_count) ?? 0,
    availability_rate: finite(row.availability_rate), last_observed_at: row.last_observed_at ?? null,
  } : null;
}

function tariff(row) {
  const stationId = first(row.station_id, row.charging_station_id);
  const id = first(row.id, stableId(stationId, row.connector_uid, row.tariff_period, row.connector_type));
  return id && stationId ? {
    id: String(id), station_id: String(stationId), connector_uid: row.connector_uid ?? null,
    voltage_level: row.voltage_level ?? null, tariff_period: row.tariff_period ?? null,
    connector_type: row.connector_type ?? null, power_kw: finite(row.power_kw),
    activation_fee_eur: finite(row.activation_fee_eur), energy_price_eur_kwh: finite(row.energy_price_eur_kwh),
    time_price_eur_min: finite(row.time_price_eur_min), updated_at: first(row.updated_at, row.created_at, now),
  } : null;
}

function adhoc(row) {
  const stationId = first(row.station_id, row.charging_station_id);
  const id = stableId(stationId, row.point_id, row.pricing_policy, row.rate_index ?? 0);
  return stationId && row.point_id && row.pricing_policy ? {
    id, station_id: String(stationId), point_id: String(row.point_id),
    pricing_policy: String(row.pricing_policy), amount_eur: finite(row.amount_eur),
    currency: row.currency ?? "EUR", observed_at: first(row.observed_at, row.updated_at, now),
    updated_at: first(row.updated_at, row.created_at, now),
  } : null;
}

const source = {
  stations: (await readTable("charging_stations", true)).map(station).filter(Boolean),
  operators: (await readTable("operators")).map(operator).filter(Boolean),
  connectors: (await readTable("connectors", true)).map(connector).filter(Boolean),
  vehicle_models: (await readTable("vehicle_models", true)).map(vehicle).filter(Boolean),
  ceme_cards: (await readTable("ceme_cards")).map(card).filter(Boolean),
  station_reviews: (await readTable("station_reviews")).map(review).filter(Boolean),
  station_reliability: (await readTable("station_reliability")).map(reliability).filter(Boolean),
  official_opc_tariffs: (await readTable("official_opc_tariffs")).map(tariff).filter(Boolean),
  station_ad_hoc_price_components: (await readTable("station_ad_hoc_price_components")).map(adhoc).filter(Boolean),
};

function insertFile(table, rows, columns, fileNumber) {
  const values = rows.map((row) => `(${columns.map((column) => sql(row[column])).join(", ")})`).join(",\n");
  return `INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES\n${values};\n`;
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, "001_reset.sql"), d1Tables.map((table) => `DELETE FROM ${table};`).join("\n") + "\n");

const columns = {
  station_cache_v2: ["id", "external_id", "source", "name", "address", "city", "latitude", "longitude", "max_power_kw", "status", "operator_id", "amenities", "synced_at"],
  station_cache: ["id", "external_id", "source", "name", "address", "city", "latitude", "longitude", "max_power_kw", "status", "operator_id", "amenities", "synced_at"],
  operators: ["id", "name", "external_id", "source", "updated_at"],
  connectors: ["id", "station_id", "type", "power_kw", "quantity", "available_count", "status", "availability_updated_at", "availability_source", "updated_at"],
  vehicle_models: ["id", "external_id", "source", "make", "model", "variant", "model_year_start", "model_year_end", "battery_capacity_kwh", "consumption_wh_km", "wltp_range_km", "max_ac_power_kw", "max_dc_power_kw", "connector_types", "active", "body_style", "data_quality", "consumption_basis", "updated_at"],
  ceme_cards: ["id", "name", "energy_price_eur_kwh", "session_fee_eur", "includes_tar", "vat_rate", "iec_eur_kwh", "conditions", "source_url", "valid_from", "valid_to", "pricing_mode", "network_scope", "cashback_own_rate", "cashback_other_rate", "active", "updated_at"],
  station_reviews: ["id", "station_id", "rating", "comment", "created_at"],
  station_reliability: ["station_id", "review_count", "average_rating", "snapshot_count", "availability_rate", "last_observed_at"],
  official_opc_tariffs: ["id", "station_id", "connector_uid", "voltage_level", "tariff_period", "connector_type", "power_kw", "activation_fee_eur", "energy_price_eur_kwh", "time_price_eur_min", "updated_at"],
  station_ad_hoc_price_components: ["id", "station_id", "point_id", "pricing_policy", "amount_eur", "currency", "observed_at", "updated_at"],
};

let fileNumber = 2;
for (const [table, rows] of Object.entries({
  station_cache_v2: source.stations, station_cache: source.stations, operators: source.operators,
  connectors: source.connectors, vehicle_models: source.vehicle_models, ceme_cards: source.ceme_cards,
  station_reviews: source.station_reviews, station_reliability: source.station_reliability,
  official_opc_tariffs: source.official_opc_tariffs,
  station_ad_hoc_price_components: source.station_ad_hoc_price_components,
})) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    await writeFile(join(outputDir, `${String(fileNumber).padStart(4, "0")}_${table}.sql`), insertFile(table, chunk, columns[table], fileNumber));
    fileNumber += 1;
  }
}

await writeFile(join(outputDir, "999_validate.sql"), `SELECT 'station_cache_v2' AS table_name, count(*) AS row_count FROM station_cache_v2 UNION ALL SELECT 'connectors', count(*) FROM connectors UNION ALL SELECT 'vehicle_models', count(*) FROM vehicle_models UNION ALL SELECT 'ceme_cards', count(*) FROM ceme_cards;\n`);
await writeFile(join(outputDir, "manifest.json"), JSON.stringify({ generated_at: now, source: supabaseUrl, counts: Object.fromEntries(Object.entries(source).map(([key, rows]) => [key, rows.length])) }, null, 2));
console.log(`Prepared Supabase → D1 snapshot with ${fileNumber - 2} data files`);
