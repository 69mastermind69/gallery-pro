
"use strict";

const CACHE_NAME = "mastermind-gallery-v2";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./qr-tool.html",
  "./pdf-tool.html",
  "./backup-tool.html",
  "./photo-editor.html",
  "./video-editor.html"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names
          .filter(name =>
            name.startsWith("mastermind-gallery-") &&
            name !== CACHE_NAME
          )
          .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  /*
   * Third-party JavaScript libraries:
   * Once loaded online, keep a copy in Cache Storage.
   * This includes the QR and PDF libraries used by the app.
   */
  if (!sameOrigin) {
    if (request.destination !== "script") return;

    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);

      if (cached) return cached;

      try {
        const response = await fetch(request);

        if (response.ok || response.type === "opaque") {
          try {
            await cache.put(request, response.clone());
          } catch (error) {
            console.warn("Could not cache external script:", error);
          }
        }

        return response;
      } catch (error) {
        return new Response(
          "This library has not been cached yet. Connect to the internet and open this tool once.",
          {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          }
        );
      }
    })());

    return;
  }

  /*
   * Page navigation:
   * Try the network first to get updates, then use the offline cache.
   */
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);

      try {
        const response = await fetch(request);

        if (response.ok) {
          try {
            await cache.put(request, response.clone());
          } catch (error) {
            console.warn("Could not cache page:", error);
          }
        }

        return response;
      } catch (error) {
        const cachedPage = await cache.match(request, {
          ignoreSearch: true
        });

        if (cachedPage) return cachedPage;

        const path = url.pathname;
        const knownFile = APP_FILES.find(file => {
          if (file === "./") return false;
          return path.endsWith(file.slice(1));
        });

        if (knownFile) {
          const knownCached = await cache.match(knownFile);
          if (knownCached) return knownCached;
        }

        const home = await cache.match("./index.html");
        if (home) return home;

        return new Response(
          "Gallery Pro is offline and this page has not been cached yet. Open it once while online.",
          {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          }
        );
      }
    })());

    return;
  }

  /*
   * Same-origin files:
   * Cache first for speed and offline use; fetch and cache if missing.
   */
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    if (cached) return cached;

    try {
      const response = await fetch(request);

      if (response.ok && response.type === "basic") {
        try {
          await cache.put(request, response.clone());
        } catch (error) {
          console.warn("Could not cache resource:", error);
        }
      }

      return response;
    } catch (error) {
      return new Response("Resource unavailable offline.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
  })());
});
