const CACHE_NAME = "gongyo-trainer-v18";
const APP_SHELL = [
  "./index.html",
  "./syllables.html",
  "./src/syllables.css",
  "./src/syllables.js",
  "./assets/syllables.5-wide.txt",
  "./ritual.html",
  "./src/ritual.css",
  "./src/ritual.js",
  "./assets/ritual.txt",
  "./manifest.webmanifest",
  "./assets/icons/gongyo-icon-192.png",
  "./assets/icons/gongyo-icon-512.png",
  "./assets/icons/gongyo-icon.svg",
  "./assets/icons/gongyo-icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names
        .filter((name) => (name.startsWith("gongyo-syllables-") || name.startsWith("gongyo-trainer-")) && name !== CACHE_NAME)
        .map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") return response;
        const responseForCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseForCache));
        return response;
      });
    }),
  );
});
