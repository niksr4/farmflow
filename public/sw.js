const CACHE_VERSION = "farmflow-pwa-v4"
const APP_SHELL_CACHE = `${CACHE_VERSION}-app-shell`
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`
const API_CACHE = `${CACHE_VERSION}-api`

const OFFLINE_URL = "/offline"
const SYNC_TAG = "farmflow-sync-writes"
const WRITE_QUEUE_DB = "farmflow-offline-db"
const WRITE_QUEUE_STORE = "writeQueue"
const MAX_WRITE_ATTEMPTS = 10
const DEFAULT_READ_API_TIMEOUT_MS = 3500
const DEFAULT_WRITE_TIMEOUT_MS = 12000
const MAX_WRITE_QUEUE_ENTRIES = 400
const WRITE_DEDUPE_WINDOW_MS = 30 * 1000
const MIN_TIMEOUT_MS = 800
const MAX_TIMEOUT_MS = 30000
const AUTH_REQUIRED_STATUSES = new Set([401, 403])
const REVIEW_REQUIRED_STATUSES = new Set([400, 404, 409, 410, 412, 422])
let runtimeConfig = {
  navigationCache: true,
  staticAssetCache: true,
  readApiCache: true,
  writeQueue: true,
  readApiTimeoutMs: DEFAULT_READ_API_TIMEOUT_MS,
  writeTimeoutMs: DEFAULT_WRITE_TIMEOUT_MS,
  maxWriteQueueEntries: MAX_WRITE_QUEUE_ENTRIES,
}

const toBooleanFlag = (value, defaultValue = true) => {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (normalized === "true") return true
    if (normalized === "false") return false
  }
  return defaultValue
}

const toNumberFlag = (value, defaultValue) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return defaultValue
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.floor(parsed)))
}

const toQueueLimit = (value, defaultValue) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return defaultValue
  return Math.max(50, Math.min(2000, Math.floor(parsed)))
}

const applyRuntimeConfig = (nextValue = {}) => {
  runtimeConfig = {
    navigationCache: toBooleanFlag(nextValue.navigationCache, runtimeConfig.navigationCache),
    staticAssetCache: toBooleanFlag(nextValue.staticAssetCache, runtimeConfig.staticAssetCache),
    readApiCache: toBooleanFlag(nextValue.readApiCache, runtimeConfig.readApiCache),
    writeQueue: toBooleanFlag(nextValue.writeQueue, runtimeConfig.writeQueue),
    readApiTimeoutMs: toNumberFlag(nextValue.readApiTimeoutMs, runtimeConfig.readApiTimeoutMs),
    writeTimeoutMs: toNumberFlag(nextValue.writeTimeoutMs, runtimeConfig.writeTimeoutMs),
    maxWriteQueueEntries: toQueueLimit(nextValue.maxWriteQueueEntries, runtimeConfig.maxWriteQueueEntries),
  }
}

const APP_SHELL_ASSETS = [
  "/",
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

const clearQueuedRequests = async () => {
  const db = await openWriteQueueDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(WRITE_QUEUE_STORE, "readwrite")
    tx.objectStore(WRITE_QUEUE_STORE).clear()
    tx.oncomplete = () => resolve(undefined)
    tx.onerror = () => reject(tx.error)
  })
  db.close()
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

const clearSensitiveData = async () => {
  await Promise.all([caches.delete(API_CACHE), clearQueuedRequests()])
  await notifyClients({ type: "SENSITIVE_DATA_CLEARED" })
}

const buildWriteSignature = (method, url, body) => `${String(method || "POST").toUpperCase()}::${String(url || "")}::${String(body || "")}`

const trimQueueIfNeeded = async (maxEntries) => {
  const entries = await getQueuedRequests()
  if (entries.length <= maxEntries) return 0
  const toDrop = [...entries]
    .sort((a, b) => Number(a.queuedAt || 0) - Number(b.queuedAt || 0))
    .slice(0, Math.max(0, entries.length - maxEntries))
  for (const entry of toDrop) {
    await deleteQueuedRequest(entry.id)
  }
  return toDrop.length
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

  const queuedAt = Date.now()
  const signature = buildWriteSignature(cloned.method, cloned.url, body)
  const existingEntries = await getQueuedRequests()
  const duplicate = existingEntries.find(
    (entry) =>
      String(entry.signature || "") === signature &&
      queuedAt - Number(entry.queuedAt || 0) <= WRITE_DEDUPE_WINDOW_MS,
  )
  if (duplicate) {
    return {
      queued: false,
      duplicate: true,
      pendingCount: existingEntries.length,
      trimmedCount: 0,
    }
  }

  await putQueuedRequest({
    url: cloned.url,
    method: cloned.method,
    headers,
    body,
    signature,
    queuedAt,
    attempts: 0,
  })

  const trimmedCount = await trimQueueIfNeeded(runtimeConfig.maxWriteQueueEntries)
  const pendingCount = await getQueuedCount()
  return {
    queued: true,
    duplicate: false,
    pendingCount,
    trimmedCount,
  }
}

const isAuthRequiredStatus = (status) => AUTH_REQUIRED_STATUSES.has(Number(status || 0))

const isReviewRequiredStatus = (status) => REVIEW_REQUIRED_STATUSES.has(Number(status || 0))

const toQueueEntrySummary = (entry) => {
  const url = String(entry?.url || "")
  let pathname = url
  try {
    pathname = new URL(url, self.location.origin).pathname
  } catch {
    pathname = url
  }
  return {
    id: Number(entry?.id || 0),
    method: String(entry?.method || "POST").toUpperCase(),
    url,
    pathname,
    queuedAt: Number(entry?.queuedAt || 0),
    attempts: Number(entry?.attempts || 0),
    lastError: String(entry?.lastError || ""),
    lastStatus: Number(entry?.lastStatus || 0) || null,
    blockedReason: String(entry?.blockedReason || ""),
  }
}

const classifyQueuedEntries = (entries) => {
  const blockedAuthEntries = []
  const blockedReviewEntries = []
  for (const entry of entries) {
    const summary = toQueueEntrySummary(entry)
    const status = Number(summary.lastStatus || 0)
    if (summary.blockedReason === "auth_required" || isAuthRequiredStatus(status)) {
      blockedAuthEntries.push(summary)
      continue
    }
    if (summary.blockedReason === "review_required" || isReviewRequiredStatus(status)) {
      blockedReviewEntries.push(summary)
    }
  }
  return { blockedAuthEntries, blockedReviewEntries }
}

const reportWriteQueueStatus = async (reason = "manual") => {
  const entries = await getQueuedRequests()
  const ordered = [...entries].sort((a, b) => Number(a.queuedAt || 0) - Number(b.queuedAt || 0))
  const { blockedAuthEntries, blockedReviewEntries } = classifyQueuedEntries(ordered)
  await notifyClients({
    type: "WRITE_QUEUE_STATUS",
    reason,
    pendingCount: ordered.length,
    blockedAuthCount: blockedAuthEntries.length,
    blockedReviewCount: blockedReviewEntries.length,
    blockedAuthEntries: blockedAuthEntries.slice(0, 8),
    blockedReviewEntries: blockedReviewEntries.slice(0, 12),
    updatedAt: Date.now(),
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
  const entries = (await getQueuedRequests()).sort((a, b) => Number(a.queuedAt || 0) - Number(b.queuedAt || 0))
  if (!entries.length) {
    await notifyClients({ type: "WRITE_QUEUE_FLUSHED", syncedCount: 0, remaining: 0 })
    return
  }

  let syncedCount = 0
  let droppedCount = 0
  let authRequiredCount = 0
  let authRequiredStatus = 0
  let reviewRequiredCount = 0

  for (const entry of entries) {
    const headers = new Headers(entry.headers || {})
    const init = {
      method: entry.method || "POST",
      headers,
      body: entry.body || undefined,
      credentials: "include",
    }

    try {
      const response = await fetchWithTimeout(entry.url, runtimeConfig.writeTimeoutMs, init)

      if (response.ok) {
        syncedCount += 1
        await deleteQueuedRequest(entry.id)
        continue
      }

      const status = Number(response.status || 0)
      if (isAuthRequiredStatus(status)) {
        authRequiredCount += 1
        authRequiredStatus = status
        entry.lastError = `HTTP_${status}`
        entry.lastStatus = status
        entry.blockedReason = "auth_required"
        await updateQueuedRequest(entry)
        // Stop here: remaining queued writes likely need a valid signed-in session.
        break
      }

      if (isReviewRequiredStatus(status)) {
        reviewRequiredCount += 1
        entry.lastError = `HTTP_${status}`
        entry.lastStatus = status
        entry.blockedReason = "review_required"
        await updateQueuedRequest(entry)
        continue
      }

      entry.attempts = Number(entry.attempts || 0) + 1
      entry.lastError = `HTTP_${status}`
      entry.lastStatus = status
      entry.blockedReason = null
      if (entry.attempts >= MAX_WRITE_ATTEMPTS) {
        droppedCount += 1
        await deleteQueuedRequest(entry.id)
      } else {
        await updateQueuedRequest(entry)
      }
    } catch (error) {
      entry.attempts = Number(entry.attempts || 0) + 1
      entry.lastError = String(error && error.message ? error.message : "network_error")
      entry.blockedReason = "network"
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
  await reportWriteQueueStatus("flush")
  if (authRequiredCount > 0) {
    await notifyClients({
      type: "WRITE_QUEUE_AUTH_REQUIRED",
      blockedCount: authRequiredCount,
      pendingCount: remaining,
      status: authRequiredStatus,
    })
  }
  if (reviewRequiredCount > 0) {
    await notifyClients({
      type: "WRITE_QUEUE_REVIEW_REQUIRED",
      reviewCount: reviewRequiredCount,
      pendingCount: remaining,
    })
  }
  if (droppedCount > 0) {
    await notifyClients({ type: "WRITE_QUEUE_DROPPED", droppedCount })
  }
}

const fetchWithTimeout = async (request, timeoutMs, init = undefined) => {
  const controller = new AbortController()
  const safeTimeout = toNumberFlag(timeoutMs, DEFAULT_READ_API_TIMEOUT_MS)
  const timeoutId = setTimeout(() => controller.abort(), safeTimeout)
  try {
    return await fetch(request, {
      ...(init || {}),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

const networkFirst = async (request, cacheName, timeoutMs) => {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetchWithTimeout(request, timeoutMs)
    if (response.status === 401 || response.status === 403) {
      await cache.delete(request)
      return response
    }
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
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable()
      }
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
  if (data.type === "SET_RUNTIME_CONFIG") {
    applyRuntimeConfig(data.config || {})
    return
  }
  if (data.type === "CLEAR_SENSITIVE_DATA") {
    event.waitUntil(clearSensitiveData())
    return
  }
  if (data.type === "FLUSH_WRITE_QUEUE") {
    event.waitUntil(flushWriteQueue())
    return
  }
  if (data.type === "GET_WRITE_QUEUE_STATUS") {
    event.waitUntil(reportWriteQueueStatus("request"))
    return
  }
  if (data.type === "DELETE_QUEUED_REQUEST") {
    const id = Number(data.id || 0)
    if (!Number.isFinite(id) || id <= 0) {
      event.waitUntil(reportWriteQueueStatus("delete_invalid"))
      return
    }
    event.waitUntil(
      (async () => {
        await deleteQueuedRequest(id)
        await reportWriteQueueStatus("delete")
      })(),
    )
  }
})

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG && runtimeConfig.writeQueue) {
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

  if (url.pathname === "/api/auth/signout" && request.method !== "GET") {
    event.waitUntil(clearSensitiveData())
  }

  if (request.method === "GET") {
    if (request.mode === "navigate") {
      if (!runtimeConfig.navigationCache) {
        event.respondWith(fetch(request))
        return
      }

      event.respondWith(
        (async () => {
          try {
            const preloadResponse = await event.preloadResponse
            if (preloadResponse) {
              const cache = await caches.open(RUNTIME_CACHE)
              if (shouldCacheResponse(preloadResponse)) {
                cache.put(request, preloadResponse.clone())
              }
              return preloadResponse
            }
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
      if (runtimeConfig.readApiCache) {
        event.respondWith(networkFirst(request, API_CACHE, runtimeConfig.readApiTimeoutMs))
      } else {
        event.respondWith(fetch(request))
      }
      return
    }

    const isStaticAsset =
      url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/_next/image") ||
      url.pathname.startsWith("/resources/") ||
      url.pathname.startsWith("/images/") ||
      STATIC_ASSET_PATTERN.test(url.pathname)

    if (isStaticAsset) {
      if (runtimeConfig.staticAssetCache) {
        event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE))
      } else {
        event.respondWith(fetch(request))
      }
    }
    return
  }

  if (isMatchingPrefix(url.pathname, WRITE_API_PREFIXES)) {
    if (!runtimeConfig.writeQueue) {
      event.respondWith(fetch(request.clone()))
      return
    }
    event.respondWith(
      (async () => {
        try {
          return await fetchWithTimeout(request.clone(), runtimeConfig.writeTimeoutMs)
        } catch {
          try {
            const queueResult = await queueWriteRequest(request)
            await registerBackgroundSync()
            if (queueResult.trimmedCount > 0) {
              await notifyClients({ type: "WRITE_QUEUE_TRIMMED", trimmedCount: queueResult.trimmedCount })
            }
            await notifyClients({
              type: queueResult.duplicate ? "WRITE_QUEUE_DUPLICATE_SKIPPED" : "WRITE_QUEUED",
              pendingCount: queueResult.pendingCount,
            })
            await reportWriteQueueStatus(queueResult.duplicate ? "duplicate" : "queued")
            return new Response(
              JSON.stringify({
                success: true,
                queued: queueResult.queued,
                duplicate: queueResult.duplicate,
                offline: true,
                pendingCount: queueResult.pendingCount,
                message: queueResult.duplicate
                  ? "Similar update already queued. It will sync automatically when online."
                  : "No network. Update queued and will sync automatically.",
              }),
              {
                status: 202,
                headers: {
                  "Content-Type": "application/json",
                  "X-FarmFlow-Queued": queueResult.queued ? "1" : "0",
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
