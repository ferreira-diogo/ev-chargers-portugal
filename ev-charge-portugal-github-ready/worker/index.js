async function mergeAvailability(rows, env) {
  if (!env.AVAILABILITY_KV || !rows.length) return rows;
  try {
    const snapshot = await env.AVAILABILITY_KV.get("mobie_nap_current", "json");
    if (!snapshot?.statuses) return rows;
    for (const connector of rows) {
      const site = String(connector.station_id || "").replace(/^nap-/, "");
      const external = String(connector.external_id || connector.id || "").replace(/^nap-/, "");
      let point = external.startsWith(site + "-") ? external.slice(site.length + 1) : "";
      let status = snapshot.statuses[site + "|" + point];
      while (!status && /-\d+$/.test(point)) {
        point = point.replace(/-\d+$/, "");
        status = snapshot.statuses[site + "|" + point];
      }
      if (!status) continue;
      connector.status = status;
      connector.availability_updated_at = snapshot.publication_time;
      connector.availability_source = "mobie_nap";
      connector.available_count = status === "available" ? 1 : ["charging", "outOfOrder", "blocked", "inoperative", "reserved"].includes(status) ? 0 : null;
    }
  } catch (error) { console.error("NAP snapshot:", error); }
  return rows;
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
].join(", ");

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60, stale-while-revalidate=300",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "Content-Type",
    },
  });
}

async function stations(request, env) {
  const db = env.CHARGEVOY_DB;
  if (!db) return json({ stations: [], error: "D1 binding unavailable" }, 503);

  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const hasLocation =
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180;

  try {
    const result = hasLocation
      ? await db
          .prepare(`SELECT ${fields}
            FROM station_cache_v2
            WHERE latitude BETWEEN ? AND ?
              AND longitude BETWEEN ? AND ?
            ORDER BY COALESCE(max_power_kw, 0) DESC
            LIMIT 500`)
          .bind(lat - 0.45, lat + 0.45, lon - 0.65, lon + 0.65)
          .all()
      : await db
          .prepare(`SELECT ${fields}
            FROM station_cache_v2
            ORDER BY COALESCE(max_power_kw, 0) DESC
            LIMIT 500`)
          .all();

    const stationRows = result.results || [];
    let connectorRows = [];
    const stationIds = stationRows.map((station) => station.id).filter(Boolean);
    for (let offset = 0; offset < stationIds.length; offset += 80) {
      const batch = stationIds.slice(offset, offset + 80);
      if (!batch.length) continue;
      const placeholders = batch.map(() => "?").join(", ");
      const connectorResult = await db.prepare(
        `SELECT id, external_id, station_id, type, power_kw, quantity, available_count, status,
                availability_updated_at, availability_source
         FROM connectors WHERE station_id IN (${placeholders})`,
      ).bind(...batch).all();
      connectorRows.push(...(connectorResult.results || []));
    }

    await mergeAvailability(connectorRows, env);

    return json({
      source: "cloudflare-d1-cache",
      stale: true,
      stations: stationRows,
      connectors: connectorRows,
    });
  } catch (error) {
    console.error("D1 station fallback:", error);
    return json({ stations: [], error: "D1 query failed" }, 503);
  }
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

    if (url.pathname === "/api/stations" || url.pathname.startsWith("/api/stations/")) {
      return stations(request, env);
    }

    if (url.pathname === "/api/connectors") {
      if (!env.CHARGEVOY_DB) return json({ connectors: [], error: "D1 binding unavailable" }, 503);
      const stationId = url.searchParams.get("station_id");
      if (!stationId || stationId.length > 180) return json({ connectors: [], error: "station_id inválido" }, 400);
      try {
        const result = await env.CHARGEVOY_DB.prepare(
          "SELECT id, external_id, station_id, type, power_kw, quantity, available_count, status, availability_updated_at, availability_source FROM connectors WHERE station_id = ? ORDER BY id",
        ).bind(stationId).all();
        const connectors = await mergeAvailability(result.results || [], env);
        return json({ source: "cloudflare-d1", connectors });
      } catch (error) {
        console.error("D1 connectors:", error);
        return json({ connectors: [], error: "D1 connector query failed" }, 503);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
