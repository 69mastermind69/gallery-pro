
"use strict";

const CACHE_VERSION = "mastermind-gallery-v2";
const LIBRARY_CACHE = "mastermind-gallery-libraries-v1";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./photo-editor.html",
  "./video-editor.html",
  "./pdf-tool.html",
  "./qr-tool.html",
  "./backup-tool.html"
];

const OFFLINE_LIBRARIES = [
  "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js",
  "https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js"
];

const LIBRARY_URLS = new Set(OFFLINE_LIBRARIES);

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
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
            name !== CACHE_VERSION &&
            name !== LIBRARY_CACHE
          )
          .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

async function cacheLibrary(request) {
  const cache = await caches.open(LIBRARY_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);

  if (response.ok || response.type === "opaque") {
    try {
      await cache.put(request, response.clone());
    } catch (error) {
      console.warn("Library cache failed:", error);
    }
  }

  return response;
}

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Cache selected third-party libraries for later offline use.
  if (LIBRARY_URLS.has(url.href)) {
    event.respondWith(
      cacheLibrary(request).catch(async () => {
        const cache = await caches.open(LIBRARY_CACHE);
        const cached = await cache.match(request);

        if (cached) {
          return cached;
        }

        return new Response(
          "এই লাইব্রেরি এখনো অফলাইনে সংরক্ষিত হয়নি। ইন্টারনেট চালু করে টুলটি আবার খোলো।",
          {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          }
        );
      })
    );
    return;
  }

  // Do not cache unrelated external websites.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Navigation: try the network, then use the cached page.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);

      try {
        const response = await fetch(request);

        if (response.ok) {
          const path = url.pathname;
          const isAppPage =
            path.endsWith("/") ||
            APP_FILES.some(file =>
              new URL(file, self.registration.scope).pathname === path
            );

          if (isAppPage) {
            await cache.put(request, response.clone());
          }
        }

        return response;
      } catch (error) {
        const cachedPage = await cache.match(request, {
          ignoreSearch: true
        });

        if (cachedPage) {
          return cachedPage;
        }

        const relativePath = url.pathname.startsWith(
          new URL(self.registration.scope).pathname
        )
          ? "./" + url.pathname.slice(
              new URL(self.registration.scope).pathname.length
            )
          : "./index.html";

        const fallback = await cache.match(relativePath);

        if (fallback) {
          return fallback;
        }

        return new Response(
          "অফলাইন পৃষ্ঠা পাওয়া যায়নি। ইন্টারনেট চালু করে অ্যাপটি একবার খোলো।",
          {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          }
        );
      }
    })());
    return;
  }

  // Other same-origin resources: cache first, then network.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request);

    if (cached) {
      return cached;
    }

    const response = await fetch(request);

    if (response.ok && response.type === "basic") {
      await cache.put(request, response.clone());
    }

    return response;
  })());
});
