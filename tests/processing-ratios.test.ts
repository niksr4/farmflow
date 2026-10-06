import { describe, expect, it } from "vitest"

import {
  DEFAULT_PROCESSING_ROUTE,
  PROCESSING_ROUTES,
  formsForRoute,
  parseProcessingRoute,
  resolveProcessingRoute,
  routeProducesForm,
} from "@/lib/crop-config"
import {
  cherryInputKg,
  dayOutturnPercent,
  deriveProcessingFigures,
  pulpedInputKg,
} from "@/lib/processing-ratios"

/**
 * THE RATIO THAT ASSUMED AN ESTATE'S CONVENTION.
 *
 * dry_cherry_percent used to divide by `green + float`, which is correct for an estate that washes
 * its ripe cherry and dries the rest whole, and wrong for one that dries its ripe crop. See the
 * header of lib/processing-ratios.ts for the full account.
 *
 * The first test below is the one that matters most: it is HoneyFarm's real production data, and it
 * has to produce the same numbers it produced before this file existed.
 */

const bagWeightKg = 50

/** A day with both lines running, shaped like HoneyFarm's Robusta. */
const dualDay = {
  crop_today: 1000,
  ripe_today: 700,
  green_today: 200,
  float_today: 100,
  wet_parchment: 310,
  dry_parch: 170,
  dry_cherry: 125,
}

describe("the dry cherry denominator is derived, not assumed", () => {
  /**
   * ⚠ THE REGRESSION GUARD. Verified against production on 2026-10-06: all 74 of HoneyFarm's
   * processing rows have crop_today == ripe + green + float to within 0.5 kg, on both varieties.
   * So for them `crop - ripe` and `green + float` are the same number, and the new formula has to
   * reproduce the old one exactly.
   *
   * Asserted as an identity over many shapes rather than one example, because a single hand-picked
   * row can agree by luck. Every row here satisfies the balance HoneyFarm's data satisfies.
   */
  it("reproduces the OLD formula exactly whenever crop == ripe + green + float", () => {
    const balancedDays = [
      { crop_today: 1000, ripe_today: 700, green_today: 200, float_today: 100, dry_cherry: 125 },
      { crop_today: 2500, ripe_today: 2000, green_today: 400, float_today: 100, dry_cherry: 210 },
      { crop_today: 880.5, ripe_today: 500.25, green_today: 300.25, float_today: 80, dry_cherry: 161.5 },
      { crop_today: 150, ripe_today: 0, green_today: 100, float_today: 50, dry_cherry: 62 },
      { crop_today: 3333, ripe_today: 3000, green_today: 333, float_today: 0, dry_cherry: 140 },
    ]

    for (const day of balancedDays) {
      // The formula as it was, character for character, before this module existed.
      const greenPlusFloat = day.green_today + day.float_today
      const oldValue =
        greenPlusFloat > 0
          ? Number.parseFloat(((day.dry_cherry * 100) / greenPlusFloat).toFixed(2))
          : 0

      const derived = deriveProcessingFigures({ entry: day, bagWeightKg, route: "both" })

      expect(
        derived.dry_cherry_percent,
        `a balanced day must not move: ${JSON.stringify(day)}`,
      ).toBe(oldValue)
    }
  })

  /**
   * The bug, stated as a test. An estate drying its ripe crop whole gets an absurd number from the
   * old formula and a correct one from the new.
   */
  it("gives a natural-route estate a real figure where the old formula gave nonsense", () => {
    // Everything picked is dried whole. A little green and float is still recorded.
    const naturalDay = {
      crop_today: 1000,
      ripe_today: 900,
      green_today: 80,
      float_today: 20,
      dry_cherry: 480,
    }

    const oldValue = Number.parseFloat(((480 * 100) / (80 + 20)).toFixed(2))
    expect(oldValue, "the old formula really did produce this").toBe(480)

    const derived = deriveProcessingFigures({ entry: naturalDay, bagWeightKg, route: "natural" })
    // 480 kg of dry cherry out of 1000 kg of fruit: 48%, which is a believable cherry outturn.
    expect(derived.dry_cherry_percent).toBe(48)
  })

  /**
   * The quieter half of the same bug, and the worse one. A natural estate that does not bother
   * recording the sort split divided by zero and got 0% -- its only yield figure, silently absent.
   */
  it("does not report 0% for a natural estate that skips the sort split", () => {
    const noSortSplit = {
      crop_today: 1000,
      ripe_today: 0,
      green_today: 0,
      float_today: 0,
      dry_cherry: 500,
    }

    const greenPlusFloat = 0
    const oldValue = greenPlusFloat > 0 ? 1 : 0
    expect(oldValue, "the old formula fell through to a flat zero").toBe(0)

    const derived = deriveProcessingFigures({ entry: noSortSplit, bagWeightKg, route: "natural" })
    expect(derived.dry_cherry_percent).toBe(50)
  })

  it("reports no cherry ratio for a wet-only estate, because it makes no cherry", () => {
    const derived = deriveProcessingFigures({ entry: dualDay, bagWeightKg, route: "wet" })
    expect(cherryInputKg(dualDay, "wet")).toBe(0)
    expect(derived.dry_cherry_percent).toBe(0)
  })

  it("reports no wet ratio for a natural estate, because nothing is pulped", () => {
    expect(pulpedInputKg(dualDay, "natural")).toBe(0)
    const derived = deriveProcessingFigures({ entry: dualDay, bagWeightKg, route: "natural" })
    expect(derived.fr_wp_percent).toBe(0)
  })

  /**
   * A ripe weight above the day's crop is a typo, not a negative denominator. Without the clamp the
   * ratio goes negative, which renders as a number and reads as a measurement.
   */
  it("clamps a denominator that a typo would drive negative", () => {
    const typo = { crop_today: 100, ripe_today: 900, green_today: 0, float_today: 0, dry_cherry: 40 }
    expect(cherryInputKg(typo, "both")).toBe(0)
    const derived = deriveProcessingFigures({ entry: typo, bagWeightKg, route: "both" })
    expect(derived.dry_cherry_percent).toBe(0)
    expect(derived.dry_cherry_percent).not.toBeLessThan(0)
  })
})

describe("the rest of the derivation is unchanged", () => {
  it("keeps the crop shares, the wet line, and the bag counts as they were", () => {
    const derived = deriveProcessingFigures({ entry: dualDay, bagWeightKg, route: "both" })

    expect(derived.ripe_percent).toBe(70)
    expect(derived.green_percent).toBe(20)
    expect(derived.float_percent).toBe(10)
    // 310 wet parchment out of 700 ripe pulped.
    expect(derived.fr_wp_percent).toBe(44.29)
    // 170 dry out of 310 wet.
    expect(derived.wp_dp_percent).toBe(54.84)
    expect(derived.dry_p_bags).toBe(3.4)
    expect(derived.dry_cherry_bags).toBe(2.5)
  })

  it("accumulates to-date figures onto the previous day", () => {
    const derived = deriveProcessingFigures({
      entry: dualDay,
      previous: {
        crop_todate: 5000,
        ripe_todate: 3500,
        green_todate: 1000,
        float_todate: 500,
        dry_p_todate: 800,
        dry_cherry_todate: 600,
        dry_p_bags_todate: 16,
        dry_cherry_bags_todate: 12,
      },
      bagWeightKg,
      route: "both",
    })

    expect(derived.crop_todate).toBe(6000)
    expect(derived.dry_p_todate).toBe(970)
    expect(derived.dry_cherry_todate).toBe(725)
    expect(derived.dry_p_bags_todate).toBe(19.4)
    expect(derived.dry_cherry_bags_todate).toBe(14.5)
  })

  it("treats a first record as starting from zero", () => {
    const derived = deriveProcessingFigures({ entry: dualDay, previous: null, bagWeightKg, route: "both" })
    expect(derived.crop_todate).toBe(1000)
    expect(derived.dry_p_todate).toBe(170)
  })

  /**
   * A zero bag weight would make every bag count Infinity, which renders as an empty input rather
   * than as an error. Pinned because the fallback is easy to drop in a refactor.
   */
  it("falls back to 50 kg rather than dividing by zero", () => {
    const derived = deriveProcessingFigures({ entry: dualDay, bagWeightKg: 0, route: "both" })
    expect(Number.isFinite(derived.dry_p_bags)).toBe(true)
    expect(derived.dry_p_bags).toBe(3.4)
  })
})

describe("the day's outturn, which no screen used to show", () => {
  it("measures parchment against pulped fruit on the wet route", () => {
    const outturn = dayOutturnPercent({ entry: dualDay, route: "wet" })
    expect(outturn).toEqual({ label: "Parchment outturn", percent: 24.29 })
  })

  it("measures cherry against the whole crop on the natural route", () => {
    const outturn = dayOutturnPercent({
      entry: { crop_today: 1000, ripe_today: 900, dry_cherry: 480 },
      route: "natural",
    })
    expect(outturn).toEqual({ label: "Cherry outturn", percent: 48 })
  })

  it("measures both lines together when both are running", () => {
    const outturn = dayOutturnPercent({ entry: dualDay, route: "both" })
    // (170 + 125) / 1000
    expect(outturn).toEqual({ label: "Day outturn", percent: 29.5 })
  })

  /**
   * Null, not zero. A partially typed day would otherwise flash an outturn of 0% at a writer who is
   * mid-entry, which is a worse answer than no answer.
   */
  it("returns null rather than claiming an outturn of zero", () => {
    expect(dayOutturnPercent({ entry: { crop_today: 0 }, route: "both" })).toBeNull()
    expect(dayOutturnPercent({ entry: { crop_today: 1000 }, route: "both" })).toBeNull()
    expect(dayOutturnPercent({ entry: { crop_today: 1000, dry_parch: 0 }, route: "wet" })).toBeNull()
    expect(dayOutturnPercent({ entry: { crop_today: 1000, dry_cherry: 0 }, route: "natural" })).toBeNull()
  })
})

describe("the route axis itself", () => {
  it("defaults to the value that hides nothing", () => {
    expect(DEFAULT_PROCESSING_ROUTE).toBe("both")
    expect(formsForRoute(DEFAULT_PROCESSING_ROUTE)).toEqual(["Dry Parchment", "Dry Cherry"])
  })

  it("maps each route to exactly the forms it can produce", () => {
    expect(formsForRoute("wet")).toEqual(["Dry Parchment"])
    expect(formsForRoute("natural")).toEqual(["Dry Cherry"])
    expect(routeProducesForm("wet", "Dry Cherry")).toBe(false)
    expect(routeProducesForm("natural", "Dry Parchment")).toBe(false)
    expect(routeProducesForm("both", "Dry Cherry")).toBe(true)
  })

  /**
   * Strict on write, lenient on read -- the same split the form axis uses, and for the same reason:
   * a stored value this build does not recognise must not make the pulping screen unusable, but an
   * unrecognised value must never be saved.
   */
  it("refuses an unknown route on write and absorbs one on read", () => {
    expect(parseProcessingRoute("semi-washed")).toBeNull()
    expect(parseProcessingRoute("")).toBeNull()
    expect(parseProcessingRoute(null)).toBeNull()
    expect(resolveProcessingRoute("semi-washed")).toBe("both")
    expect(resolveProcessingRoute(undefined)).toBe("both")
  })

  it("accepts the stored tokens case-insensitively, since they are read back from JSON", () => {
    expect(parseProcessingRoute("WET")).toBe("wet")
    expect(parseProcessingRoute("  Natural ")).toBe("natural")
  })

  /**
   * Every route must be handled by formsForRoute. A fourth route added to the list without a case
   * here would silently fall through to the default and claim it produces both forms.
   */
  it("has no route that falls through to the default by accident", () => {
    for (const route of PROCESSING_ROUTES) {
      const forms = formsForRoute(route)
      expect(forms.length, `${route} must declare its forms`).toBeGreaterThan(0)
      if (route !== "both") {
        expect(forms.length, `${route} is a single-line route`).toBe(1)
      }
    }
  })
})
