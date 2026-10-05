/* Shared location resolution for web/PWA and the isolated Android bundle. */
(function (root) {
  "use strict";
  const settlements = new Set(["city", "town", "village", "hamlet", "suburb", "neighbourhood", "locality"]);
  const cache = new Map();
  let requestQueue = Promise.resolve(), lastRequestAt = 0;
  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-PT").replace(/\s+/g, " ").trim();
  }
  function placeName(place) {
    return place.name || place.namedetails?.name || String(place.display_name || "").split(",")[0];
  }
  function isBoundary(place) {
    return (place.category || place.class) === "boundary" || place.type === "administrative";
  }
  function isSettlement(place) {
    return !isBoundary(place) && settlements.has(place.addresstype || place.type);
  }
  function distance(a, b) {
    const rad = Math.PI / 180, dLat = (Number(b.lat) - Number(a.lat)) * rad;
    const dLon = (Number(b.lon) - Number(a.lon)) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(Number(a.lat) * rad) * Math.cos(Number(b.lat) * rad) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  }
  function exactName(place, query) {
    const target = normalize(query);
    return [placeName(place), place.namedetails?.name, place.namedetails?.["name:pt"], place.namedetails?.official_name]
      .some(name => name && normalize(name) === target);
  }
  function candidates(results, query) {
    const head = query.split(",")[0].trim();
    const ranked = results.filter(p => p && p.lat != null && p.lon != null &&
      Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)) &&
      Math.abs(Number(p.lat)) <= 90 && Math.abs(Number(p.lon)) <= 180 &&
      (!p.address?.country_code || p.address.country_code.toLowerCase() === "pt"))
      .map((place, index) => ({place, index, score:
        (exactName(place, head) ? 100 : 0) + (isSettlement(place) ? 30 : 0) +
        (place.osm_type === "node" && isSettlement(place) ? 10 : 0) - (isBoundary(place) ? 20 : 0)}))
      .sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.place);
    const unique = [];
    for (const place of ranked) {
      if (unique.some(prior =>
        (place.osm_type && place.osm_id && prior.osm_type === place.osm_type && prior.osm_id === place.osm_id) ||
        (normalize(placeName(prior)) === normalize(placeName(place)) &&
          isBoundary(prior) === isBoundary(place) && distance(prior, place) < 0.5))) continue;
      unique.push(place);
    }
    return unique;
  }
  function automaticChoice(places, query) {
    // A district/municipality must never silently become a town destination.
    const explicitArea = /^(distrito|concelho|municipio|freguesia|regiao)\b/.test(normalize(query));
    if (explicitArea) return places.length === 1 ? places[0] : null;
    const simple = !query.includes(",") && !/\d/.test(query);
    if (simple) {
      const exact = places.filter(p => isSettlement(p) && exactName(p, query));
      if (exact.length === 1) return exact[0];
      if (exact.length > 1) return null;
    }
    return places.length === 1 && !isBoundary(places[0]) ? places[0] : null;
  }
  function english() { return (root.document?.documentElement.lang || "pt").startsWith("en"); }
  function kind(place) {
    const en = english(), type = place.addresstype || place.type;
    if (isBoundary(place)) return en ? "Administrative area · approximate point" : "Área administrativa · ponto aproximado";
    const names = en ? {city:"City",town:"Town",village:"Village",hamlet:"Village",suburb:"Neighbourhood",neighbourhood:"Neighbourhood"}
      : {city:"Cidade",town:"Vila",village:"Aldeia",hamlet:"Aldeia",suburb:"Bairro",neighbourhood:"Bairro"};
    return names[type] || (en ? "Location / address" : "Local / morada");
  }
  function choose(places, query) {
    return new Promise((resolve, reject) => {
      const doc = root.document, previousFocus = doc.activeElement;
      const dialog = doc.createElement("dialog");
      dialog.className = "geocode-dialog";
      dialog.setAttribute("aria-labelledby", "geocode-choice-title");
      dialog.setAttribute("aria-describedby", "geocode-choice-description");
      const title = doc.createElement("h2"); title.id = "geocode-choice-title";
      title.textContent = english() ? "Choose the destination" : "Escolha a localização";
      const hint = doc.createElement("p"); hint.id = "geocode-choice-description";
      hint.textContent = english() ? `Confirm the location for “${query}”. Administrative areas use an approximate point.`
        : `Confirme o local para “${query}”. As áreas administrativas usam um ponto aproximado.`;
      const list = doc.createElement("div"); list.className = "geocode-options";
      let done = false;
      function finish(place) {
        if (done) return; done = true;
        dialog.close(); dialog.remove(); previousFocus?.focus();
        if (place) resolve(place);
        else { const error = new Error(english() ? "Search cancelled." : "Pesquisa cancelada."); error.name = "AbortError"; reject(error); }
      }
      for (const place of places) {
        const button = doc.createElement("button"); button.type = "button"; button.className = "geocode-option";
        const name = doc.createElement("strong"); name.textContent = `${placeName(place)} · ${kind(place)}`;
        const address = doc.createElement("small"); address.textContent = place.display_name || placeName(place);
        button.append(name, address); button.addEventListener("click", () => finish(place)); list.append(button);
      }
      const cancel = doc.createElement("button"); cancel.type = "button"; cancel.className = "geocode-cancel";
      cancel.textContent = english() ? "Cancel" : "Cancelar"; cancel.addEventListener("click", () => finish(null));
      dialog.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
      dialog.addEventListener("close", () => { if (!done) finish(null); });
      dialog.append(title, hint, list, cancel); doc.body.append(dialog); dialog.showModal();
    });
  }
  function request(params) {
    const task = requestQueue.then(async () => {
      const wait = Math.max(0, 1100 - (Date.now() - lastRequestAt));
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      lastRequestAt = Date.now();
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await root.fetch(`https://nominatim.openstreetmap.org/search?${params}`, {signal:controller.signal});
        if (!response.ok) throw new Error(english() ? `Location search HTTP ${response.status}` : `Pesquisa geográfica HTTP ${response.status}`);
        const results = await response.json();
        if (!Array.isArray(results)) throw new Error(english() ? "Invalid location response." : "Resposta geográfica inválida.");
        return results;
      } catch (error) {
        if (controller.signal.aborted) throw new Error(english() ? "Location search timed out. Please try again." : "A pesquisa demorou demasiado. Tente novamente.");
        throw error;
      } finally { clearTimeout(timeout); }
    });
    requestQueue = task.catch(() => {});
    return task;
  }
  async function resolve(query) {
    query = String(query || "").trim().replace(/\s+/g, " ");
    if (!query) throw new Error(english() ? "Enter a location." : "Indique uma localização.");
    const key = normalize(query), cached = cache.get(key);
    let places;
    if (cached && Date.now() - cached.at < 600000) places = cached.places;
    else {
      const common = {format:"jsonv2",countrycodes:"pt",limit:"8",addressdetails:"1",namedetails:"1",dedupe:"0","accept-language":"pt-PT"};
      const params = new URLSearchParams({...common, q:query});
      places = candidates(await request(params), query);
      // A broad administrative match can hide the settlement in the first page.
      // Retry with a city query only when a simple name has no exact settlement.
      const simple = !query.includes(",") && !/\d/.test(query) && !/^(distrito|concelho|municipio|freguesia|regiao)\b/.test(key);
      if (simple && !places.some(p => isSettlement(p) && exactName(p, query))) {
        const local = await request(new URLSearchParams({...common,city:query,featureType:"city"}));
        places = candidates([...places,...local], query);
      }
      if (!places.length) throw new Error(english() ? `Location not found: ${query}` : `Local não encontrado: ${query}`);
      cache.set(key,{at:Date.now(),places});
      if (cache.size > 100) cache.delete(cache.keys().next().value);
    }
    const selected = automaticChoice(places, query) || await choose(places, query);
    return {lat:Number(selected.lat),lon:Number(selected.lon),label:selected.display_name || placeName(selected)};
  }
  root.ChargeVoyGeocoding = Object.freeze({resolve, candidates, automaticChoice});
})(typeof window !== "undefined" ? window : globalThis);
