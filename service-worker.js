// Simple PWA Service Worker
const CACHE = 'budget-pwa-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];
self.addEventListener('install', (e)=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});
self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE && caches.delete(k)))).then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch', (e)=>{
  const { request } = e;
  e.respondWith(
    caches.match(request).then(cached => {
      const fetchPromise = fetch(request).then(networkRes => {
        const copy = networkRes.clone();
        caches.open(CACHE).then(c=>{ c.put(request, copy); });
        return networkRes;
      }).catch(()=> cached);
      return cached || fetchPromise;
    })
  );
});
