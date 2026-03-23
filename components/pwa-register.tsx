"use client"

import { useEffect } from "react"

const OFFLINE_DB_NAME = "farmflow-offline-db"
const RETIRED_MESSAGE = "farmflow-sw-retired"
const RELOAD_GUARD_KEY = "farmflow-sw-retired-reload"

const clearLegacyPwaArtifacts = async () => {
  if (typeof window === "undefined") return

  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    } catch (error) {
      console.warn("Service worker cleanup failed:", error)
    }
  }

  if ("caches" in window) {
    try {
      const cacheKeys = await caches.keys()
      const farmflowKeys = cacheKeys.filter((key) => key.startsWith("farmflow-pwa-") || key.includes("farmflow"))
      await Promise.all(farmflowKeys.map((key) => caches.delete(key)))
    } catch (error) {
      console.warn("Cache cleanup failed:", error)
    }
  }

  if ("indexedDB" in window) {
    try {
      indexedDB.deleteDatabase(OFFLINE_DB_NAME)
    } catch (error) {
      console.warn("Offline queue cleanup failed:", error)
    }
  }
}

export default function PwaRegister() {
  useEffect(() => {
    void clearLegacyPwaArtifacts()

    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event?.data?.type !== RETIRED_MESSAGE) return
      try {
        if (window.sessionStorage.getItem(RELOAD_GUARD_KEY) === "1") return
        window.sessionStorage.setItem(RELOAD_GUARD_KEY, "1")
      } catch {
        // Ignore storage issues and still reload once.
      }
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage)

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleServiceWorkerMessage)
    }
  }, [])

  return null
}
