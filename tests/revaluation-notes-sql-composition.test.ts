import { afterEach, describe, expect, it, vi } from "vitest"
import { neon } from "@neondatabase/serverless"
import { EXCLUDE_REVALUATION_SQL } from "@/lib/revaluation-notes"

/**
 * Regression test for a real production incident (2026-09-15 scanner run).
 *
 * app/api/finance-balance-sheet/route.ts interpolated `${EXCLUDE_REVALUATION_SQL}` directly
 * into a neon tagged-template query (`sql\`...\``), the same way its sibling date/estate
 * clauses are composed. Those siblings work because they are themselves the *result* of
 * calling the same `sql` tag (neon's documented "composable queries" feature: nesting a
 * `sql\`\`` fragment splices its text in raw). `EXCLUDE_REVALUATION_SQL` is not one of those —
 * it's a plain string built with `.join()` — so interpolating it directly does NOT splice it
 * in as SQL text. Neon instead binds it as an ordinary parameter value, sending literally
 * `WHERE tenant_id = $1 $2` to Postgres with the whole multi-line clause as $2's *value* — a
 * syntax error on every call, which broke GET /api/finance-balance-sheet for every tenant.
 *
 * This intercepts the Neon HTTP driver's outgoing fetch (the ground truth for what Postgres
 * would actually receive — inspecting the tag function's internal queryData is not enough,
 * since sql.unsafe()'s marker object is only resolved into query text at fetch time) and
 * asserts the two interpolation styles produce what they actually produce, so a future
 * refactor that drops the `sql.unsafe(...)` wrapper fails a test instead of failing every
 * balance-sheet request in production.
 */
describe("EXCLUDE_REVALUATION_SQL composed into a neon tagged-template query", () => {
  // A syntactically valid-looking connection string is enough to construct the client --
  // neon() does not connect until a query is awaited. We stub fetch so nothing actually
  // hits the network; we only care what request body neon would have sent.
  const sql = neon("postgresql://user:pass@localhost:5432/db")

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const captureRequestBody = async (query: PromiseLike<unknown>): Promise<{ query: string; params: unknown[] }> => {
    let captured: { query: string; params: unknown[] } | null = null
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, opts: { body: string }) => {
        captured = JSON.parse(opts.body)
        return {
          ok: true,
          status: 200,
          json: async () => ({ command: "SELECT", rowCount: 0, rows: [], fields: [] }),
          text: async () => "{}",
        }
      }),
    )
    await query
    if (!captured) throw new Error("fetch was never called")
    return captured
  }

  it("BUG: interpolating the raw string directly binds it as a parameter, producing invalid SQL", async () => {
    const body = await captureRequestBody(
      sql`SELECT 1 FROM transaction_history WHERE tenant_id = ${"tenant-1"} ${EXCLUDE_REVALUATION_SQL}`,
    )

    // The exclusion clause lands as a bound parameter, not SQL text -- a bare, unjoined `$2`
    // sits in the WHERE clause with no operator connecting it to `tenant_id = $1`, which
    // Postgres rejects with a syntax error.
    expect(body.params).toEqual(["tenant-1", EXCLUDE_REVALUATION_SQL])
    expect(body.query).not.toContain("NOT ILIKE")
    expect(body.query.trim().endsWith("$2")).toBe(true)
  })

  it("FIX: wrapping it in sql.unsafe(...) splices it in as literal SQL text instead", async () => {
    const body = await captureRequestBody(
      sql`SELECT 1 FROM transaction_history WHERE tenant_id = ${"tenant-1"} ${sql.unsafe(EXCLUDE_REVALUATION_SQL)}`,
    )

    // Only the real parameter remains bound; the exclusion clause is now part of the query text.
    expect(body.params).toEqual(["tenant-1"])
    expect(body.query).toContain("NOT ILIKE 'Price updated%'")
    expect(body.query).toContain("NOT ILIKE 'Price correction%'")
  })
})
