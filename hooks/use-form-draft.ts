"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useAuth } from "@/hooks/use-auth"
import {
  DRAFT_TTL_MS,
  buildDraftKey,
  buildDraftScope,
  isDraftExpired,
  purgeLegacyDrafts,
} from "@/lib/form-draft"

/**
 * Persist in-progress form state to localStorage so a killed app, dead
 * network, or accidental navigation doesn't lose a half-filled entry.
 *
 * - While `enabled`, `value` is debounce-written to localStorage.
 * - Call `loadDraft()` when opening the form to offer a restore.
 * - Call `clearDraft()` after a successful save or explicit discard.
 * - Drafts older than 24h are treated as stale and ignored.
 *
 * Keys are scoped to the signed-in tenant and user — see lib/form-draft.ts. Estate managers
 * share devices, which is the very situation this feature exists for, so an unscoped draft
 * was offered to whoever opened the form next, including a user on a different tenant.
 */
export function useFormDraft<T>(key: string, value: T, enabled: boolean) {
  const { user } = useAuth()
  const scope = useMemo(
    () => buildDraftScope(user?.tenantId, user?.username),
    [user?.tenantId, user?.username],
  )
  const storageKey = useMemo(() => (scope ? buildDraftKey(scope, key) : null), [scope, key])

  // Drafts written by the old unscoped scheme belong to nobody in particular and may have come
  // from another tenant, so they are deleted rather than migrated — this cleans a device that
  // is already holding one, instead of only protecting drafts written from now on.
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      purgeLegacyDrafts(window.localStorage)
    } catch {
      // Private mode / quota — nothing reachable to clean up anyway.
    }
  }, [])

  useEffect(() => {
    // No signed-in user means no scope to attribute a draft to, and persisting an
    // unattributable draft is exactly what caused the leak.
    if (!enabled || !storageKey || typeof window === "undefined") return
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ v: value, savedAt: Date.now() }))
      } catch {
        // Quota/private-mode failures just mean no draft protection
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [storageKey, value, enabled])

  const loadDraft = useCallback((): T | null => {
    if (typeof window === "undefined" || !storageKey) return null
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { v: T; savedAt: number } | null
      if (!parsed || isDraftExpired(parsed.savedAt, Date.now(), DRAFT_TTL_MS)) return null
      return parsed.v
    } catch {
      return null
    }
  }, [storageKey])

  const clearDraft = useCallback(() => {
    if (typeof window === "undefined" || !storageKey) return
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // ignore
    }
  }, [storageKey])

  return { loadDraft, clearDraft }
}
