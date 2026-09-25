// Restore API after static Worker build separation: 2026-09-25T14:55Z
// Deploy trigger: Cloudflare D1 primary API
// D1 NAP snapshot loaded: 2026-09-25
const CATALOGS = {
  stations: [
    "id", "external_id", "source", "name", "address", "city",
    "latitude", "longitude", "max_power_kw", "status", "operator_id", "amenities"
  ],
  operators: ["id", "name", "external_id", "source", "updated_at"],
  connectors: [
    "id", "station_id", "type", "power_kw", "quantity", "available_count",
    "status", "availability_updated_at", "availability_source", "updated_at"
  ],
  vehicle_models: [
    "id", "external_id", "source", "make", "model", "variant",
    "model_year_start", "model_year_end", "battery_capacity_kwh",
    "consumption_wh_km", "wltp_range_km", "max_ac_power_kw",
    "max_dc_power_kw", "connector_types", "active", "body_style",
    "data_quality", "consumption_basis", "updated_at"
  ],
  ceme_cards: [
    "id", "name", "energy_price_eur_kwh", "session_fee_eur",
    "includes_tar", "vat_rate", "iec_eur_kwh", "conditions", "source_url",
    "valid_from", "valid_to", "pricing_mode", "network_scope",
    "cashback_own_rate", "cashback_other_rate", "active", "updated_at"
  ],
  station_reviews: ["id", "station_id", "rating", "comment", "created_at"],
  station_reliability: [
    "station_id", "review_count", "average_rating", "snapshot_count",
    "availability_rate", "last_observed_at"
  ],
  official_opc_tariffs: [
    "id", "station_id", "connector_uid", "voltage_level", "tariff_period",
    "connector_type", "power_kw", "activation_fee_eur",
    "energy_price_eur_kwh", "time_price_eur_min", "updated_at"
  ],
  station_ad_hoc_price_components: [
    "id", "station_id", "point_id", "pricing_policy", "amount_eur",
    "currency", "observed_at", "updated_at"
  ],
};

const TABLES = {
  stations: "station_cache_v2",
  operators: "operators",
  connectors: "connectors",
  vehicle_models: "vehicle_models",
  ceme_cards: "ceme_cards",
  station_reviews: "station_reviews",
  station_reliability: "station_reliability",
  official_opc_tariffs: "official_opc_tariffs",
  station_ad_hoc_price_components: "station_ad_hoc_price_components",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60, stale-while-revalidate=300",
      "access-control-allow-origin": "*",
    },
  });
}

function validNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function readCatalog(db, url, catalogName) {
  const table = TABLES[catalogName];
  const allowed = CATALOGS[catalogName];
  if (!table || !allowed) return json({ error: "Catalog not available" }, 404);

  const requested = (url.searchParams.get("select") || allowed.join(","))
    .split(",")
    .map((value) => value.trim())
    .filter((value) => allowed.includes(value));
  const columns = requested.length ? requested : allowed;
  const bindings = [];
  const where = [];

  for (const column of allowed) {
    const eq = url.searchParams.get(`${column}_eq`);
    const gte = url.searchParams.get(`${column}_gte`);
    const lte = url.searchParams.get(`${column}_lte`);
    if (eq !== null) {
      where.push(`"${column}" = ?`);
      bindings.push(eq);
    }
    if (gte !== null && validNumber(gte) !== null) {
      where.push(`"${column}" >= ?`);
      bindings.push(Number(gte));
    }
    if (lte !== null && validNumber(lte) !== null) {
      where.push(`"${column}" <= ?`);
      bindings.push(Number(lte));
    }
  }

  const orderParam = url.searchParams.get("order");
  let order = "";
  if (orderParam) {
    const [column, direction] = orderParam.split(".");
    if (allowed.includes(column)) {
      order = ` ORDER BY "${column}" ${direction === "desc" ? "DESC" : "ASC"}`;
    }
  }

  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 500), 1), 1000);
  const sql = `SELECT ${columns.map((column) => `"${column}"`).join(", ")}
    FROM "${table}"${where.length ? ` WHERE ${where.join(" AND ")}` : ""}
    ${order} LIMIT ${limit}`;
  const result = await db.prepare(sql).bind(...bindings).all();
  return json({ source: "cloudflare-d1", stale: true, rows: result.results || [] });
}

async function readStations(db, url) {
  const lat = validNumber(url.searchParams.get("lat"));
  const lon = validNumber(url.searchParams.get("lon"));
  const hasLocation =
    lat !== null && lon !== null &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;

  const query = hasLocation
    ? db.prepare(`SELECT ${CATALOGS.stations.join(", ")}
       FROM station_cache_v2
       WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?
       ORDER BY COALESCE(max_power_kw, 0) DESC LIMIT 500`)
      .bind(lat - 0.45, lat + 0.45, lon - 0.65, lon + 0.65)
    : db.prepare(`SELECT ${CATALOGS.stations.join(", ")}
       FROM station_cache_v2
       ORDER BY COALESCE(max_power_kw, 0) DESC LIMIT 500`);

  const result = await query.all();
  return json({
    source: "cloudflare-d1-cache",
    stale: true,
    stations: result.results || [],
  });
}

async function nearbyOpenStreetMap(lat, lon) {
  const query =
    `[out:json][timeout:20];nwr[amenity=charging_station](around:50000,${lat},${lon});out center tags;`;
  const endpoints = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];
  let lastError;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          "user-agent": "ChargeVoy/1.0",
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
      const payload = await response.json();
      return (payload.elements || []).slice(0, 500).map((item) => {
        const tags = item.tags || {};
        const latitude = Number(item.lat ?? item.center?.lat);
        const longitude = Number(item.lon ?? item.center?.lon);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
        return {
          id: `osm-${item.type}-${item.id}`,
          external_id: String(item.id),
          source: "openstreetmap-overpass",
          name: tags.name || tags.ref || "Posto de carregamento",
          address: [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" "),
          city: tags["addr:city"] || tags["addr:municipality"] || "",
          latitude, longitude,
          max_power_kw: null,
          status: "unknown",
          operator_id: tags.operator || null,
          amenities: JSON.stringify(tags),
        };
      }).filter(Boolean);
    } catch (error) {
      lastError = error;
      console.warn("Overpass endpoint failed:", endpoint, error);
    }
  }
  throw lastError || new Error("No Overpass endpoint available");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,OPTIONS",
          "access-control-allow-headers": "Content-Type",
        },
      });
    }
    if (!env.CHARGEVOY_DB) return json({ error: "D1 binding unavailable" }, 503);

    try {
      if (url.pathname.endsWith("/api/catalog")) {
        const catalog = url.searchParams.get("table");
        return await readCatalog(env.CHARGEVOY_DB, url, catalog);
      }

      const result = await readStations(env.CHARGEVOY_DB, url);
      const payload = await result.json();
      if (payload.stations?.length) return json(payload);

      const lat = validNumber(url.searchParams.get("lat"));
      const lon = validNumber(url.searchParams.get("lon"));
      if (lat !== null && lon !== null) {
        return json({
          source: "cloudflare-d1-empty",
          stale: true,
          stations: await nearbyOpenStreetMap(lat, lon),
        });
      }
      return json(payload);
    } catch (error) {
      console.error("ChargeVoy API:", error);
      const lat = validNumber(url.searchParams.get("lat"));
      const lon = validNumber(url.searchParams.get("lon"));
      if (
        url.pathname.endsWith("/api/stations") &&
        lat !== null &&
        lon !== null
      ) {
        try {
          return json({
            source: "openstreetmap-overpass-fallback",
            stale: true,
            stations: await nearbyOpenStreetMap(lat, lon),
            warning: "D1 indisponível; dados de localização temporários",
          });
        } catch (fallbackError) {
          console.error("Overpass fallback:", fallbackError);
        }
      }
      return json({ error: "D1 query failed", stations: [], rows: [] }, 503);
    }
  },
};
