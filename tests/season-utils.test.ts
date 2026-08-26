import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { isTabOffSeason, getMobileBottomNavTabs, SEASONAL_TABS } from "../lib/season-utils"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("isTabOffSeason", () => {
  it("returns false for always-available tabs", () => {
    expect(isTabOffSeason("home")).toBe(false)
    expect(isTabOffSeason("accounts")).toBe(false)
    expect(isTabOffSeason("rainfall")).toBe(false)
    expect(isTabOffSeason("inventory")).toBe(false)
  })

  it("seasonal tabs are in the SEASONAL_TABS set", () => {
    expect(SEASONAL_TABS.has("processing")).toBe(true)
    expect(SEASONAL_TABS.has("dispatch")).toBe(true)
    expect(SEASONAL_TABS.has("sales")).toBe(true)
  })

  it("returns false for non-seasonal tab even in off-season", () => {
    // June is off-season for coffee
    vi.setSystemTime(new Date("2026-06-05T10:00:00Z"))
    expect(isTabOffSeason("accounts")).toBe(false)
    expect(isTabOffSeason("rainfall")).toBe(false)
  })
})

describe("getMobileBottomNavTabs", () => {
  it("always includes home and accounts", () => {
    const allTabs = ["home", "accounts", "rainfall", "inventory", "processing", "dispatch", "sales"]
    const tabs = getMobileBottomNavTabs(allTabs)
    expect(tabs).toContain("home")
    expect(tabs).toContain("accounts")
  })

  it("returns max 4 tabs", () => {
    const allTabs = ["home", "accounts", "rainfall", "inventory", "processing"]
    const tabs = getMobileBottomNavTabs(allTabs)
    expect(tabs.length).toBeLessThanOrEqual(4)
  })

  it("only returns tabs that are in the available set", () => {
    const available = ["home", "accounts", "rainfall"]
    const tabs = getMobileBottomNavTabs(available)
    for (const tab of tabs) {
      expect(available).toContain(tab)
    }
  })

  it("includes processing during harvest season (Oct-Mar)", () => {
    vi.setSystemTime(new Date("2026-01-15T10:00:00Z")) // January = harvest
    const tabs = getMobileBottomNavTabs(["home", "accounts", "rainfall", "inventory", "processing"])
    expect(tabs).toContain("processing")
  })

  it("does not include processing in off-season (Apr-Sep)", () => {
    vi.setSystemTime(new Date("2026-06-05T10:00:00Z")) // June = off-season
    const tabs = getMobileBottomNavTabs(["home", "accounts", "rainfall", "inventory", "processing"])
    expect(tabs).not.toContain("processing")
  })

  // The muster is the most-written surface in the product and was not on this list at all --
  // the list predates it existing. Reaching it on a phone meant opening the drawer.
  it("puts the muster in the bar in both seasons", () => {
    const available = ["home", "attendance", "accounts", "rainfall", "inventory", "processing", "picking"]
    vi.setSystemTime(new Date("2026-01-15T10:00:00Z"))
    expect(getMobileBottomNavTabs(available)).toContain("attendance")
    vi.setSystemTime(new Date("2026-06-05T10:00:00Z"))
    expect(getMobileBottomNavTabs(available)).toContain("attendance")
  })

  // `toBeLessThanOrEqual(4)` above passes on a list that never reaches four, which is how the
  // old five-entry list looked correct: it came out at four only because `picking` filtered away
  // for most tenants. HoneyFarm have picking enabled and got a six-item bar. This asserts the
  // exact count with every tab available, in both seasons, so the cap is a rule not a coincidence.
  it("returns exactly four with every tab available, picking included", () => {
    const everything = [
      "home", "attendance", "accounts", "rainfall", "inventory", "picking",
      "processing", "dispatch", "sales", "pepper", "season", "balance-sheet",
    ]
    for (const when of ["2026-01-15T10:00:00Z", "2026-06-05T10:00:00Z"]) {
      vi.setSystemTime(new Date(when))
      const tabs = getMobileBottomNavTabs(everything)
      expect(tabs).toHaveLength(4)
      expect(new Set(tabs).size).toBe(4)
    }
  })
})
