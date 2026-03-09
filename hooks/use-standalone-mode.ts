"use client"

import { useSyncExternalStore } from "react"

type NavigatorWithStandalone = Navigator & { standalone?: boolean }

const DISPLAY_MODE_QUERIES = ["(display-mode: standalone)", "(display-mode: fullscreen)", "(display-mode: minimal-ui)"]

const getServerSnapshot = () => false

const getSnapshot = () => {
  if (typeof window === "undefined") return false
  const iosStandalone = Boolean((window.navigator as NavigatorWithStandalone).standalone)
  if (iosStandalone) return true
  return DISPLAY_MODE_QUERIES.some((query) => window.matchMedia(query).matches)
}

const subscribe = (callback: () => void) => {
  if (typeof window === "undefined") {
    return () => {}
  }

  const mediaLists = DISPLAY_MODE_QUERIES.map((query) => window.matchMedia(query))
  const listener = () => callback()

  mediaLists.forEach((media) => media.addEventListener("change", listener))
  window.addEventListener("appinstalled", listener)

  return () => {
    mediaLists.forEach((media) => media.removeEventListener("change", listener))
    window.removeEventListener("appinstalled", listener)
  }
}

export function useStandaloneMode() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
