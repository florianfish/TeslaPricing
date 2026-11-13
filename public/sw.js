// Service worker de l'application installable (PWA).
// Chemins relatifs à son emplacement : l'application peut être servie sous un préfixe inconnu (Ingress Home Assistant).
//
// - Pages : réseau d'abord, repli sur la dernière page d'accueil enregistrée (hors connexion).
// - API (GET) : réseau d'abord, repli sur la dernière réponse enregistrée, marquée par l'en-tête
//   « X-SW-Cached-At » (date d'enregistrement) pour que l'interface signale des données hors connexion.
// - Fichiers de l'application, polices, feuille Leaflet : cache d'abord, rafraîchi en arrière-plan.
// - Tuiles de carte et tout le reste : non interceptés.

const VERSION = 'v1';
const PAGES = `pages-${VERSION}`;
const API = `api-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const CACHES = [PAGES, API, ASSETS];
const MAX_ASSETS = 80;
const CACHED_AT = 'X-SW-Cached-At';

const scopeUrl = new URL(self.registration.scope);
const APP_SHELL = new URL('./', scopeUrl).href;
const PRECACHE = ['./', 'manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png'].map((p) => new URL(p, scopeUrl).href);

// Ressources tierces mises en cache : polices Google et feuille de style Leaflet
const CACHEABLE_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'unpkg.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    // Un fichier introuvable ne doit pas empêcher l'installation (allSettled plutôt que addAll)
    caches
      .open(PAGES)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !CACHES.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === scopeUrl.origin) {
    if (!url.href.startsWith(scopeUrl.href)) return;
    const relative = url.pathname.slice(scopeUrl.pathname.length);
    if (request.mode === 'navigate') {
      event.respondWith(networkFirstPage(request));
    } else if (relative.startsWith('api/')) {
      event.respondWith(networkFirstApi(request));
    } else if (relative !== 'sw.js') {
      event.respondWith(staleWhileRevalidate(event, request));
    }
  } else if (CACHEABLE_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event, request));
  }
});

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    // Page d'accueil enregistrée comme coquille hors connexion (les pages station l'ouvrent aussi)
    if (response.ok && new URL(request.url).pathname === scopeUrl.pathname) {
      await cache.put(APP_SHELL, response.clone());
    }
    return response;
  } catch (err) {
    return (await cache.match(request, { ignoreSearch: true })) || (await cache.match(APP_SHELL)) || offlineResponse();
  }
}

async function networkFirstApi(request) {
  const cache = await caches.open(API);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, await stamp(response.clone()));
    return response;
  } catch (err) {
    return (await cache.match(request)) || offlineResponse(true);
  }
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then(async (response) => {
      // Réponses opaques (tierces sans CORS) acceptées : polices et feuille Leaflet
      if (response.ok || response.type === 'opaque') {
        await cache.put(request, response.clone());
        await trim(cache);
      }
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return (await refresh) || offlineResponse();
}

// Copie de la réponse avec sa date d'enregistrement
async function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT, new Date().toISOString());
  return new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers });
}

// Les fichiers de l'application changent de nom à chaque version : garder les plus récents
async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((key) => cache.delete(key)));
}

function offlineResponse(json = false) {
  return json
    ? new Response(JSON.stringify({ error: 'Hors connexion' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
    : new Response('Hors connexion', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
