import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * The muster roll follows the estate selector, like the other thirty-four routes.
 *
 * It used to be the exception, on the reasoning that presence has no place: a day's attendance
 * carries no location, so an estate filter can only match a property of the worker, not of the
 * work. True, and not the point -- a selector that scopes the whole app except one screen is
 * something people learn to work around rather than a rule.
 *
 * THE DANGEROUS PART IS THE DELETE. PUT removes any attendance row for the date whose worker is
 * not in presentWorkerIds. Scope the roll without scoping the delete and saving Honeyfarm's roll
 * wipes Sidapur's attendance for that day -- the save succeeds, the rows vanish, and neither
 * screen says anything.
 */
const route = readFileSync("app/api/attendance/route.ts", "utf8")

describe("the roll is scoped", () => {
  it("filters workers by the active estate", () => {
    expect(route).toContain("const rollEstateClause = activeEstate")
    expect(route).toContain("AND (estate IS NULL OR estate = ${activeEstate})")
  })

  it("and applies it to the workers query", () => {
    const q = route.slice(route.indexOf("FROM attendance_workers"), route.indexOf("ORDER BY LOWER(full_name)"))
    expect(q).toContain("${rollEstateClause}")
  })

  it("a worker with no estate still serves every estate", () => {
    // Laxmi's 21 carry no estate. Dropping the IS NULL arm would empty their roll entirely.
    expect(route).toMatch(/estate IS NULL OR estate = \$\{activeEstate\}/)
  })
})

/**
 * Reported 2026-08-26 and the reason this block exists: the roll showed Sidapur's eight people
 * while "Save · 19 present" kept counting all thirty-six. Only the workers query carried the
 * estate clause; everything the screen derives from the day -- presence, picking, the weekly
 * summary -- read the whole tenant. The totals described a different set of people than the rows
 * above them.
 */
describe("everything the day derives is cut the same way the roll is", () => {
  it("scopes the presence read, which is where the save-bar count comes from", () => {
    const q = route.slice(route.indexOf("FROM attendance_records"), route.indexOf("FROM picking_records"))
    expect(q).toContain("${recordEstateClause}")
  })

  it("scopes picking the same way", () => {
    const q = route.slice(route.indexOf("FROM picking_records"))
    expect(q.slice(0, 400)).toContain("${recordEstateClause}")
  })

  it("scopes the weekly summary, which aliases the worker table", () => {
    expect(route).toContain("const weeklyEstateClause = activeEstate")
    const q = route.slice(route.indexOf("COUNT(ar.id)::int"), route.indexOf("GROUP BY w.id"))
    expect(q).toContain("${weeklyEstateClause}")
  })

  it("reaches the estate through the worker, since attendance has no estate of its own", () => {
    const clause = route.slice(route.indexOf("const recordEstateClause"), route.indexOf("const weeklyEstateClause"))
    expect(clause).toContain("FROM attendance_workers")
    expect(clause).toContain("(estate IS NULL OR estate = ${activeEstate})")
  })
})

describe("the delete is scoped in lockstep, or attendance disappears", () => {
  it("the delete clause is not empty", () => {
    expect(route).not.toContain("const estateWorkerScopeClause = accountsSql``\n")
    expect(route).toContain("const estateWorkerScopeClause = putEstate")
  })

  it("it restricts to the same predicate the roll uses", () => {
    const clause = route.slice(route.indexOf("const estateWorkerScopeClause"), route.indexOf("// Diff, not replace"))
    expect(clause).toContain("FROM attendance_workers")
    expect(clause).toContain("(estate IS NULL OR estate = ${putEstate})")
  })

  it("and the delete actually uses it", () => {
    const del = route.slice(route.indexOf("DELETE FROM attendance_records"))
    expect(del.slice(0, 300)).toContain("${estateWorkerScopeClause}")
  })

  it("both sides read the estate the same way", () => {
    // Two different resolutions would be two different sets, which is the drift this guards.
    expect((route.match(/resolveActiveEstate\(/g) ?? []).length).toBe(2)
    expect((route.match(/SELECTED_ESTATE_COOKIE/g) ?? []).length).toBe(3)
  })

  it("with no estate selected, neither is scoped", () => {
    // "All estates" must behave exactly as before: whole roll, unscoped delete.
    expect(route).toMatch(/: accountsSql``/)
  })
})
