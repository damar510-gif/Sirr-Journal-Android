/* Cache only this public launcher. Never intercept Google Apps Script traffic,
   journal data, authentication, arbitrary same-origin files or non-GET requests. */
importScripts('./identity.js');
const BASE = self.registration.scope;
const CACHE_PREFIX = 'sirr-shell:' + new URL(BASE).pathname + ':';
const CACHE = CACHE_PREFIX + 'v2';
const ASSETS = ['./', './index.html', './app.css', './app.js', './identity.js', './manifest.webmanifest', './app-icon-192.png', './app-icon-512.png', './connection.txt'];
const URLS = ASSETS.map(path => new URL(path, BASE).href);
const MANIFEST = new URL('./manifest.webmanifest', BASE).href;
const ICON192 = new URL('./app-icon-192.png', BASE).href;
const ICON512 = new URL('./app-icon-512.png', BASE).href;
const DB_NAME = 'sirr-shell-branding:' + new URL(BASE).pathname;
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('identity');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readBranding() {
  let db;
  try {
    db = await database();
    return await new Promise((resolve, reject) => {
      const request = db.transaction('identity').objectStore('identity').get('current');
      request.onsuccess = () => resolve(self.SirrIdentity.branding(request.result)); request.onerror = () => reject(request.error);
    });
  } catch (_) { return self.SirrIdentity.branding(null); }
  finally { if (db) db.close(); }
}
async function writeBranding(value) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('identity', 'readwrite');
      transaction.objectStore('identity').put(self.SirrIdentity.branding(value), 'current');
      transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(URLS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'sirr-branding' || !event.source || !event.source.url.startsWith(BASE)) return;
  event.waitUntil(writeBranding(event.data.branding).then(() => { if (event.ports[0]) event.ports[0].postMessage({ ok: true }); }).catch(() => { if (event.ports[0]) event.ports[0].postMessage({ ok: false }); }));
});
function manifest(brand) {
  return new Response(JSON.stringify({
    id: './', name: brand.name, short_name: Array.from(brand.name).slice(0, 20).join(''), description: 'مذكرتك الشخصية المشفرة، من أي جهاز بكلمة المرور',
    lang: 'ar', dir: 'rtl', start_url: './', scope: './', display: 'standalone', background_color: '#f4f6f1', theme_color: self.SirrIdentity.presets[brand.preset].color,
    icons: [ { src: './app-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' }, { src: './app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' } ]
  }), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
function png(data) {
  const binary = atob(data.split(',')[1]), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Response(bytes, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } });
}
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const clean = url.origin + url.pathname;
  if (!URLS.includes(clean)) return;
  event.respondWith((async () => {
    if (clean === MANIFEST) return manifest(await readBranding());
    if (clean === ICON192 || clean === ICON512) {
      const brand = await readBranding(), data = clean === ICON192 ? brand.icon192 : brand.icon512;
      if (data) return png(data);
    }
    try { return await fetch(request); }
    catch (_) {
      const cached = await (await caches.open(CACHE)).match(clean);
      if (!cached) return Response.error();
      const headers = new Headers(cached.headers); headers.set('X-Sirr-Offline', '1');
      return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
    }
  })());
});
