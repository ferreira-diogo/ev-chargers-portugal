// Route-corridor planner override. Loaded after chargevoy.js.
// Keeps the original local station set as a fallback if the corridor API is unavailable.
(function () {
  function routeBounds(coordinates) {
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (const [lon, lat] of coordinates) {
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    }
    // ~20 km latitude and >=15 km longitude throughout mainland Portugal.
    return { minLat: minLat - 0.18, maxLat: maxLat + 0.18, minLon: minLon - 0.25, maxLon: maxLon + 0.25 };
  }

  async function loadRouteCorridorStations(coordinates) {
    const bounds = routeBounds(coordinates);
    const params = new URLSearchParams({
      min_lat: String(bounds.minLat), max_lat: String(bounds.maxLat),
      min_lon: String(bounds.minLon), max_lon: String(bounds.maxLon), limit: "1500",
    });
    const response = await fetchWithTimeout(`${D1_FALLBACK_URL}?${params}`, { cache: "no-store" }, 15000);
    if (!response.ok) throw new Error(`API de postos HTTP ${response.status}`);
    const payload = await response.json();
    const stations = Array.isArray(payload?.stations) ? payload.stations : [];
    const connectors = Array.isArray(payload?.connectors) ? payload.connectors : [];
    if (!stations.length) throw new Error("A API do corredor não devolveu postos.");
    for (const connector of connectors) {
      if (!connector?.station_id) continue;
      const list = connectorMap.get(connector.station_id) || [];
      if (!list.some((item) => item.id === connector.id)) list.push(connector);
      connectorMap.set(connector.station_id, list);
    }
    return stations;
  }

  async function planRouteCorridor() {
    const button = document.getElementById("plan-route");
    const result = document.getElementById("route-result");
    const originText = document.getElementById("route-origin").value.trim();
    const destinationText = document.getElementById("route-destination").value.trim();
    const startBattery = Math.min(100, Math.max(5, Number(document.getElementById("route-battery").value) || 80));
    const reserve = Math.min(40, Math.max(5, Number(document.getElementById("route-reserve").value) || 15));
    if (!originText || !destinationText) { notifyUser("Indique a origem e o destino.", { kind: "error" }); return; }
    if (reserve >= startBattery) { notifyUser("A bateria inicial deve ser superior à reserva de chegada.", { kind: "error" }); return; }
    try {
      button.disabled = true; button.textContent = "A calcular…"; result.classList.remove("show");
      const origin = routeOriginOverride && originText === routeOriginOverride.input ? routeOriginOverride : await geocodePortugal(originText);
      const destination = routeDestinationOverride && destinationText === routeDestinationOverride.input ? routeDestinationOverride : await geocodePortugal(destinationText);
      const routeUrl = `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=full&geometries=geojson&steps=false`;
      const response = await fetchWithTimeout(routeUrl, {}, 15000);
      if (!response.ok) throw new Error(`Serviço de rotas HTTP ${response.status}`);
      const data = await response.json();
      if (data.code !== "Ok" || !data.routes?.length) throw new Error("Não foi possível calcular uma rota rodoviária.");
      const route = data.routes[0], coordinates = route.geometry.coordinates;
      const distance = route.distance / 1000, duration = route.duration / 60;
      const routeProfile = buildRouteProfile(coordinates, distance);
      const capacity = Number(currentVehicle?.battery_capacity_kwh) || 60;
      const consumption = ((Number(currentVehicle?.consumption_wh_km) || 170) / 1000) * 1.15;
      const requiredEnergy = distance * consumption;
      const usableEnergy = (capacity * (startBattery - reserve)) / 100;
      const chargeNeeded = Math.max(0, requiredEnergy - usableEnergy);

      let routeStations = allStations;
      let corridorSource = "local-fallback";
      try {
        routeStations = await loadRouteCorridorStations(coordinates);
        corridorSource = "route-corridor";
      } catch (error) {
        console.warn("Route corridor fallback:", error);
      }

      let candidates = routeStations
        .filter((station) => {
          if (!(Number(station.max_power_kw) > 0)) return false;
          const knownConnectors = connectorMap.get(station.id) || [];
          // Missing connector metadata must not create a false negative.
          return !knownConnectors.length || stationCompatibleWithVehicle(station);
        })
        .map((station) => {
          const availability = stationAvailability(connectorMap.get(station.id) || []);
          return { ...station, ...stationRoutePosition(station, routeProfile), route_availability: availability };
        })
        .filter((station) => station.distance <= 15 && station.route_km > distance * 0.04 && station.route_km < distance * 0.96);

      console.info("ChargeVoy route candidates", { source: corridorSource, stations: routeStations.length, candidates: candidates.length });
      const reserveEnergy = (capacity * reserve) / 100;
      const maxVehiclePower = Number(currentVehicle?.max_dc_power_kw) || 50;
      let batteryEnergy = (capacity * startBattery) / 100, currentKm = 0, currentDetourKm = 0, chargingMinutes = 0, detourKm = 0;
      const suggested = [], usedStations = new Set();
      while (batteryEnergy - (currentDetourKm + distance - currentKm) * consumption < reserveEnergy && suggested.length < 5) {
        const reachableKm = Math.max(0, (batteryEnergy - reserveEnergy) / consumption);
        const targetKm = currentKm + reachableKm * 0.82;
        const reachable = candidates.filter((station) => {
          const legKm = currentDetourKm + (station.route_km - currentKm) + station.distance;
          return !usedStations.has(station.id) && station.route_km > currentKm + 5 && legKm <= reachableKm && station.route_km < distance - 5;
        });
        reachable.sort((a, b) => routeCandidateScore(a, targetKm, reachableKm, maxVehiclePower) - routeCandidateScore(b, targetKm, reachableKm, maxVehiclePower));
        const station = reachable[0]; if (!station) break;
        const fallback = findFallbackStation(station, candidates, usedStations, maxVehiclePower);
        const legKm = currentDetourKm + (station.route_km - currentKm) + station.distance;
        batteryEnergy = Math.max(0, batteryEnergy - legKm * consumption);
        const arrivalSoc = (batteryEnergy / capacity) * 100, targetEnergy = capacity * 0.8;
        const energyToCharge = Math.max(0, targetEnergy - batteryEnergy);
        const effectivePower = Math.max(1, Math.min(Number(station.max_power_kw) || 1, maxVehiclePower));
        const chargeMinutes = chargingTimeMinutes(energyToCharge, effectivePower);
        chargingMinutes += chargeMinutes;
        suggested.push({ ...station, arrival_soc: arrivalSoc, departure_soc: 80, energy_to_charge: energyToCharge, effective_power: effectivePower, charge_minutes: chargeMinutes, leg_km: legKm, fallback });
        usedStations.add(station.id); batteryEnergy = targetEnergy; detourKm += station.distance * 2; currentDetourKm = station.distance; currentKm = station.route_km;
      }
      const finalLegKm = currentDetourKm + (distance - currentKm);
      const routeFeasible = batteryEnergy - finalLegKm * consumption >= reserveEnergy;
      const finalEnergy = Math.max(0, batteryEnergy - finalLegKm * consumption), finalSoc = (finalEnergy / capacity) * 100;
      lastPlannedRoute = { origin, destination, stops: suggested.map((station) => ({ latitude: station.latitude, longitude: station.longitude, name: station.name })), distanceKm: distance, driveMinutes: duration, chargingMinutes };
      routeLayer.clearLayers();
      const routeLine = L.geoJSON(route.geometry, { style: { color: "#1464c2", weight: 5, opacity: 0.85 } }).addTo(routeLayer);
      L.marker([origin.lat, origin.lon]).addTo(routeLayer).bindPopup(`<b>Origem</b><br>${escapeHtml(origin.label)}`);
      L.marker([destination.lat, destination.lon]).addTo(routeLayer).bindPopup(`<b>Destino</b><br>${escapeHtml(destination.label)}`);
      suggested.forEach((station, index) => {
        L.circleMarker([station.latitude, station.longitude], { radius: 10, color: "#fff", weight: 3, fillColor: isOfficialTeslaStation(station) ? "#e82127" : "#f59e0b", fillOpacity: 1 }).addTo(routeLayer).bindPopup(`<b>Paragem ${index + 1}${isOfficialTeslaStation(station) ? " · Supercharger Tesla" : ""}</b><br>${escapeHtml(station.name)}<br>Chegada: ${station.arrival_soc.toFixed(0)}% · carregar ${station.energy_to_charge.toFixed(1).replace(".", ",")} kWh<br>~${station.charge_minutes} min a ${station.effective_power} kW`);
        if (station.fallback) L.circleMarker([station.fallback.latitude, station.fallback.longitude], { radius: 7, color: "#475569", weight: 2, fillColor: "#fff", fillOpacity: 1 }).addTo(routeLayer).bindPopup(`<b>Plano B da paragem ${index + 1}</b><br>${escapeHtml(station.fallback.name || "Posto alternativo")}<br>${station.fallback.distance_from_primary.toFixed(1).replace(".", ",")} km do posto principal · ${escapeHtml(station.fallback.max_power_kw || "—")} kW`);
      });
      map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
      const detourMinutes = detourKm, totalMinutes = duration + detourMinutes + chargingMinutes;
      const stopsHtml = chargeNeeded <= 0
        ? `<b>✓ A rota é possível sem carregamento intermédio.</b> Chegada estimada: ${finalSoc.toFixed(0)}%.`
        : suggested.length && routeFeasible
          ? `<b>⚡ Plano recomendado: ${suggested.length} ${suggested.length === 1 ? "paragem" : "paragens"} · ${chargingMinutes} min a carregar.</b>${isTeslaVehicle() ? "<br><small>Superchargers oficiais são priorizados quando não comprometem a autonomia nem criam um desvio excessivo.</small>" : ""}<ol class="route-stops">${suggested.map((station, index) => `<li><b>${index + 1}. ${escapeHtml(station.name || "Posto")}</b>${isOfficialTeslaStation(station) ? " · <b>Supercharger Tesla</b>" : ""} — ao km ~${station.route_km.toFixed(0)}, chegada ${station.arrival_soc.toFixed(0)}%, carregar ${station.energy_to_charge.toFixed(1).replace(".", ",")} kWh até ${station.departure_soc}% · <b>~${station.charge_minutes} min</b> a ${station.effective_power} kW · desvio ~${station.distance.toFixed(1).replace(".", ",")} km${station.route_availability.kind === "live" ? ` · ${escapeHtml(station.route_availability.label)}` : ""}${station.fallback ? `<br><small><b>Plano B:</b> ${escapeHtml(station.fallback.name || "Posto alternativo")} · ${station.fallback.distance_from_primary.toFixed(1).replace(".", ",")} km do principal · ${escapeHtml(station.fallback.max_power_kw || "—")} kW</small>` : "<br><small>Plano B: não foi encontrado outro posto alcançável nesta zona.</small>"}</li>`).join("")}</ol><b>Destino:</b> chegada estimada com ${finalSoc.toFixed(0)}%.`
          : suggested.length
            ? `<b>⚠ Foram encontradas ${suggested.length} paragens possíveis, mas não é possível completar a rota mantendo ${reserve}% de reserva. Experimente aumentar a bateria inicial ou reduzir a reserva.</b>`
            : `<b>⚠ É necessário carregar, mas não foram encontrados postos compatíveis e alcançáveis até 15 km desta rota.</b><br><small>Foram analisados ${routeStations.length} postos (${corridorSource === "route-corridor" ? "corredor completo da rota" : "fallback local"}) e ${candidates.length} ficaram até 15 km do percurso.</small>`;
      result.innerHTML = `<div class="route-summary"><span><b>${distance.toFixed(0)} km</b> de rota</span><span><b>${formatDuration(duration)}</b> a conduzir</span><span><b>${formatDuration(chargingMinutes)}</b> a carregar</span><span><b>${formatDuration(totalMinutes)}</b> total</span><span><b>${requiredEnergy.toFixed(1).replace(".", ",")} kWh</b> estimados</span></div>${stopsHtml}<br><small>Estimativa para ${escapeHtml(currentVehicle ? `${currentVehicle.make} ${currentVehicle.model} ${currentVehicle.variant || ""}`.trim() : "o veículo selecionado")}, com margem de consumo de 15%. Inclui curva média de carregamento, 4 minutos de operação por paragem e aproximadamente ${detourKm.toFixed(1).replace(".", ",")} km de desvios.</small><div class="route-actions"><button onclick="recalculateRoute()" id="recalculate-route">↻ Atualizar rota</button><button onclick="openRouteInGoogleMaps()">🧭 Navegar até ao destino</button><button onclick="sharePlannedRoute()">↗ Partilhar rota</button></div>`;
      result.classList.add("show"); saveRouteToUserHistory();
    } catch (error) {
      console.error(error); result.innerHTML = `<b>Não foi possível calcular a rota.</b><br>${escapeHtml(error.message)}`; result.classList.add("show");
    } finally { button.disabled = false; button.textContent = "🧭 Calcular rota"; }
  }

  // Direct callers (route-to-station/recalculate) use the corrected implementation.
  planRoute = planRouteCorridor;
  // The original click listener captured the old function. Intercept it before target/bubble listeners.
  const button = document.getElementById("plan-route");
  if (button) button.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); planRouteCorridor(); }, true);
})();
