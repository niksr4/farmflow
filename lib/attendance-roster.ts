/**
 * Who may be deployed on a given day, and what to say when somebody may not.
 *
 * ⚠ WRITTEN FROM A LIVE INCIDENT. HoneyFarm, 2026-10-13, mid-harvest. A writer deployed arabica
 * picking successfully, then every later batch -- weeding, the bungalow work -- was refused with:
 *
 *     "One or more workers are invalid for this tenant"
 *
 * The cause was one worker, Saina, who had been taken off the roster but still had a biometric
 * punch at 08:11 that morning. Three things combined, and all three were the app's fault:
 *
 *   1. THE MUSTER OFFERED HER. The roster read filters `active = TRUE`; the attendance read does
 *      not. So she appeared on the day's sheet (29 people, 30 entries) and could be selected.
 *   2. ONE BAD WORKER KILLED THE WHOLE BATCH. Twenty valid deployments failed for one row.
 *   3. THE MESSAGE NAMED NOBODY. There was no way for the writer to work out which of twenty-odd
 *      people was the problem, so the afternoon was lost to guessing.
 *
 * THE RULE, stated deliberately: a worker who was PRESENT on a date stays deployable FOR THAT
 * DATE, even once they are off the roster. Taking somebody off means "do not roster them in
 * future", not "void the day they already worked" -- and the other reading silently strands a
 * leaver's final day of pay, which is the kind of quiet wrong answer this codebase exists to
 * avoid. Deploying them on a day they were NOT present stays refused, and is now named.
 */

export type RosterCandidate = {
  id: string
  fullName: string
  /** Still on the roster. */
  active: boolean
  /** Has an attendance record for the date being deployed. */
  presentOnDate: boolean
}

/** A worker may be deployed on a date if they are on the roster, or were there that day. */
export const isDeployable = (c: Pick<RosterCandidate, "active" | "presentOnDate">) =>
  c.active || c.presentOnDate

const list = (names: string[]) =>
  names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`

/**
 * The reason this batch cannot be saved, or null.
 *
 * `requestedIds` is what the client sent; `found` is every matching worker row in the tenant,
 * looked up WITHOUT an active filter so the ones that exist but cannot be deployed can be named
 * rather than lumped in with ids that belong to nobody.
 */
export const describeUndeployableWorkers = (
  requestedIds: string[],
  found: RosterCandidate[],
): string | null => {
  const byId = new Map(found.map((c) => [String(c.id), c]))

  // Ids that match no worker in this tenant. Genuinely not ours -- a stale browser tab, or an id
  // from another estate. Nothing to name, because there is no name.
  const unknown = requestedIds.filter((id) => !byId.has(String(id)))

  // Off the roster AND not present that day. These have names, and naming them is the whole point.
  const stranded = found.filter((c) => !isDeployable(c)).map((c) => c.fullName)

  if (stranded.length > 0) {
    const who = list(stranded)
    const verb = stranded.length === 1 ? "is" : "are"
    const they = stranded.length === 1 ? "them" : "them"
    return (
      `${who} ${verb} no longer on the worker list and ${verb === "is" ? "was" : "were"} not marked present on this day, ` +
      `so ${they} cannot be given work. Remove ${stranded.length === 1 ? "that row" : "those rows"} and save again, ` +
      `or put ${they} back under Workers first.`
    )
  }

  if (unknown.length > 0) {
    return unknown.length === 1
      ? "One of the selected workers does not belong to this estate. Refresh the page and try again."
      : `${unknown.length} of the selected workers do not belong to this estate. Refresh the page and try again.`
  }

  return null
}
