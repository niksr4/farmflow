"use client"

import { useSyncExternalStore } from "react"

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
  return useSyncExternalStore(
    (callback) => subscribe(query, callback),
    () => getSnapshot(query),
    getServerSnapshot,
  )
}
