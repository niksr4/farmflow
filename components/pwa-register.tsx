"use client"

import { useEffect } from "react"

const OFFLINE_DB_NAME = "farmflow-offline-db"

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
  }, [])

  return null
}
