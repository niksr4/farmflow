// Kill-switch service worker.
//
// FarmFlow no longer uses a service worker — the app registers none (see
// components/pwa-register.tsx, which actively unregisters legacy workers). This file remains
// only to RETIRE any legacy cache-first service worker still registered on installed PWAs.
//
// Browsers re-fetch an already-registered SW script on navigation. When a device that still
// runs the old caching worker launches the PWA, it fetches this script, sees it changed,
// installs it, and on activation it: deletes every cache, unregisters itself, and reloads open
// windows once — returning the device to a clean, network-only state with no stale chunks.
//
// Devices that have no service worker never fetch this file, so it is a no-op for them.

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys()
        await Promise.all(keys.map((key) => caches.delete(key)))
      } catch {
        // ignore — cache API may be unavailable
      }

      try {
        await self.registration.unregister()
      } catch {
        // ignore
      }

      // Reload any open windows once so they load without service-worker control. After
      // unregister() the reloaded documents have no controlling SW, so this does not loop.
      try {
        const clients = await self.clients.matchAll({ type: "window" })
        await Promise.all(clients.map((client) => client.navigate(client.url).catch(() => {})))
      } catch {
        // ignore
      }
    })(),
  )
})

// No fetch handler: every request goes straight to the network.
