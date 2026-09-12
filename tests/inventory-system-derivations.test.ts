import { describe, expect, it } from "vitest"

import {
  availableExportDatasets,
  estateFilteredLocations,
  filterEmptyMetrics,
  seasonProgress,
} from "@/components/inventory-system/derivations"

/**
 * The first pieces of InventorySystem() to arrive with proof.
 *
 * All four of these ran inside a 5,074-line component and none had a test, because none COULD:
 * vitest runs in `environment: "node"` with no jsdom, so nothing that lives inside a component is
 * reachable. Lifting them out is the part of the decomposition this repository can actually verify,
 * which is why it went first and the 1,131-line render block did not.
 */

const day = 86_400_000
const YEAR = { startDate: "2026-04-01", endDate: "2027-03-31" }
const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

describe("seasonProgress", () => {
  it("is 0% on the first day and 100% on the last", () => {
    expect(seasonProgress(YEAR, at("2026-04-01")).pct).toBe(0)
    expect(seasonProgress(YEAR, at("2027-03-31")).pct).toBe(100)
  })

  it("clamps outside the year rather than going negative or past 100", () => {
    expect(seasonProgress(YEAR, at("2025-01-01")).pct).toBe(0)
    expect(seasonProgress(YEAR, at("2030-01-01")).pct).toBe(100)
  })

  it("counts the days left, and never below zero", () => {
    expect(seasonProgress(YEAR, at("2027-03-21")).daysRemaining).toBe(10)
    expect(seasonProgress(YEAR, at("2030-01-01")).daysRemaining).toBe(0)
  })

  it("returns 0%, not NaN, for a zero-length year", () => {
    /**
     * THE BUG THIS CARRIES OVER. The version inside the shell divided by (end - start) with no
     * guard. A fiscal year whose ends are the same date gave NaN, and NaN survives every clamp
     * around it — Math.min(100, Math.max(0, NaN)) is NaN — so the hero strip would have rendered
     * "NaN%". No tenant has such a year; the guard costs one comparison.
     */
    const zero = { startDate: "2026-04-01", endDate: "2026-04-01" }
    expect(seasonProgress(zero, at("2026-04-01")).pct).toBe(0)
    expect(Number.isNaN(seasonProgress(zero, at("2026-04-01")).pct)).toBe(false)
  })

  it("returns 0%, not NaN, for an unparseable or inverted year", () => {
    expect(seasonProgress({ startDate: "not a date", endDate: "2027-03-31" }, Date.now()).pct).toBe(0)
    expect(seasonProgress({ startDate: "2027-03-31", endDate: "2026-04-01" }, Date.now()).pct).toBe(0)
  })

  it("accepts Date objects as well as strings, since the shell holds both", () => {
    const asDates = { startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31") }
    expect(seasonProgress(asDates, at("2026-04-01")).pct).toBe(0)
  })
})

describe("filterEmptyMetrics", () => {
  const tiles = [{ metricValue: 0 }, { metricValue: 5 }, { metricValue: null }, { metricValue: undefined }]

  it("does nothing when the setting is off", () => {
    expect(filterEmptyMetrics(tiles, false)).toHaveLength(4)
  })

  it("drops exact zeroes when the setting is on", () => {
    expect(filterEmptyMetrics(tiles, true)).toHaveLength(3)
  })

  it("keeps null and undefined, because they mean 'not loaded', not 'nothing'", () => {
    // Hiding them would make a tile flicker out and back as data arrives.
    const loading = [{ metricValue: null }, { metricValue: undefined }]
    expect(filterEmptyMetrics(loading, true)).toHaveLength(2)
  })

  it("shows everything rather than nothing when every tile is zero", () => {
    // A row that hides all its tiles reads as broken. Better a row of zeroes than an empty one.
    const allZero = [{ metricValue: 0 }, { metricValue: 0 }]
    expect(filterEmptyMetrics(allZero, true)).toHaveLength(2)
  })
})

describe("availableExportDatasets", () => {
  it("gives a tenant with nothing enabled no datasets", () => {
    expect(availableExportDatasets({}).size).toBe(0)
  })

  it("accounts alone yields two datasets, labour and expenses", () => {
    const d = availableExportDatasets({ canShowAccounts: true })
    expect([...d].sort()).toEqual(["expenses", "labour", "pnl-monthly"])
  })

  it("reconciliation appears for any of dispatch, sales or season", () => {
    for (const flag of ["canShowDispatch", "canShowSales", "canShowSeason"] as const) {
      expect(availableExportDatasets({ [flag]: true }).has("reconciliation")).toBe(true)
    }
  })

  it("pnl-monthly appears for any of accounts, sales or season", () => {
    for (const flag of ["canShowAccounts", "canShowSales", "canShowSeason"] as const) {
      expect(availableExportDatasets({ [flag]: true }).has("pnl-monthly")).toBe(true)
    }
  })

  it("counts a union once, not once per module that unlocks it", () => {
    // The shell only ever kept .size, so a double-add would have inflated the badge silently.
    const d = availableExportDatasets({ canShowDispatch: true, canShowSales: true, canShowSeason: true })
    expect([...d].filter((x) => x === "reconciliation")).toHaveLength(1)
  })

  it("gives a full-enterprise tenant every dataset exactly once", () => {
    const d = availableExportDatasets({
      canShowProcessing: true, canShowDispatch: true, canShowSales: true, canShowPepper: true,
      canShowRainfall: true, showTransactionHistory: true, canShowInventory: true,
      canShowAccounts: true, canShowSeason: true, canShowReceivables: true,
    })
    expect([...d].sort()).toEqual([
      "dispatch", "expenses", "inventory", "labour", "pepper", "pnl-monthly",
      "processing", "rainfall", "receivables-aging", "reconciliation", "sales", "transactions",
    ])
  })
})

describe("estateFilteredLocations", () => {
  const blocks = [
    { name: "A", estate: "HoneyFarm" },
    { name: "B", estate: "Seshagiri" },
    { name: "C", estate: null },
  ]

  it("narrows to the chosen estate", () => {
    const out = estateFilteredLocations(blocks, { canSelectEstate: true, selectedEstate: "HoneyFarm" })
    expect(out.map((b) => b.name)).toEqual(["A"])
  })

  it("returns everything for a tenant with no estate selector", () => {
    // Four of five live tenants. Filtering on a null selection would empty their block picker.
    expect(estateFilteredLocations(blocks, { canSelectEstate: false, selectedEstate: null })).toHaveLength(3)
    expect(estateFilteredLocations(blocks, { canSelectEstate: false, selectedEstate: "HoneyFarm" })).toHaveLength(3)
  })

  it("returns everything when a multi-estate tenant has selected none", () => {
    expect(estateFilteredLocations(blocks, { canSelectEstate: true, selectedEstate: null })).toHaveLength(3)
  })

  it("excludes unassigned blocks from a specific estate, rather than always showing them", () => {
    // Unlike workers, a BLOCK belongs to exactly one estate; a null estate is missing data, not a
    // block that lives everywhere.
    const out = estateFilteredLocations(blocks, { canSelectEstate: true, selectedEstate: "Seshagiri" })
    expect(out.map((b) => b.name)).toEqual(["B"])
  })
})

describe("the shell delegates rather than keeping a second copy", () => {
  it("no longer computes any of them inline", async () => {
    const { readFileSync } = await import("node:fs")
    const { resolve } = await import("node:path")
    const shell = readFileSync(resolve(__dirname, "../components/inventory-system.tsx"), "utf8")
    for (const name of [
      "deriveSeasonProgress",
      "deriveFilterEmptyMetrics",
      "deriveExportDatasets",
      "deriveEstateFilteredLocations",
    ]) {
      expect(shell, `${name} is imported but unused — the inline copy is still live`).toContain(name)
    }
    // The signature of the old inline version, which must not come back alongside the import.
    expect(shell).not.toMatch(/const pct = Math\.min\(100, Math\.max\(0, Math\.round\(/)
  })
})
