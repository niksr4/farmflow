/**
 * Turning a pair of fingerprint punches into a day's work.
 *
 * Everything here is derived from what a BioMax N-WL20 actually sends, observed on the live relay
 * test between 2026-08-10 and 2026-08-14 (see biometric_punches, tenant Estate Mock). Three facts
 * from that data drive the whole design:
 *
 * 1. THE TERMINAL DOES NOT SAY IN OR OUT. Every punch in the sample carried the identical
 *    raw_status (16777216) and raw_verify (268435456). There is no direction flag to read, so
 *    "in" is the first punch of the day and "out" is the last. Anything that wants to know which
 *    way a worker was walking has to infer it, and this module is where that inference lives.
 *
 * 2. PEOPLE PUNCH MORE THAN TWICE. Worker 1 on 10 Aug punched at 09:32:48, 09:38:20 and 11:30:33.
 *    Only the first and last mean anything; the middle one is noise.
 *
 * 3. AND THEY DOUBLE-TAP. Worker 2 on 14 Aug punched at 07:03:51 and again at 07:06:05 -- two
 *    minutes apart. Taken literally that is a two-minute shift. It is obviously one arrival read
 *    twice: a finger that did not take the first time, or a queue shuffling at the terminal. A
 *    rule that pays by hours has to reject that, or the first thing biometrics does is turn a
 *    full day into nothing. Hence MIN_SHIFT_GAP_MINUTES.
 *
 * The output is deliberately a *proposal*, not a fact. It is what the hours suggest the day was
 * worth; a manager can still allocate whatever they know to be true. An estate knows why someone
 * left at noon and the terminal does not.
 */

/**
 * Below this, a second punch is the same arrival read twice rather than a departure.
 *
 * Fifteen minutes is comfortably above the double-tap seen in the sample (2m14s) and comfortably
 * below any real half day. Nobody arrives, works, and leaves inside a quarter of an hour; if they
 * do, it is not a shift anyone is paying for.
 */
export const MIN_SHIFT_GAP_MINUTES = 15

/**
 * A full day's hours, and the floor below which a day is not even half. Tenant-overridable via
 * `tenants.full_day_hours` / `half_day_hours`.
 *
 * SIX, not seven, from 2026-09-03: an estate day that ends inside six hours of the first punch is
 * a half day. Seven was a guess made before any estate had a terminal; six is the number asked
 * for once one did. It only moves the full/half boundary -- the band below `halfDayHours` still
 * reports `short` rather than rounding up, because paying half for ninety minutes and paying
 * nothing for it are both decisions the estate should make rather than inherit.
 */
export const DEFAULT_FULL_DAY_HOURS = 6
export const DEFAULT_HALF_DAY_HOURS = 3.5

export type ShiftThresholds = {
  fullDayHours: number
  halfDayHours: number
}

export const DEFAULT_SHIFT_THRESHOLDS: ShiftThresholds = {
  fullDayHours: DEFAULT_FULL_DAY_HOURS,
  halfDayHours: DEFAULT_HALF_DAY_HOURS,
}

/**
 * What the punches say about a day.
 *
 * - `absent`      — no punch at all.
 * - `open`        — punched in, no valid out yet. Present, and work can be set: this is the state
 *                   for most of the working day and it must never read as an error.
 * - `full`/`half` — a completed shift at or above the relevant threshold.
 * - `short`       — completed, but under the half-day floor. Surfaced rather than rounded, because
 *                   silently paying half for two hours and silently paying nothing are both
 *                   decisions the estate should make, not us.
 */
export type ShiftStatus = "absent" | "open" | "full" | "half" | "short"

export type ShiftAssessment = {
  status: ShiftStatus
  /** Worked hours, or null while the shift is still open. */
  hours: number | null
  /** What the hours suggest the day is worth: 1, 0.5, or 0. Null while open — unknown, not zero. */
  suggestedDayFraction: number | null
  /**
   * True when a second punch existed but was too close to the first to be a departure. The punch
   * is not discarded -- the roll still shows it -- but it does not close the shift, and the UI
   * says why rather than silently showing "still in".
   */
  rescanIgnored: boolean
}

const MS_PER_HOUR = 3_600_000

const toTime = (value: Date | string | null | undefined): number | null => {
  if (!value) return null
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

export function resolveShiftThresholds(input?: Partial<ShiftThresholds> | null): ShiftThresholds {
  const full = Number(input?.fullDayHours)
  const half = Number(input?.halfDayHours)
  const fullDayHours = Number.isFinite(full) && full > 0 ? full : DEFAULT_FULL_DAY_HOURS
  // A half threshold at or above the full one would make "half" unreachable, and a negative one
  // makes every shift full. Fall back rather than honour a nonsense pair.
  //
  // The fallback was `Math.min(DEFAULT_HALF_DAY_HOURS, fullDayHours / 2)`, which was only ever
  // right by coincidence: the default full day was 7 and 7/2 is exactly 3.5, so the halving never
  // bit. Moving the default to 6 made it bite -- the default half-day floor silently became 3,
  // disagreeing with DEFAULT_SHIFT_THRESHOLDS one line above it and quietly paying half a day for
  // a three-hour shift. Halving is a last resort for a tenant who sets a full day shorter than the
  // default floor, not the normal path.
  const halfDayHours =
    Number.isFinite(half) && half > 0 && half < fullDayHours
      ? half
      : DEFAULT_HALF_DAY_HOURS < fullDayHours
        ? DEFAULT_HALF_DAY_HOURS
        : fullDayHours / 2
  return { fullDayHours, halfDayHours }
}

/**
 * Assess one worker's day from their first and last punch.
 *
 * `checkOut` is whatever the ingest recorded as the last punch; this decides whether it counts.
 */
export function assessShift(
  checkIn: Date | string | null | undefined,
  checkOut: Date | string | null | undefined,
  thresholds: Partial<ShiftThresholds> | null = null,
): ShiftAssessment {
  const { fullDayHours, halfDayHours } = resolveShiftThresholds(thresholds)

  const inMs = toTime(checkIn)
  if (inMs === null) {
    return { status: "absent", hours: null, suggestedDayFraction: null, rescanIgnored: false }
  }

  const outMs = toTime(checkOut)
  // An out-punch at or before the in-punch is not a shift. Clock drift and a device re-sending an
  // older buffered punch both produce it, and neither means the worker time-travelled.
  if (outMs === null || outMs <= inMs) {
    return { status: "open", hours: null, suggestedDayFraction: null, rescanIgnored: false }
  }

  const minutes = (outMs - inMs) / 60_000
  if (minutes < MIN_SHIFT_GAP_MINUTES) {
    // Still open: they arrived and were read twice. The day is not over.
    return { status: "open", hours: null, suggestedDayFraction: null, rescanIgnored: true }
  }

  const hours = (outMs - inMs) / MS_PER_HOUR
  if (hours >= fullDayHours) return { status: "full", hours, suggestedDayFraction: 1, rescanIgnored: false }
  if (hours >= halfDayHours) return { status: "half", hours, suggestedDayFraction: 0.5, rescanIgnored: false }
  return { status: "short", hours, suggestedDayFraction: 0, rescanIgnored: false }
}

/** "6h 29m" — for a column of durations that has to be readable at a glance. */
export function formatWorkedHours(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours) || hours < 0) return "—"
  const total = Math.round(hours * 60)
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`
}

export const shiftStatusLabel = (status: ShiftStatus): string =>
  status === "absent" ? "Absent"
  : status === "open" ? "Still in"
  : status === "full" ? "Full day"
  : status === "half" ? "Half day"
  : "Short"
