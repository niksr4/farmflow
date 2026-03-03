import { describe, expect, it } from "vitest"

import {
  isMissingRelation,
  normalizeBagType,
  resolveDispatchReceivedKgs,
  resolveSalesKgs,
  toLocationBucket,
} from "../lib/server/season-summary-utils"

describe("season summary utils", () => {
  it("normalizes bag type and location buckets", () => {
    expect(normalizeBagType("dry cherry")).toBe("Dry Cherry")
    expect(normalizeBagType("parchment")).toBe("Dry Parchment")
    expect(toLocationBucket("Main A", "")).toBe("MAIN")
    expect(toLocationBucket("Hill Block", "HB")).toBe("HB")
    expect(toLocationBucket("", "")).toBe("Unknown")
  })

  it("resolves dispatch and sales KGs with correct fallback order", () => {
    expect(resolveDispatchReceivedKgs({ kgs_received: 210, bags_dispatched: 2 }, 50)).toBe(210)
    expect(resolveDispatchReceivedKgs({ kgs_received: 0, bags_dispatched: 2 }, 50)).toBe(100)

    expect(resolveSalesKgs({ sold_kgs: 120, bags_sold: 3 }, 50)).toBe(120)
    expect(resolveSalesKgs({ sold_kgs: 0, kgs: 75, bags_sold: 3 }, 50)).toBe(75)
    expect(resolveSalesKgs({ sold_kgs: 0, kgs: 0, bags_sold: 3 }, 50)).toBe(150)
  })

  it("detects missing relation errors", () => {
    const error = new Error('relation "receivables" does not exist')
    expect(isMissingRelation(error, "receivables")).toBe(true)
    expect(isMissingRelation(error, "journal_entries")).toBe(false)
  })
})
