// Bump this whenever you ship a new build so old caches get cleared out.
const CACHE_VERSION = "viec-cua-toi-v2";
// Phông chữ Google (Plus Jakarta Sans / JetBrains Mono) được nhớ riêng, không bị xoá mỗi lần đổi CACHE_VERSION,
// để app cài trên điện thoại vẫn hiện đúng phông khi ngoại tuyến.
const FONT_CACHE = "viec-cua-toi-fonts-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.json", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION && k !== FONT_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Phông chữ Google: cache-first (file phông không đổi theo URL), chỉ lưu phản hồi hợp lệ.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ||
            fetch(request).then((response) => {
              if (response && (response.status === 200 || response.type === "opaque")) {
                cache.put(request, response.clone());
              }
              return response;
            })
        )
      )
    );
    return;
  }

  // Never cache API calls (Supabase, storage, etc.) — always go to the network
  // so data stays live. Only cache same-origin app-shell/static assets.
  if (url.origin !== self.location.origin) return;

  // Navigation requests: try network first, fall back to cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Static assets: cache-first, then update the cache in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
