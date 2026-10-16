import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * A DESTRUCTIVE PATH MUST BE GUARDED BY AN ALLOW-LIST, NEVER A DENY-LIST.
 *
 * `app/api/admin/seed-tenant` has a `resetExisting` flag that DELETEs from fifteen tables:
 * billing, receivables, quality, curing, journal, sales, dispatch, rainfall, pepper, processing,
 * expenses, labour, the stock ledger and current inventory. Everything an estate has ever
 * recorded except its muster.
 *
 * ⚠ IT WAS GUARDED BY `if (name.includes("honeyfarm")) refuse` -- a deny-list containing one
 * name. HoneyFarm was safe. Laxmi, Medappa Estates and Seshagiri are all "not HoneyFarm", so all
 * three passed, and so would every tenant that ever signs up. Owner login was the only other
 * control, and the owner is one account that is used daily.
 *
 * The asymmetry is the whole point: a deny-list fails OPEN for anything it has not heard of, and
 * the things it has not heard of are, by construction, the new ones. An allow-list fails CLOSED.
 *
 * Found by the 2026-10-15 scanner run, which correctly declined to fix it and escalated instead.
 */

/**
 * ⚠ COMMENTS STRIPPED FIRST, AND THAT IS LOAD-BEARING -- for the third time in this codebase.
 * The fix documents the old deny-list verbatim ("includes(\"honeyfarm\")") so a raw scan matches
 * its own explanation and fails while the code is correct. tests/a-failed-read-is-not-a-zero.ts
 * learned this on 2026-10-14 and I did not carry the lesson here until this test refused its own
 * baseline.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")

const ROUTE = stripComments(readFileSync("app/api/admin/seed-tenant/route.ts", "utf8"))

describe("seeding refuses any tenant it was not explicitly told is a demo", () => {
  it("still has the destructive reset this is guarding, so the test cannot pass vacuously", () => {
    expect(ROUTE).toMatch(/resetExisting/)
    expect(ROUTE).toMatch(/DELETE FROM \$\{?table\}?|DELETE FROM /)
    // The table list is what makes this serious -- if it shrinks to nothing the guard is moot,
    // and if it grows the guard matters more.
    const tables = ROUTE.slice(ROUTE.indexOf("const resetTables"), ROUTE.indexOf("]", ROUTE.indexOf("const resetTables")))
    expect(tables.split('"').filter((t) => /^[a-z_]+$/.test(t)).length).toBeGreaterThanOrEqual(10)
  })

  it("decides by an allow-list, not by excluding one name", () => {
    // The exact shape that shipped: a single-name deny-list.
    expect(
      /includes\("honeyfarm"\)/i.test(ROUTE),
      "the guard is back to excluding HoneyFarm by name, which permits every other tenant " +
        "including all three other real estates and every future signup",
    ).toBe(false)

    // And the replacement must be a membership test the default answer to which is "no".
    expect(ROUTE).toMatch(/DEMO_TENANTS/)
    expect(
      /!\s*DEMO_TENANTS\.includes\(/.test(ROUTE),
      "the allow-list must be used as a NEGATIVE gate (refuse when absent), not as a positive one",
    ).toBe(true)
  })

  it("names only demo tenants, and none of the four real estates", () => {
    const list = ROUTE.slice(ROUTE.indexOf("const DEMO_TENANTS"), ROUTE.indexOf("]", ROUTE.indexOf("const DEMO_TENANTS")))
    // Real tenants on production as of 2026-10-15. None may appear.
    for (const real of ["honeyfarm", "laxmi", "medappa", "seshagiri", "greenvalley"]) {
      expect(
        list.toLowerCase().includes(real),
        `${real} is a real tenant and must never be seedable -- seeding deletes fifteen tables`,
      ).toBe(false)
    }
    expect(list.toLowerCase()).toContain("estate mock")
  })

  it("refuses before deleting anything, not after", () => {
    // Order matters: a guard that runs after the first DELETE has already destroyed data.
    const guardAt = ROUTE.search(/!\s*DEMO_TENANTS\.includes\(/)
    const deleteAt = ROUTE.indexOf("DELETE FROM")
    expect(guardAt).toBeGreaterThan(-1)
    expect(deleteAt).toBeGreaterThan(-1)
    expect(
      guardAt < deleteAt,
      "the demo-tenant check must come before the first DELETE",
    ).toBe(true)
  })
})
