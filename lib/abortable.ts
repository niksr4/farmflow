/**
 * Request cancellation helpers.
 *
 * The pattern this replaces is `let ignore = false` in a useEffect, flipped in the cleanup.
 * That correctly stops a stale `setState`, but it does nothing about the request itself: the
 * response still downloads in full, still gets JSON-parsed, and is only then discarded. On a
 * phone, rapidly switching tabs stacks up whole record sets — several of these endpoints are
 * `all=true` full-table reads — that cost memory and main-thread time for output nobody wants.
 * An AbortController stops the transfer at the network layer instead.
 *
 * ## Reads only — never abort a mutation
 *
 * These helpers are for GETs. Aborting a POST/PUT/DELETE does NOT roll back the server: the
 * request may already have been received and committed, and the client would report failure
 * for a write that actually happened. Users retry things they are told failed, which is how
 * you get duplicate records — the exact damage lib/single-flight.ts exists to prevent.
 * Mutations should be guarded with single-flight and allowed to finish.
 */

/**
 * True when a rejection is a cancellation we caused, rather than a real failure.
 *
 * Cancellation surfaces inconsistently across engines: browsers throw a DOMException with
 * `name === "AbortError"`, undici/Node can surface a plain Error or wrap the reason, and a
 * signal aborted with a custom reason propagates that reason verbatim. Callers must never
 * show these to a user — the request was cancelled on purpose.
 */
export function isAbortError(error: unknown): boolean {
  if (!error) return false

  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "AbortError"
  }

  if (typeof error === "object") {
    const candidate = error as { name?: unknown; code?: unknown; cause?: unknown }
    if (candidate.name === "AbortError") return true
    if (candidate.code === 20) return true // legacy DOMException ABORT_ERR
    // fetch wraps the underlying cause on some runtimes
    if (candidate.cause && candidate.cause !== error && isAbortError(candidate.cause)) return true
  }

  return false
}

export type AbortGroup = {
  /**
   * Abort whatever is in flight and hand back a signal for the replacement request.
   * Use when a newer request supersedes an older one — a tab switch, a re-search, a
   * repeated tap on a refresh control.
   */
  next: () => AbortSignal
  /** Abort everything outstanding. Call on unmount. */
  abortAll: () => void
  /** Whether the most recently issued signal has been aborted. */
  isAborted: () => boolean
}

/**
 * Tracks the in-flight controller for a logical request slot, so a superseding call cancels
 * the one before it. Framework-free so it can be unit-tested without a DOM.
 */
export function createAbortGroup(): AbortGroup {
  let current: AbortController | null = null

  return {
    next: () => {
      current?.abort()
      current = new AbortController()
      return current.signal
    },
    abortAll: () => {
      current?.abort()
      current = null
    },
    isAborted: () => (current ? current.signal.aborted : false),
  }
}

export type JsonResult<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Fetch JSON with cancellation, collapsing the `res.json().catch(() => ({}))` dance this
 * codebase repeats at ~140 call sites.
 *
 * Aborts propagate to the caller as a thrown error rather than a result, so an intentional
 * cancellation can never be mistaken for a failed load and rendered as an error state.
 * Callers should guard their catch with `isAbortError`.
 */
export async function fetchJson<T = any>(
  input: string,
  init?: RequestInit & { signal?: AbortSignal },
): Promise<JsonResult<T>> {
  const response = await fetch(input, init)
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "error" in payload && String((payload as any).error)) ||
      `Request failed (${response.status})`
    return { ok: false, error: message }
  }

  // This API's convention is `{ success: boolean, ... }`; treat an explicit false as failure.
  if (payload && typeof payload === "object" && "success" in payload && !(payload as any).success) {
    return { ok: false, error: String((payload as any).error || "Request failed") }
  }

  return { ok: true, data: payload as T }
}
