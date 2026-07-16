"use client"

import { useCallback, useEffect } from "react"

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000
const draftKey = (key: string) => `farmflow:draft:${key}`

/**
 * Persist in-progress form state to localStorage so a killed app, dead
 * network, or accidental navigation doesn't lose a half-filled entry.
 *
 * - While `enabled`, `value` is debounce-written to localStorage.
 * - Call `loadDraft()` when opening the form to offer a restore.
 * - Call `clearDraft()` after a successful save or explicit discard.
 * - Drafts older than 24h are treated as stale and ignored.
 */
export function useFormDraft<T>(key: string, value: T, enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(draftKey(key), JSON.stringify({ v: value, savedAt: Date.now() }))
      } catch {
        // Quota/private-mode failures just mean no draft protection
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [key, value, enabled])

  const loadDraft = useCallback((): T | null => {
    if (typeof window === "undefined") return null
    try {
      const raw = localStorage.getItem(draftKey(key))
      if (!raw) return null
      const parsed = JSON.parse(raw) as { v: T; savedAt: number } | null
      if (!parsed || Date.now() - (parsed.savedAt || 0) > DRAFT_TTL_MS) return null
      return parsed.v
    } catch {
      return null
    }
  }, [key])

  const clearDraft = useCallback(() => {
    if (typeof window === "undefined") return
    try {
      localStorage.removeItem(draftKey(key))
    } catch {
      // ignore
    }
  }, [key])

  return { loadDraft, clearDraft }
}
