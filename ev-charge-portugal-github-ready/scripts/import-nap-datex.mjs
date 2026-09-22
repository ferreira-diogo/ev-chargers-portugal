import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { createClient } from "@supabase/supabase-js";
import { SaxesParser } from "saxes";

const DEFAULT_URL = "https://ev-nap.mobie.pt/integration/nap/evChargingInfra";
const args = new Set(process.argv.slice(2));
const stage = args.has("--stage");
const fileArg = process.argv.find((value) => value.startsWith("--file="));
const sourceFile = fileArg?.slice("--file=".length);
const sourceUrl = process.env.NAP_SOURCE_URL?.trim() || DEFAULT_URL;
const minimumSites = Number(process.env.NAP_MIN_SITES || 8000);
const minimumConnectors = Number(process.env.NAP_MIN_CONNECTORS || 17000);

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase = stage
  ? createClient(required("SUPABASE_URL", supabaseUrl), required("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const previousEtag = stage ? await latestEtag() : null;
const source = await openSource(previousEtag);

if (source.notModified) {
  console.log(JSON.stringify({ success: true, changed: false, etag: previousEtag }, null, 2));
  process.exit(0);
}

const parsed = await parseDatex(source.stream);
const validation = validate(parsed);
const summary = {
  success: validation.errors.length === 0,
  changed: true,
  mode: stage ? "stage" : "dry-run",
  source_url: sourceFile || sourceUrl,
  etag: source.etag,
  publication_time: parsed.publicationTime,
  sites: parsed.stations.length,
  refill_points: parsed.refillPoints,
  connectors: parsed.connectors.length,
  operators: parsed.operators.size,
  connector_types: Object.fromEntries(
    [...parsed.connectors.reduce((counts, row) => counts.set(row.type, (counts.get(row.type) || 0) + 1), new Map())]
      .sort((a, b) => b[1] - a[1]),
  ),
  stations_without_operator: parsed.stations.filter((row) => !row.operator_name).length,
  tesla_sites: parsed.stations.filter((row) => row.operator_name?.toLowerCase() === "tesla").length,
  milfontes_sites: parsed.stations.filter((row) => `${row.name} ${row.address}`.toLowerCase().includes("milfontes")).length,
  validation,
};

if (!summary.success) {
  console.error(JSON.stringify(summary, null, 2));
  process.exit(1);
}

if (!stage) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

const batchId = crypto.randomUUID();
await insertRun(batchId, source, parsed, validation);

try {
  await insertChunks("nap_staging_stations", parsed.stations.map((row) => ({ batch_id: batchId, ...row })));
  await insertChunks("nap_staging_connectors", parsed.connectors.map((row) => ({ batch_id: batchId, ...row })));

  const { error } = await supabase.from("nap_import_runs").update({
    status: "validated",
    staged_sites: parsed.stations.length,
    staged_connectors: parsed.connectors.length,
    validation,
    completed_at: new Date().toISOString(),
  }).eq("batch_id", batchId);
  if (error) throw error;

  console.log(JSON.stringify({ ...summary, batch_id: batchId }, null, 2));
} catch (error) {
  await supabase.from("nap_import_runs").update({
    status: "failed",
    error_message: String(error),
    completed_at: new Date().toISOString(),
  }).eq("batch_id", batchId);
  throw error;
}

async function openSource(etag) {
  if (sourceFile) {
    return { stream: createReadStream(sourceFile), etag: null, notModified: false };
  }

  const headers = { Accept: "application/xml", "User-Agent": "EV Charge Portugal NAP Audit/1.0" };
  if (etag) headers["If-None-Match"] = etag;
  const response = await fetch(sourceUrl, { headers, signal: AbortSignal.timeout(300_000) });
  if (response.status === 304) return { notModified: true, etag, stream: null };
  if (!response.ok || !response.body) throw new Error(`NAP HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("xml")) throw new Error(`Formato NAP inesperado: ${contentType}`);
  return {
    stream: Readable.fromWeb(response.body),
    etag: response.headers.get("etag"),
    notModified: false,
  };
}

async function parseDatex(stream) {
  const stations = [];
  const connectors = [];
  const operators = new Set();
  const seenSites = new Set();
  const seenConnectors = new Set();
  const stack = [];
  let text = "";
  let publicationTime = null;
  let site = null;
  let refill = null;
  let connector = null;
  let connectorIndex = 0;
  let refillPoints = 0;

  const parser = new SaxesParser({ xmlns: false });
  parser.on("opentag", (node) => {
    const name = local(node.name);
    stack.push(name);
    text = "";
    if (name === "energyInfrastructureSite") {
      site = {
        external_id: attr(node, "id"), operator_external_id: null, operator_name: null,
        name: null, address: null, city: null, postal_code: null, country_code: "PT",
        latitude: null, longitude: null, max_power_kw: null, accessibility: null,
        source_updated_at: null, raw_data: null,
      };
    } else if (site && name === "operator") {
      site.operator_external_id = attr(node, "id");
    } else if (site && name === "refillPoint") {
      refill = { id: attr(node, "id"), connectors: [] };
      connectorIndex = 0;
    } else if (refill && name === "connector") {
      connector = { type: "Unknown", power_kw: null };
      connectorIndex += 1;
    }
  });
  parser.on("text", (value) => { text += value; });
  parser.on("closetag", (node) => {
    const name = local(typeof node === "string" ? node : node.name);
    const value = text.trim();
    const path = stack.join("/");

    if (value) {
      if (name === "publicationTime") publicationTime = value;
      if (site && name === "postcode") site.postal_code = value;
      if (site && name === "countryCode") site.country_code = value;
      if (site && name === "latitude") site.latitude = numberOrNull(value);
      if (site && name === "longitude") site.longitude = numberOrNull(value);
      if (site && name === "usageType" && !refill) site.accessibility = value;
      if (site && name === "value") {
        if (path.includes("/operator/") && path.includes("/name/")) site.operator_name ??= value;
        else if (path.includes("/addressLine/") && path.includes("/text/")) site.address ??= value;
        else if (path.includes("/city/")) site.city ??= value;
        else if (!path.includes("/operator/") && !refill && path.includes("/name/")) site.name ??= value;
      }
      if (connector && name === "connectorType") connector.type = normalizeConnector(value);
      if (connector && name === "maxPowerAtSocket") connector.power_kw = wattsToKw(value);
    }

    if (name === "connector" && refill && connector) {
      refill.connectors.push({ ...connector, index: connectorIndex });
      connector = null;
    } else if (name === "refillPoint" && site && refill) {
      refillPoints += 1;
      const items = refill.connectors.length ? refill.connectors : [{ type: "Unknown", power_kw: null, index: 1 }];
      for (const item of items) {
        const pointId = refill.id || `point-${connectors.length + 1}`;
        const baseId = `${site.external_id}-${pointId}`;
        const externalId = items.length === 1 ? baseId : `${baseId}-${item.index}`;
        if (seenConnectors.has(externalId)) throw new Error(`Conector NAP duplicado: ${externalId}`);
        seenConnectors.add(externalId);
        const row = {
          station_external_id: site.external_id,
          external_id: externalId,
          type: item.type,
          power_kw: item.power_kw,
          quantity: 1,
          status: "unknown",
          source_hash: hash({ externalId, type: item.type, power: item.power_kw }),
          raw_data: { refill_point_id: refill.id },
        };
        connectors.push(row);
        if (item.power_kw != null) site.max_power_kw = Math.max(site.max_power_kw || 0, item.power_kw);
      }
      refill = null;
    } else if (name === "energyInfrastructureSite" && site) {
      if (!site.external_id || seenSites.has(site.external_id)) throw new Error(`Posto NAP inválido/duplicado: ${site.external_id}`);
      seenSites.add(site.external_id);
      if (site.operator_name) operators.add(site.operator_name);
      site.name ||= site.external_id;
      site.source_updated_at = publicationTime;
      site.source_hash = hash(site);
      stations.push(site);
      site = null;
    }

    stack.pop();
    text = "";
  });
  parser.on("error", (error) => { throw error; });

  for await (const chunk of stream) parser.write(chunk.toString("utf8"));
  parser.close();
  return { stations, connectors, operators, publicationTime, refillPoints };
}

function validate(parsed) {
  const errors = [];
  const invalidCoordinates = parsed.stations.filter((row) =>
    !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude) ||
    row.latitude < 30 || row.latitude > 43 || row.longitude < -32 || row.longitude > -5,
  ).length;
  const orphanConnectors = parsed.connectors.filter((row) => !row.station_external_id).length;
  if (parsed.stations.length < minimumSites) errors.push(`Sites abaixo do mínimo: ${parsed.stations.length} < ${minimumSites}`);
  if (parsed.connectors.length < minimumConnectors) errors.push(`Conectores abaixo do mínimo: ${parsed.connectors.length} < ${minimumConnectors}`);
  if (invalidCoordinates) errors.push(`Coordenadas inválidas/fora de Portugal: ${invalidCoordinates}`);
  if (orphanConnectors) errors.push(`Conectores órfãos: ${orphanConnectors}`);
  if (!parsed.publicationTime) errors.push("publicationTime ausente");
  return { errors, invalid_coordinates: invalidCoordinates, orphan_connectors: orphanConnectors };
}

async function latestEtag() {
  const { data, error } = await supabase.from("nap_import_runs")
    .select("source_etag").in("status", ["validated", "promoted"])
    .not("source_etag", "is", null).order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data?.source_etag || null;
}

async function insertRun(batchId, source, parsed, validation) {
  const { error } = await supabase.from("nap_import_runs").insert({
    batch_id: batchId, source_url: sourceUrl, source_etag: source.etag,
    publication_time: parsed.publicationTime, status: "staged", dry_run: true,
    source_sites: parsed.stations.length, source_refill_points: parsed.refillPoints,
    validation,
  });
  if (error) throw error;
}

async function insertChunks(table, rows, size = 250) {
  for (let index = 0; index < rows.length; index += size) {
    const { error } = await supabase.from(table).insert(rows.slice(index, index + size));
    if (error) throw new Error(`${table} lote ${index / size + 1}: ${error.message}`);
  }
}

function local(name) { return String(name).split(":").pop(); }
function attr(node, name) { return node.attributes?.[name] ?? null; }
function numberOrNull(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function wattsToKw(value) { const watts = numberOrNull(value); return watts == null ? null : Math.round((watts / 1000) * 100) / 100; }
function hash(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function required(name, value) { if (!value) throw new Error(`${name} não configurada`); return value; }
function normalizeConnector(value) {
  const normalized = String(value).toLowerCase();
  if (normalized.includes("t2combo") || normalized.includes("combo") || normalized.includes("ccs")) return "CCS";
  if (normalized.includes("chademo")) return "CHAdeMO";
  if (normalized.includes("62196t2") || normalized.includes("type2")) return "Type 2";
  if (normalized.includes("62196t1") || normalized.includes("type1")) return "Type 1";
  if (normalized.includes("domestic") || normalized.includes("schuko")) return "Schuko";
  return value || "Unknown";
}
