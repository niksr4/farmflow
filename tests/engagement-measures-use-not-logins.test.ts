import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The engagement report measures whether an estate USED the product, not whether it logged in.
 *
 * THE NUMBER THAT PROMPTED THIS. The daily report's fourth column read "Logins (7d)" and printed 0
 * for Medappa and 1 for Seshagiri, on a week when both recorded labour on six days out of seven.
 * The figure was literally correct and told the reader the opposite of the truth.
 *
 * Sessions roll, so an active writer authenticates once and then works for months:
 *
 *   Gagan Rai (Medappa)   1 login EVER, on 5 August       438 writes in the last 7 days
 *   KAB123 (HoneyFarm)    last login 25 July              114 writes in the last 7 days
 *   nuthan (Seshagiri)    last login 27 August             53 writes in the last 7 days
 *
 * Every account with a healthy login count is an ADMIN signing in from a browser that clears
 * cookies. The column was measuring cookie hygiene and being read as engagement — which is the
 * worst kind of wrong number, because it is defensible line by line.
 *
 * The status badge in the same row already knew this. It takes daysSinceAnyActivity from
 * tenant-dormancy.ts, fixed after a "haven't seen you in a few days" probe went to Medappa while
 * their writer marked attendance daily. Two figures printed side by side, one taught and one not.
 *
 * Same family as the ledger window that summed all time while the rows beside it were date-scoped,
 * and the payroll filter that hid every worker taken off the roster: nothing threw, the number just
 * meant something other than what it was read as.
 */

const AGENT = readFileSync(
  resolve(__dirname, "../lib/server/agents/tenant-engagement-agent.ts"),
  "utf8",
)

describe("the activity column counts days worked, not logins", () => {
  it("no longer prints a login count as the engagement figure", () => {
    // The header cells only — the comment above legitimately names the old label to explain what
    // it replaced, and asserting over the whole file makes documenting a fix fail the fix.
    const headers = [...AGENT.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((m) => m[1])
    expect(headers).toContain("Active days (7d)")
    expect(headers).not.toContain("Logins (7d)")
  })

  it("derives active days from what was recorded, across every write surface", () => {
    // Labour and attendance are the daily ones; expenses and processing are the seasonal ones. An
    // estate deep in harvest may touch none of the first two on a given day.
    for (const table of ["labour_cost", "attendance_records", "expense_transactions", "processing_records"]) {
      expect(AGENT, `${table} is not counted toward active days`).toMatch(
        new RegExp(`FROM ${table}[\\s\\S]{0,120}CURRENT_DATE - 7|FROM ${table}[\\s\\S]{0,120}INTERVAL '7 days'`),
      )
    }
  })

  it("counts DISTINCT days, so one busy day is not seven", () => {
    // 208 muster rows on a single Saturday is one active day, not 208 and not a full week.
    expect(AGENT).toMatch(/COUNT\(DISTINCT d\)/)
  })

  it("keeps the login count, demoted to a footnote rather than deleted", () => {
    // Still worth knowing that nobody has opened a browser in a month — it is just not the headline.
    expect(AGENT).toMatch(/loginsLast7d \? ` <span/)
    expect(AGENT).toContain("Last login")
  })
})

describe("the status badge and the column agree about what activity means", () => {
  it("the status still comes from the shared dormancy signals", () => {
    // One definition of "has this estate gone quiet", not two. tenant-dormancy.ts is the source of
    // truth the weekly digest, the daily digest and the probe all read.
    expect(AGENT).toContain("fetchTenantActivitySignals")
    expect(AGENT).toContain("daysSinceAnyActivity")
  })

  it("and the classifier prefers activity over logins when it has both", () => {
    const guidance = readFileSync(resolve(__dirname, "../lib/tenant-guidance.ts"), "utf8")
    expect(guidance).toMatch(/daysSinceQuiet = daysSinceAnyActivity \?\? daysSinceLastLogin/)
  })
})
