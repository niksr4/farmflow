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
})

