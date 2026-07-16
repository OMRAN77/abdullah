// Minimal service worker: network-first, ignore non-GET (same strategy as
// the other apps in this family).
const CACHE = 'abdullah-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { self.clients.claim(); });
self.addEventListener('fetch', (event) => {
  if(event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).then((res) => {
      const clone = res.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, clone)).catch(()=>{});
      return res;
    }).catch(() => caches.match(event.request))
  );
});
