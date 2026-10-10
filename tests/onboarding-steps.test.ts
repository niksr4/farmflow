import { describe, expect, it } from "vitest"

import {
  buildLaunchGuidePhases,
  buildOnboardingSteps,
  countBlocksMissingAcreage,
  countItemsMissingPrice,
  countWorkersMissingRate,
  getOnboardingStatusRequests,
  INITIAL_ONBOARDING_STATUS,
  isBlocksAndAcreageDone,
  isBlocksNamedDone,
  isInventoryDone,
  isProcessingRouteDone,
  isTeamMemberDone,
  isWeatherDone,
  isWorkersDone,
  type OnboardingAccess,
  type OnboardingStatusKey,
} from "@/components/inventory-system/onboarding"
import { resolveProcessingRoute } from "@/lib/crop-config"

const fullAccess: OnboardingAccess = {
  canShowInventory: true,
  canShowAccountCodes: true,
  canShowLabor: true,
  canShowProcessing: true,
  canShowDispatch: true,
  canShowSales: true,
  canManageUsers: true,
}

describe("the order the estate is asked in", () => {
  /**
   * ⚠ THE ORDER CHANGED ON 2026-10-06 AND THE PRODUCTION DATA IS THE REASON. Of six tenants,
   * exactly one had an acreage on every block and NOT ONE had a finished checklist. Five were
   * stalled on step one, which was the all-or-nothing acreage gate. Medappa has 21 blocks and 29
   * fully-rated workers, has been marking a muster for months, and still read 0 done.
   *
   * Asking for acreage first is sound reasoning about reports and wrong reasoning about onboarding.
   */
  it("asks for workers first, because the muster is the thing that happens every morning", () => {
    const steps = buildOnboardingSteps(INITIAL_ONBOARDING_STATUS, fullAccess)
    expect(steps[0].key).toBe("workers")
  })

  it("asks for the storehouse before the stock that goes in it", () => {
    const keys = buildOnboardingSteps(INITIAL_ONBOARDING_STATUS, fullAccess).map((s) => s.key)
    expect(keys.indexOf("storehouse")).toBeLessThan(keys.indexOf("inventory"))
  })

  /**
   * Naming a block and measuring it are separate steps now, and in this order. They were one step,
   * and conflating "I can charge work to this block" with "I can compare this block to another" is
   * what built the wall every tenant stopped at.
   */
  it("asks for a block's name before its acreage", () => {
    const keys = buildOnboardingSteps(INITIAL_ONBOARDING_STATUS, fullAccess).map((s) => s.key)
    expect(keys.indexOf("blocks")).toBeLessThan(keys.indexOf("blocks_acreage"))
  })

  /**
   * The PRINCIPLE, not the sequence. A step that unblocks daily recording must come before any step
   * that only unblocks comparison or convenience. Stated as a partition so that inserting a step
   * tomorrow has to respect the rule rather than just not break a hardcoded list.
   */
  it("puts everything that unblocks recording ahead of everything that does not", () => {
    // Typed, so a typo in either list is a compile error rather than a silent indexOf of -1 that
    // would quietly weaken the partition.
    const UNBLOCKS_RECORDING: OnboardingStatusKey[] = [
      "workers",
      "blocks",
      "storehouse",
      "inventory",
      "processing_route",
    ]
    const UNBLOCKS_NOTHING_YET: OnboardingStatusKey[] = ["blocks_acreage", "weather", "team_member"]

    const keys = buildOnboardingSteps(INITIAL_ONBOARDING_STATUS, fullAccess).map((s) => s.key)
    const lastEssential = Math.max(...UNBLOCKS_RECORDING.map((k) => keys.indexOf(k)))
    const firstOptional = Math.min(...UNBLOCKS_NOTHING_YET.map((k) => keys.indexOf(k)))

    expect(lastEssential).toBeGreaterThanOrEqual(0)
    expect(firstOptional).toBeGreaterThanOrEqual(0)
    expect(
      lastEssential,
      `"${keys[firstOptional]}" is asked before "${keys[lastEssential]}", which an estate needs first`,
    ).toBeLessThan(firstOptional)

    // And the partition has to cover the list, or a step added tomorrow escapes the rule entirely.
    expect([...keys].sort()).toEqual([...UNBLOCKS_RECORDING, ...UNBLOCKS_NOTHING_YET].sort())
  })

  it("follows the agreed sequence end to end", () => {
    expect(buildOnboardingSteps(INITIAL_ONBOARDING_STATUS, fullAccess).map((s) => s.key)).toEqual([
      "workers",
      "blocks",
      "storehouse",
      "inventory",
      "processing_route",
      "blocks_acreage",
      "weather",
      "team_member",
    ])
  })

  it("drops the steps a tenant has no module for", () => {
    const keys = buildOnboardingSteps(INITIAL_ONBOARDING_STATUS, {
      ...fullAccess,
      canShowInventory: false,
      canShowLabor: false,
      canShowProcessing: false,
      canManageUsers: false,
    }).map((s) => s.key)
    expect(keys).toEqual(["blocks", "blocks_acreage", "weather"])
  })

  it("does not ask how an estate processes when it has no pulping screen", () => {
    const keys = buildOnboardingSteps(INITIAL_ONBOARDING_STATUS, {
      ...fullAccess,
      canShowProcessing: false,
    }).map((s) => s.key)
    expect(keys).not.toContain("processing_route")
  })
})

describe("the processing route step cannot be born green", () => {
  /**
   * ⚠ THE VACUITY THIS STEP WAS ONE LINE AWAY FROM. Every reader resolves an unset route to "both"
   * so that nothing is hidden from an estate that never answered. If this predicate did the same,
   * the step would be complete for every tenant on day one and the question would never be asked.
   *
   * Null is the unanswered state. That distinction is the only thing making this step real, so it
   * is asserted directly rather than trusted.
   */
  it("is not done when nobody has been asked", () => {
    expect(isProcessingRouteDone({ settings: { estateProfile: {} } })).toBe(false)
    expect(isProcessingRouteDone({ settings: { estateProfile: { processingRoute: null } } })).toBe(false)
    expect(isProcessingRouteDone({})).toBe(false)
  })

  it("is not satisfied by the value a reader would have defaulted to", () => {
    // resolveProcessingRoute(undefined) is "both". If that leaked in here the step would be free.
    expect(resolveProcessingRoute(undefined)).toBe("both")
    expect(isProcessingRouteDone({ settings: { estateProfile: { processingRoute: undefined } } })).toBe(false)
  })

  it.each(["wet", "natural", "both"])("is done once somebody says %s", (route) => {
    expect(isProcessingRouteDone({ settings: { estateProfile: { processingRoute: route } } })).toBe(true)
  })

  it("is not done by a value that would be refused on write", () => {
    expect(isProcessingRouteDone({ settings: { estateProfile: { processingRoute: "semi-washed" } } })).toBe(false)
  })

  it("reads the bare profile shape as well as the nested one", () => {
    expect(isProcessingRouteDone({ estateProfile: { processingRoute: "wet" } })).toBe(true)
  })
})

describe("a block needs a name before it needs an area", () => {
  it("is done once every block is named", () => {
    expect(isBlocksNamedDone({ locations: [{ kind: "block", name: "Top Field" }] })).toBe(true)
  })

  /**
   * The split is only worth anything if naming can finish while acreage is still outstanding. That
   * is Medappa's exact shape: 21 named blocks, none measured.
   */
  it("finishes for an estate whose blocks are all named and none measured", () => {
    const medappaShape = {
      locations: Array.from({ length: 21 }, (_, i) => ({ kind: "block", name: `Block ${i + 1}`, areaAcres: null })),
    }
    expect(isBlocksNamedDone(medappaShape)).toBe(true)
    expect(isBlocksAndAcreageDone(medappaShape)).toBe(false)
  })

  it("is not done with a blank or whitespace name", () => {
    expect(isBlocksNamedDone({ locations: [{ kind: "block", name: "" }] })).toBe(false)
    expect(isBlocksNamedDone({ locations: [{ kind: "block", name: "   " }] })).toBe(false)
    expect(isBlocksNamedDone({ locations: [{ kind: "block" }] })).toBe(false)
  })

  it("is not done with no blocks at all", () => {
    expect(isBlocksNamedDone({ locations: [] })).toBe(false)
  })

  it("ignores the store and the general location, as the acreage check does", () => {
    expect(isBlocksNamedDone({ locations: [{ kind: "block", name: "A" }, { kind: "store" }, { kind: "general" }] })).toBe(true)
  })
})

describe("acreage on every block, not the first one", () => {
  // One block with an area and nine without yields a per-acre figure that reads as precise and is
  // wrong by an order of magnitude. This is the difference from the old "add first location" step.
  it("is not done while any block lacks an area", () => {
    const payload = { locations: [{ kind: "block", areaAcres: 4 }, { kind: "block", areaAcres: null }] }
    expect(isBlocksAndAcreageDone(payload)).toBe(false)
    expect(countBlocksMissingAcreage(payload)).toBe(1)
  })

  it("is done when every block has one", () => {
    expect(isBlocksAndAcreageDone({ locations: [{ kind: "block", areaAcres: 4 }, { kind: "block", areaAcres: 2.5 }] })).toBe(true)
  })

  it("ignores the storehouse, which has no planted area", () => {
    const payload = { locations: [{ kind: "block", areaAcres: 4 }, { kind: "store", areaAcres: null }] }
    expect(isBlocksAndAcreageDone(payload)).toBe(true)
    expect(countBlocksMissingAcreage(payload)).toBe(0)
  })

  it("treats a row with no kind as a block, the way the API defaults it", () => {
    expect(isBlocksAndAcreageDone({ locations: [{ areaAcres: null }] })).toBe(false)
  })

  it("is not done with no blocks at all", () => {
    expect(isBlocksAndAcreageDone({ locations: [] })).toBe(false)
    expect(isBlocksAndAcreageDone({})).toBe(false)
  })

  it.each([0, -1, "", null, undefined])("refuses %s as an area", (v) => {
    expect(isBlocksAndAcreageDone({ locations: [{ kind: "block", areaAcres: v }] })).toBe(false)
  })
})

describe("stock has to be valued, not merely present", () => {
  it("is not done while any item has no price", () => {
    const payload = { inventory: [{ avg_price: 25 }, { avg_price: 0 }] }
    expect(isInventoryDone(payload)).toBe(false)
    expect(countItemsMissingPrice(payload)).toBe(1)
  })

  it("is done when every item carries one", () => {
    expect(isInventoryDone({ inventory: [{ avg_price: 25 }, { avg_price: 14 }] })).toBe(true)
  })

  it("reads the camelCase shape too", () => {
    expect(isInventoryDone({ items: [{ avgPrice: 30 }] })).toBe(true)
  })
})

describe("a rate on every worker", () => {
  // Medappa has 10 of 33 rated and their writer types a wage on every allocation -- the exact
  // work the muster was built to remove.
  it("is not done while any worker has no rate", () => {
    const payload = { workers: [{ dailyRate: 600 }, { dailyRate: null }] }
    expect(isWorkersDone(payload)).toBe(false)
    expect(countWorkersMissingRate(payload)).toBe(1)
  })

  it("is done when all of them do", () => {
    expect(isWorkersDone({ workers: [{ dailyRate: 600 }, { dailyRate: 700 }] })).toBe(true)
  })

  it("is not done with an empty roster", () => {
    expect(isWorkersDone({ workers: [] })).toBe(false)
  })
})

describe("weather needs both coordinates", () => {
  // A latitude alone is not a place. The forecast falls back to a regional default that can be a
  // hundred kilometres from the estate, and nothing says so.
  it("is done only with both", () => {
    expect(isWeatherDone({ settings: { estateProfile: { weatherLatitude: 12.4, weatherLongitude: 75.7 } } })).toBe(true)
  })

  it.each([
    { weatherLatitude: 12.4, weatherLongitude: null },
    { weatherLatitude: null, weatherLongitude: 75.7 },
    {},
  ])("is not done with %o", (profile) => {
    expect(isWeatherDone({ settings: { estateProfile: profile } })).toBe(false)
  })
})

describe("the writer's login", () => {
  it("needs someone beyond the admin who signed up", () => {
    expect(isTeamMemberDone({ users: [{ id: 1 }] })).toBe(false)
    expect(isTeamMemberDone({ users: [{ id: 1 }, { id: 2 }] })).toBe(true)
  })
})

describe("the requests behind the checks", () => {
  it("asks locations for stores too, or the storehouse step can never finish", () => {
    const reqs = getOnboardingStatusRequests("/api/locations?scope=all&kind=all", fullAccess, "t1", "2026-08-20")
    const store = reqs.find((r) => r.key === "storehouse")
    expect(store?.endpoint).toContain("kind=all")
  })

  it("dates the attendance call, since the roster endpoint is day-scoped", () => {
    const reqs = getOnboardingStatusRequests("/api/locations", fullAccess, "t1", "2026-08-20")
    expect(reqs.find((r) => r.key === "workers")?.endpoint).toContain("date=2026-08-20")
  })

  it("has a request for every step it renders", () => {
    const reqs = getOnboardingStatusRequests("/api/locations", fullAccess, "t1", "2026-08-20")
    for (const step of buildOnboardingSteps(INITIAL_ONBOARDING_STATUS, fullAccess)) {
      expect(reqs.some((r) => r.key === step.key), `no request fetches "${step.key}"`).toBe(true)
    }
  })
})

describe("a general location is not a piece of land", () => {
  // 99.4% of HoneyFarm's cost sits on "Honeyfarm (general)" and "Sidapur (general)". They hold
  // spend that is real but belongs to no block, so they must never be asked for an area -- and
  // must never enter an acreage denominator, or every per-acre figure on the estate is wrong.
  it("does not demand acreage from a general location", () => {
    const payload = {
      locations: [
        { kind: "block", areaAcres: 4 },
        { kind: "general", areaAcres: null },
        { kind: "store", areaAcres: null },
      ],
    }
    expect(isBlocksAndAcreageDone(payload)).toBe(true)
    expect(countBlocksMissingAcreage(payload)).toBe(0)
  })

  it("would otherwise leave HoneyFarm stuck on step one forever", () => {
    // Their real shape: two blocks, two generals, one store.
    const honeyfarm = {
      locations: [
        { kind: "block", areaAcres: 12 },
        { kind: "block", areaAcres: 8 },
        { kind: "general", areaAcres: null },
        { kind: "general", areaAcres: null },
        { kind: "store", areaAcres: null },
      ],
    }
    expect(isBlocksAndAcreageDone(honeyfarm)).toBe(true)
  })

  it("still counts a real block that has no area", () => {
    expect(isBlocksAndAcreageDone({ locations: [{ kind: "block", areaAcres: null }, { kind: "general" }] })).toBe(false)
  })
})

describe("a launch-guide button names the tab it actually opens", () => {
  /**
   * Found by the daily scan on 2026-08-23 and lost to a blocked push. The Week-1 card's label fell
   * through to a hardcoded "Open Inventory" whenever locations were already set -- but the tab it
   * routes to is processing or dispatch there for a tenant with Inventory disabled. A button that
   * names one destination and opens another is the same confident-wrong-answer class as everything
   * else here: nothing errors, the user just ends up somewhere they were not promised.
   */
  const withInventoryOff: OnboardingAccess = {
    ...fullAccess,
    canShowInventory: false,
  }

  it("says Pulping when it opens Pulping", () => {
    const phase = buildLaunchGuidePhases({ ...INITIAL_ONBOARDING_STATUS, locations: true }, withInventoryOff)[0]
    expect(phase.actionTab).toBe("processing")
    expect(phase.actionLabel).toBe("Open Pulping")
  })

  it("says Dispatch when Pulping is off too", () => {
    const access = { ...withInventoryOff, canShowProcessing: false }
    const phase = buildLaunchGuidePhases({ ...INITIAL_ONBOARDING_STATUS, locations: true }, access)[0]
    expect(phase.actionTab).toBe("dispatch")
    expect(phase.actionLabel).toBe("Open Dispatch")
  })

  it("still says Inventory when it opens Inventory", () => {
    const phase = buildLaunchGuidePhases({ ...INITIAL_ONBOARDING_STATUS, locations: true }, fullAccess)[0]
    expect(phase.actionTab).toBe("inventory")
    expect(phase.actionLabel).toBe("Open Inventory")
  })

  it("never names a tab it does not route to, across every phase and access shape", () => {
    const EXPECTED: Record<string, string> = {
      inventory: "Open Inventory",
      processing: "Open Pulping",
      dispatch: "Open Dispatch",
      accounts: "Open Accounts",
      sales: "Open Sales",
    }
    for (const access of [fullAccess, withInventoryOff, { ...withInventoryOff, canShowProcessing: false }]) {
      for (const locations of [true, false]) {
        for (const phase of buildLaunchGuidePhases({ ...INITIAL_ONBOARDING_STATUS, locations }, access)) {
          const expected = EXPECTED[phase.actionTab]
          if (!expected) continue
          expect(phase.actionLabel, `"${phase.actionLabel}" opens ${phase.actionTab}`).toBe(expected)
        }
      }
    }
  })
})
