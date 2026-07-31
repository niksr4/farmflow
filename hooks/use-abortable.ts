"use client"

import { useEffect, useMemo } from "react"
import { createAbortGroup, type AbortGroup } from "@/lib/abortable"

/**
 * An AbortGroup scoped to the component's lifetime: a new request cancels the previous one,
 * and unmounting cancels whatever is outstanding.
 *
 * For imperative reads — a refresh button, a filter change, a search box — where repeated
 * input would otherwise leave a pile of superseded requests downloading in the background.
 * For reads inside a useEffect, prefer a local `new AbortController()` aborted in the effect's
 * cleanup, so each effect owns its own cancellation.
 *
 * Reads only. See lib/abortable.ts for why mutations must not be aborted.
 *
 * ```ts
 * const requests = useAbortableRequests()
 *
 * const reload = async () => {
 *   try {
 *     const result = await fetchJson("/api/records", { signal: requests.next() })
 *     if (result.ok) setRecords(result.data.records)
 *   } catch (error) {
 *     if (isAbortError(error)) return
 *     setError("Could not load records")
 *   }
 * }
 * ```
 */
export function useAbortableRequests(): AbortGroup {
  // Stable for the component's lifetime, so the cleanup below runs only on unmount and the
  // group can be a plain effect dependency — no ref needed, and none touched during render.
  const group = useMemo(() => createAbortGroup(), [])

  useEffect(() => {
    return () => group.abortAll()
  }, [group])

  return group
}
