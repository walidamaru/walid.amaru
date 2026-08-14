// Service Worker — Carnet Clients
// Met en cache la bibliothèque ZXing (lecture QR/Data Matrix) et la page de l'application
// afin qu'elles restent disponibles même sans connexion internet, après une première
// visite réussie (avec connexion).

const CACHE_NAME = 'carnet-clients-cache-v3';

// Fichiers essentiels à mettre en cache dès l'installation.
// Le chemin relatif './' et './index.html' couvre la page de l'application elle-même ;
// l'URL ZXing couvre la bibliothèque externe utilisée pour le scan QR/Data Matrix.
const PRECACHE_URLS = [
  './',
  './index.html',
  'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // On tente chaque ressource individuellement : si l'une échoue (ex. pas de réseau
      // au tout premier chargement), les autres sont quand même mises en cache.
      return Promise.all(
        PRECACHE_URLS.map((url) =>
          fetch(url, { mode: url.startsWith('http') ? 'cors' : 'same-origin' })
            .then((response) => {
              if (response && response.ok) {
                return cache.put(url, response);
              }
            })
            .catch(() => { /* silencieux : on retentera au fil des visites en ligne */ })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// La page HTML elle-même change souvent (mises à jour de l'app) : on la sert en
// "réseau d'abord" pour toujours avoir la dernière version quand il y a du réseau,
// et on ne retombe sur la version en cache qu'en cas d'échec (hors-ligne).
function isAppShellRequest(req){
  if(req.mode === 'navigate') return true;
  const url = new URL(req.url);
  return url.origin === self.location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('index.html'));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (isAppShellRequest(req)) {
    // Réseau d'abord (pour toujours avoir les dernières modifications), cache en secours hors-ligne.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Pour le reste (bibliothèques externes comme ZXing) : cache d'abord, réseau en secours.
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
