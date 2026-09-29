const CACHE_NAME='ev-charge-shell-v23';
const SHELL=['./','./index.html','./manifest.webmanifest','./icon.svg','./assets/chargevoy.css?v=17','./assets/chargevoy.js?v=23','./assets/ceme-cards.json','./assets/vehicle-catalog.json?v=1','./assets/route-corridor.js?v=17'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put('./index.html',copy));return response}).catch(()=>caches.match('./index.html')));
    return;
  }
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/')){
    // Availability can change every few minutes. Never replay a cached API
    // response as though it were the current status.
    event.respondWith(fetch(event.request));
    return;
  }
  if(url.pathname.endsWith('/assets/stations-snapshot.json')){
    // Refresh the structural catalogue on every visit. The last complete
    // version remains available when a network request fails.
    event.respondWith(fetch(event.request).then(response=>{
      if(!response.ok)throw new Error('Station snapshot unavailable');
      const copy=response.clone();
      caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
      return response;
    }).catch(()=>caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(response.ok)caches.open(CACHE_NAME).then(cache=>cache.put(event.request,response.clone()));
    return response;
  })));
});
