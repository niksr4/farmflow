/**
 * A REFUSAL THE WRITER CAN ACT ON IS NOT A FAULT, AND MUST NOT ARRIVE AS ONE.
 *
 * `scripts/152` puts `assert_worker_day_budget()` on **both** `labour_assignments` and
 * `picking_records`: a worker-day cannot exceed 1.0 across day-work and picking together, and the
 * trigger RAISEs when it would. That is the system working — somebody is being booked twice for
 * the same day, and the estate needs to know which.
 *
 * ⚠ REPORTED FROM PRODUCTION, 2026-10-15. Nandu at Laxmi tried to log a whole-day picking record
 * for Aliza on the 14th. She was already marked for a whole day of day-work (activity 140,
 * `day_fraction` 1.000), so picking would have taken her to 2.0 and the trigger refused it. The
 * route had no mapping for that, so it fell into its generic catch and told him
 * **"Failed to save picking record"** — which reads as "the app is broken", not as "Aliza is
 * already booked". He had done everything correctly and had no way to find out why.
 *
 * ⚠ AND THIS WAS HALF-FIXED BY ITS OWN AUTHOR. PR #85 added exactly this mapping to the picking
 * EDIT route and did not touch the CREATE route or the muster route. Sweeping for the shape found
 * two routes still unmapped — one of them `attendance/assignments`, which is the muster every
 * tenant writes every morning. Hence one helper used by all three, rather than a third copy of the
 * regex: the next writer of a day-capped table gets it by calling this.
 */

/**
 * The trigger's own sentence if this error is the day-budget refusal, otherwise `null`.
 *
 * ⚠ RETURNS THE DATABASE'S MESSAGE DELIBERATELY. The trigger names the worker and the date, which
 * is the only part the writer needs; a message invented here would have to guess at them and would
 * drift from the trigger the moment 152 is revised.
 *
 * The pattern is kept broad on purpose — this must fail towards *showing* the writer something
 * useful. A false positive turns a 500 into a 409 carrying a real database sentence, which is
 * still more use than "Failed to save". A false negative is the bug being fixed.
 *
 * Keyed on the wording `assert_worker_day_budget()` ACTUALLY raises, read off production rather
 * than guessed. Its two messages are:
 *
 *   "A worker's day is one day. This person already has % of % booked on % (%), and this adds %
 *    more. Picking and day-work share the same day: remove or halve the other entry first."
 *   "This person already has % jobs on % (limit %), counting picking and day-work together.
 *    Correct one of them instead of adding another."
 *
 * Both are already good sentences -- they name the day, the amount already booked and what to do
 * about it. The bug was never the message; it was that two routes threw it away. `day budget` and
 * `day_cap` stay in the pattern for the 116-era phrasing and for anything a future revision names
 * that way.
 */
const DAY_CAP_WORDING =
  /day is one day|picking and day-work|jobs on .+\(limit|day budget|day_cap/i

export function dayCapRefusal(error: unknown): string | null {
  const message = String((error as Error)?.message || "")
  if (!message) return null
  return DAY_CAP_WORDING.test(message) ? message : null
}

/** HTTP 409: the request was understood, and the current state refuses it. Not 400, not 500. */
export const DAY_CAP_STATUS = 409
