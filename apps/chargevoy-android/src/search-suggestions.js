// Photon supports search-as-you-type; do not autocomplete using public Nominatim.
(() => {
  for (const id of ['location-search', 'route-origin', 'route-destination']) {
    const input = document.getElementById(id);
    if (!input) continue;
    const box = document.createElement('div');
    box.className = 'android-search-suggestions'; box.hidden = true;
    box.setAttribute('role', 'listbox'); box.id = `${id}-suggestions`;
    input.after(box); input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-controls', box.id);
    input.setAttribute('aria-expanded', 'false');
    let timer, controller, generation = 0, selected = -1;
    const cache = new Map();
    function hide() { box.hidden = true; input.setAttribute('aria-expanded', 'false'); selected = -1; }
    function choose(place) {
      input.value = place.label;
      input.dispatchEvent(new Event('input', {bubbles: true}));
      if (id === 'route-origin') routeOriginOverride = {...place, input: place.label};
      if (id === 'route-destination') routeDestinationOverride = {...place, input: place.label};
      if (id === 'location-search') { searchPosition = {...place, input: place.label}; renderStations(true); }
      clearTimeout(timer); controller?.abort(); generation++; hide();
    }
    input.addEventListener('focus', () => {
      if (input.value === 'A minha localização') input.select();
    });
    input.addEventListener('beforeinput', event => {
      if (input.value !== 'A minha localização' || !event.inputType.startsWith('insert')) return;
      input.value = ''; input.dispatchEvent(new Event('input', {bubbles: true}));
    });
    input.addEventListener('input', () => {
      clearTimeout(timer); controller?.abort(); const sequence = ++generation;
      if (id === 'location-search') searchPosition = null;
      hide(); const query = input.value.trim();
      if (query.length < 3 || query === 'A minha localização') return;
      timer = setTimeout(async () => {
        box.replaceChildren(); box.hidden = false; box.textContent = 'A procurar locais…'; input.setAttribute('aria-expanded', 'true');
        try {
          let places = cache.get(query.toLowerCase());
          if (!places) {
            controller = new AbortController();
            const response = await fetch(`https://photon.komoot.io/api/?${new URLSearchParams({q: query, limit: '8', lat: '39.5', lon: '-8', lang: 'en'})}`, {signal: controller.signal});
            if (!response.ok) throw Error('Pesquisa temporariamente indisponível.');
            const data = await response.json();
            places = (data.features || []).filter(f => f.properties?.countrycode?.toLowerCase() === 'pt' && f.geometry?.coordinates?.every(Number.isFinite)).map(f => ({lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], label: [...new Set([f.properties.name, f.properties.city, f.properties.state].filter(Boolean))].join(', ')}));
            cache.set(query.toLowerCase(), places); if (cache.size > 50) cache.delete(cache.keys().next().value);
          }
          if (sequence !== generation) return;
          box.replaceChildren();
          if (!places.length) { box.textContent = 'Sem sugestões. Pode escrever o local completo e pesquisar.'; return; }
          for (const place of places) {
            const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'option'); button.textContent = place.label;
            button.addEventListener('pointerdown', event => event.preventDefault()); button.addEventListener('click', () => choose(place)); box.append(button);
          }
        } catch (error) { if (sequence === generation && error.name !== 'AbortError') box.textContent = 'Sugestões indisponíveis. Pode pesquisar pelo nome completo.'; }
      }, 700);
    });
    input.addEventListener('keydown', event => {
      const options = [...box.querySelectorAll('button')];
      if (event.key === 'Escape') { generation++; controller?.abort(); clearTimeout(timer); hide(); }
      if (options.length && !box.hidden && ['ArrowDown','ArrowUp','Enter'].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.key === 'Enter') { if (selected >= 0) options[selected].click(); return; }
        selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options.forEach((option, index) => { option.setAttribute('aria-selected', index === selected ? 'true' : 'false'); });
      }
    }, true);
    input.addEventListener('blur', () => { generation++; controller?.abort(); clearTimeout(timer); setTimeout(hide, 150); });
  }
})();
