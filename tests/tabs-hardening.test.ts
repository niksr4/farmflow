import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("tabs hardening regression guards", () => {
  it("keeps inactive tab content hidden even when force-mounted", () => {
    const tabsSource = readFileSync(resolve(process.cwd(), "components/ui/tabs.tsx"), "utf8")
    expect(tabsSource).toContain("data-[state=inactive]:hidden")
  })

  it("keeps dashboard tabs force-mounted after first open for faster switching", () => {
    const dashboardSource = readFileSync(resolve(process.cwd(), "components/inventory-system.tsx"), "utf8")
    expect(dashboardSource).toContain("const [loadedTabs, setLoadedTabs]")
    expect(dashboardSource).toContain('forceMount={isTabLoaded("')
  })

  it("does not restore transaction history or other sales as standalone top-level tabs", () => {
    const dashboardSource = readFileSync(resolve(process.cwd(), "components/inventory-system.tsx"), "utf8")
    expect(dashboardSource).not.toContain('<TabsContent value="transactions"')
    expect(dashboardSource).not.toContain('<TabsContent value="other-sales"')
    expect(dashboardSource).not.toContain('{ value: "transactions",')
    expect(dashboardSource).not.toContain('{ value: "other-sales",')
  })
})
