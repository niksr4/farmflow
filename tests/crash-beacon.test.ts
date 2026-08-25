import { describe, expect, it } from "vitest"
import {
  buildCrashReport,
  classifySession,
  parseRecords,
  pruneRecords,
  sessionDurationSeconds,
  MAX_RECORD_AGE_MS,
  MIN_CRASH_DURATION_MS,
  MIN_CRASH_INTERACTIONS,
  STALE_AFTER_MS,
  type SessionRecord,
} from "../lib/crash-beacon"

const NOW = 1_800_000_000_000

const record = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  id: "s1",
  startedAt: NOW - 60_000,
  lastSeenAt: NOW - 1_000,
  visibility: "visible",
  closedAt: null,
  url: "/dashboard",
  // A session someone was actually in. It has to clear MIN_CRASH_INTERACTIONS for these cases to
  // be about staleness at all -- the default used to be 0 interactions, which now classifies as
  // "never started" and would have made every test below pass for the wrong reason.
  interactions: 3,
  lastInteractionAt: NOW - 5_000,
  usedHeapMb: null,
  heapLimitMb: null,
  appVersion: null,
  tenantId: null,
  username: null,
  ...overrides,
})

describe("classifySession", () => {
  it("treats a recently-beating session as active", () => {
    expect(classifySession(record({ lastSeenAt: NOW - 2_000 }), NOW)).toBe("active")
  })

  it("treats a session closed via pagehide as clean, however stale", () => {
    expect(
      classifySession(record({ lastSeenAt: NOW - 10 * 60_000, closedAt: NOW - 10 * 60_000 }), NOW),
    ).toBe("clean")
  })

  // The core discriminator. iOS reclaims backgrounded web content routinely; the user reads
  // that as "it reloaded", not "it crashed". Alerting on it would bury the real signal.
  it("treats a stale hidden session as a background reclaim, not a crash", () => {
    expect(
      classifySession(record({ lastSeenAt: NOW - 5 * 60_000, visibility: "hidden" }), NOW),
    ).toBe("backgrounded")
  })

  it("reports a stale foreground session with no teardown as a crash", () => {
    // startedAt moved back with lastSeenAt. It used to be left at the default, which put the
    // session's last heartbeat four minutes BEFORE it started -- an impossible record that only
    // passed because nothing looked at duration. sessionDurationSeconds clamps such a record to
    // zero, so it now reads as a page that never ran.
    expect(
      classifySession(
        record({ startedAt: NOW - 10 * 60_000, lastSeenAt: NOW - 5 * 60_000, visibility: "visible" }),
        NOW,
      ),
    ).toBe("crashed")
  })

  it("does not call a session dead the instant it passes the interval", () => {
    // A busy main thread delays timers; a false crash report is worse than a missed one.
    expect(classifySession(record({ lastSeenAt: NOW - (STALE_AFTER_MS - 1) }), NOW)).toBe("active")
    expect(classifySession(record({ lastSeenAt: NOW - (STALE_AFTER_MS + 1) }), NOW)).toBe("crashed")
  })
})

describe("a session has to have been one before its death is reported", () => {
  /**
   * This was the loudest issue in production Sentry -- 22 events, 4 users, three weeks -- and every
   * sampled event read durationSeconds: 0, interactions: 0, tenantId: unknown, on Android Chrome.
   * Those are not crashes. They are page loads that went somewhere else immediately: a redirect to
   * /login, a prefetch, a link preview, a bot.
   */
  const stale = { lastSeenAt: NOW - (STALE_AFTER_MS + 1) }

  it("a page nobody touched is not a crash", () => {
    expect(classifySession(record({ ...stale, interactions: 0 }), NOW)).toBe("backgrounded")
  })

  it("a page that barely existed is not a crash, even if it was touched", () => {
    // Half a second. Deliberately not "one millisecond under the floor": sessionDurationSeconds
    // rounds to whole seconds, so 1,999 ms reads as 2 s and clears a 2,000 ms bar -- the real
    // boundary is 1.5 s. That is fine for a floor whose only job is excluding pages nobody saw,
    // but a test asserting the exact edge would be asserting the rounding, not the rule.
    const blink = NOW - (STALE_AFTER_MS + 1)
    expect(
      classifySession(record({ startedAt: blink - 500, lastSeenAt: blink }), NOW),
    ).toBe("backgrounded")
  })

  it("but a real session that died in the foreground still is", () => {
    expect(
      classifySession(
        record({ ...stale, startedAt: NOW - 120_000, interactions: MIN_CRASH_INTERACTIONS }),
        NOW,
      ),
    ).toBe("crashed")
  })

  it("the floor never overrides a clean teardown or a live session", () => {
    // Order matters: a 0-interaction session that closed properly is "clean", not "backgrounded".
    expect(classifySession(record({ interactions: 0, closedAt: NOW - 1_000 }), NOW)).toBe("clean")
    expect(classifySession(record({ interactions: 0, lastSeenAt: NOW - 1_000 }), NOW)).toBe("active")
  })
})

describe("pruneRecords", () => {
  it("drops records older than the retention window", () => {
    const fresh = record({ id: "fresh", startedAt: NOW - 1_000 })
    const ancient = record({ id: "ancient", startedAt: NOW - MAX_RECORD_AGE_MS - 1 })
    const kept = pruneRecords([fresh, ancient], NOW)
    expect(kept.map((r) => r.id)).toEqual(["fresh"])
  })

  it("keeps only the newest records so a crash loop cannot fill storage", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      record({ id: `s${i}`, startedAt: NOW - i * 1_000 }),
    )
    const kept = pruneRecords(many, NOW, 10)
    expect(kept).toHaveLength(10)
    expect(kept[0].id).toBe("s0")
  })
})

describe("parseRecords", () => {
  it("returns nothing for absent or malformed storage", () => {
    expect(parseRecords(null)).toEqual([])
    expect(parseRecords("not json")).toEqual([])
    expect(parseRecords('{"not":"an array"}')).toEqual([])
  })

  it("discards entries that are not well-formed records", () => {
    // Storage is user-writable and survives deploys — treat it as untrusted input.
    const raw = JSON.stringify([
      record(),
      { id: "bad" },
      null,
      { ...record({ id: "bad-visibility" }), visibility: "sideways" },
      { ...record({ id: "bad-time" }), lastSeenAt: "soon" },
    ])
    const parsed = parseRecords(raw)
    expect(parsed.map((r) => r.id)).toEqual(["s1"])
  })

  it("round-trips a valid record", () => {
    const original = record({ interactions: 12, lastInteractionAt: NOW - 500 })
    expect(parseRecords(JSON.stringify([original]))).toEqual([original])
  })
})

describe("buildCrashReport", () => {
  it("summarises how long the session lived and how quiet it went", () => {
    const report = buildCrashReport(
      record({ startedAt: NOW - 120_000, lastSeenAt: NOW - 60_000 }),
      NOW,
    )
    expect(report.durationSeconds).toBe(60)
    expect(report.secondsSinceLastHeartbeat).toBe(60)
  })

  it("carries the dead session's tenant and user so the report is attributable", () => {
    // The whole point: this report is emitted on the NEXT load, which is usually the
    // logged-out landing page. Attribution has to travel with the record or the issue
    // arrives with Users: 0 and cannot be told apart from a fleet-wide regression.
    const report = buildCrashReport(
      record({ tenantId: "41b4b10c-428c-4155-882f-1cc7f6e89a78", username: "KAB123" }),
      NOW,
    )
    expect(report.tenantId).toBe("41b4b10c-428c-4155-882f-1cc7f6e89a78")
    expect(report.username).toBe("KAB123")
  })

  it("normalises attribution to null for records written by an earlier deploy", () => {
    // Records already sitting in localStorage predate these fields and still pass
    // isSessionRecord, which only validates what classification needs. They must not put
    // `undefined` on the wire on the first load after this ships.
    const legacy = record()
    delete (legacy as Partial<SessionRecord>).tenantId
    delete (legacy as Partial<SessionRecord>).username

    const report = buildCrashReport(legacy, NOW)
    expect(report.tenantId).toBeNull()
    expect(report.username).toBeNull()
  })

  it("flags a burst when many taps land right before the session dies", () => {
    const report = buildCrashReport(
      record({ interactions: 40, lastSeenAt: NOW - 1_000, lastInteractionAt: NOW - 3_000 }),
      NOW,
    )
    expect(report.burstSuspected).toBe(true)
  })

  it("does not flag a burst for a long quiet session that simply died", () => {
    const report = buildCrashReport(
      record({ interactions: 3, lastSeenAt: NOW - 1_000, lastInteractionAt: NOW - 600_000 }),
      NOW,
    )
    expect(report.burstSuspected).toBe(false)
  })

  it("does not flag a burst when taps were many but long finished", () => {
    const report = buildCrashReport(
      record({ interactions: 50, lastSeenAt: NOW, lastInteractionAt: NOW - 60_000 }),
      NOW,
    )
    expect(report.burstSuspected).toBe(false)
  })
})

describe("sessionDurationSeconds", () => {
  it("never returns a negative duration when clocks disagree", () => {
    // localStorage survives system clock changes; a negative duration would be nonsense.
    expect(sessionDurationSeconds(record({ startedAt: NOW, lastSeenAt: NOW - 10_000 }))).toBe(0)
  })
})
