const CACHE_NAME = 'adzan-cache-v3';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './assets/gambar/favicon.png',
  './assets/gambar/favicon.svg',
  './assets/gambar/header_bg.png',
  './assets/gambar/verified.png',
  './assets/audio/marimba_soft.mp3'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Langsung ambil alih
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName); // Hapus cache versi lama
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Tetap utamakan jaringan (Network First) baik API maupun Aset selama masa development
  event.respondWith(
    fetch(event.request).then(response => {
      // Simpan backup diam-diam
      if(!event.request.url.includes('api.aladhan')){
        const resClone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, resClone));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
