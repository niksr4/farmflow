import { describe, expect, it } from "vitest"
import {
  EMPTY_WRITE_QUEUE_STATUS,
  parseWriteQueueEntries,
  parseWriteQueueStatus,
} from "../lib/write-queue"

const NOW = 1_800_000_000_000

describe("parseWriteQueueEntries", () => {
  it("normalises a well-formed entry", () => {
    expect(
      parseWriteQueueEntries([
        {
          id: 7,
          method: "post",
          pathname: "/api/labor-neon",
          url: "https://thefarmflow.in/api/labor-neon",
          queuedAt: NOW,
          attempts: 2,
          lastError: "offline",
          lastStatus: 401,
          blockedReason: "auth",
        },
      ]),
    ).toEqual([
      {
        id: 7,
        method: "POST",
        pathname: "/api/labor-neon",
        url: "https://thefarmflow.in/api/labor-neon",
        queuedAt: NOW,
        attempts: 2,
        lastError: "offline",
        lastStatus: 401,
        blockedReason: "auth",
      },
    ])
  })

  it("drops entries with no usable id", () => {
    // Every action the card offers is keyed on the id; a zero-id row is a dead button.
    expect(parseWriteQueueEntries([{ id: 0 }, { id: null }, {}, { id: 3 }])).toHaveLength(1)
  })

  it("survives junk from a stale service worker without throwing", () => {
    // The worker can be several deploys behind the page, so its payload is untrusted input.
    expect(parseWriteQueueEntries(null)).toEqual([])
    expect(parseWriteQueueEntries("nope")).toEqual([])
    expect(parseWriteQueueEntries([null, undefined, 42, "x"])).toEqual([])
  })

  it("defaults a missing method rather than rendering undefined", () => {
    const [entry] = parseWriteQueueEntries([{ id: 1 }])
    expect(entry.method).toBe("POST")
    expect(entry.lastError).toBe("")
    expect(entry.lastStatus).toBeNull()
  })

  it("keeps lastStatus null rather than coercing it to zero", () => {
    // 0 would render as a status code that never existed.
    const [entry] = parseWriteQueueEntries([{ id: 1, lastStatus: null }])
    expect(entry.lastStatus).toBeNull()
  })
})

describe("parseWriteQueueStatus", () => {
  it("reads the current field names", () => {
    expect(
      parseWriteQueueStatus(
        { pendingCount: 3, blockedAuthCount: 1, blockedReviewCount: 2, updatedAt: NOW },
        NOW,
      ),
    ).toMatchObject({ pendingCount: 3, blockedAuthCount: 1, blockedReviewCount: 2, updatedAt: NOW })
  })

  it("accepts the legacy field names an older worker sends", () => {
    // A stale worker reporting blockedCount/reviewCount must not read as an empty queue —
    // the user would be told their offline writes had gone through when they had not.
    const status = parseWriteQueueStatus({ blockedCount: 4, reviewCount: 5 }, NOW)
    expect(status.blockedAuthCount).toBe(4)
    expect(status.blockedReviewCount).toBe(5)
  })

  it("prefers the current field name when both are present", () => {
    const status = parseWriteQueueStatus({ blockedAuthCount: 1, blockedCount: 9 }, NOW)
    expect(status.blockedAuthCount).toBe(1)
  })

  it("falls back to an empty snapshot for missing or malformed detail", () => {
    expect(parseWriteQueueStatus(null, NOW)).toEqual({ ...EMPTY_WRITE_QUEUE_STATUS, updatedAt: NOW })
    expect(parseWriteQueueStatus(undefined, NOW)).toEqual({
      ...EMPTY_WRITE_QUEUE_STATUS,
      updatedAt: NOW,
    })
  })

  it("clamps nonsense counts to zero instead of rendering NaN", () => {
    const status = parseWriteQueueStatus({ pendingCount: "many", blockedAuthCount: -3 }, NOW)
    expect(status.pendingCount).toBe(0)
    expect(status.blockedAuthCount).toBe(0)
  })

  it("stamps updatedAt when the worker omits it", () => {
    expect(parseWriteQueueStatus({ pendingCount: 1 }, NOW).updatedAt).toBe(NOW)
  })
})
