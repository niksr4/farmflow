import { describe, expect, it } from "vitest"
import { UNSPECIFIED_LABEL } from "@/lib/crop-config"
import {
  formatBagTypeLabel as formatDispatchLabel,
  normalizeBagTypeKey,
} from "@/components/dispatch/coffee-bags"
import {
  formatBagTypeLabel as formatSalesLabel,
  normalizeBagType,
} from "@/components/sales/coffee-bags"

/**
 * A FORM NOBODY CAN READ GETS ITS OWN BUCKET, NOT PARCHMENT'S.
 *
 * Both tabs used to answer "parchment" for anything that was not cherry, because their totals had two
 * form keys and a third answer would have indexed them with `undefined` and rendered NaN. In a money
 * table that is not a tidier label: it is cherry weight and cherry revenue filed under parchment, with
 * nothing on screen to say so.
 *
 * The dispatch tab's version was worse than misfiling. It composes a `${variety}_${form}` key and
 * looks it up behind `if (totals[key] !== undefined)`, so a row whose key did not exist was DROPPED --
 * the bags left the totals altogether.
 *
 * ⚠ THE PROPERTY THAT MATTERS MOST IS THE QUIET ONE: for canonical data the bucket stays empty, so
 * the extra row never appears for any real tenant. Verified against production on 2026-10-03 -- every
 * bag_type HoneyFarm, Laxmi, Medappa, Seshagiri and greenvalley have written is already one of the two
 * canonical spellings, so this is defence for data that predates migration 153 rather than a row
 * anybody will see today.
 */

describe("an unreadable form is shown, not folded into parchment", () => {
  it("keys the three outcomes apart on the sales tab", () => {
    expect(normalizeBagType("Dry Cherry")).toBe("cherry")
    expect(normalizeBagType("Dry Parchment")).toBe("parchment")
    // The abbreviations are understood, so they do NOT land in the bucket.
    expect(normalizeBagType("Dry P")).toBe("parchment")
    expect(normalizeBagType("DP")).toBe("parchment")
    expect(normalizeBagType("dc")).toBe("cherry")

    // Only genuinely unreadable values do.
    expect(normalizeBagType("green bean")).toBe("unspecified")
    expect(normalizeBagType("Dry Cherry / Dry Parchment")).toBe("unspecified")
    expect(normalizeBagType("")).toBe("unspecified")
    expect(normalizeBagType(null)).toBe("unspecified")
    expect(normalizeBagType(undefined)).toBe("unspecified")
  })

  it("keys the three outcomes apart on the dispatch tab, in its own vocabulary", () => {
    expect(normalizeBagTypeKey("Dry Cherry")).toBe("dry_cherry")
    expect(normalizeBagTypeKey("Dry Parchment")).toBe("dry_parchment")
    expect(normalizeBagTypeKey("Dry P")).toBe("dry_parchment")
    expect(normalizeBagTypeKey("green bean")).toBe("unspecified")
    expect(normalizeBagTypeKey("")).toBe("unspecified")
  })

  it("never names a form it cannot read", () => {
    /**
     * formatBagTypeLabel used to return "Dry Parchment" for an unreadable value on both tabs -- a
     * confident label over a figure nobody had established.
     */
    for (const format of [formatSalesLabel, formatDispatchLabel]) {
      expect(format("Dry P")).toBe("Dry Parchment")
      expect(format("dc")).toBe("Dry Cherry")
      expect(format("green bean")).toBe(UNSPECIFIED_LABEL)
      expect(format("")).toBe(UNSPECIFIED_LABEL)
    }
    expect(formatSalesLabel(null)).toBe(UNSPECIFIED_LABEL)
  })

  it("leaves the bucket empty for canonical data, so the extra row stays hidden", () => {
    /**
     * The quiet property. Every value any real tenant has ever written must key to cherry or
     * parchment, never to the bucket -- otherwise this change puts an amber warning on a clean
     * estate's screen.
     *
     * These are the exact values present in production on 2026-10-03, byte for byte.
     */
    const everyValueInProduction = ["Dry Parchment", "Dry Cherry"]
    for (const value of everyValueInProduction) {
      expect(normalizeBagType(value), `${value} must not reach the bucket`).not.toBe("unspecified")
      expect(normalizeBagTypeKey(value), `${value} must not reach the bucket`).not.toBe("unspecified")
    }
    // "Dry P" exists on the Estate Mock demo tenant and is read as parchment rather than bucketed.
    expect(normalizeBagType("Dry P")).not.toBe("unspecified")
    expect(normalizeBagTypeKey("Dry P")).not.toBe("unspecified")
  })
})
