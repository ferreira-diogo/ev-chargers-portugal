      const SUPABASE_URL = "https://ftnmdgiftdgaycotjixr.supabase.co";
      const D1_FALLBACK_URL = "https://chargevoy-api.zombid.workers.dev/api/stations";
      const SUPABASE_KEY = "sb_publishable_krF5y8hef028bneF7yL1oA_L8YjXcj_";
      const API_HEADERS = {
        apikey: SUPABASE_KEY,
        Authorization: "Bearer " + SUPABASE_KEY,
      };
      const authClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        },
      );
      const map = L.map("map", {
        preferCanvas: true,
        zoomSnap: 0.5,
        zoomDelta: 1,
      }).setView([39.55, -8], 6.5);
      function syncMobileLandscapeMode() {
        const isTouchDevice =
          "ontouchstart" in window || navigator.maxTouchPoints > 0;
        const isLandscape = window.innerWidth > window.innerHeight;
        document.body.classList.toggle(
          "mobile-landscape",
          isTouchDevice && isLandscape,
        );
        requestAnimationFrame(() => map.invalidateSize());
      }
      syncMobileLandscapeMode();
      window.addEventListener("resize", syncMobileLandscapeMode);
      window.addEventListener("orientationchange", syncMobileLandscapeMode);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        updateWhenIdle: true,
        keepBuffer: 1,
      }).addTo(map);
      const stationLayer = L.layerGroup().addTo(map);
      const searchLayer = L.layerGroup().addTo(map);
      const routeLayer = L.layerGroup().addTo(map);
      let allStations = [];
      let stationLoadRetryScheduled = false;
      let connectorMap = new Map();
      let operatorMap = new Map();
      let reliabilityMap = new Map();
      let currentPoiItems = [];
      let markerMap = new Map();
      let selectedPower = "all";
      let searchPosition = null;
      let lastGeocodeAt = 0;
      const LOCAL_VEHICLE_FALLBACK = [
        ["Tesla", "Model 3", "RWD", 2023, 60, 145, 513, 11, 170, "sedan"],
        ["Tesla", "Model Y", "RWD", 2023, 60, 160, 455, 11, 170, "suv"],
        ["Tesla", "Model S", "Dual Motor", 2023, 100, 180, 634, 11, 250, "sedan"],
        ["Tesla", "Model X", "Dual Motor", 2023, 100, 210, 576, 11, 250, "suv"],
        ["Volkswagen", "ID.3", "Pro", 2023, 58, 155, 426, 11, 135, "hatchback"],
        ["Volkswagen", "ID.4", "Pro", 2023, 77, 175, 520, 11, 135, "suv"],
        ["Renault", "5 E-Tech", "52 kWh", 2024, 52, 150, 410, 11, 100, "hatchback"],
        ["Peugeot", "e-208", "50 kWh", 2023, 50, 160, 362, 11, 100, "hatchback"],
        ["Hyundai", "Ioniq 5", "77 kWh", 2023, 77, 180, 507, 11, 235, "suv"],
        ["Kia", "EV6", "77.4 kWh", 2023, 77, 180, 528, 11, 240, "suv"],
        ["Mercedes-Benz", "EQA", "250+", 2023, 70, 180, 424, 11, 100, "suv"],
        ["Mercedes-Benz", "GLC", "300e", 2024, 31, 220, 130, 11, 0, "suv"],
        ["BMW", "i4", "eDrive40", 2023, 81, 165, 590, 11, 205, "sedan"],
        ["Volvo", "EX30", "Single Motor Extended Range", 2024, 69, 160, 476, 11, 153, "suv"],
      ].map(([make, model, variant, year, battery, consumption, range, ac, dc, body], index) => ({
        id: `local-vehicle-${index + 1}`,
        external_id: `local-${index + 1}`,
        source: "local-fallback",
        make, model, variant, model_year_start: year,
        battery_capacity_kwh: battery,
        consumption_wh_km: consumption,
        wltp_range_km: range,
        max_ac_power_kw: ac,
        max_dc_power_kw: dc,
        connector_types: JSON.stringify(["CCS2", "Type 2"]),
        body_style: body,
        data_quality: "fallback",
        consumption_basis: "catalogue-estimate",
      }));

      let vehicleModels = [];
      let currentVehicle = null;
      let selectedStationPower = null;
      let selectedStation = null;
      let routeOriginOverride = null;
      let routeDestinationOverride = null;
      let cemeCards = [];
      let selectedOpcTariffs = [];
      let selectedAdHocPriceComponents = [];
      let pricingRequest = 0;
      let favoriteStationIds = new Set(
        JSON.parse(localStorage.getItem("ev-charge-favorites") || "[]"),
      );
      let lastPlannedRoute = null;
      let vehicleImageRequest = 0;
      let currentSession = null;
      let installPrompt = null;
      const geocodeCache = new Map();
      // Interface translations: all platforms (web, PWA and Capacitor) share this file.
      const I18N_EN = {
        "Encontra · Compara · Calcula · Decide":
          "Find · Compare · Plan · Decide",
        "☰ Filtros": "☰ Filters",
        Mapa: "Map",
        Rotas: "Routes",
        Veículo: "Vehicle",
        Favoritos: "Favourites",
        Entrar: "Sign in",
        "🚗 O meu veículo": "🚗 My vehicle",
        "Todas as marcas": "All makes",
        "A carregar veículos…": "Loading vehicles…",
        "A obter dados da Supabase…": "Fetching data from Supabase…",
        "Onde quer carregar?": "Where do you want to charge?",
        Potência: "Power",
        Todos: "All",
        "Até 50": "Up to 50",
        Conectores: "Connectors",
        Estado: "Status",
        "🟢 Disponível": "🟢 Available",
        "🔴 Indisponível": "🔴 Unavailable",
        "🔵 Desconhecido": "🔵 Unknown",
        Operador: "Operator",
        "Todos os operadores": "All operators",
        "⌕ Procurar": "⌕ Search",
        "🧭 Planeador de viagens": "🧭 Trip planner",
        "Sugere paragens compatíveis, energia necessária e tempo até 80%.":
          "Suggests compatible stops, required energy and time to 80%.",
        "🧭 Calcular rota": "🧭 Calculate route",
        "🚗 Mostrando": "🚗 Showing",
        "postos reais em Portugal": "real charging stations in Portugal",
        Disponível: "Available",
        Indisponível: "Unavailable",
        "Estado desconhecido": "Status unknown",
        "Melhores opções para o seu veículo": "Best options for your vehicle",
        "Maior potência": "Highest power",
        "Mais próximo": "Nearest",
        "Nome A–Z": "Name A–Z",
        "Operador A–Z": "Operator A–Z",
        "A carregar postos reais…": "Loading charging stations…",
        "A consultar a base de dados nacional.":
          "Checking the national database.",
        "Encontre paragens compatíveis, tempos e um Plano B para cada paragem.":
          "Find compatible stops, charging times and a Plan B for every stop.",
        "Compare cartões e apps com tarifa oficial, taxas e custo final.":
          "Compare cards and apps using official rates, fees and final cost.",
        "Consulte o estado atual e a cobertura histórica disponível.":
          "See current status and available historical coverage.",
        "⌄ Fechar detalhes e voltar ao mapa":
          "⌄ Close details and return to map",
        "Fotografia do posto de carregamento": "Charging station photo",
        "Fotografia do posto não disponível":
          "Charging station photo unavailable",
        "Ver local e fotos no Google Maps":
          "View location and photos on Google Maps",
        "Selecione um posto no mapa": "Select a station on the map",
        "Os detalhes reais aparecerão aqui.": "Live details will appear here.",
        "● Estado ainda não selecionado": "● No station selected yet",
        "Potência máx.": "Max power",
        Tomadas: "Outlets",
        Disponibilidade: "Availability",
        "O que há por perto?": "What is nearby?",
        Atualizar: "Refresh",
        "Sugestões próximas, distância e tempo estimado a pé.":
          "Nearby suggestions, distance and estimated walking time.",
        Restaurantes: "Restaurants",
        Hotéis: "Hotels",
        Supermercados: "Supermarkets",
        Cafés: "Cafés",
        "Selecione um posto para consultar locais próximos.":
          "Select a station to see nearby places.",
        "⭐ Avaliações e fiabilidade": "⭐ Reviews and reliability",
        "Selecione um posto para consultar avaliações.":
          "Select a station to see reviews.",
        "Simulador de carregamento": "Charging simulator",
        "Por energia": "By energy",
        "Por tempo": "By time",
        "Estado atual da bateria": "Current battery level",
        "Carregar até": "Charge to",
        "Energia necessária": "Energy required",
        "Selecione um posto": "Select a station",
        "Melhor custo oficial estimado": "Best estimated official cost",
        "Tempo estimado": "Estimated time",
        "Comparador de cartões e apps": "Card and app comparison",
        "Fora de vazio": "Off-peak excluded",
        Vazio: "Off-peak",
        "Selecione um posto oficial MOBI.E/NAP com pelo menos 22 kW.":
          "Select an official MOBI.E/NAP station with at least 22 kW.",
        "Selecione um posto para criar rota":
          "Select a station to create a route",
        "↔ Ver opção B": "↔ View Plan B",
        "☆ Adicionar aos favoritos": "☆ Add to favourites",
        "Privacidade e análise": "Privacy and analytics",
        "Podemos usar o Google Analytics para melhorar o site? A escolha fica guardada neste dispositivo.":
          "May we use Google Analytics to improve the service? Your choice is saved on this device.",
        Recusar: "Decline",
        Aceitar: "Accept",
        "ChargeVoy · EV Charging & Routes · projeto pessoal":
          "ChargeVoy · personal project · demonstration",
        "Aviso legal": "Legal notice",
        Privacidade: "Privacy",
        Termos: "Terms",
        Detalhes: "Details",
        "Pesquisar por local, morada ou posto de carregamento…":
          "Search by town, address or charging station…",
        "Cidade, código postal ou localização": "Town, postcode or location",
        "Origem em Portugal": "Origin in Portugal",
        "Destino em Portugal": "Destination in Portugal",
        "Bateria %": "Battery %",
        "Reserva %": "Reserve %",
        "Usar a minha localização": "Use my location",
        "Fechar filtros": "Close filters",
        "Filtrar pontos de interesse": "Filter points of interest",
        "Modo do simulador": "Simulator mode",
        "Bateria alvo": "Target battery",
        "A minha localização": "My location",
        "Ver locais": "View places",
        "Google Maps com trânsito": "Google Maps with traffic",
        "Disponibilidade não comunicada": "Availability not reported",
        "Disponibilidade desatualizada": "Availability out of date",
        "Sem leitura atual": "No current reading",
        "sem leitura atual": "without a current reading",
        ANTERIOR: "PREVIOUS",
      };
      let currentLanguage =
        localStorage.getItem("ev-charge-language") === "en" ? "en" : "pt";
      const i18nOriginalText = new WeakMap(),
        i18nOriginalAttrs = new WeakMap();
      let translatingPage = false;
      function translateString(value) {
        if (currentLanguage !== "en" || typeof value !== "string") return value;
        const leading = value.match(/^\s*/)?.[0] || "",
          trailing = value.match(/\s*$/)?.[0] || "";
        const core = value.slice(
          leading.length,
          value.length - trailing.length,
        );
        return leading + (I18N_EN[core] || core) + trailing;
      }
      function t(value) {
        return currentLanguage === "en" ? I18N_EN[value] || value : value;
      }
      function translateElementAttributes(element) {
        if (!(element instanceof Element)) return;
        const original = i18nOriginalAttrs.get(element) || {};
        ["placeholder", "title", "aria-label", "alt"].forEach((attribute) => {
          if (!element.hasAttribute(attribute)) return;
          if (!(attribute in original))
            original[attribute] = element.getAttribute(attribute);
          element.setAttribute(
            attribute,
            currentLanguage === "en"
              ? translateString(original[attribute])
              : original[attribute],
          );
        });
        i18nOriginalAttrs.set(element, original);
      }
      function applyTranslations(root = document.body) {
        if (!root) return;
        translatingPage = true;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (
            !node.nodeValue.trim() ||
            node.parentElement?.closest("script,style")
          )
            continue;
          if (!i18nOriginalText.has(node))
            i18nOriginalText.set(node, node.nodeValue);
          const original = i18nOriginalText.get(node);
          node.nodeValue =
            currentLanguage === "en" ? translateString(original) : original;
        }
        if (root instanceof Element) translateElementAttributes(root);
        root.querySelectorAll?.("*").forEach(translateElementAttributes);
        document.documentElement.lang =
          currentLanguage === "en" ? "en" : "pt-PT";
        document.getElementById("language-toggle").textContent =
          currentLanguage === "en" ? "PT" : "EN";
        document
          .getElementById("language-toggle")
          .setAttribute(
            "aria-label",
            currentLanguage === "en"
              ? "Mudar para português"
              : "Switch to English",
          );
        translatingPage = false;
      }
      function setLanguage(language) {
        currentLanguage = language === "en" ? "en" : "pt";
        localStorage.setItem("ev-charge-language", currentLanguage);
        applyTranslations();
        // Do not recreate the map/card grid here: it keeps the language change instant on mobile.
        if (selectedStation) {
          const info = stationAvailability(
            connectorMap.get(selectedStation.id) || [],
          );
          document.getElementById("station-live").innerHTML =
            availabilityHtml(info);
          document.getElementById("station-status").innerHTML =
            availabilityHtml(info);
        }
      }
      // Dynamic map data can contain thousands of elements. Translation is intentionally
      // applied only on explicit language changes so it never blocks map interactions.

      const D1_PUBLIC_TABLES = new Set([
        "operators",
        "connectors",
        "station_reviews",
        "station_reliability",
        "official_opc_tariffs",
        "station_ad_hoc_price_components",
        "vehicle_models",
        "ceme_cards",
      ]);

      function d1Query(table, query) {
        const source = new URLSearchParams(query || "");
        const target = new URLSearchParams();
        target.set("table", table);
        for (const [key, value] of source.entries()) {
          if (key === "select" || key === "limit" || key === "offset") {
            target.set(key, value);
            continue;
          }
          const match = key.match(/^([^=]+)$/);
          if (match && value.startsWith("eq.")) {
            target.set(`${match[1]}_eq`, value.slice(3));
          } else if (match && value.startsWith("gte.")) {
            target.set(`${match[1]}_gte`, value.slice(4));
          } else if (match && value.startsWith("lte.")) {
            target.set(`${match[1]}_lte`, value.slice(4));
          } else if (key === "order") {
            target.set("order", value.split(",")[0]);
          }
        }
        return target;
      }

      async function getD1Rows(table, query) {
        const response = await fetchWithTimeout(
          `${D1_FALLBACK_URL.replace(/\/api\/stations$/, "")}/api/catalog?${d1Query(table, query)}`,
          { headers: { Accept: "application/json" } },
          15000,
        );
        if (!response.ok)
          throw new Error(`D1 ${table}: HTTP ${response.status}`);
        const payload = await response.json();
        return Array.isArray(payload.rows) ? payload.rows : [];
      }

      async function getRows(table, query) {
        if (D1_PUBLIC_TABLES.has(table)) {
          try {
            const d1Rows = await getD1Rows(table, query);
            if (d1Rows.length) return d1Rows;
          } catch (error) {
            console.warn(`D1 ${table} indisponível; usando Supabase`, error);
          }
        }
        const response = await fetchWithTimeout(
          `${SUPABASE_URL}/rest/v1/${table}?${query}`,
          { headers: API_HEADERS },
          15000,
        );
        if (!response.ok)
          throw new Error(
            `${table}: HTTP ${response.status} - ${await response.text()}`,
          );
        return response.json();
      }

      async function getAllRows(table, query, pageSize = 1000) {
        const rows = [];
        let offset = 0;
        while (true) {
          const page = await getRows(
            table,
            `${query}&limit=${pageSize}&offset=${offset}`,
          );
          rows.push(...page);
          if (page.length < pageSize) break;
          offset += pageSize;
        }
        return rows;
      }

      const connectorRequests = new Map();
      async function loadStationConnectors(stationId, force = false) {
        if (!force && connectorMap.has(stationId))
          return connectorMap.get(stationId) || [];
        if (!force && connectorRequests.has(stationId))
          return connectorRequests.get(stationId);
        const request = getRows(
          "connectors",
          "select=station_id,type,power_kw,quantity,available_count,status,availability_updated_at,availability_source&station_id=eq." +
            encodeURIComponent(stationId) +
            "&order=id.asc",
        )
          .then((rows) => {
            connectorMap.set(stationId, rows);
            return rows;
          })
          .finally(() => connectorRequests.delete(stationId));
        connectorRequests.set(stationId, request);
        return request;
      }

      function markerColor(status) {
        if (status === "available") return "#18b978";
        if (status === "unavailable" || status === "offline") return "#ed6464";
        return "#2b7bd0";
      }

      function statusLabel(status) {
        if (status === "available") return t("Disponível");
        if (status === "unavailable" || status === "offline")
          return t("Indisponível");
        return t("Disponibilidade não comunicada");
      }

      function stationAvailability(connectors) {
        const total = connectors.reduce(
          (sum, c) => sum + (Number(c.quantity) || 1),
          0,
        );
        const now = Date.now();
        const valid = connectors.filter((c) => {
          const age = now - Date.parse(c.availability_updated_at);
          return (
            c.availability_source === "mobie_nap" &&
            Number.isInteger(c.available_count) &&
            c.available_count >= 0 &&
            c.available_count <= Number(c.quantity) &&
            Number.isFinite(age) &&
            age >= -300000
          );
        });
        const fresh = valid.filter(
          (c) => now - Date.parse(c.availability_updated_at) <= 20 * 60000,
        );
        const recent = valid.filter(
          (c) => now - Date.parse(c.availability_updated_at) <= 45 * 60000,
        );
        const readings = fresh.length ? fresh : recent;
        if (!readings.length)
          return {
            kind: valid.length ? "expired" : "none",
            total,
            label: valid.length
              ? t("Disponibilidade desatualizada")
              : t("Disponibilidade não comunicada"),
            detail: t("Sem leitura atual"),
          };
        const oldest = Math.min(
          ...readings.map((c) => Date.parse(c.availability_updated_at)),
        );
        const ageMinutes = Math.max(0, Math.floor((now - oldest) / 60000));
        const available = readings.reduce(
          (sum, c) => sum + c.available_count,
          0,
        );
        const knownTotal = readings.reduce(
          (sum, c) => sum + Number(c.quantity),
          0,
        );
        const complete = knownTotal === total;
        const byType = new Map();
        readings.forEach((c) => {
          const type = connectorCategory(c.type);
          byType.set(type, (byType.get(type) || 0) + c.available_count);
        });
        const types = [...byType]
          .map(([type, count]) => `${count} ${type}`)
          .join(" · ");
        const suffix = complete
          ? ""
          : ` · ${total - knownTotal} ${t("sem leitura atual")}`;
        const kind = fresh.length ? "live" : "stale";
        const label =
          currentLanguage === "en"
            ? `${available}/${knownTotal} available connectors${kind === "stale" ? " in the last reading" : ""}${suffix} · source updated ${ageMinutes} min ago`
            : `${available}/${knownTotal} fichas em pontos livres${kind === "stale" ? " na última leitura" : ""}${suffix} · fonte há ${ageMinutes} min`;
        const detail =
          currentLanguage === "en"
            ? `Available connectors: ${types}`
            : `Fichas em pontos livres: ${types}`;
        return {
          kind,
          total,
          knownTotal,
          complete,
          available,
          ageMinutes,
          label,
          detail,
          publicationTime: new Date(oldest).toISOString(),
        };
      }

      function availabilityHtml(info) {
        const title = escapeHtml(
          currentLanguage === "en"
            ? `MOBI.E NAP · published: ${info.publicationTime || "not reported"}. Status is reported per charging point. One point may offer multiple connectors; totals do not represent the number of cars that can charge simultaneously.`
            : `MOBI.E NAP · publicação: ${info.publicationTime || "não comunicada"}. Estado comunicado por ponto de carregamento. Um ponto pode oferecer várias fichas; os totais não representam carros que podem carregar em simultâneo.`,
        );
        if (info.kind === "live")
          return `<span class="live-pill" title="${title}"><i></i>LIVE</span> ${escapeHtml(info.label)}<br><small>${escapeHtml(info.detail)}</small>`;
        if (info.kind === "stale")
          return `<span class="stale-pill" title="${title}">${t("ANTERIOR")}</span> ${escapeHtml(info.label)}`;
        return escapeHtml(info.label);
      }

      function effectiveStationStatus(station) {
        const info = stationAvailability(connectorMap.get(station.id) || []);
        if (info.kind === "live")
          return info.available > 0
            ? "available"
            : info.complete
              ? "unavailable"
              : "unknown";
        return station.status === "unavailable" || station.status === "offline"
          ? "unavailable"
          : "unknown";
      }

      function escapeHtml(value) {
        return String(value ?? "").replace(
          /[&<>'"]/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              "'": "&#39;",
              '"': "&quot;",
            })[c],
        );
      }

      let toastTimer;
      function notifyUser(message, options = {}) {
        const toast = document.getElementById("app-toast");
        if (!toast) return;
        clearTimeout(toastTimer);
        toast.textContent = message;
        toast.className = `app-toast show ${options.kind || ""}`.trim();
        toastTimer = setTimeout(() => {
          toast.classList.remove("show");
        }, options.duration || 4500);
      }

      async function fetchWithTimeout(resource, options = {}, timeoutMs = 15000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          return await fetch(resource, { ...options, signal: controller.signal });
        } catch (error) {
          if (error.name === "AbortError")
            throw new Error("O serviço de rotas demorou demasiado tempo. Tente novamente.");
          throw error;
        } finally {
          clearTimeout(timer);
        }
      }
      function connectorCategory(value) {
        const type = String(value || "").toLowerCase();
        if (type.includes("chademo")) return "CHAdeMO";
        if (type.includes("tesla") || type.includes("nacs")) return "Tesla";
        if (type.includes("ccs") || type.includes("combo")) return "CCS";
        if (
          type.includes("type 2") ||
          type.includes("mennekes") ||
          type.includes("iec 62196-2")
        )
          return "Type 2";
        return String(value || "Outro");
      }

      function isOfficialTeslaStation(station) {
        return station?.amenities?.tesla_official_supercharger === true;
      }
      function isTeslaVehicle() {
        return String(currentVehicle?.make || "").toLowerCase() === "tesla";
      }

      function distanceKm(a, b) {
        const rad = (value) => (value * Math.PI) / 180;
        const dLat = rad(Number(b.lat) - Number(a.lat));
        const dLon = rad(Number(b.lon) - Number(a.lon));
        const lat1 = rad(Number(a.lat));
        const lat2 = rad(Number(b.lat));
        const h =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
        return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
      }

      function populateVehicles(vehicles) {
        vehicleModels = vehicles;
        const brandSelect = document.getElementById("vehicle-brand");
        const brands = [
          ...new Set(vehicles.map((vehicle) => vehicle.make).filter(Boolean)),
        ].sort((a, b) => a.localeCompare(b, "pt"));
        brandSelect.innerHTML =
          '<option value="all">Todas as marcas</option>' +
          brands
            .map(
              (brand) =>
                `<option value="${escapeHtml(brand)}">${escapeHtml(brand)}</option>`,
            )
            .join("");
        const saved = localStorage.getItem("ev-charge-vehicle");
        const savedVehicle = vehicles.find((vehicle) => vehicle.id === saved);
        const defaultVehicle =
          savedVehicle ||
          vehicles.find(
            (vehicle) =>
              vehicle.source === "manual" &&
              vehicle.make === "Tesla" &&
              vehicle.model === "Model 3",
          ) ||
          vehicles[0];
        if (defaultVehicle) brandSelect.value = defaultVehicle.make;
        renderVehicleOptions(brandSelect.value, defaultVehicle?.id);
      }

      function renderVehicleOptions(brand = "all", preferredId = null) {
        const select = document.getElementById("vehicle-select");
        const filtered = vehicleModels.filter(
          (vehicle) => brand === "all" || vehicle.make === brand,
        );
        select.innerHTML = filtered
          .map(
            (vehicle) =>
              `<option value="${escapeHtml(vehicle.id)}">${escapeHtml(vehicle.model)} · ${escapeHtml(vehicle.variant)}${vehicle.model_year_start ? ` (${vehicle.model_year_start})` : ""}</option>`,
          )
          .join("");
        if (
          preferredId &&
          filtered.some((vehicle) => vehicle.id === preferredId)
        )
          select.value = preferredId;
        applyVehicle(select.value);
      }

      function vehicleIllustration(vehicle) {
        const seed = [...(vehicle?.make || "EV")].reduce(
          (sum, char) => sum + char.charCodeAt(0),
          0,
        );
        const colors = [
          "#18b978",
          "#1464c2",
          "#e82127",
          "#7c3aed",
          "#ea8a16",
          "#0f766e",
        ];
        const color = colors[seed % colors.length];
        const style = String(vehicle?.body_style || "").toLowerCase();
        const roof =
          style.includes("suv") || style.includes("van")
            ? "M18 31 Q25 12 43 11 L61 13 Q70 16 77 31"
            : style.includes("hatch")
              ? "M17 31 Q27 16 43 14 L62 17 Q69 21 76 31"
              : "M15 31 Q27 18 39 16 L58 17 Q67 20 78 31";
        return `<svg viewBox="0 0 94 58" role="img" aria-label="Ilustração ${escapeHtml(vehicle?.make || "")} ${escapeHtml(vehicle?.model || "")}"><defs><linearGradient id="carPaint" x1="0" x2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#071b31"/></linearGradient></defs><path d="${roof}" fill="#dff4ff" stroke="#123a57" stroke-width="2"/><path d="M10 31 Q13 27 20 27 H75 Q83 27 87 34 L85 42 H8 L7 36 Q7 33 10 31Z" fill="url(#carPaint)"/><path d="M29 18 L40 17 L40 28 H22Z M44 17 L57 18 L70 28 H44Z" fill="#bfe8f5" opacity=".9"/><circle cx="24" cy="42" r="7" fill="#10263d"/><circle cx="24" cy="42" r="3" fill="#cbd5e1"/><circle cx="72" cy="42" r="7" fill="#10263d"/><circle cx="72" cy="42" r="3" fill="#cbd5e1"/><path d="M11 34h7M80 34h6" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`;
      }

      async function renderVehicleImage(vehicle) {
        const target = document.getElementById("vehicle-image");
        const credit = document.getElementById("vehicle-image-credit");
        const request = ++vehicleImageRequest;
        target.innerHTML = vehicleIllustration(vehicle);
        credit.textContent = "A procurar imagem do modelo…";
        try {
          const query = `${vehicle.make} ${vehicle.model}`
            .replace(/\s+/g, " ")
            .trim();
          const params = new URLSearchParams({
            action: "query",
            generator: "search",
            gsrsearch: `intitle:${query} automobile`,
            gsrnamespace: "0",
            gsrlimit: "3",
            prop: "pageimages|info",
            pithumbsize: "320",
            inprop: "url",
            format: "json",
            origin: "*",
          });
          const response = await fetch(
            `https://en.wikipedia.org/w/api.php?${params}`,
          );
          if (!response.ok) throw new Error("Imagem indisponível");
          const data = await response.json();
          const pages = Object.values(data.query?.pages || {});
          const page = pages.find((item) => item.thumbnail?.source) || pages[0];
          if (request !== vehicleImageRequest) return;
          if (!page?.thumbnail?.source) throw new Error("Sem fotografia");
          target.innerHTML = `<img src="${escapeHtml(page.thumbnail.source)}" alt="${escapeHtml(query)}" loading="lazy">`;
          credit.innerHTML = `Imagem: <a href="${escapeHtml(page.fullurl || "https://en.wikipedia.org/")}" target="_blank" rel="noopener">Wikipedia</a>`;
        } catch (error) {
          if (request === vehicleImageRequest)
            credit.textContent = "Ilustração baseada no tipo de carro";
        }
      }

      function applyVehicle(vehicleId) {
        currentVehicle =
          vehicleModels.find((vehicle) => vehicle.id === vehicleId) ||
          vehicleModels[0] ||
          null;
        if (!currentVehicle) return;
        localStorage.setItem("ev-charge-vehicle", currentVehicle.id);
        document.getElementById("vehicle-specs").textContent =
          `🔋 ${currentVehicle.battery_capacity_kwh} kWh · ${currentVehicle.consumption_wh_km} Wh/km · DC ${currentVehicle.max_dc_power_kw ?? "—"} kW`;
        renderVehicleImage(currentVehicle);
        const compatible = new Set(currentVehicle.connector_types || []);
        document.querySelectorAll(".connector-filter").forEach((input) => {
          input.checked = compatible.has(input.value);
        });
        sim();
        renderStations(false);
      }

      function selectedStationMapsUrl() {
        if (!selectedStation) return "";
        const query = [
          selectedStation.name,
          operatorMap.get(selectedStation.operator_id),
          selectedStation.address,
          selectedStation.city,
          "Portugal",
        ]
          .filter(Boolean)
          .join(", ");
        return (
          "https://www.google.com/maps/search/?api=1&query=" +
          encodeURIComponent(query) +
          "&hl=pt"
        );
      }
      function selectedStationDirectionsUrl() {
        if (!selectedStation) return "";
        const params = new URLSearchParams({
          api: "1",
          destination: `${selectedStation.latitude},${selectedStation.longitude}`,
          travelmode: "driving",
          dir_action: "navigate",
        });
        const origin = routeOriginOverride || searchPosition;
        if (origin?.lat != null && origin?.lon != null)
          params.set("origin", `${origin.lat},${origin.lon}`);
        return `https://www.google.com/maps/dir/?${params.toString()}`;
      }
      function openSelectedStationMaps() {
        const url = selectedStationDirectionsUrl();
        if (url) window.open(url, "_blank", "noopener");
      }
      function showStationPhotos() {
        const url = selectedStationMapsUrl();
        if (url) window.open(url, "_blank", "noopener");
      }
      function showStationAlternative() {
        if (!selectedStation) return;
        const alternatives = allStations
          .filter(
            (station) =>
              station.id !== selectedStation.id &&
              stationCompatibleWithVehicle(station) &&
              Number(station.latitude) &&
              Number(station.longitude),
          )
          .map((station) => ({
            ...station,
            distance_from_selected: distanceKm(
              { lat: selectedStation.latitude, lon: selectedStation.longitude },
              { lat: station.latitude, lon: station.longitude },
            ),
          }))
          .filter((station) => station.distance_from_selected <= 60)
          .sort(
            (a, b) =>
              a.distance_from_selected - b.distance_from_selected ||
              (Number(b.max_power_kw) || 0) - (Number(a.max_power_kw) || 0),
          );
        const alternative = alternatives[0];
        if (!alternative) {
          notifyUser("Não foi encontrada uma opção B compatível num raio de 60 km.", { kind: "error" });
          return;
        }
        map.setView([alternative.latitude, alternative.longitude], 15);
        markerMap.get(alternative.id)?.openPopup();
        selectStation(alternative, operatorMap.get(alternative.operator_id));
      }
      async function loadStationPhoto(station) {
        const image = document.getElementById("station-photo"),
          fallback = document.getElementById("station-photo-fallback"),
          source = document.getElementById("station-photo-source");
        if (!image || !fallback) return;
        const stationId = station.id;
        const showPhoto = (url, label) => {
          if (!url || selectedStation?.id !== stationId) return false;
          image.onload = () => {
            if (selectedStation?.id !== stationId) return;
            image.hidden = false;
            fallback.hidden = true;
            if (source) {
              source.textContent = label;
              source.hidden = false;
            }
          };
          image.onerror = () => {
            image.hidden = true;
            fallback.hidden = false;
            if (source) source.hidden = true;
            image.removeAttribute("src");
          };
          image.src = url;
          return true;
        };
        image.hidden = true;
        fallback.hidden = false;
        image.removeAttribute("src");
        if (source) source.hidden = true;
        const direct =
          station.amenities?.photo_url || station.amenities?.image_url || null;
        if (direct) {
          showPhoto(direct, "Foto do posto");
          return;
        }
        try {
          const query =
            '[out:json][timeout:8];nwr["image"](around:60,' +
            Number(station.latitude) +
            "," +
            Number(station.longitude) +
            ");out tags;";
          const response = await fetch(
            "https://overpass-api.de/api/interpreter",
            {
              method: "POST",
              body: query,
              headers: {
                "Content-Type": "text/plain;charset=UTF-8",
                Accept: "application/json",
              },
            },
          );
          const element = response.ok
            ? (await response.json()).elements?.find((item) => item.tags?.image)
            : null;
          if (element?.tags?.image) {
            showPhoto(element.tags.image, "Foto comunitária");
            return;
          }
        } catch (error) {
          console.warn("Foto OSM indisponível");
        }
        try {
          const params = new URLSearchParams({
            lat: String(Number(station.latitude)),
            lng: String(Number(station.longitude)),
            zoomLevel: "17",
            join: "sequence",
            orderBy: "id",
            orderDirection: "desc",
          });
          const response = await fetch(
            "https://api.openstreetcam.org/2.0/photo/?" + params.toString(),
          );
          const data = response.ok ? await response.json() : null;
          const photos = data?.result?.data || data?.data || [];
          const photo = photos.find(
            (item) => item?.fileurlLTh || item?.fileurlProc || item?.fileurlTh,
          );
          const url =
            photo?.fileurlLTh || photo?.fileurlProc || photo?.fileurlTh;
          if (url) showPhoto(url, "Imagem comunitária · KartaView");
        } catch (error) {
          console.warn("Imagem de rua indisponível");
        }
      }
      function setNavigationMode(mode) {
        document.body.classList.toggle("map-mode", mode === "map");
        document.body.classList.remove("station-mode");
        document
          .querySelectorAll(".nav button")
          .forEach((button) => button.classList.remove("active"));
        document.getElementById(`nav-${mode}`)?.classList.add("active");
      }

      function closeStationPanel() {
        selectedStation = null;
        setNavigationMode("map");
        document.querySelector(".main")?.classList.remove("station-selected");
        document.querySelector(".right")?.classList.remove("station-open");
        if (window.innerWidth <= 780)
          requestAnimationFrame(() => map.invalidateSize());
      }
      function renderConnectorMatrix(connectors) {
        const target = document.getElementById("connector-matrix");
        if (!target) return;
        if (!connectors.length) {
          target.innerHTML =
            '<div class="connector-row"><div><b>Tomadas não comunicadas</b><small>O operador ainda não publicou o detalhe dos conectores.</small></div><span class="connector-state unknown">Sem dados</span></div>';
          return;
        }
        target.innerHTML = connectors
          .map((connector, index) => {
            const quantity = Math.max(1, Number(connector.quantity) || 1);
            const free =
              connector.available_count == null
                ? null
                : Math.max(0, Number(connector.available_count) || 0);
            const state =
              free == null
                ? "unknown"
                : free > 0
                  ? "available"
                  : connector.status === "occupied" ||
                      connector.status === "charging"
                    ? "occupied"
                    : "unavailable";
            const label =
              state === "available"
                ? quantity > 1
                  ? `${free}/${quantity} livres`
                  : "Livre"
                : state === "occupied"
                  ? "Ocupado"
                  : state === "unavailable"
                    ? "Indisponível"
                    : "Sem live";
            const type =
              connectorCategory(connector.type) || connector.type || "Conector";
            const power = connector.power_kw
              ? `${connector.power_kw} kW`
              : "Potência não comunicada";
            return `<div class="connector-row"><div><b>Tomada ${index + 1} · ${escapeHtml(type)}</b><small>${escapeHtml(power)}${quantity > 1 ? ` · ${quantity} tomadas` : ""}</small></div><span class="connector-state ${state}">${escapeHtml(label)}</span></div>`;
          })
          .join("");
      }
      function updateStationConnectorPanel(station, stationConnectors) {
        const connectorTypes = [
          ...new Set(
            stationConnectors.map((connector) =>
              connectorCategory(connector.type),
            ),
          ),
        ];
        const totalPoints = stationConnectors.reduce(
          (total, connector) => total + (Number(connector.quantity) || 1),
          0,
        );
        const availability = stationAvailability(stationConnectors);
        document.getElementById("station-status").innerHTML =
          availabilityHtml(availability);
        document.getElementById("station-connectors").textContent =
          connectorTypes.join(" · ") || "—";
        document.getElementById("station-points").textContent =
          totalPoints || "—";
        document.getElementById("station-live").innerHTML =
          availabilityHtml(availability);
        renderConnectorMatrix(stationConnectors);
      }

      function selectStation(station, operatorName) {
        selectedStation = station;
        document
          .getElementById("route-planner")
          ?.classList.remove("route-visible");
        setNavigationMode("map");
        document.body.classList.add("station-mode");
        document.querySelector(".main")?.classList.add("station-selected");
        document.querySelector(".right")?.classList.add("station-open");
        loadStationPhoto(station);
        selectedStationPower = Number(station.max_power_kw) || null;
        const stationConnectors = connectorMap.get(station.id) || [];
        const location =
          [station.address, station.city].filter(Boolean).join(", ") ||
          "Morada não comunicada";
        document.getElementById("sn").textContent =
          station.name || operatorName || "Posto de carregamento";
        document.getElementById("station-operator").textContent =
          operatorName || "Operador não indicado";
        document.getElementById("station-meta").textContent =
          `⌖ ${location} · ${isOfficialTeslaStation(station) ? "Tesla oficial" : station.source === "nap" ? "NAP oficial" : station.source === "openchargemap" ? "OpenChargeMap" : station.source || "Fonte"} ${station.external_id || "—"}`;
        document.getElementById("station-power").textContent =
          station.max_power_kw ? `${station.max_power_kw} kW` : "—";
        updateStationConnectorPanel(station, stationConnectors);
        if (!stationConnectors.length) {
          document.getElementById("station-connectors").textContent =
            "A consultar…";
          document.getElementById("station-points").textContent = "—";
        }
        loadStationConnectors(station.id)
          .then((connectors) => {
            if (selectedStation?.id === station.id)
              updateStationConnectorPanel(station, connectors);
          })
          .catch(() => {
            if (selectedStation?.id === station.id)
              document.getElementById("station-connectors").textContent =
                "Disponibilidade indisponível";
          });
        document.querySelector(".right")?.classList.add("station-open");
        if (window.innerWidth <= 780)
          requestAnimationFrame(() => map.invalidateSize());
        loadStationReviews(station.id);
        const routeButton = document.getElementById("route-selected-station");
        routeButton.disabled = false;
        document.getElementById("station-google-maps").disabled = false;
        document.getElementById("station-photos").disabled = false;
        document.getElementById("station-alternative").disabled = false;
        routeButton.textContent = "🧭 Rota até este posto";
        updateFavoriteButton();
        sim();
        loadStationPricing(station);
        const poiList = document.getElementById("station-pois");
        if (poiList)
          poiList.innerHTML = "A procurar pontos de interesse próximos…";
        loadNearbyPois();
      }

      async function loadStationReviews(stationId) {
        const panel = document.getElementById("station-reviews");
        if (!panel) return;
        panel.innerHTML = "A carregar avaliações…";
        try {
          const [reviews, summary] = await Promise.all([
            getRows(
              "station_reviews",
              "select=id,rating,comment,created_at&station_id=eq." +
                encodeURIComponent(stationId) +
                "&order=created_at.desc&limit=8",
            ),
            getRows(
              "station_reliability",
              "select=review_count,average_rating,snapshot_count,availability_rate,last_observed_at&station_id=eq." +
                encodeURIComponent(stationId),
            ),
          ]);
          const s = summary[0] || {};
          const header = s.review_count
            ? "<b>⭐ " +
              Number(s.average_rating).toFixed(1) +
              "/5</b> · " +
              s.review_count +
              " avaliação(ões)"
            : "<b>Ainda sem avaliações</b>";
          const reliability =
            s.availability_rate != null
              ? " · Fiabilidade observada: " +
                Number(s.availability_rate).toFixed(0) +
                "%"
              : "";
          const rows = reviews
            .map(
              (review) =>
                '<div class="review-row"><b>' +
                "★".repeat(review.rating) +
                "☆".repeat(5 - review.rating) +
                "</b><small>" +
                escapeHtml(review.comment || "Sem comentário") +
                "</small></div>",
            )
            .join("");
          panel.innerHTML =
            '<div class="review-summary">' +
            header +
            reliability +
            "</div>" +
            (rows ||
              "<small>As primeiras avaliações ajudarão a criar o histórico de fiabilidade.</small>") +
            (currentSession?.user
              ? '<button class="secondary" id="write-review">Avaliar este posto</button>'
              : "<small>Entre para deixar uma avaliação.</small>");
          document
            .getElementById("write-review")
            ?.addEventListener("click", () => showReviewForm(stationId));
        } catch (error) {
          panel.innerHTML =
            "<small>Não foi possível carregar as avaliações.</small>";
        }
      }
      function showReviewForm(stationId) {
        openModal(
          "Avaliar posto",
          '<form id="review-form" class="auth-form"><label>Classificação<select id="review-rating"><option value="5">★★★★★</option><option value="4">★★★★☆</option><option value="3">★★★☆☆</option><option value="2">★★☆☆☆</option><option value="1">★☆☆☆☆</option></select></label><label>Comentário<textarea id="review-comment" maxlength="1000" rows="4" placeholder="Como estava o posto?"></textarea></label><p id="review-message" class="auth-message"></p><button class="primary">Guardar avaliação</button></form>',
        );
        document
          .getElementById("review-form")
          .addEventListener("submit", async (event) => {
            event.preventDefault();
            const message = document.getElementById("review-message");
            message.textContent = "A guardar…";
            const { error } = await authClient.from("station_reviews").upsert(
              {
                station_id: stationId,
                user_id: currentSession.user.id,
                rating: Number(document.getElementById("review-rating").value),
                comment:
                  document.getElementById("review-comment").value.trim() ||
                  null,
              },
              { onConflict: "station_id,user_id" },
            );
            if (error) {
              message.textContent = error.message;
              return;
            }
            closeModal();
            await loadStationReviews(stationId);
          });
      }

      function saveFavorites() {
        localStorage.setItem(
          "ev-charge-favorites",
          JSON.stringify([...favoriteStationIds]),
        );
      }
      function updateFavoriteButton() {
        const button = document.getElementById("station-favorite");
        if (!button) return;
        const active =
          selectedStation && favoriteStationIds.has(selectedStation.id);
        button.disabled = !selectedStation;
        button.classList.toggle("fav-on", Boolean(active));
        button.textContent = active
          ? "★ Remover dos favoritos"
          : "☆ Adicionar aos favoritos";
      }
      async function toggleSelectedFavorite() {
        if (!selectedStation) return;
        const removing = favoriteStationIds.has(selectedStation.id);
        if (removing) favoriteStationIds.delete(selectedStation.id);
        else favoriteStationIds.add(selectedStation.id);
        saveFavorites();
        updateFavoriteButton();
        if (currentSession?.user) {
          const query = removing
            ? authClient
                .from("user_favorites")
                .delete()
                .eq("station_id", selectedStation.id)
            : authClient.from("user_favorites").upsert(
                {
                  user_id: currentSession.user.id,
                  station_id: selectedStation.id,
                },
                { onConflict: "user_id,station_id" },
              );
          const { error } = await query;
          if (error) console.error("Sincronização do favorito:", error);
        }
      }
      function openModal(title, html) {
        document.getElementById("modal-title").textContent = title;
        document.getElementById("modal-body").innerHTML = html;
        document.getElementById("app-modal").classList.add("open");
        document
          .getElementById("app-modal")
          .setAttribute("aria-hidden", "false");
      }
      function closeModal() {
        document.getElementById("app-modal").classList.remove("open");
        document
          .getElementById("app-modal")
          .setAttribute("aria-hidden", "true");
      }
      function isNativeApp() {
        return Boolean(window.Capacitor?.isNativePlatform?.());
      }
      async function handleNativeAuthCallback(url) {
        if (!url?.startsWith("chargevoy://auth/callback")) return;
        const callbackUrl = new URL(url);
        const values = new URLSearchParams(callbackUrl.hash.replace(/^#/, ""));
        const errorDescription =
          values.get("error_description") || values.get("error");
        if (errorDescription) {
          openModal(
            "Não foi possível entrar",
            `<p>${escapeHtml(errorDescription)}</p>`,
          );
          return;
        }
        const access_token = values.get("access_token"),
          refresh_token = values.get("refresh_token");
        if (!access_token || !refresh_token) {
          openModal(
            "Não foi possível entrar",
            "<p>O retorno de autenticação não continha uma sessão válida.</p>",
          );
          return;
        }
        const { error } = await authClient.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) {
          openModal(
            "Não foi possível entrar",
            `<p>${escapeHtml(error.message)}</p>`,
          );
          return;
        }
        try {
          await window.Capacitor?.Plugins?.Browser?.close();
        } catch (_) {}
        await initAuth();
        closeModal();
      }
      function setupNativeAuth() {
        if (!isNativeApp()) return;
        window.Capacitor?.Plugins?.App?.addListener("appUrlOpen", (event) =>
          handleNativeAuthCallback(event.url),
        );
      }
      async function signInWithGoogle() {
        const native = isNativeApp();
        const redirectTo = native
          ? "chargevoy://auth/callback"
          : window.location.origin + window.location.pathname;
        const { data, error } = await authClient.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo, skipBrowserRedirect: native },
        });
        if (error) {
          openModal(
            "Não foi possível entrar",
            `<p>${escapeHtml(error.message)}</p><p>Confirme se o fornecedor Google está ativo na Supabase e se este endereço está autorizado.</p>`,
          );
          return;
        }
        if (native && data?.url) {
          const browser = window.Capacitor?.Plugins?.Browser;
          if (browser?.open) await browser.open({ url: data.url });
          else window.location.assign(data.url);
        }
      }
      function showEmailAuth(mode = "signin") {
        const signup = mode === "signup";
        openModal(
          signup ? "Criar conta" : "Entrar com email",
          `<form id="email-auth-form" class="auth-form"><label>Email<input id="auth-email" type="email" autocomplete="email" required></label><label>Palavra-passe<input id="auth-password" type="password" minlength="8" autocomplete="${signup ? "new-password" : "current-password"}" required></label><button class="primary" type="submit">${signup ? "Criar conta" : "Entrar"}</button><button class="secondary" type="button" id="auth-switch">${signup ? "Já tenho conta" : "Criar nova conta"}</button><button class="text-button" type="button" id="auth-forgot">Esqueci-me da palavra-passe</button><p class="auth-message" id="auth-message"></p></form>`,
        );
        document
          .getElementById("email-auth-form")
          .addEventListener("submit", async (event) => {
            event.preventDefault();
            const email = document.getElementById("auth-email").value.trim();
            const password = document.getElementById("auth-password").value;
            const message = document.getElementById("auth-message");
            message.textContent = "A processar…";
            const result = signup
              ? await authClient.auth.signUp({
                  email,
                  password,
                  options: {
                    emailRedirectTo:
                      window.location.origin + window.location.pathname,
                  },
                })
              : await authClient.auth.signInWithPassword({ email, password });
            if (result.error) {
              const code = result.error.code || "";
              message.textContent =
                code === "email_address_not_authorized" ||
                /not authorized|not authorised/i.test(
                  result.error.message || "",
                )
                  ? "A Supabase ainda não está autorizada a enviar email para este endereço. Adicione-o à equipa do projeto para testes ou configure SMTP personalizado."
                  : result.error.message;
              return;
            }
            if (signup && !result.data.session) {
              message.textContent =
                "Conta criada. Confirme o email antes de entrar e verifique também as pastas Spam e Promoções.";
              return;
            }
            closeModal();
            await initAuth();
          });
        document
          .getElementById("auth-switch")
          .addEventListener("click", () =>
            showEmailAuth(signup ? "signin" : "signup"),
          );
        document
          .getElementById("auth-forgot")
          .addEventListener("click", async () => {
            const email = document.getElementById("auth-email").value.trim();
            const message = document.getElementById("auth-message");
            if (!email) {
              message.textContent = "Indique primeiro o seu email.";
              return;
            }
            const result = await authClient.auth.resetPasswordForEmail(email, {
              redirectTo: window.location.origin + window.location.pathname,
            });
            message.textContent = result.error
              ? result.error.message
              : "Verifique o email para redefinir a palavra-passe. Se não aparecer, veja Spam e Promoções.";
          });
      }
      async function signOutUser() {
        await authClient.auth.signOut();
        closeModal();
      }
      async function deleteMyAccount() {
        const user = currentSession?.user;
        if (!user) return;
        const label =
          currentLanguage === "en"
            ? "Delete your account permanently? Favorites, route history, preferences and reviews will be removed immediately."
            : "Eliminar a conta de forma permanente? Os favoritos, histórico de rotas, preferências e avaliações serão removidos imediatamente.";
        if (!window.confirm(label)) return;
        openModal(
          currentLanguage === "en" ? "Deleting account" : "A eliminar conta",
          currentLanguage === "en"
            ? "<p>Please wait…</p>"
            : "<p>Por favor aguarde…</p>",
        );
        const { error } =
          await authClient.functions.invoke("delete-my-account");
        if (error) {
          openModal(
            currentLanguage === "en"
              ? "Unable to delete account"
              : "Não foi possível eliminar a conta",
            `<p>${escapeHtml(error.message || "Tente novamente ou contacte evchargeportugal@gmail.com.")}</p><p><a href="mailto:evchargeportugal@gmail.com?subject=Pedido%20de%20elimina%C3%A7%C3%A3o%20de%20conta">evchargeportugal@gmail.com</a></p>`,
          );
          return;
        }
        await authClient.auth.signOut();
        currentSession = null;
        favoriteStationIds = new Set();
        saveFavorites();
        updateAuthUI();
        closeModal();
        notifyUser(
          currentLanguage === "en"
            ? "Your account and associated data have been deleted."
            : "A sua conta e os dados associados foram eliminados.",
          { kind: "success" },
        );
      }
      async function syncUserFavorites() {
        if (!currentSession?.user) return;
        const userId = currentSession.user.id;
        const { data, error } = await authClient
          .from("user_favorites")
          .select("station_id");
        if (error) {
          console.error("Favoritos:", error);
          return;
        }
        const remoteIds = (data || []).map((item) => item.station_id);
        const merged = new Set([...favoriteStationIds, ...remoteIds]);
        favoriteStationIds = merged;
        saveFavorites();
        const missing = [...merged]
          .filter((id) => !remoteIds.includes(id))
          .map((station_id) => ({ user_id: userId, station_id }));
        if (missing.length)
          await authClient
            .from("user_favorites")
            .upsert(missing, { onConflict: "user_id,station_id" });
        updateFavoriteButton();
      }
      function updateAuthUI() {
        const user = currentSession?.user;
        document.getElementById("account-label").textContent = user
          ? user.user_metadata?.name?.split(" ")[0] || "Conta"
          : "Entrar";
      }
      async function showAccount() {
        const user = currentSession?.user;
        if (!user) {
          openModal(
            "Entrar",
            `<p>Entre para sincronizar favoritos e guardar o histórico das suas rotas em vários dispositivos.</p><button class="primary" onclick="signInWithGoogle()">Entrar com Google</button><button class="secondary" onclick="showEmailAuth('signin')">Entrar com email</button><button class="secondary" onclick="showEmailAuth('signup')">Criar conta com email</button>${installPrompt ? '<button class="secondary" onclick="installPwa()">Instalar aplicação</button>' : ""}`,
          );
          return;
        }
        openModal(
          t("A minha conta"),
          `<p><b>${escapeHtml(user.user_metadata?.full_name || user.user_metadata?.name || "Utilizador")}</b><br><small>${escapeHtml(user.email || "")}</small></p><p>${t("Os favoritos e as novas rotas ficam associados a esta conta.")}</p>${installPrompt ? '<button class="primary" onclick="installPwa()">Instalar aplicação</button>' : ""}<button class="secondary" onclick="signOutUser()">${t("Terminar sessão")}</button><hr style="border:0;border-top:1px solid #e4eaf0;margin:18px 0"><p><b>${t("Eliminar conta")}</b><br><small>${t("Elimina imediatamente favoritos, histórico, preferências e avaliações associados à conta. Esta ação não pode ser desfeita.")}</small></p><button class="secondary" style="color:#a51c30;border-color:#efb8c0" onclick="deleteMyAccount()">${t("Eliminar a minha conta")}</button>`,
        );
      }
      async function installPwa() {
        if (!installPrompt) return;
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        closeModal();
      }
      function showFavorites() {
        const stations = [...favoriteStationIds]
          .map((id) => allStations.find((station) => station.id === id))
          .filter(Boolean);
        const html = stations.length
          ? stations
              .map(
                (station) =>
                  `<div class="favorite-row"><div><b>${escapeHtml(station.name || "Posto")}</b><small>${escapeHtml([station.address, station.city].filter(Boolean).join(", ") || "Localização não indicada")} · ${escapeHtml(station.max_power_kw || "—")} kW</small></div><button data-favorite-open="${escapeHtml(station.id)}">Ver</button></div>`,
              )
              .join("")
          : "<p>Ainda não adicionou postos aos favoritos. Selecione um posto e toque em “Adicionar aos favoritos”.</p>";
        openModal("☆ Postos favoritos", html);
        document.querySelectorAll("[data-favorite-open]").forEach((button) =>
          button.addEventListener("click", () => {
            const station = allStations.find(
              (item) => item.id === button.dataset.favoriteOpen,
            );
            if (station) {
              closeModal();
              selectStation(station, operatorMap.get(station.operator_id));
              map.setView([station.latitude, station.longitude], 15);
              document
                .querySelector(".right")
                .scrollIntoView({ behavior: "smooth" });
            }
          }),
        );
      }
      async function showHistory() {
        let stationHtml = "";
        if (selectedStation) {
          const availability = stationAvailability(
            connectorMap.get(selectedStation.id) || [],
          );
          stationHtml = `<p><b>${escapeHtml(selectedStation.name || "Posto selecionado")}</b><br>Estado atual: <b>${escapeHtml(availability.label)}</b></p><p><small>A fiabilidade do posto só será calculada depois de existirem snapshots provenientes de uma fonte live validada.</small></p>`;
        }
        if (!currentSession?.user) {
          openModal(
            "📊 Histórico",
            `${stationHtml}<p>Entre com Google para guardar e consultar o histórico das suas rotas.</p><button class="primary" onclick="signInWithGoogle()">Entrar com Google</button>`,
          );
          return;
        }
        openModal("📊 Histórico", "<p>A carregar as suas rotas…</p>");
        const { data, error } = await authClient
          .from("user_route_history")
          .select(
            "id,origin_label,destination_label,distance_km,charging_minutes,created_at",
          )
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) {
          openModal(
            "📊 Histórico",
            `${stationHtml}<p>Não foi possível consultar o histórico.</p>`,
          );
          return;
        }
        const routes = (data || [])
          .map(
            (route) =>
              `<div class="favorite-row"><div><b>${escapeHtml(route.origin_label)} → ${escapeHtml(route.destination_label)}</b><small>${route.distance_km ? `${Number(route.distance_km).toFixed(0)} km · ` : ""}${route.charging_minutes ?? 0} min a carregar · ${new Date(route.created_at).toLocaleDateString("pt-PT")}</small></div></div>`,
          )
          .join("");
        openModal(
          "📊 Histórico",
          `${stationHtml}${routes || "<p>Ainda não existem rotas guardadas nesta conta.</p>"}`,
        );
      }

      function officialConnectorCategory(value) {
        const type = String(value || "").toLowerCase();
        if (type.includes("chademo")) return "CHAdeMO";
        if (type.includes("combo") || type.includes("ccs")) return "CCS";
        if (
          type.includes("mennekes") ||
          type.includes("type 2") ||
          type.includes("iec_62196_t2")
        )
          return "Type 2";
        return connectorCategory(value);
      }

      function networkTariff(voltage, period) {
        const level = String(voltage || "BT").toUpperCase();
        const rates =
          level === "MAT"
            ? { fora_vazio: 0.0664, vazio: 0.0134 }
            : level === "AT"
              ? { fora_vazio: 0.0692, vazio: 0.014 }
              : level === "MT"
                ? { fora_vazio: 0.0812, vazio: 0.0157 }
                : { fora_vazio: 0.1192, vazio: 0.0266 };
        return rates[period] ?? rates.fora_vazio;
      }

      let simMode = "energy";
      function simulationScenario() {
        const start = Math.max(
          5,
          Math.min(90, Number(document.getElementById("from").value) || 20),
        );
        const capacity = Number(currentVehicle?.battery_capacity_kwh) || 60;
        const maxVehiclePower = Number(currentVehicle?.max_dc_power_kw) || 50;
        const effectivePower = Math.max(
          1,
          Math.min(selectedStationPower || maxVehiclePower, maxVehiclePower),
        );
        let end;
        let energyKwh;
        let minutes;
        if (simMode === "time") {
          minutes = Math.max(
            5,
            Math.min(180, Number(document.getElementById("to").value) || 30),
          );
          energyKwh = Math.min(
            ((100 - start) * capacity) / 100,
            ((effectivePower * minutes) / 60) * 0.75,
          );
          end = start + (energyKwh / capacity) * 100;
        } else {
          end = Math.max(
            start + 1,
            Math.min(100, Number(document.getElementById("to").value) || 80),
          );
          energyKwh = ((end - start) * capacity) / 100;
          minutes = Math.max(
            5,
            Math.ceil(((energyKwh / effectivePower) * 60) / 0.75),
          );
        }
        return { start, end, energyKwh, minutes, effectivePower };
      }
      function pricingScenario() {
        return simulationScenario();
      }
      function renderSimulator() {
        const scenario = simulationScenario();
        document.getElementById("fv").textContent =
          scenario.start.toFixed(0) + "%";
        document.getElementById("tv").textContent =
          simMode === "time"
            ? scenario.minutes + " min"
            : scenario.end.toFixed(0) + "%";
        document.getElementById("energy").textContent =
          "~" + scenario.energyKwh.toFixed(1).replace(".", ",") + " kWh";
        document.getElementById("mins").textContent =
          "~" + scenario.minutes + " min";
        document.getElementById("from-label").textContent =
          "Estado atual da bateria";
        document.getElementById("to-label").textContent =
          simMode === "time" ? "Tempo de carregamento" : "Carregar até";
        document
          .getElementById("from")
          .setAttribute("aria-label", "Estado atual da bateria");
        document
          .getElementById("to")
          .setAttribute(
            "aria-label",
            simMode === "time" ? "Tempo de carregamento" : "Bateria alvo",
          );
        renderPriceComparison();
      }
      function setSimulationMode(mode) {
        simMode = mode === "time" ? "time" : "energy";
        const target = document.getElementById("to");
        const buttons = document.querySelectorAll("[data-sim-mode]");
        buttons.forEach((button) => {
          const active = button.dataset.simMode === simMode;
          button.classList.toggle("on", active);
          button.setAttribute("aria-selected", active ? "true" : "false");
        });
        if (simMode === "time") {
          target.min = "5";
          target.max = "180";
          target.step = "5";
          target.value = "30";
        } else {
          target.min = "20";
          target.max = "100";
          target.step = "1";
          target.value = "80";
        }
        renderSimulator();
      }
      function sim() {
        renderSimulator();
      }
      from.oninput = to.oninput = sim;
      document
        .querySelectorAll("[data-sim-mode]")
        .forEach((button) =>
          button.addEventListener("click", () =>
            setSimulationMode(button.dataset.simMode),
          ),
        );

      function compatibleOfficialTariffs() {
        const vehicleTypes = new Set(currentVehicle?.connector_types || []);
        const compatible = selectedOpcTariffs.filter(
          (item) =>
            !vehicleTypes.size ||
            vehicleTypes.has(officialConnectorCategory(item.connector_type)),
        );
        return compatible.length ? compatible : selectedOpcTariffs;
      }

      function calculateCardPrice(card, opc, scenario, period) {
        const energy = Number(scenario.energyKwh);
        const vehiclePower =
          Number(currentVehicle?.max_dc_power_kw) || Number(opc.power_kw) || 22;
        const optionPower = Math.max(
          1,
          Math.min(Number(opc.power_kw) || 1, vehiclePower),
        );
        const minutes = Math.max(
          5,
          Math.ceil(((energy / optionPower) * 60) / 0.75),
        );
        if (card.pricing_mode === "final_fixed") {
          const total = Number(card.energy_price_eur_kwh) * energy;
          const operator = String(
            operatorMap.get(selectedStation?.operator_id) ||
              selectedStation?.name ||
              "",
          ).toLowerCase();
          const ownNetwork = operator.includes("atlante");
          const cashbackRate =
            Number(
              ownNetwork ? card.cashback_own_rate : card.cashback_other_rate,
            ) || 0;
          return {
            card,
            opc,
            total,
            ceme: total,
            tar: 0,
            opcCost: 0,
            iec: 0,
            minutes,
            effectiveKwh: Number(card.energy_price_eur_kwh),
            finalFixed: true,
            cashback: total * cashbackRate,
            cashbackRate,
          };
        }
        const opcCost =
          Number(opc.activation_fee_eur || 0) +
          Number(opc.energy_price_eur_kwh || 0) * energy +
          Number(opc.time_price_eur_min || 0) * minutes;
        const tar = card.includes_tar
          ? 0
          : networkTariff(opc.voltage_level, period) * energy;
        const ceme =
          Number(card.energy_price_eur_kwh) * energy +
          Number(card.session_fee_eur || 0);
        const iec = Number(card.iec_eur_kwh || 0.001) * energy;
        const subtotal = ceme + tar + opcCost + iec;
        const total = subtotal * (1 + Number(card.vat_rate || 0.23));
        return {
          card,
          opc,
          total,
          ceme,
          tar,
          opcCost,
          iec,
          minutes,
          effectiveKwh: total / Math.max(energy, 0.01),
        };
      }

      function adHocPriceMarkup() {
        const freshAfter = Date.now() - 24 * 60 * 60 * 1000;
        const fresh = selectedAdHocPriceComponents.filter(
          (item) => Date.parse(item.observed_at || "") >= freshAfter,
        );
        if (!fresh.length) return "";
        const labels = {
          pricePerDeliveryUnit: "energia",
          pricePerChargingTime: "tempo",
          flatRate: "sessão",
        };
        const groups = new Map();
        fresh.forEach((item) => {
          const key = item.pricing_policy;
          const values = groups.get(key) || new Set();
          values.add(Number(item.amount_eur));
          groups.set(key, values);
        });
        const parts = [...groups.entries()]
          .map(([policy, values]) => {
            const amounts = [...values]
              .filter(Number.isFinite)
              .sort((a, b) => a - b);
            if (!amounts.length) return null;
            const amount =
              amounts.length === 1
                ? amounts[0].toFixed(2)
                : `${amounts[0].toFixed(2)}–${amounts.at(-1).toFixed(2)}`;
            const unit =
              policy === "pricePerDeliveryUnit"
                ? "€/kWh"
                : policy === "pricePerChargingTime"
                  ? "€/min"
                  : "€";
            const label =
              currentLanguage === "en"
                ? {
                    pricePerDeliveryUnit: "energy",
                    pricePerChargingTime: "time",
                    flatRate: "session",
                  }[policy] || "component"
                : labels[policy] || "componente";
            return `${amount.replace(".", ",")} ${unit} ${label}`;
          })
          .filter(Boolean);
        if (!parts.length) return "";
        const latest = Math.max(
          ...fresh.map((item) => Date.parse(item.observed_at || "") || 0),
        );
        const age = Math.max(0, Math.round((Date.now() - latest) / 60000));
        const text =
          currentLanguage === "en"
            ? `Direct charging at this station, published by MOBI.E ${age < 2 ? "less than 2 min" : age + " min"} ago. It is not a CEME card estimate.`
            : `Carregamento direto no posto, publicado pela MOBI.E há ${age < 2 ? "menos de 2 min" : age + " min"}. Não é uma estimativa de cartão CEME.`;
        return `<div class="price-empty"><span class="official-price">${currentLanguage === "en" ? "OFFICIAL AD HOC PRICE" : "PREÇO AD HOC OFICIAL"}</span><br><b>${parts.join(" · ")}</b><br>${text}</div>`;
      }

      function renderPriceComparison() {
        const container = document.getElementById("price-comparison");
        const headline = document.getElementById("price");
        if (!selectedStation) {
          headline.textContent = "Selecione um posto";
          return;
        }
        const directPrice = adHocPriceMarkup();
        if (
          selectedStation.source !== "nap" ||
          Number(selectedStation.max_power_kw) < 22
        ) {
          headline.textContent = "Preço oficial indisponível";
          container.innerHTML =
            directPrice +
            '<div class="price-empty">O comparador de cartões é apresentado apenas em postos oficiais NAP/MOBI.E com potência igual ou superior a 22 kW.</div>';
          return;
        }
        if (!selectedOpcTariffs.length) {
          headline.textContent = "Preço oficial indisponível";
          container.innerHTML =
            directPrice +
            '<div class="price-empty">Este posto ainda não tem uma correspondência tarifária oficial inequívoca para cartões. Não é apresentada qualquer estimativa.</div>';
          return;
        }
        const scenario = pricingScenario();
        const period = document.getElementById("price-period").value;
        const tariffs = compatibleOfficialTariffs();
        const comparisons = cemeCards
          .map((card) => {
            const eligibleTariffs =
              card.pricing_mode === "final_fixed"
                ? tariffs.filter((opc) => Number(opc.power_kw) >= 50)
                : tariffs;
            const options = eligibleTariffs.map((opc) =>
              calculateCardPrice(card, opc, scenario, period),
            );
            return options.sort((a, b) => a.total - b.total)[0];
          })
          .filter(Boolean)
          .sort((a, b) => a.total - b.total);
        if (!comparisons.length) {
          container.innerHTML =
            directPrice +
            '<div class="price-empty">Não foi possível calcular os cartões de referência.</div>';
          return;
        }
        headline.textContent = `≈ ${comparisons[0].total.toFixed(2).replace(".", ",")} €`;
        container.innerHTML =
          directPrice +
          comparisons
            .map(
              (item, index) =>
                `<div class="price-card"><span class="price-rank">${index + 1}</span><div class="price-name">${escapeHtml(item.card.name)} ${index === 0 ? '<span class="official-price">MENOR ESTIMATIVA</span>' : ""}<span class="price-breakdown">${item.finalFixed ? `Preço final promocional · taxas incluídas${item.cashbackRate ? ` · ${Math.round(item.cashbackRate * 100)}% em Green Gems (~${item.cashback.toFixed(2).replace(".", ",")} €) para uso futuro` : ""}` : `CEME ${item.ceme.toFixed(2).replace(".", ",")} € · OPC ${item.opcCost.toFixed(2).replace(".", ",")} €${item.tar ? ` · TAR ${item.tar.toFixed(2).replace(".", ",")} €` : ""} · taxas + IVA`}</span></div><div class="price-total">${item.total.toFixed(2).replace(".", ",")} €<small>${item.effectiveKwh.toFixed(3).replace(".", ",")} €/kWh final</small></div></div>`,
            )
            .join("") +
          `<div class="price-empty">Cenário: ${scenario.energyKwh.toFixed(1).replace(".", ",")} kWh · ~${comparisons[0].minutes} min · tomada ${escapeHtml(comparisons[0].opc.connector_type || "compatível")} ${escapeHtml(comparisons[0].opc.power_kw)} kW. Fonte OPC: MOBI.E. Campanhas só aparecem durante a respetiva validade.</div>`;
      }

      async function loadStationPricing(station) {
        const request = ++pricingRequest;
        selectedOpcTariffs = [];
        selectedAdHocPriceComponents = [];
        const container = document.getElementById("price-comparison");
        if (station.source !== "nap" || Number(station.max_power_kw) < 22) {
          renderPriceComparison();
          return;
        }
        container.innerHTML =
          '<div class="price-empty">A consultar tarifas oficiais…</div>';
        try {
          const [rows, adHoc] = await Promise.all([
            getRows(
              "official_opc_tariffs",
              `select=station_id,connector_uid,voltage_level,tariff_period,connector_type,power_kw,activation_fee_eur,energy_price_eur_kwh,time_price_eur_min&station_id=eq.${encodeURIComponent(station.id)}&tariff_period=eq.REGULAR&order=power_kw.desc`,
            ),
            getRows(
              "station_ad_hoc_price_components",
              `select=point_id,pricing_policy,amount_eur,currency,observed_at&station_id=eq.${encodeURIComponent(station.id)}&order=observed_at.desc`,
            ),
          ]);
          if (request !== pricingRequest) return;
          selectedOpcTariffs = rows;
          selectedAdHocPriceComponents = adHoc;
          renderPriceComparison();
        } catch (error) {
          console.error(error);
          if (request === pricingRequest) {
            document.getElementById("price").textContent = "Preço indisponível";
            container.innerHTML =
              '<div class="price-empty">Não foi possível consultar a tarifa oficial neste momento.</div>';
          }
        }
      }

      async function loadOverpassStations(place) {
        if (!place) return [];
        const query =
          `[out:json][timeout:12];nwr[amenity=charging_station](around:50000,${Number(place.lat)},${Number(place.lon)});out center tags;`;
        const response = await fetch("https://overpass.kumi.systems/api/interpreter", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: new URLSearchParams({ data: query }),
        });
        if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
        const payload = await response.json();
        return (payload.elements || []).map((item) => {
          const tags = item.tags || {};
          const latitude = Number(item.lat ?? item.center?.lat);
          const longitude = Number(item.lon ?? item.center?.lon);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
          return {
            id: `osm-${item.type}-${item.id}`,
            external_id: String(item.id),
            source: "openstreetmap-live",
            name: tags.name || tags.ref || "Posto de carregamento",
            address: [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" "),
            city: tags["addr:city"] || tags["addr:municipality"] || "",
            latitude, longitude, max_power_kw: null, status: "unknown",
            operator_id: tags.operator || null, amenities: JSON.stringify(tags),
          };
        }).filter(Boolean).slice(0, 500);
      }

      async function loadFallbackStations(place) {
        const params = new URLSearchParams();
        if (place) {
          params.set("lat", String(place.lat));
          params.set("lon", String(place.lon));
        }
        try {
          const response = await fetch(`${D1_FALLBACK_URL}?${params.toString()}`, {
            headers: { Accept: "application/json" },
          });
          if (response.ok) {
            const payload = await response.json();
            const stations = Array.isArray(payload.stations) ? payload.stations : [];
            if (stations.length) return stations;
          }
        } catch (error) {
          console.warn("D1 indisponível; consulta Overpass direta", error);
        }
        return loadOverpassStations(place);
      }

      const stationFields =
        "id,external_id,source,name,address,city,latitude,longitude,max_power_kw,status,operator_id,amenities";
      function nearbyStationsQuery(place) {
        const latDelta = 0.45;
        const lonDelta = 0.65;
        const lat = Number(place.lat);
        const lon = Number(place.lon);
        return `select=${stationFields}&latitude=gte.${lat - latDelta}&latitude=lte.${lat + latDelta}&longitude=gte.${lon - lonDelta}&longitude=lte.${lon + lonDelta}&limit=500`;
      }
      function fallbackStationsQuery() {
        return `select=${stationFields}&limit=500`;
      }

      async function loadRealStations() {
        const badge = document.getElementById("station-count");
        const cards = document.getElementById("station-cards");
        try {
          // Primeiro tentamos obter a posição. Assim não obrigamos a
          // aplicação a descarregar a tabela nacional completa.
          let place = null;
          try {
            place = await useMyLocation({
              setRouteOrigin: true,
              silent: true,
            });
          } catch (error) {
            console.warn("Localização indisponível; usando fallback nacional");
          }

          let stations;
          try {
            // D1 é agora a fonte primária do catálogo público de postos.
            // A Supabase permanece como fallback reversível enquanto validamos a migração.
            stations = await loadFallbackStations(place);
            if (!stations.length) throw new Error("D1 sem postos disponíveis");
          } catch (d1Error) {
            console.warn("D1 indisponível ou vazia; usando Supabase como fallback", d1Error);
            try {
              stations = await getRows(
                "charging_stations",
                place ? nearbyStationsQuery(place) : fallbackStationsQuery(),
              );
            } catch (supabaseError) {
              console.warn("Supabase indisponível; tentando novamente D1", supabaseError);
              stations = await loadFallbackStations(place);
            }
          }
          const operatorResult = (
            await Promise.allSettled([getRows("operators", "select=id,name")])
          )[0];
          const operators =
            operatorResult.status === "fulfilled" ? operatorResult.value : [];
          if (operatorResult.status !== "fulfilled")
            console.warn("Operadores indisponíveis; mostrando postos sem operador");

          connectorMap = new Map();
          reliabilityMap = new Map();
          operatorMap = new Map(operators.map((o) => [o.id, o.name]));
          allStations = stations;
          const operatorSelect = document.getElementById("operator-filter");
          [
            ...new Set(
              stations
                .map((station) => operatorMap.get(station.operator_id))
                .filter(Boolean),
            ),
          ]
            .sort((a, b) => a.localeCompare(b, "pt"))
            .forEach((name) => {
              const option = document.createElement("option");
              option.value = name;
              option.textContent = name;
              operatorSelect.appendChild(option);
            });
          renderStations(false);

          // O enriquecimento continua opcional. Conectores e fiabilidade
          // são carregados apenas quando o utilizador abre um posto.
          const [vehiclesResult, cardsResult] = await Promise.allSettled([
            getRows(
              "vehicle_models",
              "select=id,external_id,source,make,model,variant,model_year_start,battery_capacity_kwh,consumption_wh_km,wltp_range_km,max_ac_power_kw,max_dc_power_kw,connector_types,body_style,data_quality,consumption_basis&active=eq.true&order=make.asc,model.asc,variant.asc",
            ),
            getRows(
              "ceme_cards",
              "select=id,name,energy_price_eur_kwh,session_fee_eur,includes_tar,vat_rate,iec_eur_kwh,conditions,source_url,valid_from,valid_to,pricing_mode,network_scope,cashback_own_rate,cashback_other_rate&active=eq.true",
            ),
          ]);
          if (vehiclesResult.status === "fulfilled" && vehiclesResult.value.length) {
            populateVehicles(vehiclesResult.value);
          } else {
            console.warn("Catálogo remoto indisponível; usando catálogo local", vehiclesResult.reason);
            populateVehicles(LOCAL_VEHICLE_FALLBACK);
          }
          if (cardsResult.status === "fulfilled") {
            const today = new Date().toISOString().slice(0, 10);
            cemeCards = cardsResult.value.filter(
              (card) =>
                (!card.valid_from || card.valid_from <= today) &&
                (!card.valid_to || card.valid_to >= today),
            );
          } else {
            console.warn("Tarifários CEME indisponíveis", cardsResult.reason);
          }
        } catch (error) {
          console.error(error);
          badge.textContent = "erro";
          cards.innerHTML =
            '<article class="card"><div class="op">Os postos estão temporariamente indisponíveis</div><div class="st">A tentar novamente automaticamente quando a base de dados responder.</div></article>';
          if (!stationLoadRetryScheduled) {
            stationLoadRetryScheduled = true;
            setTimeout(() => {
              stationLoadRetryScheduled = false;
              loadRealStations();
            }, 60000);
          }
        }
      }

      function selectedValues(selector) {
        return [...document.querySelectorAll(selector + ":checked")].map(
          (input) => input.value,
        );
      }

      function matchesPower(power) {
        const value = Number(power) || 0;
        if (selectedPower === "0-50") return value <= 50;
        if (selectedPower === "50-150") return value > 50 && value <= 150;
        if (selectedPower === "150-250") return value > 150 && value <= 250;
        if (selectedPower === "250+") return value > 250;
        return true;
      }

      function markerCellKey(station, zoom) {
        if (zoom <= 7)
          return (
            Math.round(Number(station.latitude) * 2) +
            ":" +
            Math.round(Number(station.longitude) * 2)
          );
        if (zoom <= 9)
          return (
            Math.round(Number(station.latitude) * 5) +
            ":" +
            Math.round(Number(station.longitude) * 5)
          );
        if (zoom <= 11)
          return (
            Math.round(Number(station.latitude) * 12) +
            ":" +
            Math.round(Number(station.longitude) * 12)
          );
        return station.id;
      }
      function renderStations(zoomToResults = true) {
        const badge = document.getElementById("station-count");
        const cards = document.getElementById("station-cards");
        const search = document
          .getElementById("global-search")
          .value.trim()
          .toLocaleLowerCase("pt");
        const connectors = selectedValues(".connector-filter");
        const statuses = selectedValues(".status-filter");
        const selectedOperator =
          document.getElementById("operator-filter").value;
        const sort = document.getElementById("sort-filter").value;
        let filtered = allStations.filter((s) => {
          const stationConnectors = connectorMap.get(s.id) || [];
          const operatorName = operatorMap.get(s.operator_id) || "";
          const haystack = [s.name, s.address, s.city, operatorName]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("pt");
          const connectorMatch =
            !connectors.length ||
            connectors.some((filter) =>
              filter === "Tesla"
                ? isOfficialTeslaStation(s)
                : stationConnectors.some(
                    (c) => connectorCategory(c.type) === filter,
                  ),
            );
          const statusMatch =
            !statuses.length || statuses.includes(effectiveStationStatus(s));
          return (
            (!search || haystack.includes(search)) &&
            matchesPower(s.max_power_kw) &&
            connectorMatch &&
            statusMatch &&
            (selectedOperator === "all" || operatorName === selectedOperator)
          );
        });
        if (searchPosition) {
          filtered = filtered.map((s) => ({
            ...s,
            distance_km: distanceKm(searchPosition, {
              lat: s.latitude,
              lon: s.longitude,
            }),
          }));
          const nearby = filtered.filter((s) => s.distance_km <= 75);
          filtered = nearby.length
            ? nearby
            : filtered
                .sort((a, b) => a.distance_km - b.distance_km)
                .slice(0, 20);
        }
        filtered.sort((a, b) => {
          if (sort === "distance-asc" && searchPosition)
            return (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity);
          if (sort === "name-asc")
            return String(a.name || "").localeCompare(
              String(b.name || ""),
              "pt",
            );
          if (sort === "operator-asc")
            return String(operatorMap.get(a.operator_id) || "").localeCompare(
              String(operatorMap.get(b.operator_id) || ""),
              "pt",
            );
          return (Number(b.max_power_kw) || 0) - (Number(a.max_power_kw) || 0);
        });
        badge.textContent = filtered.length.toLocaleString("pt-PT");
        stationLayer.clearLayers();
        markerMap.clear();
        const markerZoom = map.getZoom();
        const markerSeen = new Set();
        const viewport = markerZoom >= 10 ? map.getBounds() : null;
        const markerStations = filtered.filter((s) => {
          if (
            viewport &&
            !viewport.contains([Number(s.latitude), Number(s.longitude)])
          )
            return false;
          const cell = markerCellKey(s, markerZoom);
          if (markerSeen.has(cell)) return false;
          markerSeen.add(cell);
          return true;
        });
        markerStations.forEach((s) => {
          const stationConnectors = connectorMap.get(s.id) || [];
          const connectorText =
            [...new Set(stationConnectors.map((c) => c.type))].join(" · ") ||
            "Conector não indicado";
          const totalPoints = stationConnectors.reduce(
            (total, connector) => total + (Number(connector.quantity) || 1),
            0,
          );
          const availability = stationAvailability(stationConnectors);
          const operatorName =
            operatorMap.get(s.operator_id) || "Operador não indicado";
          const location =
            [s.address, s.city].filter(Boolean).join(", ") ||
            "Localização não indicada";
          const marker = L.circleMarker([s.latitude, s.longitude], {
            radius: 8,
            color: "#fff",
            weight: 2,
            fillColor: markerColor(effectiveStationStatus(s)),
            fillOpacity: 1,
          }).addTo(stationLayer);
          marker.bindPopup(
            `<b>${escapeHtml(s.name || operatorName)}</b><br>${escapeHtml(operatorName)}<br>${escapeHtml(location)}<br>⚡ ${escapeHtml(s.max_power_kw ?? "—")} kW · ${escapeHtml(totalPoints)} tomadas · ${escapeHtml(connectorText)}<br>● ${escapeHtml(availability.kind === "none" && isOfficialTeslaStation(s) ? "Disponibilidade na app Tesla" : availability.label)}<br><button onclick="routeToStationById('${escapeHtml(s.id)}')" style="margin-top:7px;border:0;border-radius:6px;padding:6px 9px;background:#0eaf72;color:#fff;font-weight:700;cursor:pointer">🧭 Criar rota</button>`,
          );
          marker.on("click", () => selectStation(s, operatorName));
          markerMap.set(s.id, marker);
        });
        if (zoomToResults && filtered.length) {
          const bounds = L.latLngBounds(
            filtered.map((s) => [s.latitude, s.longitude]),
          );
          map.fitBounds(bounds, { padding: [25, 25], maxZoom: 13 });
        }
        const best = filtered.filter((s) => s.max_power_kw).slice(0, 5);
        cards.innerHTML = best
          .map((s, index) => {
            const stationConnectors = connectorMap.get(s.id) || [];
            const connectorText =
              [...new Set(stationConnectors.map((c) => c.type))].join(" · ") ||
              "Não indicado";
            const operatorName =
              operatorMap.get(s.operator_id) || "Operador não indicado";
            const availability = stationAvailability(stationConnectors);
            const distance =
              s.distance_km != null
                ? `${s.distance_km.toFixed(1).replace(".", ",")} km`
                : isOfficialTeslaStation(s)
                  ? "Tesla oficial"
                  : s.source === "nap"
                    ? "NAP oficial"
                    : "Dados comunitários";
            const totalPoints = stationConnectors.reduce(
              (total, connector) => total + (Number(connector.quantity) || 1),
              0,
            );
            const reliability = reliabilityMap.get(s.id) || {};
            const reliabilityText = reliability.review_count
              ? "⭐ " +
                Number(reliability.average_rating).toFixed(1) +
                " (" +
                reliability.review_count +
                ")"
              : reliability.availability_rate != null
                ? "Fiabilidade observada: " +
                  Number(reliability.availability_rate).toFixed(0) +
                  "%"
                : "Fiabilidade: a acumular dados";
            const effectivePower = currentVehicle?.max_dc_power_kw
              ? Math.min(
                  Number(s.max_power_kw) || 0,
                  Number(currentVehicle.max_dc_power_kw),
                )
              : Number(s.max_power_kw) || 0;
            return `<article class="card"><div class="rank">${index + 1} <span class="tag">Compatível</span></div><div class="op">${escapeHtml(operatorName)}</div><div class="st">${escapeHtml(s.name || "Posto de carregamento")}</div><div class="avail">${availability.kind === "none" && isOfficialTeslaStation(s) ? "● Disponibilidade na app Tesla" : availabilityHtml(availability)}</div><div class="reliability">${reliabilityText}</div><div class="metrics"><div class="metric"><b>${escapeHtml(effectivePower || "—")} kW</b>máximo com o veículo</div><div class="metric"><b>${escapeHtml(distance)}</b>${s.distance_km != null ? "distância aproximada" : escapeHtml(`${totalPoints} tomadas · ${connectorText}`)}</div></div><div class="cost"><b>${escapeHtml(s.max_power_kw)} kW</b> disponíveis no posto<div class="card-actions"><button data-station-id="${escapeHtml(s.id)}">Ver no mapa</button><button class="secondary" data-station-details="${escapeHtml(s.id)}">Ver detalhes e navegar</button></div></article>`;
          })
          .join("");
        if (!best.length)
          cards.innerHTML =
            '<article class="card"><div class="op">Sem resultados</div><div class="st">Altere a pesquisa ou os filtros selecionados.</div></article>';
        cards.querySelectorAll("button[data-station-id]").forEach((button) =>
          button.addEventListener("click", () => {
            const station = allStations.find(
              (s) => s.id === button.dataset.stationId,
            );
            if (station) {
              closeStationPanel();
              map.setView([station.latitude, station.longitude], 15, {
                animate: true,
              });
              markerMap.get(station.id)?.openPopup();
            }
          }),
        );
        cards.querySelectorAll("button[data-station-details]").forEach((button) =>
          button.addEventListener("click", () => {
            const station = allStations.find(
              (s) => s.id === button.dataset.stationDetails,
            );
            if (station) {
              map.setView([station.latitude, station.longitude], 15, {
                animate: true,
              });
              selectStation(station, operatorMap.get(station.operator_id));
            }
          }),
        );
      }

      async function geocodePortugal(query) {
        const cacheKey = query.toLocaleLowerCase("pt");
        let place = geocodeCache.get(cacheKey);
        if (!place) {
          const wait = Math.max(0, 1000 - (Date.now() - lastGeocodeAt));
          if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
          const params = new URLSearchParams({
            q: `${query}, Portugal`,
            format: "jsonv2",
            countrycodes: "pt",
            limit: "1",
          });
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?${params}`,
          );
          lastGeocodeAt = Date.now();
          if (!response.ok)
            throw new Error(`Pesquisa geográfica HTTP ${response.status}`);
          const results = await response.json();
          if (!results.length)
            throw new Error(`Local não encontrado: ${query}`);
          place = results[0];
          geocodeCache.set(cacheKey, place);
        }
        return {
          lat: Number(place.lat),
          lon: Number(place.lon),
          label: place.display_name,
        };
      }

      async function searchPortugal() {
        const input = document.getElementById("location-search");
        const button = document.getElementById("apply-filters");
        const query = input.value.trim();
        if (!query) {
          searchPosition = null;
          searchLayer.clearLayers();
          renderStations();
          return;
        }
        if (query.toLocaleLowerCase("pt-PT") === "a minha localização") {
          if (!searchPosition || searchPosition.label !== "A minha localização")
            await useMyLocation();
          else renderStations(true);
          document.querySelector(".side").classList.remove("mobile-open");
          return;
        }
        try {
          button.disabled = true;
          button.textContent = "A pesquisar…";
          const place = await geocodePortugal(query);
          searchPosition = place;
          searchLayer.clearLayers();
          L.marker([searchPosition.lat, searchPosition.lon])
            .addTo(searchLayer)
            .bindPopup(`<b>Pesquisa</b><br>${escapeHtml(place.label)}`)
            .openPopup();
          document.getElementById("sort-filter").value = "distance-asc";
          renderStations(true);
          document.querySelector(".side").classList.remove("mobile-open");
        } catch (error) {
          console.error(error);
          notifyUser(error.message || "Não foi possível pesquisar este local.", { kind: "error" });
        } finally {
          button.disabled = false;
          button.textContent = "⌕ Procurar";
        }
      }

      async function browserPosition() {
        const nativeGeolocation = window.Capacitor?.Plugins?.Geolocation;
        if (nativeGeolocation) {
          try {
            const position = await nativeGeolocation.getCurrentPosition({
              enableHighAccuracy: true,
              timeout: 12000,
              maximumAge: 300000,
            });
            return {
              lat: position.coords.latitude,
              lon: position.coords.longitude,
              accuracy: position.coords.accuracy,
              label: "A minha localização",
            };
          } catch (error) {
            const message = String(error?.message || error);
            if (/denied|permission|recus/i.test(message))
              throw new Error(
                "Permissão de localização recusada. Autorize-a nas definições da aplicação.",
              );
            throw new Error("Não foi possível determinar a localização.");
          }
        }
        return new Promise((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error("Este navegador não suporta localização."));
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (position) =>
              resolve({
                lat: position.coords.latitude,
                lon: position.coords.longitude,
                accuracy: position.coords.accuracy,
                label: "A minha localização",
              }),
            (error) => {
              const messages = {
                1: "Permissão de localização recusada. Autorize-a no navegador.",
                2: "Não foi possível determinar a localização.",
                3: "A localização demorou demasiado tempo.",
              };
              reject(
                new Error(
                  messages[error.code] ||
                    "Não foi possível obter a localização.",
                ),
              );
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 },
          );
        });
      }

      async function useMyLocation(options = {}) {
        const button = document.getElementById(
          options.buttonId || "use-location",
        );
        try {
          if (button) {
            button.disabled = true;
            button.textContent = "…";
          }
          const place = await browserPosition();
          searchPosition = place;
          document
            .getElementById("map-location-cta")
            ?.classList.add("is-hidden");
          routeOriginOverride = { ...place, input: "A minha localização" };
          document.getElementById("location-search").value =
            "A minha localização";
          if (options.setRouteOrigin)
            document.getElementById("route-origin").value =
              "A minha localização";
          searchLayer.clearLayers();
          L.circle([place.lat, place.lon], {
            radius: Math.max(25, place.accuracy || 25),
            color: "#1464c2",
            weight: 2,
            fillColor: "#60a5fa",
            fillOpacity: 0.16,
          }).addTo(searchLayer);
          L.marker([place.lat, place.lon])
            .addTo(searchLayer)
            .bindPopup("<b>A sua localização aproximada</b>")
            .openPopup();
          document.getElementById("sort-filter").value = "distance-asc";
          renderStations(false);
          map.setView([place.lat, place.lon], 12, { animate: false });
          return place;
        } catch (error) {
          console.error(error);
          const locationStatus = document.getElementById("map-location-cta");
          const locationStatusText = document.getElementById(
            "map-location-cta-text",
          );
          locationStatus?.classList.add("is-error");
          if (locationStatusText)
            locationStatusText.textContent =
              "Pode pesquisar uma localização no mapa.";
          if (!options.silent) notifyUser(error.message, { kind: "error" });
          throw error;
        } finally {
          if (button) {
            button.disabled = false;
            button.textContent = "◎";
          }
        }
      }

      async function routeToSelectedStation() {
        if (!selectedStation) {
          notifyUser("Selecione primeiro um posto no mapa.", { kind: "error" });
          return;
        }
        const operatorName =
          operatorMap.get(selectedStation.operator_id) ||
          "Posto de carregamento";
        const destinationLabel =
          [selectedStation.name, selectedStation.city]
            .filter(Boolean)
            .join(", ") || operatorName;
        routeDestinationOverride = {
          lat: Number(selectedStation.latitude),
          lon: Number(selectedStation.longitude),
          label: destinationLabel,
          input: destinationLabel,
        };
        document.getElementById("route-destination").value = destinationLabel;
        if (
          !routeOriginOverride ||
          document.getElementById("route-origin").value !==
            "A minha localização"
        )
          await useMyLocation({ setRouteOrigin: true });
        else
          document.getElementById("route-origin").value = "A minha localização";
        openRoutePlanner();
        await planRoute();
      }

      function routeToStationById(stationId) {
        const station = allStations.find((item) => item.id === stationId);
        if (!station) return;
        selectStation(station, operatorMap.get(station.operator_id));
        routeToSelectedStation();
      }

      function buildRouteProfile(coordinates, routeDistanceKm) {
        const cumulative = [0];
        for (let index = 1; index < coordinates.length; index++) {
          const previous = coordinates[index - 1];
          const point = coordinates[index];
          cumulative[index] =
            cumulative[index - 1] +
            distanceKm(
              { lat: previous[1], lon: previous[0] },
              { lat: point[1], lon: point[0] },
            );
        }
        const geometryDistance =
          cumulative[cumulative.length - 1] || routeDistanceKm || 1;
        const scale = routeDistanceKm / geometryDistance;
        return { coordinates, cumulative, scale };
      }

      function stationRoutePosition(station, profile) {
        const { coordinates, cumulative, scale } = profile;
        const step = Math.max(1, Math.floor(coordinates.length / 240));
        let best = { distance: Infinity, route_km: 0 };
        for (let index = 0; index < coordinates.length; index += step) {
          const point = coordinates[index];
          const distance = distanceKm(
            { lat: station.latitude, lon: station.longitude },
            { lat: point[1], lon: point[0] },
          );
          if (distance < best.distance)
            best = { distance, route_km: cumulative[index] * scale };
        }
        const lastIndex = coordinates.length - 1;
        const lastPoint = coordinates[lastIndex];
        const lastDistance = distanceKm(
          { lat: station.latitude, lon: station.longitude },
          { lat: lastPoint[1], lon: lastPoint[0] },
        );
        if (lastDistance < best.distance)
          best = {
            distance: lastDistance,
            route_km: cumulative[lastIndex] * scale,
          };
        return best;
      }

      function chargingTimeMinutes(energyKwh, effectivePowerKw) {
        const curveFactor =
          effectivePowerKw > 150 ? 0.65 : effectivePowerKw > 50 ? 0.75 : 0.88;
        return Math.max(
          5,
          Math.ceil((energyKwh / (effectivePowerKw * curveFactor)) * 60 + 4),
        );
      }

      function formatDuration(minutes) {
        const rounded = Math.max(0, Math.round(minutes));
        const hours = Math.floor(rounded / 60);
        const remainder = rounded % 60;
        return hours ? `${hours} h ${remainder} min` : `${remainder} min`;
      }

      function openRoutePlanner() {
        closeStationPanel();
        const planner = document.getElementById("route-planner");
        setNavigationMode("routes");
        planner.classList.add("route-visible");
        planner.scrollTop = 0;
        planner.classList.remove("flash");
        requestAnimationFrame(() => planner.classList.add("flash"));
        setTimeout(() => document.getElementById("route-origin").focus(), 350);
      }

      function stationCompatibleWithVehicle(station) {
        const vehicleConnectors = new Set(
          currentVehicle?.connector_types || [],
        );
        if (!vehicleConnectors.size) return true;
        return (connectorMap.get(station.id) || []).some((connector) =>
          vehicleConnectors.has(connectorCategory(connector.type)),
        );
      }

      function routeAvailabilityPenalty(station) {
        const availability = station.route_availability;
        if (availability.kind === "live")
          return availability.available > 0 ? -0.15 : 0.8;
        if (availability.kind === "stale") return 0.08;
        return 0;
      }

      function teslaRouteBonus(station) {
        return isTeslaVehicle() && isOfficialTeslaStation(station) ? -0.55 : 0;
      }

      function routeCandidateScore(
        station,
        targetKm,
        reachableKm,
        maxVehiclePower,
      ) {
        const power = Math.min(
          Number(station.max_power_kw) || 0,
          maxVehiclePower,
        );
        return (
          Math.abs(station.route_km - targetKm) / Math.max(reachableKm, 1) +
          station.distance / 20 -
          power / 500 +
          routeAvailabilityPenalty(station) +
          teslaRouteBonus(station)
        );
      }

      function findFallbackStation(
        primary,
        reachable,
        usedStations,
        maxVehiclePower,
      ) {
        const alternatives = reachable.filter(
          (station) =>
            station.id !== primary.id &&
            !usedStations.has(station.id) &&
            Math.abs(station.route_km - primary.route_km) <= 35,
        );
        alternatives.sort((a, b) => {
          const distanceA = distanceKm(
            { lat: primary.latitude, lon: primary.longitude },
            { lat: a.latitude, lon: a.longitude },
          );
          const distanceB = distanceKm(
            { lat: primary.latitude, lon: primary.longitude },
            { lat: b.latitude, lon: b.longitude },
          );
          const powerA = Math.min(Number(a.max_power_kw) || 0, maxVehiclePower);
          const powerB = Math.min(Number(b.max_power_kw) || 0, maxVehiclePower);
          const scoreA =
            distanceA / 20 +
            a.distance / 25 -
            powerA / 650 +
            routeAvailabilityPenalty(a) +
            teslaRouteBonus(a);
          const scoreB =
            distanceB / 20 +
            b.distance / 25 -
            powerB / 650 +
            routeAvailabilityPenalty(b) +
            teslaRouteBonus(b);
          return scoreA - scoreB;
        });
        const fallback = alternatives[0];
        if (!fallback) return null;
        return {
          ...fallback,
          distance_from_primary: distanceKm(
            { lat: primary.latitude, lon: primary.longitude },
            { lat: fallback.latitude, lon: fallback.longitude },
          ),
        };
      }

      async function recalculateRoute() {
        if (!lastPlannedRoute) return;
        const button = document.getElementById("recalculate-route");
        if (button) {
          button.disabled = true;
          button.textContent = "A atualizar…";
        }
        try {
          await planRoute();
        } finally {
          if (button) {
            button.disabled = false;
            button.textContent = "↻ Atualizar rota";
          }
        }
      }
      function googleMapsRouteUrl() {
        if (!lastPlannedRoute) return "";
        const route = lastPlannedRoute;
        const params = new URLSearchParams({
          api: "1",
          origin: `${route.origin.lat},${route.origin.lon}`,
          destination: `${route.destination.lat},${route.destination.lon}`,
          travelmode: "driving",
        });
        if (route.stops.length)
          params.set(
            "waypoints",
            route.stops
              .map((stop) => `${stop.latitude},${stop.longitude}`)
              .join("|"),
          );
        return `https://www.google.com/maps/dir/?${params}`;
      }
      function openRouteInGoogleMaps() {
        const url = googleMapsRouteUrl();
        if (url) window.open(url, "_blank", "noopener");
      }
      async function sharePlannedRoute() {
        if (!lastPlannedRoute) return;
        const url = googleMapsRouteUrl();
        const text = `Rota elétrica: ${lastPlannedRoute.origin.label} → ${lastPlannedRoute.destination.label}${lastPlannedRoute.stops.length ? ` · ${lastPlannedRoute.stops.length} paragens de carregamento` : ""}`;
        try {
          if (navigator.share)
            await navigator.share({ title: "ChargeVoy", text, url });
          else {
            await navigator.clipboard.writeText(`${text}\n${url}`);
            notifyUser("Ligação da rota copiada.", { kind: "success" });
          }
        } catch (error) {
          if (error?.name !== "AbortError")
            window.open(url, "_blank", "noopener");
        }
      }
      async function saveRouteToUserHistory() {
        if (!currentSession?.user || !lastPlannedRoute) return;
        const route = lastPlannedRoute;
        const { error } = await authClient.from("user_route_history").insert({
          user_id: currentSession.user.id,
          origin_label: route.origin.label,
          origin_lat: route.origin.lat,
          origin_lon: route.origin.lon,
          destination_label: route.destination.label,
          destination_lat: route.destination.lat,
          destination_lon: route.destination.lon,
          vehicle_id: currentVehicle?.id || null,
          stops: route.stops,
          distance_km: route.distanceKm,
          drive_minutes: Math.round(route.driveMinutes),
          charging_minutes: Math.round(route.chargingMinutes),
        });
        if (error) console.error("Histórico da rota:", error);
      }

      async function planRoute() {
        const button = document.getElementById("plan-route");
        const result = document.getElementById("route-result");
        const originText = document.getElementById("route-origin").value.trim();
        const destinationText = document
          .getElementById("route-destination")
          .value.trim();
        const startBattery = Math.min(
          100,
          Math.max(
            5,
            Number(document.getElementById("route-battery").value) || 80,
          ),
        );
        const reserve = Math.min(
          40,
          Math.max(
            5,
            Number(document.getElementById("route-reserve").value) || 15,
          ),
        );
        if (!originText || !destinationText) {
            notifyUser("Indique a origem e o destino.", { kind: "error" });
          return;
        }
        if (reserve >= startBattery) {
            notifyUser("A bateria inicial deve ser superior à reserva de chegada.", { kind: "error" });
          return;
        }
        try {
          button.disabled = true;
          button.textContent = "A calcular…";
          result.classList.remove("show");
          const origin =
            routeOriginOverride && originText === routeOriginOverride.input
              ? routeOriginOverride
              : await geocodePortugal(originText);
          const destination =
            routeDestinationOverride &&
            destinationText === routeDestinationOverride.input
              ? routeDestinationOverride
              : await geocodePortugal(destinationText);
          const routeUrl = `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=full&geometries=geojson&steps=false`;
          const response = await fetchWithTimeout(routeUrl, {}, 15000);
          if (!response.ok)
            throw new Error(`Serviço de rotas HTTP ${response.status}`);
          const data = await response.json();
          if (data.code !== "Ok" || !data.routes?.length)
            throw new Error("Não foi possível calcular uma rota rodoviária.");
          const route = data.routes[0];
          const coordinates = route.geometry.coordinates;
          const distance = route.distance / 1000;
          const duration = route.duration / 60;
          const routeProfile = buildRouteProfile(coordinates, distance);
          const capacity = Number(currentVehicle?.battery_capacity_kwh) || 60;
          const consumption =
            ((Number(currentVehicle?.consumption_wh_km) || 170) / 1000) * 1.15;
          const requiredEnergy = distance * consumption;
          const usableEnergy = (capacity * (startBattery - reserve)) / 100;
          const chargeNeeded = Math.max(0, requiredEnergy - usableEnergy);
          let candidates = allStations
            .filter(
              (station) =>
                stationCompatibleWithVehicle(station) &&
                Number(station.max_power_kw) > 0,
            )
            .map((station) => {
              const availability = stationAvailability(
                connectorMap.get(station.id) || [],
              );
              return {
                ...station,
                ...stationRoutePosition(station, routeProfile),
                route_availability: availability,
              };
            })
            .filter(
              (station) =>
                station.distance <= 15 &&
                station.route_km > distance * 0.04 &&
                station.route_km < distance * 0.96,
            );
          const reserveEnergy = (capacity * reserve) / 100;
          const maxVehiclePower = Number(currentVehicle?.max_dc_power_kw) || 50;
          let batteryEnergy = (capacity * startBattery) / 100;
          let currentKm = 0;
          let currentDetourKm = 0;
          let chargingMinutes = 0;
          let detourKm = 0;
          const suggested = [];
          const usedStations = new Set();
          while (
            batteryEnergy -
              (currentDetourKm + distance - currentKm) * consumption <
              reserveEnergy &&
            suggested.length < 5
          ) {
            const reachableKm = Math.max(
              0,
              (batteryEnergy - reserveEnergy) / consumption,
            );
            const targetKm = currentKm + reachableKm * 0.82;
            const reachable = candidates.filter((station) => {
              const legKm =
                currentDetourKm +
                (station.route_km - currentKm) +
                station.distance;
              return (
                !usedStations.has(station.id) &&
                station.route_km > currentKm + 5 &&
                legKm <= reachableKm &&
                station.route_km < distance - 5
              );
            });
            reachable.sort((a, b) => {
              return (
                routeCandidateScore(a, targetKm, reachableKm, maxVehiclePower) -
                routeCandidateScore(b, targetKm, reachableKm, maxVehiclePower)
              );
            });
            const station = reachable[0];
            if (!station) break;
            const fallback = findFallbackStation(
              station,
              candidates,
              usedStations,
              maxVehiclePower,
            );
            const legKm =
              currentDetourKm +
              (station.route_km - currentKm) +
              station.distance;
            batteryEnergy = Math.max(0, batteryEnergy - legKm * consumption);
            const arrivalSoc = (batteryEnergy / capacity) * 100;
            const targetEnergy = capacity * 0.8;
            const energyToCharge = Math.max(0, targetEnergy - batteryEnergy);
            const effectivePower = Math.max(
              1,
              Math.min(Number(station.max_power_kw) || 1, maxVehiclePower),
            );
            const chargeMinutes = chargingTimeMinutes(
              energyToCharge,
              effectivePower,
            );
            chargingMinutes += chargeMinutes;
            suggested.push({
              ...station,
              arrival_soc: arrivalSoc,
              departure_soc: 80,
              energy_to_charge: energyToCharge,
              effective_power: effectivePower,
              charge_minutes: chargeMinutes,
              leg_km: legKm,
              fallback,
            });
            usedStations.add(station.id);
            batteryEnergy = targetEnergy;
            detourKm += station.distance * 2;
            currentDetourKm = station.distance;
            currentKm = station.route_km;
          }
          const finalLegKm = currentDetourKm + (distance - currentKm);
          const routeFeasible =
            batteryEnergy - finalLegKm * consumption >= reserveEnergy;
          const finalEnergy = Math.max(
            0,
            batteryEnergy - finalLegKm * consumption,
          );
          const finalSoc = (finalEnergy / capacity) * 100;
          lastPlannedRoute = {
            origin,
            destination,
            stops: suggested.map((station) => ({
              latitude: station.latitude,
              longitude: station.longitude,
              name: station.name,
            })),
            distanceKm: distance,
            driveMinutes: duration,
            chargingMinutes,
          };
          routeLayer.clearLayers();
          const routeLine = L.geoJSON(route.geometry, {
            style: { color: "#1464c2", weight: 5, opacity: 0.85 },
          }).addTo(routeLayer);
          L.marker([origin.lat, origin.lon])
            .addTo(routeLayer)
            .bindPopup(`<b>Origem</b><br>${escapeHtml(origin.label)}`);
          L.marker([destination.lat, destination.lon])
            .addTo(routeLayer)
            .bindPopup(`<b>Destino</b><br>${escapeHtml(destination.label)}`);
          suggested.forEach((station, index) => {
            L.circleMarker([station.latitude, station.longitude], {
              radius: 10,
              color: "#fff",
              weight: 3,
              fillColor: isOfficialTeslaStation(station)
                ? "#e82127"
                : "#f59e0b",
              fillOpacity: 1,
            })
              .addTo(routeLayer)
              .bindPopup(
                `<b>Paragem ${index + 1}${isOfficialTeslaStation(station) ? " · Supercharger Tesla" : ""}</b><br>${escapeHtml(station.name)}<br>Chegada: ${station.arrival_soc.toFixed(0)}% · carregar ${station.energy_to_charge.toFixed(1).replace(".", ",")} kWh<br>~${station.charge_minutes} min a ${station.effective_power} kW`,
              );
            if (station.fallback)
              L.circleMarker(
                [station.fallback.latitude, station.fallback.longitude],
                {
                  radius: 7,
                  color: "#475569",
                  weight: 2,
                  fillColor: "#fff",
                  fillOpacity: 1,
                },
              )
                .addTo(routeLayer)
                .bindPopup(
                  `<b>Plano B da paragem ${index + 1}</b><br>${escapeHtml(station.fallback.name || "Posto alternativo")}<br>${station.fallback.distance_from_primary.toFixed(1).replace(".", ",")} km do posto principal · ${escapeHtml(station.fallback.max_power_kw || "—")} kW`,
                );
          });
          map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
          const detourMinutes = detourKm;
          const totalMinutes = duration + detourMinutes + chargingMinutes;
          const stopsHtml =
            chargeNeeded <= 0
              ? `<b>✓ A rota é possível sem carregamento intermédio.</b> Chegada estimada: ${finalSoc.toFixed(0)}%.`
              : suggested.length && routeFeasible
                ? `<b>⚡ Plano recomendado: ${suggested.length} ${suggested.length === 1 ? "paragem" : "paragens"} · ${chargingMinutes} min a carregar.</b>${isTeslaVehicle() ? "<br><small>Superchargers oficiais são priorizados quando não comprometem a autonomia nem criam um desvio excessivo.</small>" : ""}<ol class="route-stops">${suggested.map((station, index) => `<li><b>${index + 1}. ${escapeHtml(station.name || "Posto")}</b>${isOfficialTeslaStation(station) ? " · <b>Supercharger Tesla</b>" : ""} — ao km ~${station.route_km.toFixed(0)}, chegada ${station.arrival_soc.toFixed(0)}%, carregar ${station.energy_to_charge.toFixed(1).replace(".", ",")} kWh até ${station.departure_soc}% · <b>~${station.charge_minutes} min</b> a ${station.effective_power} kW · desvio ~${station.distance.toFixed(1).replace(".", ",")} km${station.route_availability.kind === "live" ? ` · ${escapeHtml(station.route_availability.label)}` : ""}${station.fallback ? `<br><small><b>Plano B:</b> ${escapeHtml(station.fallback.name || "Posto alternativo")} · ${station.fallback.distance_from_primary.toFixed(1).replace(".", ",")} km do principal · ${escapeHtml(station.fallback.max_power_kw || "—")} kW</small>` : "<br><small>Plano B: não foi encontrado outro posto alcançável nesta zona.</small>"}</li>`).join("")}</ol><b>Destino:</b> chegada estimada com ${finalSoc.toFixed(0)}%.`
                : suggested.length
                  ? `<b>⚠ Foram encontradas ${suggested.length} paragens possíveis, mas não é possível completar a rota mantendo ${reserve}% de reserva. Experimente aumentar a bateria inicial ou reduzir a reserva.</b>`
                  : "<b>⚠ É necessário carregar, mas não foram encontrados postos compatíveis e alcançáveis até 15 km desta rota.</b>";
          result.innerHTML = `<div class="route-summary"><span><b>${distance.toFixed(0)} km</b> de rota</span><span><b>${formatDuration(duration)}</b> a conduzir</span><span><b>${formatDuration(chargingMinutes)}</b> a carregar</span><span><b>${formatDuration(totalMinutes)}</b> total</span><span><b>${requiredEnergy.toFixed(1).replace(".", ",")} kWh</b> estimados</span></div>${stopsHtml}<br><small>Estimativa para ${escapeHtml(currentVehicle ? `${currentVehicle.make} ${currentVehicle.model} ${currentVehicle.variant || ""}`.trim() : "o veículo selecionado")}, com margem de consumo de 15%. Inclui curva média de carregamento, 4 minutos de operação por paragem e aproximadamente ${detourKm.toFixed(1).replace(".", ",")} km de desvios.</small><div class="route-actions"><button onclick="recalculateRoute()" id="recalculate-route">↻ Atualizar rota</button><button onclick="openRouteInGoogleMaps()">🧭 Navegar até ao destino</button><button onclick="sharePlannedRoute()">↗ Partilhar rota</button></div>`;
          result.classList.add("show");
          saveRouteToUserHistory();
        } catch (error) {
          console.error(error);
          result.innerHTML = `<b>Não foi possível calcular a rota.</b><br>${escapeHtml(error.message)}`;
          result.classList.add("show");
        } finally {
          button.disabled = false;
          button.textContent = "🧭 Calcular rota";
        }
      }

      function enableAnalytics() {
        if (window.__evGaLoaded) return;
        window.__evGaLoaded = true;
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () {
          window.dataLayer.push(arguments);
        };
        window.gtag("js", new Date());
        window.gtag("config", "G-5X8DCHS5VR", { anonymize_ip: true });
        const script = document.createElement("script");
        script.async = true;
        script.src = "https://www.googletagmanager.com/gtag/js?id=G-5X8DCHS5VR";
        document.head.appendChild(script);
      }
      function setupAnalyticsConsent() {
        const banner = document.getElementById("analytics-consent");
        const choice = localStorage.getItem("analytics-consent");
        if (choice === "granted") enableAnalytics();
        if (choice) return;
        banner.hidden = false;
        document
          .getElementById("analytics-accept")
          .addEventListener("click", () => {
            localStorage.setItem("analytics-consent", "granted");
            banner.hidden = true;
            enableAnalytics();
          });
        document
          .getElementById("analytics-deny")
          .addEventListener("click", () => {
            localStorage.setItem("analytics-consent", "denied");
            banner.hidden = true;
          });
      }
      async function initAuth() {
        const { data } = await authClient.auth.getSession();
        currentSession = data.session;
        updateAuthUI();
        if (currentSession) syncUserFavorites();
        authClient.auth.onAuthStateChange((event, session) => {
          currentSession = session;
          updateAuthUI();
          if (session) syncUserFavorites();
        });
      }
      window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        installPrompt = event;
      });
      if ("serviceWorker" in navigator)
        window.addEventListener("load", () =>
          navigator.serviceWorker
            .register("./service-worker.js")
            .catch((error) => console.error("PWA:", error)),
        );
      applyTranslations();
      setupNativeAuth();
      initAuth();
      setupAnalyticsConsent();
      loadRealStations();
      let availabilityRefreshBusy = false;
      async function refreshAvailability() {
        if (
          document.hidden ||
          availabilityRefreshBusy ||
          !allStations.length ||
          !selectedStation
        )
          return;
        availabilityRefreshBusy = true;
        try {
          const connectors = await loadStationConnectors(selectedStation.id, true);
          updateStationConnectorPanel(selectedStation, connectors);
        } catch (error) {
          console.warn("Não foi possível atualizar a disponibilidade");
        } finally {
          availabilityRefreshBusy = false;
        }
      }
      setInterval(refreshAvailability, 5 * 60000);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) refreshAvailability();
      });

      // Simulator controls are initialized above with energy/time modes.
      document.querySelectorAll("#power-filter .chip").forEach((button) =>
        button.addEventListener("click", () => {
          document
            .querySelectorAll("#power-filter .chip")
            .forEach((other) => other.classList.remove("on"));
          button.classList.add("on");
          selectedPower = button.dataset.power;
          renderStations();
        }),
      );
      document
        .getElementById("apply-filters")
        .addEventListener("click", searchPortugal);
      document
        .querySelectorAll(".mobile-station-close")
        .forEach((button) =>
          button.addEventListener("click", closeStationPanel),
        );
      let stationRenderFrame = 0;
      function scheduleStationRender() {
        cancelAnimationFrame(stationRenderFrame);
        stationRenderFrame = requestAnimationFrame(() => renderStations(false));
      }
      map.on("moveend", scheduleStationRender);
      map.on("zoomend", scheduleStationRender);
      document
        .getElementById("use-location")
        .addEventListener("click", () => useMyLocation());
      document
        .getElementById("location-search")
        .addEventListener("keydown", (event) => {
          if (event.key === "Enter") searchPortugal();
        });
      document.getElementById("global-search").addEventListener("input", () => {
        renderStations(false);
        if (document.getElementById("global-search").value.trim())
          document.querySelector(".side")?.classList.remove("mobile-open");
      });
      document
        .querySelectorAll(".connector-filter,.status-filter")
        .forEach((input) =>
          input.addEventListener("change", () => renderStations(false)),
        );
      document
        .getElementById("operator-filter")
        .addEventListener("change", () => renderStations());
      document
        .getElementById("sort-filter")
        .addEventListener("change", () => renderStations(false));
      document
        .getElementById("vehicle-select")
        .addEventListener("change", (event) =>
          applyVehicle(event.target.value),
        );
      document
        .getElementById("vehicle-brand")
        .addEventListener("change", (event) =>
          renderVehicleOptions(event.target.value),
        );
      document
        .getElementById("plan-route")
        .addEventListener("click", planRoute);
      document
        .getElementById("route-use-location")
        .addEventListener("click", () =>
          useMyLocation({
            setRouteOrigin: true,
            buttonId: "route-use-location",
          }),
        );
      document
        .getElementById("route-selected-station")
        .addEventListener("click", routeToSelectedStation);
      document
        .getElementById("station-google-maps")
        .addEventListener("click", openSelectedStationMaps);
      document
        .getElementById("station-photos")
        .addEventListener("click", showStationPhotos);
      document
        .getElementById("station-alternative")
        .addEventListener("click", showStationAlternative);
      document
        .getElementById("price-period")
        .addEventListener("change", renderPriceComparison);
      document
        .querySelectorAll(
          "#route-origin,#route-destination,#route-battery,#route-reserve",
        )
        .forEach((input) =>
          input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") planRoute();
          }),
        );
      document.getElementById("route-origin").addEventListener("input", () => {
        routeOriginOverride = null;
      });
      document
        .getElementById("route-destination")
        .addEventListener("input", () => {
          routeDestinationOverride = null;
        });
      document
        .getElementById("nav-routes")
        .addEventListener("click", openRoutePlanner);
      document.getElementById("nav-map").addEventListener("click", () => {
        closeStationPanel();
        document
          .getElementById("route-planner")
          .classList.remove("route-visible");
        setNavigationMode("map");
        document
          .getElementById("map-section")
          .scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => map.invalidateSize(), 250);
      });
      document
        .getElementById("station-favorite")
        .addEventListener("click", toggleSelectedFavorite);
      document.getElementById("nav-favorites").addEventListener("click", () => {
        closeStationPanel();
        document
          .getElementById("route-planner")
          .classList.remove("route-visible");
        setNavigationMode("favorites");
        showFavorites();
      });
      document.getElementById("nav-account").addEventListener("click", () => {
        closeStationPanel();
        document
          .getElementById("route-planner")
          .classList.remove("route-visible");
        setNavigationMode("account");
        showAccount();
      });
      document
        .getElementById("modal-close")
        .addEventListener("click", closeModal);
      document
        .getElementById("app-modal")
        .addEventListener("click", (event) => {
          if (event.target.id === "app-modal") closeModal();
        });
      document
        .getElementById("mobile-filters")
        .addEventListener("click", () =>
          document.querySelector(".side").classList.add("mobile-open"),
        );
      document
        .getElementById("language-toggle")
        .addEventListener("click", () =>
          setLanguage(currentLanguage === "en" ? "pt" : "en"),
        );
      document
        .getElementById("close-mobile-filters")
        .addEventListener("click", () =>
          document.querySelector(".side").classList.remove("mobile-open"),
        );
      document.getElementById("nav-vehicle").addEventListener("click", () => {
        closeStationPanel();
        document
          .getElementById("route-planner")
          .classList.remove("route-visible");
        setNavigationMode("vehicle");
        if (window.innerWidth <= 780)
          document.querySelector(".side").classList.add("mobile-open");
        else document.getElementById("vehicle-select").focus();
      });
      const quickRoute = document.getElementById("open-route-planner");
      quickRoute.addEventListener("click", openRoutePlanner);
      quickRoute.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openRoutePlanner();
        }
      });
      const quickPrice = document.getElementById("open-price-comparator");
      function openPriceComparator() {
        if (!selectedStation) {
          const station = allStations.find(
            (item) => item.source === "nap" && Number(item.max_power_kw) >= 22,
          );
          if (station)
            selectStation(station, operatorMap.get(station.operator_id));
        }
        document
          .getElementById("price-comparison")
          .scrollIntoView({ behavior: "smooth", block: "center" });
      }
      quickPrice.addEventListener("click", openPriceComparator);
      quickPrice.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPriceComparator();
        }
      });
      const poiCache = new Map();
      let poiRequestController = null;
      function poiDistanceKm(lat1, lon1, lat2, lon2) {
        const rad = Math.PI / 180,
          a =
            Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
            Math.cos(lat1 * rad) *
              Math.cos(lat2 * rad) *
              Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
        return 6371 * 2 * Math.asin(Math.sqrt(a));
      }
      function poiLabel(tags) {
        return tags.amenity === "restaurant"
          ? "Restaurante"
          : tags.amenity === "cafe"
            ? "Café"
            : tags.amenity === "fast_food"
              ? "Comida rápida"
              : tags.amenity === "bar"
                ? "Bar"
                : tags.amenity === "toilets"
                  ? "WC"
                  : tags.tourism === "hotel"
                    ? "Hotel"
                    : tags.tourism === "museum"
                      ? "Museu"
                      : tags.tourism === "attraction"
                        ? "Atração"
                        : tags.shop === "supermarket"
                          ? "Supermercado"
                          : tags.shop === "mall"
                            ? "Centro comercial"
                            : "Ponto de interesse";
      }
      function renderNearbyPois(items) {
        const list = document.getElementById("station-pois");
        if (!list) return;
        currentPoiItems = items || [];
        const filter = document.getElementById("poi-filter")?.value || "all";
        const filtered =
          filter === "all"
            ? currentPoiItems
            : currentPoiItems.filter((item) => item.category === filter);
        if (!filtered.length) {
          list.innerHTML =
            "<div>Não foram encontrados locais deste tipo próximos.</div>";
          return;
        }
        list.innerHTML = filtered
          .map(
            (item, index) =>
              '<div class="poi-row"><div><b>' +
              escapeHtml(item.name) +
              "</b><small>" +
              escapeHtml(item.kind) +
              " · " +
              item.distance.toFixed(1).replace(".", ",") +
              " km · ~" +
              Math.max(1, Math.round((item.distance / 5) * 60)) +
              ' min a pé</small></div><button type="button" data-poi-route="' +
              index +
              '" title="Abrir no Google Maps">🗺️ Google Maps</button></div>',
          )
          .join("");
        list.querySelectorAll("[data-poi-route]").forEach((button) =>
          button.addEventListener("click", () => {
            const item = filtered[Number(button.dataset.poiRoute)];
            if (item)
              window.open(
                "https://www.google.com/maps/dir/?api=1&destination=" +
                  encodeURIComponent(item.lat + "," + item.lon),
                "_blank",
                "noopener",
              );
          }),
        );
      }
      async function loadNearbyPois() {
        const button = document.getElementById("load-nearby-pois");
        const list = document.getElementById("station-pois");
        if (
          !selectedStation ||
          selectedStation.latitude == null ||
          selectedStation.longitude == null
        ) {
          if (list) list.innerHTML = "Selecione primeiro um posto.";
          return;
        }
        const key = String(selectedStation.id);
        const cached = poiCache.get(key);
        if (cached && Date.now() - cached.at < 10 * 60 * 1000) {
          renderNearbyPois(cached.items);
          return;
        }
        if (button) {
          button.disabled = true;
          button.textContent = "A pesquisar…";
        }
        if (list) list.innerHTML = "A procurar locais próximos…";
        if (poiRequestController) poiRequestController.abort();
        poiRequestController = new AbortController();
        const lat = Number(selectedStation.latitude),
          lon = Number(selectedStation.longitude);
        const query =
          '[out:json][timeout:12];(nwr["amenity"~"restaurant|cafe|fast_food|bar|toilets"](around:1200,' +
          lat +
          "," +
          lon +
          ');nwr["tourism"~"hotel|museum|attraction"](around:1200,' +
          lat +
          "," +
          lon +
          ');nwr["shop"~"supermarket|mall"](around:1200,' +
          lat +
          "," +
          lon +
          "););out center tags;";
        try {
          const response = await fetch(
            "https://overpass-api.de/api/interpreter",
            {
              method: "POST",
              body: query,
              signal: poiRequestController.signal,
              headers: {
                Accept: "application/json",
                "Content-Type": "text/plain;charset=UTF-8",
              },
            },
          );
          if (!response.ok) throw Error("Overpass HTTP " + response.status);
          const data = await response.json();
          const items = (data.elements || [])
            .map((element) => {
              const tags = element.tags || {},
                point = element.center || element;
              return {
                name: tags.name || tags["name:pt"] || "Local sem nome",
                kind: poiLabel(tags),
                category:
                  tags.amenity === "restaurant"
                    ? "restaurant"
                    : tags.tourism === "hotel"
                      ? "hotel"
                      : tags.amenity === "toilets"
                        ? "toilets"
                        : tags.shop === "supermarket"
                          ? "supermarket"
                          : tags.amenity === "cafe"
                            ? "cafe"
                            : "other",
                lat: Number(point.lat),
                lon: Number(point.lon),
              };
            })
            .filter(
              (item) =>
                item.name !== "Local sem nome" &&
                Number.isFinite(item.lat) &&
                Number.isFinite(item.lon),
            )
            .map((item) => ({
              ...item,
              distance: poiDistanceKm(lat, lon, item.lat, item.lon),
            }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 8);
          poiCache.set(key, { at: Date.now(), items });
          renderNearbyPois(items);
        } catch (error) {
          if (error.name !== "AbortError" && list)
            list.innerHTML =
              "Não foi possível consultar os locais agora. Tente novamente dentro de alguns segundos.";
        } finally {
          if (button) {
            button.disabled = false;
            button.textContent = "Ver locais";
          }
        }
      }
      document
        .getElementById("load-nearby-pois")
        .addEventListener("click", loadNearbyPois);
      document
        .getElementById("poi-filter")
        .addEventListener("change", () => renderNearbyPois(currentPoiItems));
      const legalPages = {
        legal: {
          title: "Aviso legal",
          html: `<div class="legal-demo"><h3>${currentLanguage === "en" ? "Service identification" : "Identificação do serviço"}</h3><p><b>ChargeVoy</b> — ${currentLanguage === "en" ? "personal project operated by Diogo Ferreira" : "projeto pessoal explorado por Diogo Ferreira"}.</p><p>${currentLanguage === "en" ? "Contact for support, privacy and legal matters:" : "Contacto para apoio, privacidade e questões legais:"}<br><a href="mailto:evchargeportugal@gmail.com">evchargeportugal@gmail.com</a></p><h3>${currentLanguage === "en" ? "Purpose" : "Objeto"}</h3><p>${currentLanguage === "en" ? "This service aggregates public information on electric-vehicle charging stations, estimated prices, availability and route planning. It does not sell electricity or represent station operators." : "Este serviço agrega informação pública sobre postos de carregamento, preços estimados, disponibilidade e planeamento de rotas. Não vende eletricidade nem representa os operadores dos postos."}</p><h3>${currentLanguage === "en" ? "Important notice" : "Aviso importante"}</h3><p>${currentLanguage === "en" ? "Availability, prices, power and route recommendations are informative estimates. Confirm information at the station and with the operator before charging." : "A disponibilidade, os preços, a potência e as recomendações de rota são estimativas informativas. Confirme sempre a informação no posto e junto do operador antes de carregar."}</p></div>`,
        },
        privacy: {
          title:
            currentLanguage === "en"
              ? "Privacy policy"
              : "Política de privacidade",
          html: `<div class="legal-demo"><h3>${currentLanguage === "en" ? "Controller and contact" : "Responsável e contacto"}</h3><p>Diogo Ferreira — ChargeVoy<br><a href="mailto:evchargeportugal@gmail.com">evchargeportugal@gmail.com</a></p><h3>${currentLanguage === "en" ? "Data we process" : "Dados que tratamos"}</h3><p>${currentLanguage === "en" ? "Account email and Google sign-in identity (when chosen), favourites, route history, vehicle and preferences, reviews/comments, and location only when permission is granted." : "Email da conta e identidade Google (quando escolhida), favoritos, histórico de rotas, veículo e preferências, avaliações/comentários e localização apenas quando a autorização é concedida."}</p><h3>${currentLanguage === "en" ? "Why and how long" : "Finalidades e conservação"}</h3><p>${currentLanguage === "en" ? "We use this data to authenticate you, synchronise your account, plan routes and provide requested features. Account data is retained while the account exists and is deleted when you delete the account." : "Usamos estes dados para autenticação, sincronização da conta, planeamento de rotas e funcionalidades pedidas. Os dados da conta são conservados enquanto a conta existir e eliminados quando elimina a conta."}</p><h3>${currentLanguage === "en" ? "Providers and analytics" : "Fornecedores e analítica"}</h3><p>${currentLanguage === "en" ? "Supabase (accounts and database), Cloudflare (hosting), Google (optional sign-in and Analytics only after consent), and public mapping/data providers used by features. No advertising is shown at launch." : "Supabase (contas e base de dados), Cloudflare (alojamento), Google (login opcional e Analytics apenas após consentimento) e fornecedores públicos de mapas/dados usados pelas funcionalidades. Não é apresentada publicidade no lançamento."}</p><h3>${currentLanguage === "en" ? "Your rights" : "Os seus direitos"}</h3><p>${currentLanguage === "en" ? "You may request access, correction or deletion at the contact above. You can delete your account in the app/site; signed-out users may email us." : "Pode pedir acesso, retificação ou eliminação através do contacto acima. Pode eliminar a conta no site/app; se não conseguir entrar, envie-nos um email."}</p></div>`,
        },
        cookies: {
          title:
            currentLanguage === "en" ? "Cookie policy" : "Política de cookies",
          html: `<div class="legal-demo"><p>${currentLanguage === "en" ? "The service uses essential local storage for language, consent and app preferences. Google Analytics is only loaded after you accept analytics cookies." : "O serviço usa armazenamento local essencial para idioma, consentimento e preferências da aplicação. O Google Analytics só é carregado depois de aceitar cookies analíticos."}</p><p>${currentLanguage === "en" ? "You can change your choice by clearing site data in your browser; a new choice will be requested." : "Pode alterar a sua escolha apagando os dados do site no navegador; será novamente pedido o consentimento."}</p></div>`,
        },
        terms: {
          title:
            currentLanguage === "en" ? "Terms of use" : "Termos de utilização",
          html: `<div class="legal-demo"><h3>${currentLanguage === "en" ? "Use at your own discretion" : "Utilização por sua conta e risco"}</h3><p>${currentLanguage === "en" ? "Route planning and charging information are not a guarantee of availability, compatibility, price or safety. You remain responsible for your vehicle, route and charging session." : "O planeamento de rota e a informação de carregamento não garantem disponibilidade, compatibilidade, preço ou segurança. Mantém-se responsável pelo seu veículo, rota e sessão de carregamento."}</p><h3>${currentLanguage === "en" ? "Sources" : "Fontes"}</h3><p>${currentLanguage === "en" ? "Data may come from NAP/MOBI.E, Open Charge Map, OpenStreetMap, Google services and community contributions. It may contain delays, errors or duplicates." : "Os dados podem provir de NAP/MOBI.E, Open Charge Map, OpenStreetMap, serviços Google e contributos comunitários. Podem conter atrasos, erros ou duplicados."}</p><h3>${currentLanguage === "en" ? "Changes" : "Alterações"}</h3><p>${currentLanguage === "en" ? "We may update the service and these terms. Material changes will be reflected on this page." : "Podemos atualizar o serviço e estes termos. Alterações materiais serão refletidas nesta página."}</p></div>`,
        },
        deletion: {
          title: currentLanguage === "en" ? "Delete account" : "Eliminar conta",
          html: `<div class="legal-demo"><h3>${currentLanguage === "en" ? "Delete from the app/site" : "Eliminar no site/app"}</h3><p>${currentLanguage === "en" ? "Sign in, open “My account” and select “Delete my account”. This permanently deletes the account and its associated favourites, route history, preferences and reviews." : "Entre na conta, abra “A minha conta” e escolha “Eliminar a minha conta”. Esta ação elimina permanentemente a conta e os favoritos, histórico de rotas, preferências e avaliações associados."}</p><h3>${currentLanguage === "en" ? "Cannot sign in?" : "Não consegue entrar?"}</h3><p>${currentLanguage === "en" ? "Email" : "Envie um email para"} <a href="mailto:evchargeportugal@gmail.com?subject=Pedido%20de%20elimina%C3%A7%C3%A3o%20de%20conta">evchargeportugal@gmail.com</a> ${currentLanguage === "en" ? "from the email address of your account, with subject “Account deletion request”." : "a partir do endereço associado à conta, com o assunto “Pedido de eliminação de conta”."}</p></div>`,
        },
      };
      function showLegalPage(type) {
        const page = legalPages[type] || legalPages.legal;
        openModal(page.title, page.html);
      }
      document
        .querySelectorAll("[data-legal]")
        .forEach((button) =>
          button.addEventListener("click", () =>
            showLegalPage(button.dataset.legal),
          ),
        );
      const quickHistory = document.getElementById("open-history");
      quickHistory.addEventListener("click", showHistory);
      quickHistory.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          showHistory();
        }
      });

