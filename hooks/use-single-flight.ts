"use client"

import { useCallback, useMemo, type FormEvent } from "react"
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

/**
 * The same guard for a `<form onSubmit={…}>`, where wiring useSingleFlight directly is a trap.
 *
 * ⚠ WHAT GOES WRONG, and it is worse than the problem the guard was added to solve. The natural
 * shape is to guard the existing submit handler:
 *
 *     const handleSubmitUnguarded = async (e: React.FormEvent) => { e.preventDefault(); … }
 *     const handleSubmit = useSingleFlight(handleSubmitUnguarded)
 *     <form onSubmit={handleSubmit}>
 *
 * The guard DROPS the second call — that is its job — which means the second call never reaches
 * `e.preventDefault()`. So the second tap performs a NATIVE FORM SUBMIT: the browser navigates,
 * reloading the page while the first POST is still in flight. The user sees the form blank itself
 * mid-save and cannot tell whether the record was written. On a phone, a double-tap is not a rare
 * accident; it is the normal way a slow button gets pressed.
 *
 * Guarding a mutation and then letting the browser cancel the page underneath it is the same
 * damage as aborting the mutation, which lib/abortable.ts exists to forbid.
 *
 * The fix is only an ordering one — preventDefault BEFORE the guard, so it runs on every submit
 * whether or not the work does — but it has to be got right at six call sites and at every one
 * added later. So it lives here instead, and the guarded action takes no event at all, which
 * makes the broken shape unwriteable rather than merely discouraged.
 *
 * Raised by Greptile on PR #17 against market-pricing-tab.tsx; the sweep found the same shape in
 * five more forms, four of which predate that PR.
 */
export function useSingleFlightSubmit(
  action: () => Promise<unknown>,
  options: { cooldownMs?: number } = {},
) {
  const guarded = useSingleFlight(action, options)
  return useCallback(
    (event: FormEvent) => {
      // Unconditionally, and first. Everything below this line may or may not run.
      event.preventDefault()
      void guarded()
    },
    [guarded],
  )
}
