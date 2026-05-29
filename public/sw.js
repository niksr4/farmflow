const CACHE_VERSION = "v1"
const STATIC_CACHE = `farmflow-static-${CACHE_VERSION}`
const IMAGE_CACHE = `farmflow-images-${CACHE_VERSION}`

// Assets that are safe to cache indefinitely — they have content hashes in their URLs
const STATIC_EXTENSIONS = [".js", ".css", ".woff", ".woff2"]
// Image extensions we cache in a separate store with a max-size eviction strategy
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".svg", ".webp", ".avif"]

const MAX_IMAGE_CACHE_ENTRIES = 60

const isStaticAsset = (url) =>
  STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext)) ||
  url.pathname.startsWith("/_next/static/")

const isImage = (url) =>
  IMAGE_EXTENSIONS.some((ext) => url.pathname.endsWith(ext))

const isSameOrigin = (url) => url.origin === self.location.origin

// ── Install: no pre-caching — we populate caches lazily on first fetch ─────
self.addEventListener("install", () => {
  self.skipWaiting()
})

// ── Activate: clean up caches from old versions ─────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => k.startsWith("farmflow-") && k !== STATIC_CACHE && k !== IMAGE_CACHE)
          .map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

// ── Fetch: cache-first for static + images, network-first for everything else ─
self.addEventListener("fetch", (event) => {
  // Only handle GET requests to our own origin
  if (event.request.method !== "GET") return

  let url
  try {
    url = new URL(event.request.url)
  } catch {
    return
  }

  if (!isSameOrigin(url)) return
  // Never intercept API routes or auth — always go to network
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ingest/")) return

  if (isStaticAsset(url)) {
    // Cache-first: hashed assets never change
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request)
        if (cached) return cached
        const response = await fetch(event.request)
        if (response.ok) cache.put(event.request, response.clone())
        return response
      }),
    )
    return
  }

  if (isImage(url)) {
    // Cache-first with entry-count eviction
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request)
        if (cached) return cached
        const response = await fetch(event.request)
        if (response.ok) {
          cache.put(event.request, response.clone())
          // Evict oldest entries if cache grows too large
          cache.keys().then((keys) => {
            if (keys.length > MAX_IMAGE_CACHE_ENTRIES) {
              cache.delete(keys[0])
            }
          })
        }
        return response
      }),
    )
    return
  }

  // Everything else (HTML, API-like pages): network-first, no caching
})
