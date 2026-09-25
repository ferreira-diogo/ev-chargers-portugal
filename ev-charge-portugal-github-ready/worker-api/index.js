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
    },
  });
}

function numberFromPower(value) {
  const match = String(value || "").match(/[0-9]+(?:[.,][0-9]+)?/);
  return match ? Number(match[0].replace(",", ".")) : null;
}

function stationFromOsm(item) {
  const tags = item.tags || {};
  const latitude = Number(item.lat ?? item.center?.lat);
  const longitude = Number(item.lon ?? item.center?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const power =
    numberFromPower(tags["socket:output"]) ||
    numberFromPower(tags["socket:type2:output"]) ||
    numberFromPower(tags["socket:ccs:output"]) ||
    numberFromPower(tags["charging_station:output"]);

  return {
    id: `osm-${item.type}-${item.id}`,
    external_id: String(item.id),
    source: "openstreetmap-overpass",
    name: tags.name || tags.ref || "Posto de carregamento",
    address: [tags["addr:street"], tags["addr:housenumber"]]
      .filter(Boolean)
      .join(" "),
    city: tags["addr:city"] || tags["addr:municipality"] || "",
    latitude,
    longitude,
    max_power_kw: power,
    status: "unknown",
    operator_id: null,
    amenities: JSON.stringify(tags),
  };
}

async function nearbyOpenStreetMap(lat, lon) {
  const query =
    `[out:json][timeout:10];nwr[amenity=charging_station](around:50000,${lat},${lon});out center tags;`;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
      "user-agent": "ChargeVoy/1.0",
    },
    body: new URLSearchParams({ data: query }),
  });

  if (!response.ok) {
    throw new Error(`Overpass HTTP ${response.status}`);
  }

  const payload = await response.json();
  return (payload.elements || [])
    .map(stationFromOsm)
    .filter(Boolean)
    .slice(0, 500);
}

export default {
  async fetch(request, env) {
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
      if (env.CHARGEVOY_DB) {
        const result = hasLocation
          ? await env.CHARGEVOY_DB
              .prepare(`SELECT ${fields}
                FROM station_cache
                WHERE latitude BETWEEN ? AND ?
                  AND longitude BETWEEN ? AND ?
                ORDER BY COALESCE(max_power_kw, 0) DESC
                LIMIT 500`)
              .bind(lat - 0.45, lat + 0.45, lon - 0.65, lon + 0.65)
              .all()
          : await env.CHARGEVOY_DB
              .prepare(`SELECT ${fields}
                FROM station_cache
                ORDER BY COALESCE(max_power_kw, 0) DESC
                LIMIT 500`)
              .all();

        if (result.results?.length) {
          return json({
            source: "cloudflare-d1-cache",
            stale: true,
            stations: result.results,
          });
        }
      }

      if (hasLocation) {
        const stations = await nearbyOpenStreetMap(lat, lon);
        return json({
          source: "openstreetmap-overpass-fallback",
          stale: true,
          stations,
        });
      }

      return json({
        source: "cloudflare-d1-cache",
        stale: true,
        stations: [],
      });
    } catch (error) {
      console.error("Station fallback:", error);
      return json(
        {
          source: "fallback-error",
          stations: [],
          error: "Station fallback unavailable",
        },
        503,
      );
    }
  },
};
