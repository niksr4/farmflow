/**
 * Crash beacon — detecting sessions that ended without the page ever getting to say goodbye.
 *
 * The motivating case: hammering buttons in the iOS PWA killed the app repeatedly and nothing
 * appeared in Sentry, PostHog, or anywhere else. That is not a reporting misconfiguration
 * (though there was one of those too); it is structural. When iOS kills the WebKit content
 * process under memory pressure, JavaScript stops mid-instruction. No error is thrown, no
 * handler runs, no request is sent. Every in-page error reporter lives inside the process that
 * just died, so a process-level crash is invisible from the inside — by construction.
 *
 * The only way to see these is to notice them on the NEXT load: keep a heartbeat in
 * localStorage, and on startup look for a session that stopped beating while it was still in
 * the foreground and never recorded a clean teardown.
 *
 * This module holds the pure logic (classification, pruning, storage marshalling) so it can be
 * unit-tested without a DOM. The lifecycle wiring lives in components/crash-beacon.tsx.
 */

export const CRASH_BEACON_STORAGE_KEY = "farmflow:session-beacons"

/** How often the page updates its heartbeat while in the foreground. */
export const HEARTBEAT_INTERVAL_MS = 5_000

/**
 * A foreground session whose heartbeat is older than this is considered dead rather than
 * merely slow. Generous relative to the interval — a busy main thread can delay a timer for
 * a surprisingly long time on a loaded phone, and a false crash report is worse than a
 * missed one.
 */
export const STALE_AFTER_MS = 30_000

/** Cap on stored records so a pathological loop can never grow localStorage without bound. */
export const MAX_STORED_RECORDS = 10

/** Records older than this are dropped unreported — too stale to be actionable. */
export const MAX_RECORD_AGE_MS = 24 * 60 * 60 * 1000

export type SessionVisibility = "visible" | "hidden"

export type SessionRecord = {
  id: string
  startedAt: number
  lastSeenAt: number
  /** Visibility at the moment of the last heartbeat — the crash/backgrounded discriminator. */
  visibility: SessionVisibility
  /** Set on pagehide. Its absence is what makes a session suspicious. */
  closedAt: number | null
  url: string
  /** Interactions this session — a high count on a crashed session is the smoking gun. */
  interactions: number
  lastInteractionAt: number | null
  /** Chromium-only; absent on iOS Safari, which is where we most want it. */
  usedHeapMb: number | null
  heapLimitMb: number | null
  appVersion: string | null
  /**
   * Who was using the app when it died. Captured from the LIVE session, because the report is
   * emitted on the next load — which is frequently the logged-out landing page (proxy.ts
   * redirects a session-less request to "/"), by which point Sentry has already been told
   * setUser(null). Without this, every crash report arrives with Users: 0 and there is no way
   * to tell one struggling device apart from a fleet-wide regression, which is the only
   * question that matters when triaging one.
   */
  tenantId: string | null
  username: string | null
}

export type SessionOutcome =
  /** Still beating — this is the current session, or another live tab. */
  | "active"
  /** Closed cleanly via pagehide. Nothing to report. */
  | "clean"
  /**
   * Went quiet while backgrounded. iOS reclaims backgrounded web content routinely and the
   * user experiences this as "the app reloaded", not "the app crashed". Not worth alerting on.
   */
  | "backgrounded"
  /**
   * Went quiet while in the foreground with no teardown. The app died underneath the user.
   * This is the one worth reporting.
   */
  | "crashed"

export function classifySession(
  record: SessionRecord,
  now: number,
  staleAfterMs: number = STALE_AFTER_MS,
): SessionOutcome {
  if (record.closedAt !== null) return "clean"
  if (now - record.lastSeenAt <= staleAfterMs) return "active"
  return record.visibility === "visible" ? "crashed" : "backgrounded"
}

/** Whole seconds the session survived before it stopped reporting. */
export const sessionDurationSeconds = (record: SessionRecord): number =>
  Math.max(0, Math.round((record.lastSeenAt - record.startedAt) / 1000))

/**
 * Drop records that are too old to act on and keep only the newest few. Runs on every load,
 * so it is also the mechanism that stops a crash-loop from filling storage.
 */
export function pruneRecords(
  records: SessionRecord[],
  now: number,
  maxRecords: number = MAX_STORED_RECORDS,
  maxAgeMs: number = MAX_RECORD_AGE_MS,
): SessionRecord[] {
  return records
    .filter((record) => now - record.startedAt <= maxAgeMs)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, maxRecords)
}

/**
 * Parse whatever is in storage without ever throwing. Storage is shared, user-writable, and
 * survives deploys, so it must be treated as untrusted input: a malformed blob should cost us
 * one dropped report, not a crash inside the crash reporter.
 */
export function parseRecords(raw: string | null): SessionRecord[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isSessionRecord)
  } catch {
    return []
  }
}

function isSessionRecord(value: unknown): value is SessionRecord {
  if (!value || typeof value !== "object") return false
  const record = value as Partial<SessionRecord>
  return (
    typeof record.id === "string" &&
    typeof record.startedAt === "number" &&
    Number.isFinite(record.startedAt) &&
    typeof record.lastSeenAt === "number" &&
    Number.isFinite(record.lastSeenAt) &&
    (record.visibility === "visible" || record.visibility === "hidden") &&
    (record.closedAt === null || typeof record.closedAt === "number")
  )
}

/** Context attached to the outbound report. Flat and primitive — safe for both transports. */
export function buildCrashReport(record: SessionRecord, now: number) {
  return {
    sessionId: record.id,
    // `?? null` rather than a bare read: records written by a previous deploy are already in
    // localStorage without these fields, and they survive isSessionRecord (which only validates
    // the fields classification depends on). Normalising here keeps `undefined` out of the
    // outbound payload on the first load after this ships.
    tenantId: record.tenantId ?? null,
    username: record.username ?? null,
    durationSeconds: sessionDurationSeconds(record),
    secondsSinceLastHeartbeat: Math.round((now - record.lastSeenAt) / 1000),
    interactions: record.interactions,
    secondsSinceLastInteraction:
      record.lastInteractionAt === null
        ? null
        : Math.round((record.lastSeenAt - record.lastInteractionAt) / 1000),
    url: record.url,
    usedHeapMb: record.usedHeapMb,
    heapLimitMb: record.heapLimitMb,
    appVersion: record.appVersion,
    /**
     * Rapid interaction immediately before death is the signature of the reported bug
     * (memory pressure from burst input), as opposed to a slow leak over a long session.
     */
    burstSuspected:
      record.interactions >= 20 &&
      record.lastInteractionAt !== null &&
      record.lastSeenAt - record.lastInteractionAt <= 10_000,
  }
}
