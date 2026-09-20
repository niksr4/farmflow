import { describe, expect, it } from "vitest"

import { DEFAULT_DASHBOARD_TAB_PRIORITY } from "@/components/inventory-system/constants"
import {
  getPreferredDefaultTab,
  inferBriefTabFromText,
  resolveExceptionDrilldownTab,
  type TabVisibility,
} from "@/components/inventory-system/tab-routing"

const ALL_VISIBLE: TabVisibility = {
  canShowAccounts: true,
  canShowDispatch: true,
  canShowProcessing: true,
  canShowReceivables: true,
  canShowSalesWorkspace: true,
  canShowSeason: true,
  showTransactionHistory: true,
}

const NONE_VISIBLE: TabVisibility = {
  canShowAccounts: false,
  canShowDispatch: false,
  canShowProcessing: false,
  canShowReceivables: false,
  canShowSalesWorkspace: false,
  canShowSeason: false,
  showTransactionHistory: false,
}

const only = (overrides: Partial<TabVisibility>): TabVisibility => ({ ...NONE_VISIBLE, ...overrides })

describe("getPreferredDefaultTab", () => {
  it("picks by house priority, not by the order the tabs were given", () => {
    const [first, second] = DEFAULT_DASHBOARD_TAB_PRIORITY
    expect(getPreferredDefaultTab([second, first])).toBe(first)
  })

  it("falls through to the next priority when the top one is not visible", () => {
    const [first, second] = DEFAULT_DASHBOARD_TAB_PRIORITY
    expect(getPreferredDefaultTab([second])).toBe(second)
    expect(getPreferredDefaultTab(["something-else", second])).toBe(second)
  })

  it("falls back to whatever is visible when no known tab is", () => {
    expect(getPreferredDefaultTab(["plant-health"])).toBe("plant-health")
  })
})

describe("inferBriefTabFromText", () => {
  it("routes each topic to its tab", () => {
    expect(inferBriefTabFromText("dispatch to the curer", ALL_VISIBLE)).toBe("dispatch")
    expect(inferBriefTabFromText("revenue is up", ALL_VISIBLE)).toBe("sales")
    expect(inferBriefTabFromText("invoice outstanding", ALL_VISIBLE)).toBe("receivables")
    expect(inferBriefTabFromText("labour spend", ALL_VISIBLE)).toBe("accounts")
    expect(inferBriefTabFromText("float rate", ALL_VISIBLE)).toBe("processing")
    expect(inferBriefTabFromText("stock levels", ALL_VISIBLE)).toBe("transactions")
  })

  it("is case-insensitive", () => {
    expect(inferBriefTabFromText("REVENUE IS UP", ALL_VISIBLE)).toBe("sales")
  })

  /**
   * Order matters and is not alphabetical. "cost of sales" contains both "sale" and "cost"; the
   * sales rule is checked first, so it wins. Reordering the rules would silently send this to
   * accounts, and nothing would fail.
   */
  it("prefers the earlier rule when a phrase matches two", () => {
    expect(inferBriefTabFromText("cost of sales", ALL_VISIBLE)).toBe("sales")
    expect(inferBriefTabFromText("received stock", ALL_VISIBLE)).toBe("dispatch")
  })

  it("falls back to home rather than routing into a tab the user cannot open", () => {
    expect(inferBriefTabFromText("revenue is up", only({ canShowAccounts: true }))).toBe("home")
    expect(inferBriefTabFromText("dispatch to the curer", NONE_VISIBLE)).toBe("home")
  })

  it("skips a gated rule and lets a later one match", () => {
    // "sales cost" matches the sales rule first, but sales is hidden — the accounts rule should
    // then get its turn rather than the whole thing giving up at the first match.
    expect(inferBriefTabFromText("sales cost", only({ canShowAccounts: true }))).toBe("accounts")
  })

  it("returns home for empty and junk input", () => {
    expect(inferBriefTabFromText("", ALL_VISIBLE)).toBe("home")
    expect(inferBriefTabFromText(undefined as unknown as string, ALL_VISIBLE)).toBe("home")
    expect(inferBriefTabFromText("the weather is fine", ALL_VISIBLE)).toBe("home")
  })
})

describe("resolveExceptionDrilldownTab", () => {
  it("sends processing metrics to processing", () => {
    for (const metric of ["float_rate", "dry_parch_yield", "float_rate_zscore", "dry_parch_yield_zscore"]) {
      expect(resolveExceptionDrilldownTab(metric, ALL_VISIBLE)).toBe("processing")
    }
  })

  it("sends dispatch metrics to dispatch", () => {
    for (const metric of ["transit_loss", "dispatch_unconfirmed", "bag_weight_drift"]) {
      expect(resolveExceptionDrilldownTab(metric, ALL_VISIBLE)).toBe("dispatch")
    }
  })

  it("sends inventory and sales metrics to sales", () => {
    expect(resolveExceptionDrilldownTab("inventory_mismatch", ALL_VISIBLE)).toBe("sales")
    expect(resolveExceptionDrilldownTab("sales_spike", ALL_VISIBLE)).toBe("sales")
  })

  it("normalizes case and surrounding whitespace before matching", () => {
    expect(resolveExceptionDrilldownTab("  FLOAT_RATE  ", ALL_VISIBLE)).toBe("processing")
  })

  it("degrades to season, then home, when the owning module is hidden", () => {
    expect(resolveExceptionDrilldownTab("float_rate", only({ canShowSeason: true }))).toBe("season")
    expect(resolveExceptionDrilldownTab("float_rate", NONE_VISIBLE)).toBe("home")
    expect(resolveExceptionDrilldownTab("transit_loss", NONE_VISIBLE)).toBe("home")
  })

  it("sends an unknown or absent metric to season", () => {
    expect(resolveExceptionDrilldownTab("who_knows", ALL_VISIBLE)).toBe("season")
    expect(resolveExceptionDrilldownTab(undefined, ALL_VISIBLE)).toBe("season")
    expect(resolveExceptionDrilldownTab("", ALL_VISIBLE)).toBe("season")
  })
})
