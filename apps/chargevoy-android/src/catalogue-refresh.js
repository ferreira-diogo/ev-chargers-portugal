(function (scope) {
  'use strict';
  const url = 'https://broken-mud-373e.zombid.workers.dev/assets/stations-snapshot.json';
  const checkKey = 'chargevoy-catalogue-checked';
  function validate(payload, previous = null, now = Date.now()) {
    if (!Array.isArray(payload?.stations) || payload.stations.length < 8000 ||
        !Array.isArray(payload.connectors) || payload.connectors.length < 15000) return false;
    const date = Date.parse(payload.publication_time);
    if (!Number.isFinite(date) || date > now + 300000) return false;
    if (previous && (date < Date.parse(previous.publication_time) ||
        payload.stations.length < previous.stations.length * .95 ||
        payload.connectors.length < previous.connectors.length * .95)) return false;
    const ids = new Set(), connectors = new Set();
    for (const row of payload.stations) {
      if (typeof row?.id !== 'string' || !row.id || ids.has(row.id) || typeof row.latitude !== 'number' ||
          typeof row.longitude !== 'number' || !Number.isFinite(row.latitude) ||
          !Number.isFinite(row.longitude) || row.latitude < 30 || row.latitude > 43 ||
          row.longitude < -32 || row.longitude > -5) return false;
      ids.add(row.id);
    }
    for (const row of payload.connectors) {
      if (typeof row?.id !== 'string' || !row.id || connectors.has(row.id) || !ids.has(row.station_id)) return false;
      connectors.add(row.id);
    }
    return true;
  }
  async function storage(value) {
    // The national JSON exceeds localStorage quotas on some Android devices.
    // A transaction keeps the previous complete copy if the write fails.
    if (!scope.indexedDB) return null;
    return new Promise(resolve => {
      const request = scope.indexedDB.open('chargevoy-catalogue', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('snapshots', value ? 'readwrite' : 'readonly');
        const operation = value ? tx.objectStore('snapshots').put(value, 'national') : tx.objectStore('snapshots').get('national');
        tx.oncomplete = () => { db.close(); resolve(value || operation.result || null); };
        tx.onerror = tx.onabort = () => { db.close(); resolve(null); };
      };
    });
  }
  async function request() {
    const http = scope.Capacitor?.Plugins?.CapacitorHttp;
    if (scope.Capacitor?.isNativePlatform?.() && http) {
      // Native GET avoids cross-origin restrictions for the public static asset.
      const response = await http.get({url, connectTimeout: 15000, readTimeout: 15000, responseType: 'json'});
      if (response.status !== 200) throw Error('Catalogue HTTP ' + response.status);
      return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    }
    const response = await fetch(url, {cache: 'no-cache', signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw Error('Catalogue HTTP ' + response.status);
    return response.json();
  }
  async function refresh(previous, install) {
    let checked = 0;
    try { checked = Number(scope.localStorage.getItem(checkKey)) || 0; } catch {}
    if (checked <= Date.now() && Date.now() - checked < 24 * 3600000) return false;
    try {
      const payload = await request();
      if (!validate(payload, validate(previous) ? previous : null)) throw Error('Incomplete or regressive catalogue');
      if (!previous || Date.parse(payload.publication_time) > Date.parse(previous.publication_time)) {
        const persisted = await storage(payload);
        install(payload);
        // Retry on the next launch when persistence fails; otherwise the older
        // packaged copy would suppress refresh for a day after a quota error.
        if (!persisted) return true;
      }
      try { scope.localStorage.setItem(checkKey, String(Date.now())); } catch {}
      return true;
    } catch (error) { console.warn('Catalogue refresh: retaining offline copy', error.message); return false; }
  }
  scope.ChargeVoyCatalogue = {validate, read: () => storage(), write: storage, refresh};
})(globalThis);
