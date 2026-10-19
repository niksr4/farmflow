import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { MODULE_BUNDLES } from "../lib/modules"

/**
 * A SELF-SERVE SIGNUP MUST NOT BE ABLE TO PUT ITSELF ON A PLAN WE SELL BY HAND.
 *
 * /welcome rendered every entry of MODULE_BUNDLES as a clickable button, the setup route shipped
 * the whole array to the browser, and completeGuidedSetup validated with
 * `MODULE_BUNDLES.find(e => e.id === input.moduleBundleId)` and nothing else. So a stranger off
 * the public /signup page could hand themselves `enterprise` -- all 27 modules -- free and
 * permanently, and clampRequestedModuleStatesToPlan would then happily permit the lot.
 *
 * There was no guard to tamper when this was found. The `find` WAS the check.
 */

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")

describe("the plan a tenant may give itself", () => {
  it("has at least one plan on each side, so neither branch is dead code", () => {
    // Vacuity both ways. All-selectable is the original bug; none-selectable breaks signup.
    expect(MODULE_BUNDLES.filter((b) => b.selfServe).length).toBeGreaterThan(0)
    expect(MODULE_BUNDLES.filter((b) => !b.selfServe).length).toBeGreaterThan(0)
  })

  it("makes every bundle declare a side explicitly", () => {
    // A plan added tomorrow must say which it is rather than defaulting to giveaway.
    for (const bundle of MODULE_BUNDLES) {
      expect(typeof bundle.selfServe, `${bundle.id} does not declare selfServe`).toBe("boolean")
    }
  })

  it("does not let the widest plan be self-selected", () => {
    // Derived from module count rather than the name "enterprise": whichever plan grants the most
    // modules is the one worth stealing, whatever it ends up being called.
    const widest = [...MODULE_BUNDLES].sort((a, b) => b.modules.length - a.modules.length)[0]
    expect(
      widest.selfServe,
      `${widest.id} grants ${widest.modules.length} modules, more than any other plan, and a ` +
        "stranger off the public signup page can select it",
    ).toBe(false)
  })
})

describe("the server refuses it, not just the screen", () => {
  /**
   * The UI filter is a courtesy. /welcome is reached from a public signup, the request body is the
   * caller's to write, and the route takes moduleBundleId straight off it.
   */
  it("rejects a non-self-serve bundle in completeGuidedSetup", () => {
    const src = stripComments(readFileSync("lib/server/onboarding/setup.ts", "utf8"))
    expect(src).toMatch(/if\s*\(\s*!\s*bundle\.selfServe\s*\)/)
  })

  it("rejects it BEFORE writing the plan to the tenant row", () => {
    const src = stripComments(readFileSync("lib/server/onboarding/setup.ts", "utf8"))
    const guardAt = src.search(/!\s*bundle\.selfServe/)
    // ⚠ MATCH THE CALL, NOT THE MENTION. Keyed on the bare name this found the IMPORT at the
    // top of the file, which of course precedes the guard, and reported the order as wrong while
    // the code was right. Same family as toContain("helperName") passing on an import line.
    const persistAt = src.search(/(?:persistTenantPlanId|clampRequestedModuleStatesToPlan)\s*\(/)
    expect(guardAt).toBeGreaterThan(-1)
    expect(persistAt).toBeGreaterThan(-1)
    expect(
      guardAt < persistAt,
      "the plan is persisted before the check, so the refusal happens after the giveaway",
    ).toBe(true)
  })

  it("does not render the unselectable plan as something clickable", () => {
    const src = stripComments(readFileSync("components/welcome-onboarding-page.tsx", "utf8"))
    // The selectable list must be filtered. An unfiltered .map over moduleBundles is the bug.
    expect(
      /moduleBundles\s*\n?\s*\.filter\(\(bundle\) => bundle\.selfServe\)/.test(src),
      "the plan buttons are rendered from the full bundle list again",
    ).toBe(true)
  })
})
