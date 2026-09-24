import { beforeEach, describe, expect, it, vi } from "vitest"

// vi.hoisted so the hoisted vi.mock factory can close over it (same pattern as
// tests/labour-entry-mode.test.ts).
const { query } = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock("@/lib/server/db", () => ({ adminSql: { query: (...args: unknown[]) => query(...args) } }))

import { fetchActivityByEstate, fetchTenantEstateNames } from "@/lib/server/agents/digest-estate-breakdown"

beforeEach(() => query.mockReset())

describe("fetchActivityByEstate", () => {
  it("sums rows that land in the same estate bucket instead of keeping only the last", () => {
    // Two rows mapping to "Unassigned" (e.g. NULL estate and '' estate, grouped separately by an
    // older version of the SQL) used to overwrite each other.
    query
      .mockResolvedValueOnce([]) // processing
      .mockResolvedValueOnce([
        { estate: "Tirtha", value: 1000 },
        { estate: "Unassigned", value: 300 },
        { estate: "Unassigned", value: 200 },
      ]) // labour
      .mockResolvedValue([]) // expense, dispatch, sales
    return fetchActivityByEstate("t1", ["Citrus", "Tirtha"], "2026-09-01", "2026-09-07").then((rows) => {
      const unassigned = rows.find((r) => r.estate === "Unassigned")
      expect(unassigned?.laborCost).toBe(500)
      expect(rows.find((r) => r.estate === "Tirtha")?.laborCost).toBe(1000)
    })
  })

  it("groups on the trimmed estate tag, so a stray space cannot split an estate off the email", async () => {
    query.mockResolvedValue([])
    await fetchActivityByEstate("t1", ["Citrus", "Tirtha"], "2026-09-01", "2026-09-07")
    expect(query).toHaveBeenCalledTimes(5)
    for (const [text, params] of query.mock.calls) {
      expect(text).toContain("COALESCE(NULLIF(BTRIM(l.estate), ''), 'Unassigned') AS estate")
      expect(text).toContain("GROUP BY 1")
      expect(text).toMatch(/\.tenant_id = \$1/)
      expect(params[0]).toBe("t1")
    }
  })

  it("returns nothing for a single-estate tenant without querying", async () => {
    expect(await fetchActivityByEstate("t1", ["Only"], "2026-09-01", "2026-09-07")).toEqual([])
    expect(query).not.toHaveBeenCalled()
  })
})

describe("fetchTenantEstateNames", () => {
  it("trims and de-duplicates estate tags", async () => {
    query.mockResolvedValueOnce([{ estate: "Tirtha" }, { estate: "Tirtha " }, { estate: "Citrus" }])
    expect(await fetchTenantEstateNames("t1")).toEqual(["Tirtha", "Citrus"])
  })
})
