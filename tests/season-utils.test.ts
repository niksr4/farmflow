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
})
