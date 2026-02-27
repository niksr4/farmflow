const CACHE_VERSION = "farmflow-pwa-v3"
const APP_SHELL_CACHE = `${CACHE_VERSION}-app-shell`
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`
const API_CACHE = `${CACHE_VERSION}-api`

const OFFLINE_URL = "/offline"
const SYNC_TAG = "farmflow-sync-writes"
const WRITE_QUEUE_DB = "farmflow-offline-db"
const WRITE_QUEUE_STORE = "writeQueue"
const MAX_WRITE_ATTEMPTS = 10

const APP_SHELL_ASSETS = [
  "/",
  "/dashboard",
  "/login",
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon.svg",
  "/apple-icon.png",
  "/icon-light-32x32.png",
  "/pwa-192x192.png",
  "/pwa-512x512.png",
]

const READ_API_PREFIXES = [
  "/api/inventory-neon",
  "/api/transactions-neon",
  "/api/accounts-totals",
  "/api/accounts-summary",
  "/api/processing-records",
  "/api/dispatch",
  "/api/sales",
  "/api/curing-records",
  "/api/quality-grading-records",
  "/api/pepper-records",
  "/api/rainfall",
  "/api/season-summary",
  "/api/exception-alerts",
  "/api/locations",
  "/api/weather",
  "/api/coffee-news",
  "/api/market-news",
  "/api/get-activity",
  "/api/labor-neon",
  "/api/expenses-neon",
  "/api/receivables",
  "/api/billing/invoices",
  "/api/tenant-modules",
  "/api/tenant-settings",
]

const WRITE_API_PREFIXES = [
  "/api/transactions-neon",
  "/api/processing-records",
  "/api/dispatch",
  "/api/sales",
  "/api/rainfall",
  "/api/pepper-records",
  "/api/curing-records",
  "/api/quality-grading-records",
  "/api/journal",
  "/api/receivables",
  "/api/labor-neon",
  "/api/expenses-neon",
  "/api/add-activity",
  "/api/locations",
]

const STATIC_ASSET_PATTERN = /\.(?:css|js|mjs|png|jpg|jpeg|svg|webp|avif|ico|woff|woff2|ttf)$/

const isMatchingPrefix = (pathname, prefixes) => {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

const shouldCacheResponse = (response) => {
  if (!response || !response.ok) return false
  const cacheControl = response.headers.get("Cache-Control") || ""
  return !cacheControl.toLowerCase().includes("no-store")
}

const notifyClients = async (payload) => {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
  for (const client of clients) {
    client.postMessage(payload)
  }
}

const openWriteQueueDb = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(WRITE_QUEUE_DB, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(WRITE_QUEUE_STORE)) {
        db.createObjectStore(WRITE_QUEUE_STORE, { keyPath: "id", autoIncrement: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const putQueuedRequest = async (entry) => {
  const db = await openWriteQueueDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(WRITE_QUEUE_STORE, "readwrite")
    tx.objectStore(WRITE_QUEUE_STORE).add(entry)
    tx.oncomplete = () => resolve(undefined)
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

const updateQueuedRequest = async (entry) => {
  const db = await openWriteQueueDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(WRITE_QUEUE_STORE, "readwrite")
    tx.objectStore(WRITE_QUEUE_STORE).put(entry)
    tx.oncomplete = () => resolve(undefined)
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

const deleteQueuedRequest = async (id) => {
  const db = await openWriteQueueDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(WRITE_QUEUE_STORE, "readwrite")
    tx.objectStore(WRITE_QUEUE_STORE).delete(id)
    tx.oncomplete = () => resolve(undefined)
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

const getQueuedRequests = async () => {
  const db = await openWriteQueueDb()
  const rows = await new Promise((resolve, reject) => {
    const tx = db.transaction(WRITE_QUEUE_STORE, "readonly")
    const request = tx.objectStore(WRITE_QUEUE_STORE).getAll()
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : [])
    request.onerror = () => reject(request.error)
  })
  db.close()
  return rows
}

const getQueuedCount = async () => {
  const db = await openWriteQueueDb()
  const count = await new Promise((resolve, reject) => {
    const tx = db.transaction(WRITE_QUEUE_STORE, "readonly")
    const request = tx.objectStore(WRITE_QUEUE_STORE).count()
    request.onsuccess = () => resolve(Number(request.result || 0))
    request.onerror = () => reject(request.error)
  })
  db.close()
  return count
}

const queueWriteRequest = async (request) => {
  const cloned = request.clone()
  const headers = {}
  for (const [key, value] of cloned.headers.entries()) {
    const normalized = key.toLowerCase()
    if (normalized === "content-length" || normalized === "host") continue
    headers[key] = value
  }

  let body = null
  if (cloned.method !== "GET" && cloned.method !== "HEAD") {
    try {
      body = await cloned.text()
    } catch {
      body = null
    }
  }

  await putQueuedRequest({
    url: cloned.url,
    method: cloned.method,
    headers,
    body,
    queuedAt: Date.now(),
    attempts: 0,
  })
}

const registerBackgroundSync = async () => {
  const syncManager = self.registration && self.registration.sync
  if (!syncManager || typeof syncManager.register !== "function") return
  try {
    await syncManager.register(SYNC_TAG)
  } catch {
    // No-op: browser may not support background sync.
  }
}

const flushWriteQueue = async () => {
  const entries = await getQueuedRequests()
  if (!entries.length) {
    await notifyClients({ type: "WRITE_QUEUE_FLUSHED", syncedCount: 0, remaining: 0 })
    return
  }

  let syncedCount = 0
  let droppedCount = 0

  for (const entry of entries) {
    const headers = new Headers(entry.headers || {})
    const init = {
      method: entry.method || "POST",
      headers,
      body: entry.body || undefined,
      credentials: "include",
    }

    try {
      const response = await fetch(entry.url, init)

      if (response.ok) {
        syncedCount += 1
        await deleteQueuedRequest(entry.id)
        continue
      }

      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        droppedCount += 1
        await deleteQueuedRequest(entry.id)
        continue
      }

      entry.attempts = Number(entry.attempts || 0) + 1
      entry.lastError = `HTTP_${response.status}`
      if (entry.attempts >= MAX_WRITE_ATTEMPTS) {
        droppedCount += 1
        await deleteQueuedRequest(entry.id)
      } else {
        await updateQueuedRequest(entry)
      }
    } catch (error) {
      entry.attempts = Number(entry.attempts || 0) + 1
      entry.lastError = String(error && error.message ? error.message : "network_error")
      if (entry.attempts >= MAX_WRITE_ATTEMPTS) {
        droppedCount += 1
        await deleteQueuedRequest(entry.id)
      } else {
        await updateQueuedRequest(entry)
      }
      // Stop flush on network failure; try again when connectivity returns.
      break
    }
  }

  const remaining = await getQueuedCount()
  await notifyClients({ type: "WRITE_QUEUE_FLUSHED", syncedCount, remaining })
  if (droppedCount > 0) {
    await notifyClients({ type: "WRITE_QUEUE_DROPPED", droppedCount })
  }
}

const networkFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (shouldCacheResponse(response)) {
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    throw new Error("Network unavailable and no cached response")
  }
}

const staleWhileRevalidate = async (request, cacheName) => {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  const fetchPromise = fetch(request)
    .then((response) => {
      if (shouldCacheResponse(response)) {
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => null)

  if (cached) {
    return cached
  }

  const fresh = await fetchPromise
  if (fresh) return fresh

  return new Response("Offline", { status: 503 })
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE)
      await cache.addAll(APP_SHELL_ASSETS)
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys()
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith("farmflow-pwa-") && !name.startsWith(CACHE_VERSION))
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
      await flushWriteQueue()
    })(),
  )
})

self.addEventListener("message", (event) => {
  const data = event.data || {}
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting()
    return
  }
  if (data.type === "FLUSH_WRITE_QUEUE") {
    event.waitUntil(flushWriteQueue())
  }
})

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(flushWriteQueue())
  }
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (request.cache === "only-if-cached" && request.mode !== "same-origin") {
    return
  }

  if (url.origin !== self.location.origin) {
    return
  }

  if (request.method === "GET") {
    if (request.mode === "navigate") {
      event.respondWith(
        (async () => {
          try {
            const response = await fetch(request)
            const cache = await caches.open(RUNTIME_CACHE)
            if (shouldCacheResponse(response)) {
              cache.put(request, response.clone())
            }
            return response
          } catch {
            const cachedPage = await caches.match(request)
            if (cachedPage) return cachedPage
            const offlinePage = await caches.match(OFFLINE_URL)
            if (offlinePage) return offlinePage
            return new Response("Offline", { status: 503 })
          }
        })(),
      )
      return
    }

    if (url.pathname.startsWith("/api/") && isMatchingPrefix(url.pathname, READ_API_PREFIXES)) {
      event.respondWith(networkFirst(request, API_CACHE))
      return
    }

    const isStaticAsset =
      url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/_next/image") ||
      url.pathname.startsWith("/resources/") ||
      url.pathname.startsWith("/images/") ||
      STATIC_ASSET_PATTERN.test(url.pathname)

    if (isStaticAsset) {
      event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE))
    }
    return
  }

  if (isMatchingPrefix(url.pathname, WRITE_API_PREFIXES)) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request.clone())
        } catch {
          try {
            await queueWriteRequest(request)
            await registerBackgroundSync()
            const pendingCount = await getQueuedCount()
            await notifyClients({ type: "WRITE_QUEUED", pendingCount })
            return new Response(
              JSON.stringify({
                success: true,
                queued: true,
                offline: true,
                pendingCount,
                message: "No network. Update queued and will sync automatically.",
              }),
              {
                status: 202,
                headers: {
                  "Content-Type": "application/json",
                  "X-FarmFlow-Queued": "1",
                },
              },
            )
          } catch {
            return new Response(
              JSON.stringify({
                success: false,
                queued: false,
                error: "Unable to queue request offline.",
              }),
              {
                status: 503,
                headers: { "Content-Type": "application/json" },
              },
            )
          }
        }
      })(),
    )
  }
})
