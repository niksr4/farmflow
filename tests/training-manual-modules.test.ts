import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { MODULES } from "@/lib/modules"

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
 */
const manual = readFileSync("components/app-training-manual.tsx", "utf8")

describe("the manual gates each tab on the module that owns it", () => {
  it("Harvest Forecast is gated on yield-forecast, not season", () => {
    // Both call sites: the label list and the detailed item list.
    const gatedOnYield = manual.match(/hasModule\(enabledModules, "yield-forecast"\)/g) ?? []
    expect(gatedOnYield.length).toBeGreaterThanOrEqual(2)

    // The precise rule: for each mention, the NEAREST PRECEDING gate must be yield-forecast.
    // A character-window regex cannot express that -- it matches across unrelated neighbours,
    // which is how a check ends up passing or failing for the wrong reason.
    const gate = /hasModule\(enabledModules, "([a-z-]+)"\)/g
    const gates = [...manual.matchAll(gate)].map((m) => ({ at: m.index!, id: m[1] }))
    const mentions = [...manual.matchAll(/"Harvest Forecast"|name: "Harvest Forecast"/g)].map((m) => m.index!)
    expect(mentions.length).toBeGreaterThanOrEqual(2)
    for (const at of mentions) {
      const owning = [...gates].reverse().find((g) => g.at < at)
      expect(owning?.id, `the Harvest Forecast entry at ${at} is gated on "${owning?.id}"`).toBe("yield-forecast")
    }
  })

  it("Season Summary stays on season, which does own it", () => {
    expect(manual).toMatch(/hasModule\(enabledModules, "season"\)[\s\S]{0,60}Season Summary/)
  })

  it("every module id the manual gates on is a real module", () => {
    const ids = [...manual.matchAll(/hasModule\(enabledModules, "([a-z-]+)"\)/g)].map((m) => m[1])
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
