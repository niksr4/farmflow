import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { MODULES } from "@/lib/modules"
import { buildManualGroups, getInsightLabels } from "@/components/app-training-manual/build"

/**
 * Found by the daily scan on 2026-08-22, lost to a blocked push, re-found on 08-23, lost again.
 *
 * The training manual described "Harvest Forecast" behind `hasModule(enabledModules, "season")` in
 * two places. Season View and Harvest Forecast are separate modules with separate tabs, so a
 * tenant with one and not the other either read about a screen they cannot open, or never learned
 * a screen they have exists. Nothing threw either way.
 *
 * The general check below is the useful half: every tab the manual names should be gated on the
 * module that actually owns it, and a mismatch between the two is invisible without comparing them.
 *
 * UPGRADED 2026-09-17, when the manual's builders moved to components/app-training-manual/build.ts
 * and these source scans stopped matching.
 *
 * The scans were reaching for a behaviour they could not quite express — the old comment says so
 * outright: "the NEAREST PRECEDING gate must be yield-forecast ... a character-window regex cannot
 * express that". It does not have to any more. `buildManualGroups` is now a pure function, so the
 * question "does a tenant with Season View but not Harvest Forecast read about Harvest Forecast?"
 * can be ASKED rather than inferred from the shape of the source.
 *
 * Only the third check is still a scan, because "every gated id is a real module id" is genuinely
 * a property of the text rather than of any one tenant's output.
 */
const build = readFileSync("components/app-training-manual/build.ts", "utf8")

/**
 * ⚠ BOTH SITES, and this nearly went in covering only one.
 *
 * The tab is named in two independent places — the Insights LABEL list (getInsightLabels) and the
 * detailed ITEM list (buildManualGroups) — which is why the scan this replaced asserted
 * `gatedOnYield.length >= 2`. A first draft of this test read only the item list; flipping the
 * label gate back to "season" left it green. Caught by tamper-testing, not by review.
 */
const namesFor = (enabledModules: string[]) => [
  ...buildManualGroups(enabledModules, { isTailored: true, userRole: "admin" }).flatMap((group) =>
    group.items.map((item) => item.name),
  ),
  ...getInsightLabels(enabledModules),
]

describe("the manual gates each tab on the module that owns it", () => {
  it("does not describe Harvest Forecast to a tenant who only has Season View", () => {
    // The original bug, stated as the outcome it produced: reading about a tab you cannot open.
    expect(namesFor(["season"])).not.toContain("Harvest Forecast")
    expect(getInsightLabels(["season"])).not.toContain("Harvest Forecast")
  })

  it("does describe it to a tenant who has yield-forecast", () => {
    // And the other half: never learning a tab you have exists. Both were silent.
    expect(namesFor(["yield-forecast"])).toContain("Harvest Forecast")
    expect(getInsightLabels(["yield-forecast"])).toContain("Harvest Forecast")
  })

  it("keeps Season Summary on season, which does own it", () => {
    expect(namesFor(["season"])).toContain("Season Summary")
    expect(namesFor(["yield-forecast"])).not.toContain("Season Summary")
  })

  it("every module id the manual gates on is a real module", () => {
    const ids = [...build.matchAll(/hasModule\(enabledModules, "([a-z-]+)"\)/g)].map((m) => m[1])
    expect(ids.length).toBeGreaterThan(5)
    const known = new Set(MODULES.map((m) => m.id))
    const unknown = [...new Set(ids)].filter((id) => !known.has(id))
    expect(unknown, "the manual gates on module ids that do not exist").toEqual([])
  })
})

describe("the two modules really are distinct", () => {
  // If these were ever merged, the fix above would need revisiting rather than silently passing.
  it("season and yield-forecast are separate entries", () => {
    const ids = MODULES.map((m) => m.id)
    expect(ids).toContain("season")
    expect(ids).toContain("yield-forecast")
  })

  it("and carry the labels the manual uses", () => {
    expect(MODULES.find((m) => m.id === "season")?.label).toBe("Season View")
    expect(MODULES.find((m) => m.id === "yield-forecast")?.label).toBe("Harvest Forecast")
  })
})
