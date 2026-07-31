import { describe, expect, it } from "vitest"
import {
  buildCrashReport,
  classifySession,
  parseRecords,
  pruneRecords,
  sessionDurationSeconds,
  MAX_RECORD_AGE_MS,
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
  interactions: 0,
  lastInteractionAt: null,
  usedHeapMb: null,
  heapLimitMb: null,
  appVersion: null,
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
    expect(
      classifySession(record({ lastSeenAt: NOW - 5 * 60_000, visibility: "visible" }), NOW),
    ).toBe("crashed")
  })

  it("does not call a session dead the instant it passes the interval", () => {
    // A busy main thread delays timers; a false crash report is worse than a missed one.
    expect(classifySession(record({ lastSeenAt: NOW - (STALE_AFTER_MS - 1) }), NOW)).toBe("active")
    expect(classifySession(record({ lastSeenAt: NOW - (STALE_AFTER_MS + 1) }), NOW)).toBe("crashed")
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
