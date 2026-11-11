/* Juan Solo · Tickets — guarda la app en el teléfono para que el escáner
   funcione aunque en la fiesta no haya buena señal. */
var CACHE = "js-tickets-v1";
var SHELL = [
  "./", "index.html", "t.html", "app.js", "core.js", "tickets.css",
  "vendor/qrcode.js", "vendor/jsQR.js", "../ds/styles.css",
  "icons/icon-192.png", "icons/icon-512.png", "../dj/solo-music-logo.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
/* Red primero (para recibir actualizaciones); si no hay señal, la copia guardada. */
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match("index.html"); });
    })
  );
});
