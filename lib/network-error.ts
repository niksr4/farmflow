/**
 * "The network dropped" is not "the app broke".
 *
 * FarmFlow's writers are on Android phones in coffee plantations under tree cover. A fetch that
 * fails because the signal went is the ordinary case, not an incident -- and a browser reports it
 * as a bare `TypeError: Failed to fetch`, with no status, no body and nothing to distinguish it
 * from a genuine client bug.
 *
 * Treating the two the same costs twice:
 *
 *   - Sentry fills with connectivity blips at error level. That is how a real signal gets missed;
 *     this codebase already lost months of client-side error reporting to a CSP typo precisely
 *     because nobody was reading closely.
 *   - The UI blanks. A card that empties on a failed load says "nothing here" when it means "I
 *     could not find out" -- the same confident wrong answer as every other bug worth having.
 *
 * The message strings differ per engine and are the only signal available, so they are matched
 * loosely and `navigator.onLine` is consulted as a fallback. False negatives are fine: an
 * unrecognised network error is simply reported as before, which is where we started.
 */

const NETWORK_MESSAGES = [
  "failed to fetch", // Chrome, Edge
  "networkerror", // Firefox ("NetworkError when attempting to fetch resource")
  "load failed", // Safari
  "network request failed",
  "the internet connection appears to be offline",
  "err_internet_disconnected",
  "err_network_changed",
  "err_name_not_resolved",
]

/**
 * True when a thrown value looks like the connection failing rather than the code failing.
 *
 * Deliberately excludes AbortError: an aborted read is our own doing (hooks/use-abortable.ts) and
 * callers already handle it separately. Conflating them would hide a cancellation bug behind an
 * offline banner.
 */
export const isNetworkError = (err: unknown): boolean => {
  if (!err) return false

  const name = String((err as { name?: unknown })?.name || "")
  if (name === "AbortError") return false

  const message = err instanceof Error ? err.message : String(err)
  const normalized = message.toLowerCase()

  if (NETWORK_MESSAGES.some((m) => normalized.includes(m))) return true

  // A TypeError from fetch with no recognised text is still almost certainly the transport:
  // fetch only throws TypeError for network-level failures, never for a 4xx or 5xx.
  if (err instanceof TypeError && typeof navigator !== "undefined" && navigator.onLine === false) {
    return true
  }

  return false
}

/** Whether the device currently believes it has a connection. Conservative: unknown counts as online. */
export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false
