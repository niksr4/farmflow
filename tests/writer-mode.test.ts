import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { filterTabsForWriter, isWriterRole, WRITER_ACCOUNTS_TABS, WRITER_TABS } from "@/lib/writer-mode"

describe("isWriterRole", () => {
  it("is exactly role=user, case-insensitively", () => {
    expect(isWriterRole("user")).toBe(true)
    expect(isWriterRole("USER")).toBe(true)
    expect(isWriterRole("admin")).toBe(false)
    expect(isWriterRole("owner")).toBe(false)
  })

  it("treats an absent role as not-a-writer, so nothing is pared down by accident", () => {
    expect(isWriterRole(null)).toBe(false)
    expect(isWriterRole(undefined)).toBe(false)
    expect(isWriterRole("")).toBe(false)
  })
})

describe("filterTabsForWriter", () => {
  it("pares a writer down to the writer tabs, preserving the caller's order", () => {
    expect(filterTabsForWriter(["home", "sales", "accounts", "balance-sheet"], "user")).toEqual(["home", "accounts"])
  })

  it("leaves managers and owners untouched", () => {
    const tabs = ["home", "sales", "balance-sheet"]
    expect(filterTabsForWriter(tabs, "admin")).toEqual(tabs)
    expect(filterTabsForWriter(tabs, "owner")).toEqual(tabs)
  })

  it("never invents a tab the caller did not offer", () => {
    expect(filterTabsForWriter(["home"], "user")).toEqual(["home"])
  })
})

describe("what a writer must never be shown", () => {
  /**
   * Writer mode gates COMPLEXITY, not permission — module access is a separate gate. But two of
   * these are also money-sensitive: balance-sheet is blocked for role=user system-wide, and the
   * P&L and season views are the owner's read on the business.
   */
  const ANALYSIS_TABS = ["balance-sheet", "season-pl", "season", "sales", "ai-analysis", "receivables", "billing"]

  it("keeps analysis tabs out of the top-level writer tab list", () => {
    for (const tab of ANALYSIS_TABS) {
      expect(WRITER_TABS as readonly string[]).not.toContain(tab)
    }
  })

  it("keeps summary and code management out of the writer's accounts sub-nav", () => {
    // "dashboard" is the accounts summary; "activities" is activity-code management; "export"
    // pulls the whole ledger out.
    for (const tab of ["dashboard", "activities", "export"]) {
      expect(WRITER_ACCOUNTS_TABS as readonly string[]).not.toContain(tab)
    }
  })

  it("still gives a writer the three things they actually do daily", () => {
    expect(WRITER_ACCOUNTS_TABS as readonly string[]).toEqual(["labour", "expenses", "picking"])
  })
})

describe("the accounts sub-nav is filtered through the constant, not a second hand-kept list", () => {
  /**
   * WRITER_ACCOUNTS_TABS was exported and imported by nobody while accounts-page.tsx hand-built
   * the same three values — so editing the constant did nothing. Checks for the CALL, with import
   * lines stripped, because a guard satisfied by a mention is how that went unnoticed.
   */
  const src = readFileSync(resolve(process.cwd(), "components/accounts-page.tsx"), "utf8")
  const body = src
    .split("\n")
    .filter((line) => !/^\s*import\b/.test(line))
    .join("\n")

  it("accounts-page filters its tab list through WRITER_ACCOUNTS_TABS", () => {
    expect(body).toContain("WRITER_ACCOUNTS_TABS")
    expect(body).toMatch(/isWriterRole\([^)]*\)\s*\)?\s*\{?[\s\S]{0,200}WRITER_ACCOUNTS_TABS/)
  })
})
