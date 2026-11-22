const CACHE = 'uchet-v22';
const ASSETS = [
  './', './index.html', './css/style.css', 
  './js/app.js', './js/db.js', './js/xlsx.full.min.js',
  './manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((cache) => {
      return Promise.all(
        ASSETS.map(url => {
          return fetch(url).then(response => {
            if (response.ok) return cache.put(url, response);
          }).catch(err => console.log('Ошибка кэша:', url));
        })
      );
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// СТРАТЕГИЯ NETWORK FIRST: сначала пытаемся скачать из интернета, если нет - берем из кэша
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Если сеть работает, обновляем кэш и возвращаем свежий файл
        const responseClone = response.clone();
        caches.open(CACHE).then((cache) => {
          cache.put(e.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // Если интернета нет, отдаем то, что сохранено в памяти
        return caches.match(e.request);
      })
  );
});
