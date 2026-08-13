import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * Neon returns bare `date` / `timestamp` columns as JS Date objects. That is harmless when the
 * value goes straight into NextResponse.json(), which serialises a Date to ISO-8601 — clients
 * slicing the first 10 characters then get the date they expect.
 *
 * It is NOT harmless when the route calls String() on it first. String(new Date(...)) produces
 * "Wed Jan 28 2026 00:00:00 GMT+0530 (India Standard Time)", so slice(0, 10) yields "Wed Jan 28".
 * That is the bug that took the Picking and Ledger tabs offline in 1272d15 ("crashing for some
 * tenants" — the tenants with any records): the date rendered as a weekday, and on edit that same
 * string was fed into <input type="date"> and then rejected by the route's own YYYY-MM-DD check.
 *
 * So the rule is narrow and mechanical: if a route String()s a date column, the SQL must cast it.
 * Asserted per-file rather than by scanning every route, because most bare date selects are
 * perfectly fine — they are serialised by NextResponse.json and never stringified by hand.
 */
const ROUTES_THAT_STRINGIFY_DATES = [
  { path: "app/api/picking-records/route.ts", column: "pick_date", stringified: "String(r.pick_date)" },
  { path: "app/api/worker-ledger/route.ts", column: "entry_date", stringified: "String(r.entry_date)" },
]

describe("date columns that are stringified server-side", () => {
  it.each(ROUTES_THAT_STRINGIFY_DATES)("$path casts $column to text", ({ path, column, stringified }) => {
    const source = readFileSync(path, "utf8")

    // Guards the premise: if the String() call is gone the cast may no longer be needed, and this
    // test should be revisited rather than silently passing for the wrong reason.
    expect(source).toContain(stringified)
    expect(source).toContain(`${column}::text`)
  })

  it("keeps the client slice honest for a cast column", () => {
    // What the client does with the value, both ways, so the failure mode stays legible.
    const castByPostgres = "2026-01-28"
    const uncastThenStringified = String(new Date("2026-01-28T00:00:00+05:30"))

    expect(castByPostgres.slice(0, 10)).toBe("2026-01-28")
    expect(uncastThenStringified.slice(0, 10)).not.toBe("2026-01-28")
    expect(/^\d{4}-\d{2}-\d{2}$/.test(uncastThenStringified.slice(0, 10))).toBe(false)
  })
})
