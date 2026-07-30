"use client"

import { useCallback, useMemo } from "react"
import { createSingleFlightRunner } from "@/lib/single-flight"

/**
 * React binding for createSingleFlight — see lib/single-flight.ts for why this exists (a mobile
 * double-tap producing duplicate records, because `disabled={isSaving}` only takes effect on the
 * next render, while a ref is set synchronously in the same tick).
 *
 * Keep `disabled` on the button for the visual affordance; this is the correctness guarantee
 * behind it.
 */
export function useSingleFlight<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  options: { cooldownMs?: number } = {},
) {
  const { cooldownMs = 600 } = options

  // The guard's state lives in the runner, memoised so it survives re-renders. The handler itself
  // is passed per call, which is what keeps this working for the inline async closures these
  // forms use — memoising on the handler's identity would rebuild the guard, and clear its
  // in-flight flag, on every render.
  const runner = useMemo(() => createSingleFlightRunner({ cooldownMs }), [cooldownMs])

  return useCallback((...args: TArgs) => runner(action, ...args), [runner, action])
}
