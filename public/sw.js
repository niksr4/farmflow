const OFFLINE_DB_NAME = "farmflow-offline-db"
const RETIRED_MESSAGE = "farmflow-sw-retired"

const isFarmflowCacheKey = (key) => key.startsWith("farmflow-pwa-") || key.includes("farmflow")

const clearFarmflowCaches = async () => {
  if (!("caches" in self)) return
  const cacheKeys = await caches.keys()
  await Promise.all(cacheKeys.filter(isFarmflowCacheKey).map((key) => caches.delete(key)))
}

const clearOfflineDb = async () => {
  if (!("indexedDB" in self)) return
  await new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(OFFLINE_DB_NAME)
      request.onsuccess = () => resolve(undefined)
      request.onerror = () => resolve(undefined)
      request.onblocked = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

const notifyClients = async () => {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
  await Promise.all(
    clients.map((client) =>
      client.postMessage({
        type: RETIRED_MESSAGE,
      }),
    ),
  )
}

const retireLegacyWorker = async () => {
  await Promise.all([clearFarmflowCaches(), clearOfflineDb()])
  await self.registration.unregister().catch(() => undefined)
  await notifyClients()
}

self.addEventListener("install", (event) => {
  self.skipWaiting()
  event.waitUntil(retireLegacyWorker())
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim()
      await retireLegacyWorker()
    })(),
  )
})

self.addEventListener("message", (event) => {
  if (event?.data?.type !== "farmflow-sw-retire") return
  if (typeof event.waitUntil === "function") {
    event.waitUntil(retireLegacyWorker())
  }
})

self.addEventListener("fetch", () => {
  // Intentionally empty. Legacy service workers should not intercept network traffic anymore.
})
