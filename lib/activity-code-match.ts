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
