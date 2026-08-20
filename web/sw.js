const CACHE_NAME = "gongyo-trainer-v22";
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
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => Promise.allSettled(clients.map((client) => client.navigate(client.url)))),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.headers.has("range")) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.status === 200 && response.type === "basic") {
          await cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch (error) {
        const exactPage = await cache.match(request);
        if (exactPage) return exactPage;
        const ritualPage = await cache.match(new URL("./ritual.html", self.registration.scope).href);
        if (ritualPage) return ritualPage;
        throw error;
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.status === 200 && response.type === "basic") {
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  })());
});
