import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { firstWeekLessons } from "@/components/app-training-manual/content"

/**
 * THE MANUAL MUST SEND A NEW CLERK SOMEWHERE THAT EXISTS AND ACCEPTS THEIR WRITE.
 *
 * Nothing in the gate reads instructional copy, so the first-week lessons drifted away from the
 * product and stayed wrong for months. Found by the weekly review agent on 2026-10-21 and verified:
 *
 *   - step 3 said "Open Accounts -> Daily Labour" and described "number of workers, hours worked,
 *     total wages". That form RETURNS 409 for every tenant: the aggregate labour path is refused
 *     after each estate's cutover, and all six cutovers were in August 2026. The official first
 *     labour task was a dead end.
 *   - every step said "the Accounts tab". The navigation calls it "Costs"
 *     (components/inventory-system/tab-items.ts), so a new clerk was looking for a word that is
 *     not on their screen.
 *   - step 1 said to create LABOR, SUPPLIES, MAINTENANCE and ADMIN. Provisioning seeds 87 real
 *     estate codes (ensureDefaultActivityCodes), so it asked a tenant to build what they already
 *     had, in a vocabulary their estate does not use.
 *   - step 2 said "Accounts -> Expenses"; the subtab is "Non-Labour Expenses".
 *
 * ⚠ THE TAB NAMES ARE DERIVED FROM tab-items.ts, NOT LISTED HERE. A hand-kept list of tab labels
 * in a test is the same rot one level along: renaming a tab would leave both the manual and the
 * guard agreeing about a word nobody sees.
 */

const navigationLabels = () => {
  const source = readFileSync("components/inventory-system/tab-items.ts", "utf8")
  const fromTabs = [...source.matchAll(/\blabel:\s*"([^"]+)"/g)].map((match) => match[1])
  const fromSubtabs = [...source.matchAll(/subtabs:\s*\[([^\]]*)\]/g)].flatMap((match) =>
    [...match[1].matchAll(/"([^"]+)"/g)].map((inner) => inner[1]),
  )
  return new Set([...fromTabs, ...fromSubtabs])
}

/** Every instruction line across the first-week lessons. */
const instructions = () => firstWeekLessons.flatMap((lesson) => lesson.how)

describe("the manual names tabs that exist", () => {
  it("reads the navigation's own labels", () => {
    // Vacuity: a moved or renamed tab-items.ts would leave every assertion below comparing
    // against an empty set, which reads exactly like a clean run.
    const labels = navigationLabels()
    expect(labels.size).toBeGreaterThan(10)
    expect(labels).toContain("Costs")
    expect(labels).toContain("Muster")
    expect(labels).toContain("Cost Codes")
    expect(labels).toContain("Non-Labour Expenses")
  })

  it("never sends anybody to the Accounts tab, which is called Costs on screen", () => {
    /**
     * Kept as its own assertion rather than folded into the sweep below, because this is the
     * specific word that was wrong in all five steps and it is the one most likely to come back:
     * the component is still accounts-page.tsx and the tab VALUE is still "accounts". Only the
     * label a human reads changed.
     */
    const offenders = instructions().filter((line) => /\bAccounts\b/.test(line))
    expect(
      offenders,
      'The navigation labels this tab "Costs". The file is still accounts-page.tsx and the tab ' +
        "value is still \"accounts\", but a manual must use the word on the screen.",
    ).toEqual([])
  })

  it("never tells a clerk to record labour through Daily Labour", () => {
    /**
     * The aggregate labour form answers 409 after a tenant's cutover date, and every live tenant
     * is past theirs. Mentioning the subtab is fine -- it still holds readable history -- but an
     * instruction to RECORD through it is a dead end.
     */
    const offenders = instructions().filter(
      (line) => /Daily Labour/.test(line) && /\b(Open|Go to|Enter|Choose|Add|Record|Save)\b/.test(line),
    )
    expect(
      offenders,
      "Daily Labour refuses writes after each estate's cutover date. Send them to the Muster.",
    ).toEqual([])
  })

  it("does not ask a new tenant to invent activity codes they were given", () => {
    // Provisioning seeds 87. "Add LABOR, SUPPLIES, MAINTENANCE and ADMIN" was both unnecessary and
    // in a vocabulary no Coorg estate uses.
    const offenders = instructions().filter((line) => /\bAdd LABOR\b|SUPPLIES, MAINTENANCE/.test(line))
    expect(offenders).toEqual([])
  })

  it("points the first labour lesson at the muster", () => {
    // Positive form, so the negatives above cannot be satisfied by deleting the step entirely.
    const labourLesson = firstWeekLessons.find((lesson) => /muster/i.test(lesson.title))
    expect(labourLesson, "no first-week lesson covers the muster").toBeTruthy()
    expect(labourLesson!.how.join(" ")).toMatch(/Muster tab/)
    // The two things that actually block a muster write for a new estate.
    expect(labourLesson!.how.join(" ")).toMatch(/daily rate/i)
    expect(labourLesson!.how.join(" ")).toMatch(/block/i)
  })

  it("every tab or subtab the lessons name is one the navigation really has", () => {
    /**
     * The general sweep. Keyed on the phrasing the copy uses to send somebody somewhere, so a new
     * instruction naming a tab that does not exist fails here rather than in a customer's hands.
     */
    const labels = navigationLabels()
    const named = instructions().flatMap((line) =>
      [...line.matchAll(/(?:Open|Go to) (?:the )?([A-Z][A-Za-z-]*(?: (?:&|[A-Z][A-Za-z-]*))*)/g)].map(
        (match) => match[1].trim(),
      ),
    )
    expect(named.length, "no navigation instructions found -- phrasing changed?").toBeGreaterThan(3)
    // Two real labels contain a standalone "&" ("Stock & Inventory", "Rain & Weather"). The first
    // version of this regex stopped at it and reported "Stock" as an unknown tab -- a guard bug
    // dressed as a copy bug, which is the kind that gets "fixed" by editing correct prose.
    expect(named).toContain("Stock & Inventory")

    const unknown = named.filter((name) => {
      if (labels.has(name)) return false
      // "Costs → Non-Labour Expenses" arrives as "Costs"; a trailing word like "and" is not a tab.
      return !/^(and|the|your|a)$/i.test(name) && ![...labels].some((label) => name.startsWith(label))
    })
    expect(
      unknown,
      "These names appear in a navigation instruction but are not tab or subtab labels in " +
        "components/inventory-system/tab-items.ts.",
    ).toEqual([])
  })
})
