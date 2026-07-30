/**
 * Wraps an async action so one intent can only run it once — the mobile double-tap problem.
 *
 * The app's save buttons guarded themselves with React state (`disabled={isSaving}` set via
 * `setIsSaving(true)`). State updates are asynchronous, so on a phone two taps ~80ms apart both
 * enter the handler before React re-renders the button as disabled, and the estate ends up with two
 * identical labour entries. The flag here is read and set synchronously in the same tick, so the
 * second call is rejected outright.
 *
 * Single-flight rather than debounce on purpose: debouncing a submit delays it, which on a slow
 * connection feels like the tap did nothing. The first call goes immediately; anything while it is
 * in flight — or within `cooldownMs` of it finishing — is dropped and resolves to undefined.
 */
export function createSingleFlight<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  options: { cooldownMs?: number; now?: () => number } = {},
) {
  const { cooldownMs = 600, now = Date.now } = options
  let inFlight = false
  let lastCompletedAt = Number.NEGATIVE_INFINITY

  return async (...args: TArgs): Promise<TResult | undefined> => {
    if (inFlight) return undefined
    if (now() - lastCompletedAt < cooldownMs) return undefined

    inFlight = true
    try {
      return await action(...args)
    } finally {
      // Released even when the action throws — otherwise one failed save wedges the button
      // permanently and the user has to reload to try again.
      inFlight = false
      lastCompletedAt = now()
    }
  }
}

/**
 * A reusable guard whose *state* is stable but whose action is supplied per call.
 *
 * This is the shape React wants. Handlers are usually inline closures with a fresh identity every
 * render, so memoising `createSingleFlight(action)` on `action` would rebuild the guard — and reset
 * its in-flight flag — on every render, defeating the point. Keeping the flag in a long-lived
 * runner and passing the closure at call time avoids that without a ref, which the
 * react-hooks/refs rule disallows touching during render.
 */
export function createSingleFlightRunner(options: { cooldownMs?: number; now?: () => number } = {}) {
  const { cooldownMs = 600, now = Date.now } = options
  let inFlight = false
  let lastCompletedAt = Number.NEGATIVE_INFINITY

  return async function run<TArgs extends unknown[], TResult>(
    action: (...args: TArgs) => Promise<TResult>,
    ...args: TArgs
  ): Promise<TResult | undefined> {
    if (inFlight) return undefined
    if (now() - lastCompletedAt < cooldownMs) return undefined

    inFlight = true
    try {
      return await action(...args)
    } finally {
      inFlight = false
      lastCompletedAt = now()
    }
  }
}
