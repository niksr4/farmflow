"use client"

import { useCallback, useSyncExternalStore } from "react"

const getServerSnapshot = () => false

const getSnapshot = (query: string) => {
  if (typeof window === "undefined") return false
  return window.matchMedia(query).matches
}

const subscribe = (query: string, callback: () => void) => {
  if (typeof window === "undefined") {
    return () => {}
  }

  const media = window.matchMedia(query)
  const listener = () => callback()
  media.addEventListener("change", listener)
  return () => {
    media.removeEventListener("change", listener)
  }
}

export function useMediaQuery(query: string): boolean {
  // subscribe/getSnapshot must stay referentially stable across renders for the same query --
  // otherwise useSyncExternalStore tears down and resubscribes the matchMedia listener on every
  // render of every component calling this hook (worker-profiles-tab, inventory-system, and
  // eight other call sites), which is wasted work on every re-render rather than just on
  // mount/query-change.
  return useSyncExternalStore(
    useCallback((callback) => subscribe(query, callback), [query]),
    useCallback(() => getSnapshot(query), [query]),
    getServerSnapshot,
  )
}
