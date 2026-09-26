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
      // Shape, not the exact character class: BTRIM must take an explicit second argument, because
      // BTRIM(x) on its own trims spaces only and that is what diverged from the name list.
      expect(text).toMatch(/COALESCE\(NULLIF\(BTRIM\(l\.estate,\s*E'[^']*'\),\s*''\),\s*'Unassigned'\) AS estate/)
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
  it("de-duplicates estate tags", async () => {
    // The mock returns what the (now trimming) SQL returns. It used to return untrimmed values to
    // exercise a JS .trim() that has been removed -- see the divergence test below for why.
    query.mockResolvedValueOnce([{ estate: "Tirtha" }, { estate: "Tirtha" }, { estate: "Citrus" }])
    expect(await fetchTenantEstateNames("t1")).toEqual(["Tirtha", "Citrus"])
  })

  it("trims in SQL, in both the projection and the emptiness check", async () => {
    query.mockResolvedValueOnce([])
    await fetchTenantEstateNames("t1")
    const text = String(query.mock.calls[0][0])
    // Both, because an untrimmed NULLIF would let a whitespace-only tag through as a real estate.
    expect(text.match(/BTRIM\(/g) || []).toHaveLength(2)
  })
})

describe("the grouping key and the name list cannot disagree", () => {
  /**
   * THE INVARIANT THAT PREVENTS RECURRENCE, and the reason the JS .trim() is gone.
   *
   * BTRIM with no second argument trims SPACES ONLY; JS .trim() trims all whitespace. This file used
   * one on each side, so the two agreed on "Tirtha " and disagreed on "\tTirtha\t":
   *
   *   BTRIM(E'\tTirtha\t')  -> "\tTirtha\t"  (8 chars)   .trim() -> "Tirtha" (6)
   *
   * Verified against a real Postgres, not assumed. A tab-padded name therefore produced the key
   * "\tTirtha\t" and the list entry "Tirtha"; fetchActivityByEstate emits a zero row for every name
   * in the list, so the estate appeared in the digest reading all zeros while its actual activity was
   * dropped. Exactly the bug the file's own comment described as fixed -- for a different character.
   *
   * Raised by CodeRabbit on PR #37.
   *
   * Asserting the two expressions are the SAME is stronger than asserting either one is correct:
   * whatever the trim rule becomes, both readers get it. Keyed on the shape (BTRIM with an explicit
   * second argument, identical on both sides) rather than on the character class I chose today.
   */
  it("uses one identical trim expression on both sides", async () => {
    query.mockResolvedValue([])
    await fetchActivityByEstate("t1", ["Citrus", "Tirtha"], "2026-09-01", "2026-09-07")
    const activitySql = String(query.mock.calls[0][0])

    query.mockReset()
    query.mockResolvedValueOnce([])
    await fetchTenantEstateNames("t1")
    const namesSql = String(query.mock.calls[0][0])

    /**
     * EVERY BTRIM, not the first one that happens to match.
     *
     * The first version of this extracted one char class per statement with
     * /BTRIM\((?:\w+\.)?estate,\s*([^)]+)\)/ -- which finds the first BTRIM that HAS a second
     * argument. Breaking only the projection therefore matched the WHERE clause's BTRIM instead and
     * the test passed. Caught by tampering, not by reading it.
     *
     * The second argument is the whole point: BTRIM(x) with no char class trims spaces only, which
     * is what diverged from JS .trim().
     */
    const trimArgs = (text: string) =>
      [...text.matchAll(/BTRIM\(([^()]*)\)/g)].map((m) => {
        const inner = m[1]
        const comma = inner.indexOf(",")
        return comma === -1 ? null : inner.slice(comma + 1).trim()
      })

    const activityArgs = trimArgs(activitySql)
    const namesArgs = trimArgs(namesSql)

    expect(activityArgs.length, "expected the grouping key to trim").toBeGreaterThan(0)
    expect(namesArgs.length, "expected the name list to trim").toBeGreaterThan(0)

    const all = [...activityArgs, ...namesArgs]
    expect(
      all.filter((arg) => arg === null),
      "a bare BTRIM trims spaces only, which is the divergence itself",
    ).toEqual([])
    expect(
      [...new Set(all)],
      "one trim rule across both sides, or an estate's activity goes missing from the digest",
    ).toHaveLength(1)
  })

  it("does not re-normalise the names in JS on top of the SQL", async () => {
    /**
     * A JS .trim() after the SQL trim is what created the divergence: it normalised MORE than the
     * SQL did, so the name and the key could describe the same estate differently. Belt-and-braces
     * is the wrong instinct here -- a second, stricter normalization on one side only is not a
     * safety net, it is the bug.
     *
     * Proven behaviourally: hand the function a value the SQL would not have trimmed and check it
     * comes back untouched. A surviving .trim() would strip it and fail this.
     */
    query.mockResolvedValueOnce([{ estate: " Tirtha" }]) // non-breaking space: JS trims it, BTRIM does not
    const names = await fetchTenantEstateNames("t1")
    expect(names, "the name must match the grouping key byte for byte, tidy or not").toEqual([" Tirtha"])
  })
})
