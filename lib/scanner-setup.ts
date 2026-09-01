/**
 * Where terminals send their punches, and how far along a self-service setup has actually got.
 *
 * NOT the FarmFlow domain. These devices have no TLS stack -- verified against a BioMax N-WL20 on
 * 2026-08-10: every connection was plain HTTP even when pointed at a TLS port -- and Vercel serves
 * HTTPS only, 308-redirecting plain HTTP, which the firmware does not follow. So traffic goes via
 * a plain-HTTP relay that forwards to FarmFlow over TLS. The device panel once told estates to use
 * port 443, which cannot work with this hardware.
 *
 * These constants live here rather than in a component because two screens now show them, and a
 * relay address that is right on one screen and stale on the other is worse than no screen at all.
 */
export const BIOMETRIC_RELAY_HOST = process.env.NEXT_PUBLIC_BIOMETRIC_RELAY_HOST || "140.245.251.148"
export const BIOMETRIC_RELAY_PORT = process.env.NEXT_PUBLIC_BIOMETRIC_RELAY_PORT || "8001"

/**
 * Heartbeats arrive about every 30s (HEARTBEAT_STALE_AFTER_MS in lib/biometric-attendance.ts), so
 * polling faster than that during setup only burns battery on a phone held next to the terminal.
 */
export const SCANNER_SETUP_POLL_MS = 15_000

export type ScannerSignals = {
  deviceCount: number
  /** Has any registered terminal ever called in? Distinct from "is it online right now". */
  anyDeviceSeen: boolean
  anyDeviceOnline: boolean
  punchCount: number
  unmappedCount: number
  mappedWorkerCount: number
}

export type ScannerSetupState = {
  registered: boolean
  reachedUs: boolean
  /** Somebody on the roster carries a fingerprint id -- the numbers to enrol on the terminal. */
  rosterHasIds: boolean
  punchesArriving: boolean
  allMapped: boolean
}

/**
 * Which setup steps are genuinely done.
 *
 * Each answer comes from evidence, never from "the estate says they did it". The distinctions
 * matter more than they look:
 *
 * - `reachedUs` uses *ever seen*, not *online now*. A terminal that connected this morning and is
 *   asleep at 4pm has passed this step; marking it undone would send someone back to re-enter an
 *   IP that was always correct.
 * - `allMapped` requires at least one mapped worker. Zero unmapped codes is also what a tenant who
 *   has never received a punch looks like, and a green tick there says the roster is linked when
 *   nothing has been linked at all -- the same "empty means done" mistake the onboarding checklist
 *   made when it went green on the first priced item out of forty.
 *
 * `rosterHasIds` is deliberately "any", not "all", which breaks the house rule that a step is done
 * only when every row is done. The rule applies where the number is a denominator, and here it is
 * not knowable: an estate can quite reasonably keep a contract gang off the terminal entirely, so
 * there is no count of workers who *should* carry an id to divide by. The tab shows the raw "N of M
 * have one" instead and lets the estate decide whether the gap is a gap.
 */
export const scannerSetupState = (signals: ScannerSignals): ScannerSetupState => ({
  registered: signals.deviceCount > 0,
  reachedUs: signals.anyDeviceSeen || signals.anyDeviceOnline,
  rosterHasIds: signals.mappedWorkerCount > 0,
  punchesArriving: signals.punchCount > 0,
  allMapped: signals.unmappedCount === 0 && signals.mappedWorkerCount > 0,
})
