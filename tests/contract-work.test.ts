import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * A job priced as a whole -- "Rathi & Team, Rs 70,000 to clear the new block".
 *
 * The column, the route's POST, and the roster's "Contract crew" have all existed since the muster
 * shipped. The one missing piece was an input: nothing on any screen could send a lump sum, so
 * lump_sum has 0 rows across all four live estates while the old Labour tab still holds real
 * contract entries of Rs 70,000, Rs 70,000 and Rs 10,500. That gap is what keeps the old labour
 * write path alive, so this is the last thing standing between the two and retiring it.
 *
 * TWO THINGS HAD TO BE FIXED BEFORE THE INPUT COULD SAFELY EXIST, and both were only reachable
 * once it did -- which is why neither had ever fired:
 *
 *   1. POST wrote lump_sum onto EVERY row of a batch. A Rs 70,000 contract for a crew of twenty
 *      would have stored Rs 14,00,000. The day cap counts days, not money, so nothing would have
 *      objected and total_cost would have been faithfully wrong twenty times over.
 *
 *   2. PUT never touched lump_sum. A contract agreed at Rs 70,000 and settled at Rs 65,000 could
 *      not be corrected, and a row could never go back to per-head pricing because the stored
 *      lump sum keeps winning inside COALESCE(lump_sum, rate x headcount x day_fraction).
 *
 * Fixing (2) then created a third: an edit sends the whole row and an absent lumpSum means "price
 * this per day", so a panel that did not PREFILL the existing price would wipe it on any edit.
 */
const route = readFileSync("app/api/attendance/assignments/route.ts", "utf8")
const panel = readFileSync("components/attendance/worker-allocation.tsx", "utf8")
const muster = readFileSync("components/attendance-tab.tsx", "utf8")

describe("a contract price is the price of the job, not of each person on it", () => {
  it("divides across the selection instead of repeating on every row", () => {
    expect(route).toContain("const lumpSumEach = lumpSum == null ? null : rows.length > 0 ? lumpSum / rows.length : lumpSum")
  })

  it("and the insert uses the divided value, not the raw one", () => {
    const insert = route.slice(route.indexOf("INSERT INTO labour_assignments"))
    expect(insert.slice(0, 900)).toContain("${lumpSumEach}")
    expect(insert.slice(0, 900)).not.toMatch(/\$\{lumpSum\}/)
  })

  it("guards against a negative price on both the create and the edit path", () => {
    expect((route.match(/A contract amount cannot be negative/g) ?? []).length).toBe(2)
  })
})

describe("a contract price can be corrected and cleared", () => {
  it("the edit path writes lump_sum", () => {
    const update = route.slice(route.indexOf("UPDATE labour_assignments"))
    expect(update.slice(0, 700)).toContain("lump_sum          = ${editLumpSum}")
  })

  it("absent means per-head, not unchanged — that is what makes clearing possible", () => {
    // COALESCE(${editLumpSum}, lump_sum) would look tidier and would make a contract permanent.
    const update = route.slice(route.indexOf("UPDATE labour_assignments"))
    expect(update.slice(0, 700)).not.toContain("COALESCE(${editLumpSum}")
  })

  it("so the panel must prefill it, or every edit silently wipes the price", () => {
    expect(panel).toContain('editing?.lumpSum != null ? String(editing.lumpSum) : ""')
  })
})

describe("the panel says which pricing is in force", () => {
  it("offers the field", () => {
    expect(panel).toContain("const [contractPrice, setContractPrice]")
    expect(panel).toContain('aria-label="Contract price for the whole job"')
  })

  it("disables the daily rate rather than letting a contract silently override it", () => {
    // total_cost is COALESCE(lump_sum, rate x ...), so a filled rate beside a filled contract is
    // a number that looks used and is not.
    expect(panel).toContain("disabled={isContract}")
    expect(panel).toContain("not used on a contract")
  })

  it("previews exactly what gets stored, contract or per-head", () => {
    expect(panel).toContain("const total = isContract")
    // "Rs 70,000" beside twenty names means either the job or each of them. The gap is Rs 13 lakh.
    expect(panel).toContain("each across")
  })

  it("does not warn about a missing daily wage on a contract, where no wage is used", () => {
    expect(panel).toContain("if (isContract) {")
  })

  it("clears the price after a save, like every other field", () => {
    expect(panel).toContain('setContractPrice("")')
  })
})

describe("a contract row is legible on the muster", () => {
  it("is marked, so the price is not read as a day rate", () => {
    expect(muster).toContain("a.lumpSum != null &&")
    expect(muster).toContain(">contract</span>")
  })
})
