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
    },
  });
}

export async function onRequestGet({ request, env }) {
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
    let result;
    if (hasLocation) {
      const latDelta = 0.45;
      const lonDelta = 0.65;
      result = await db
        .prepare(
          `SELECT ${fields}
           FROM station_cache
           WHERE latitude BETWEEN ? AND ?
             AND longitude BETWEEN ? AND ?
           ORDER BY max_power_kw DESC NULLS LAST
           LIMIT 500`,
        )
        .bind(lat - latDelta, lat + latDelta, lon - lonDelta, lon + lonDelta)
        .all();
    } else {
      result = await db
        .prepare(
          `SELECT ${fields}
           FROM station_cache
           ORDER BY max_power_kw DESC NULLS LAST
           LIMIT 500`,
        )
        .all();
    }

    return json({
      source: "cloudflare-d1-cache",
      stale: true,
      stations: result.results || [],
    });
  } catch (error) {
    console.error("D1 station fallback:", error);
    return json({ stations: [], error: "D1 query failed" }, 503);
  }
}
