import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * ONE CONTROL, ONE NAME, ONE PLACE -- ON EVERY TAB THAT OWES A REPORT.
 *
 * Measured on main before this guard existed: of twenty-six workspace tabs, sixteen offered no way
 * to get the data out at all, and the ten that did disagreed about what the action is even called.
 * Costs had "Export CSV", "Excel" and "Reference PDF"; Sales and Dispatch said "Export CSV"; Stock
 * said "Export"; the P&L offered only `window.print()`; the Muster's spreadsheet was buried in two
 * sub-tabs. Finding the download on one screen taught you nothing about the next.
 *
 * So this guard enforces two things, and the second is the one with teeth:
 *
 *   1. UNIFORMITY -- a tab that reports does it through `ReportMenu`, not its own button. A ratchet,
 *      because the ten legacy exports are being converted a few at a time rather than in one
 *      unreviewable diff.
 *   2. HONESTY ABOUT THE PERIOD -- a tab that offers "this month" must actually read the period it
 *      was handed. A tab that declares periods and ignores the argument returns whatever its
 *      on-screen filter held, under a heading naming a range it does not cover. That is a
 *      complete-looking report of the wrong period: nothing throws, the figures are real, and they
 *      answer a question nobody asked. It is the defect shape this whole codebase is built around.
 *
 * ⚠ THE TAB LIST IS DERIVED FROM `tab-items.ts`, NOT TYPED OUT HERE. A hand-kept list is how the
 * twenty-seventh tab ships with no report and nobody notices -- the same reason the location_id and
 * dry-cherry guards derive their file sets. Adding a tab fails `TAB_OWNERS` below until somebody
 * says which component owns it and whether it owes a report.
 */

const root = process.cwd()
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8")

/** Comments in this repo explain the bug they guard, so a raw scan trips on the explanation. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<![:"'\\])\/\/.*$/gm, "")

/** Every tab value the workspace navigation can render, read from the builder itself. */
const navigationTabValues = () => {
  const source = stripComments(read("components/inventory-system/tab-items.ts"))
  return [...source.matchAll(/\bvalue:\s*"([a-z-]+)"/g)].map((match) => match[1]).sort()
}

/**
 * Which component owns each tab, and whether that tab owes a report.
 *
 * `owes: false` needs a reason, and the reason must be about the DATA, not about effort. A tab
 * showing somebody else's content (market news), static help (resources), a photo assessment, or
 * files the estate already holds has nothing of its own to hand to an accountant.
 */
const TAB_OWNERS: Record<string, { component: string; owes: boolean; why?: string }> = {
  // --- operations -------------------------------------------------------------------------------
  attendance: { component: "components/attendance-workspace.tsx", owes: true },
  accounts: { component: "components/accounts-page.tsx", owes: true },
  picking: { component: "components/picking-log-tab.tsx", owes: true },
  processing: { component: "components/processing-tab.tsx", owes: true },
  curing: { component: "components/curing-tab.tsx", owes: true },
  quality: { component: "components/quality-grading-tab.tsx", owes: true },
  dispatch: { component: "components/dispatch-tab.tsx", owes: true },
  sales: { component: "components/sales-tab.tsx", owes: true },
  inventory: { component: "components/inventory-system.tsx", owes: true },
  rainfall: { component: "components/rainfall-weather-tab.tsx", owes: true },
  // --- insights ---------------------------------------------------------------------------------
  "balance-sheet": { component: "components/balance-sheet-tab.tsx", owes: true },
  "season-pl": { component: "components/season-pl-tab.tsx", owes: true },
  receivables: { component: "components/receivables-tab.tsx", owes: true },
  billing: { component: "components/billing-tab.tsx", owes: true },
  season: { component: "components/season-dashboard.tsx", owes: true },
  "activity-log": { component: "components/activity-log-tab.tsx", owes: true },
  journal: { component: "components/journal-tab.tsx", owes: true },
  "yield-forecast": { component: "components/yield-forecast-tab.tsx", owes: true },
  // --- nothing of the estate's own to report ----------------------------------------------------
  news: {
    component: "components/news-tab.tsx",
    owes: false,
    why: "Third-party market headlines. Exporting somebody else's news is not an estate record.",
  },
  resources: {
    component: "components/resources-tab.tsx",
    owes: false,
    why: "Static reference material the app ships, identical for every tenant.",
  },
  "plant-health": {
    component: "components/plant-health-tab.tsx",
    owes: false,
    why: "A photo assessment per leaf. The artefact is the image and its verdict, not a table.",
  },
  documents: {
    component: "components/documents-tab.tsx",
    owes: false,
    why: "Already files. The tab's job is to hand back the original, which it does.",
  },
  "ai-analysis": {
    component: "components/ai-analysis-charts.tsx",
    owes: false,
    why: "Generated narrative over other tabs' figures. Report the source, not the commentary.",
  },
}

/**
 * Tabs that owe a report and do not have one yet.
 *
 * A RATCHET, not an excuse list: the test below fails when a tab joins it, and the one after that
 * fails when a tab on it gets a report and is not removed. Entries come off as the conversion
 * lands, and the list only ever shrinks.
 */
const REPORT_NOT_YET_UNIFORM: string[] = [
  // These ten already have SOME export, each spelled differently. Converting them changes working
  // behaviour on live money screens, so each gets its own reviewed change.
  "accounts",
  "attendance",
  "dispatch",
  "sales",
  "inventory",
  "processing",
  // No export of any kind today.
  "picking",
  "curing",
  "quality",
  "rainfall",
  "receivables",
  "billing",
  "season",
  "journal",
  "yield-forecast",
].sort()

const RENDERS_REPORT_MENU = /<ReportMenu\b/

const tabsWithAReport = () =>
  Object.entries(TAB_OWNERS)
    .filter(([, owner]) => RENDERS_REPORT_MENU.test(stripComments(read(owner.component))))
    .map(([tab]) => tab)
    .sort()

describe("every tab offers its report the same way", () => {
  it("covers every tab the navigation can render", () => {
    /**
     * Vacuity AND coverage in one. If `tab-items.ts` moves or the regex stops matching, the list
     * is empty and every assertion below inspects nothing; if a tab is added, it has no owner and
     * this fails until somebody decides whether it owes a report.
     */
    const navigation = navigationTabValues()
    expect(navigation.length).toBeGreaterThan(20)

    const unowned = navigation.filter((tab) => !TAB_OWNERS[tab])
    expect(
      unowned,
      `These tabs are in the workspace navigation with no entry in TAB_OWNERS. Add one, saying ` +
        `which component owns the tab and whether it owes the estate a report (with a reason about ` +
        `the DATA if it does not).`,
    ).toEqual([])
  })

  it("names a reason for every tab excused from reporting", () => {
    const excusedWithoutReason = Object.entries(TAB_OWNERS)
      .filter(([, owner]) => !owner.owes && !owner.why?.trim())
      .map(([tab]) => tab)
    expect(excusedWithoutReason).toEqual([])
  })

  it("does not add a tab that reports without the shared control", () => {
    /**
     * The point of the whole exercise. A tab that builds its own download button is a tab whose
     * label, placement, formats and formula-neutralisation are its own business again.
     */
    const owed = Object.entries(TAB_OWNERS)
      .filter(([, owner]) => owner.owes)
      .map(([tab]) => tab)
    const missing = owed.filter((tab) => !tabsWithAReport().includes(tab))
    const regressions = missing.filter((tab) => !REPORT_NOT_YET_UNIFORM.includes(tab))

    expect(
      regressions,
      `These tabs owe the estate a report and do not render <ReportMenu>. Use it rather than a ` +
        `bespoke button: it is the one control users learn once, and it carries the CSV formula ` +
        `neutralisation, the IST generation stamp and all three formats.`,
    ).toEqual([])
  })

  it("keeps the ratchet accurate, so a conversion is noticed", () => {
    const converted = REPORT_NOT_YET_UNIFORM.filter((tab) => tabsWithAReport().includes(tab))
    expect(
      converted,
      `These tabs now render <ReportMenu> but are still listed as not-yet-uniform. Remove them ` +
        `from REPORT_NOT_YET_UNIFORM so the list keeps meaning what it says.`,
    ).toEqual([])
  })

  it("has actually converted some tabs, so the ratchet is not measuring nothing", () => {
    // Without this, emptying TAB_OWNERS or breaking the <ReportMenu> regex reads as a clean run.
    const converted = tabsWithAReport()
    expect(converted.length).toBeGreaterThanOrEqual(3)
    expect(converted).toContain("balance-sheet")
    expect(converted).toContain("season-pl")
    expect(converted).toContain("activity-log")
  })
})

describe("a tab that offers a period actually reads it", () => {
  /**
   * ⚠ THIS IS THE ASSERTION THAT STOPS A REPORT LYING ABOUT ITS OWN RANGE.
   *
   * `periods: ["current", "day", "week", "month", "year"]` puts "This month so far" in the menu.
   * If `buildRows` then ignores its argument, the estate gets its whole financial year of figures
   * in a document headed with this month's dates. Every number real, the period wrong, and nothing
   * anywhere throws.
   *
   * Keyed on SHAPE: a multi-period definition must name its parameter and read `.start` off it.
   * Reading `.start` is the thing you cannot do by accident and cannot do without honouring the
   * range -- it is the only way to scope either a query or a filter.
   */
  const multiPeriodDefinitions = () =>
    Object.entries(TAB_OWNERS)
      .map(([tab, owner]) => ({ tab, owner, source: stripComments(read(owner.component)) }))
      .filter(({ source }) => RENDERS_REPORT_MENU.test(source))
      .flatMap(({ tab, owner, source }) => {
        // Each `periods:` declaration with more than one entry, paired with the buildRows that
        // follows it in the same object literal.
        const declarations = [...source.matchAll(/periods:\s*\[([^\]]*)\]/g)]
        return declarations
          .filter((match) => match[1].split(",").filter((entry) => entry.trim()).length > 1)
          .map((match) => {
            const after = source.slice(match.index ?? 0)
            const buildRows = after.match(/buildRows:\s*(?:async\s*)?\(?\s*([A-Za-z_$][\w$]*)?\s*\)?\s*=>/)
            return { tab, component: owner.component, parameter: buildRows?.[1], body: after }
          })
      })

  it("finds the tabs that offer more than one period", () => {
    const found = multiPeriodDefinitions()
    expect(found.length).toBeGreaterThanOrEqual(3)
    expect(found.map((entry) => entry.tab).sort()).toContain("balance-sheet")
  })

  it("names the period parameter and reads its bounds", () => {
    const offenders = multiPeriodDefinitions()
      .filter((entry) => {
        if (!entry.parameter) return true
        // The bound has to be read somewhere in what follows the declaration.
        return !new RegExp(`\\b${entry.parameter}\\.start\\b`).test(entry.body)
      })
      .map((entry) => `${entry.tab} (${entry.component})`)

    expect(
      offenders,
      `These tabs offer a period selector but their buildRows never reads the period's bounds, so ` +
        `the report would cover whatever the screen was already showing while being titled with ` +
        `the chosen range. Either read the period and scope the rows to it, or drop "periods" and ` +
        `offer only "current".`,
    ).toEqual([])
  })
})
