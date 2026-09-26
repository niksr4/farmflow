// Resolves what a user typed into the mobile activity-code search box to a concrete activity,
// so a typed-but-not-tapped code is committed to the form on blur instead of being discarded
// (the regression that made the labour form lose the code + category on scroll). Pure and
// unit-tested. Only resolves to a real activity, so submit-time validation is unchanged.

export type ActivityCodeLike = {
  code: string
  reference: string
}

export function resolveActivityFromQuery<T extends ActivityCodeLike>(
  query: string,
  activities: T[],
): T | null {
  const q = String(query || "").trim().toLowerCase()
  if (!q) return null

  // Exact code match wins, then exact reference (category) match.
  const exactCode = activities.find((a) => a.code.toLowerCase() === q)
  if (exactCode) return exactCode
  const exactReference = activities.find((a) => a.reference.toLowerCase() === q)
  if (exactReference) return exactReference

  // Otherwise accept a partial match only when it is unambiguous.
  const partial = activities.filter(
    (a) => a.code.toLowerCase().includes(q) || a.reference.toLowerCase().includes(q),
  )
  return partial.length === 1 ? partial[0] : null
}

export type ExpenseCodeDecision<T> = { outcome: "use"; activity: T } | { outcome: "refuse"; typed: string | null }

/**
 * Which cost code a submit should actually use, or a refusal.
 *
 * Pure, and deliberately so. This decision lived inline in other-expenses-tab.tsx's submit handler
 * and shipped wrong twice in one day:
 *
 *  1. An unmatched search fell back to the code it replaced. Select 136, type "fertilizer", look
 *     away, save: the warning showed, formData.code was still 136, and 136 is what got stored.
 *  2. The fix for (1) read only the SETTLED unmatched value, which the blur callback writes 150ms
 *     after focus leaves. Tapping Save straight from the open keyboard beats that timer, so the
 *     live query was still "fertilizer", the settled value was still null, the guard never ran,
 *     and 136 got stored again.
 *
 * Both were caught by CodeRabbit rather than by tests, because the tests scanned the handler's
 * source. The second scan was vacuous: it checked that the guard region mentioned `codeQuery`, and
 * the region already contained `codeQuery !== null` on an unrelated line, so deleting the fix left
 * it green. A mention is not a call and it is not a behaviour either.
 *
 * As a function it can simply be asked, which is what the tests now do.
 *
 * A valid-but-unintended code is the thing to avoid, not merely an invalid one. An invalid code is
 * refused by the database (expense_transactions has FOREIGN KEY (code, tenant_id)); a wrong-but-
 * real one is stored, aggregated into the estate's cost report, and indistinguishable afterwards.
 */
export function decideExpenseCode<T extends ActivityCodeLike>(input: {
  /** What is in the search box right now. `null` means the box is not being edited. */
  liveQuery: string | null
  /** What the blur callback settled on as unmatched. Trails `liveQuery` by 150ms. */
  settledUnmatched: string | null
  /** The code already committed to the form by an earlier valid selection. */
  committedCode: string
  activities: T[]
}): ExpenseCodeDecision<T> {
  const pending = input.liveQuery !== null ? resolveActivityFromQuery(input.liveQuery, input.activities) : null

  // Nothing in flight resolved, so anything typed and unresolved is a refusal -- whether the blur
  // callback has caught up with it yet or not. Checking only one of the two is what shipped.
  if (!pending) {
    const typed = input.settledUnmatched ?? (input.liveQuery?.trim() || null)
    if (typed) return { outcome: "refuse", typed }
  }

  const code = (pending?.code ?? input.committedCode).trim()
  const activity = input.activities.find((a) => a.code.toLowerCase() === code.toLowerCase())
  return activity ? { outcome: "use", activity } : { outcome: "refuse", typed: code || null }
}
