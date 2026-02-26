import { expect, test } from "@playwright/test"
import { expectOwnerUser, hasRequiredAuthCredentials, waitForDashboardReady } from "./helpers"

type ApiFailure = { url: string; status: number }
type PreviewTenant = { id: string; name?: string }

test.describe("tab smoke regression", () => {
  test.skip(!hasRequiredAuthCredentials, "Set required E2E credentials to run authenticated tab smoke tests")

  const buildPreviewRoute = (tenant: PreviewTenant, tab: string) => {
    const params = new URLSearchParams({
      tab,
      previewTenantId: tenant.id,
      previewRole: "admin",
    })
    if (tenant.name) params.set("previewTenantName", tenant.name)
    return `/dashboard?${params.toString()}`
  }

  test("all visible dashboard tabs open without app errors", async ({ page }) => {
    const apiFailures: ApiFailure[] = []
    const pageErrors: string[] = []

    page.on("response", (response) => {
      const url = response.url()
      if (url.includes("/api/") && response.status() >= 500) {
        apiFailures.push({ url, status: response.status() })
      }
    })

    page.on("pageerror", (error) => {
      pageErrors.push(error.message)
    })

    let resolvedRoute = "/dashboard?tab=inventory"
    if (expectOwnerUser) {
      const tenantsResponse = await page.request.get("/api/admin/tenants")
      expect(tenantsResponse.ok()).toBeTruthy()
      const payload = await tenantsResponse.json()
      const tenants = (Array.isArray(payload?.tenants) ? payload.tenants : [])
        .map((tenant: any) => ({
          id: String(tenant?.id || "").trim(),
          name: String(tenant?.name || "").trim() || undefined,
        }))
        .filter((tenant: PreviewTenant) => Boolean(tenant.id))

      let selectedRoute: string | null = null
      for (const tenant of tenants) {
        const candidateRoute = buildPreviewRoute(tenant, "inventory")
        await page.goto(candidateRoute)
        await waitForDashboardReady(page)
        if ((await page.getByRole("tab").count()) > 0) {
          selectedRoute = candidateRoute
          break
        }
      }

      test.skip(!selectedRoute, "No owner preview tenant currently exposes dashboard tabs")
      if (!selectedRoute) return
      resolvedRoute = selectedRoute
    }

    await page.goto(resolvedRoute)
    await waitForDashboardReady(page)
    await expect(page.getByRole("tab").first()).toBeVisible()

    const allTabs = page.getByRole("tab")
    const tabCount = await allTabs.count()
    expect(tabCount).toBeGreaterThan(0)

    const tabNames: string[] = []
    for (let index = 0; index < tabCount; index += 1) {
      const tab = allTabs.nth(index)
      const isDisabled = await tab.isDisabled().catch(() => false)
      if (isDisabled) continue
      const tabName = (await tab.innerText()).trim().replace(/\s+/g, " ")
      if (tabName) tabNames.push(tabName)
    }

    const visitedTabs: string[] = []
    for (const tabName of tabNames) {
      const tab = page.getByRole("tab", { name: tabName }).first()
      await tab.click()
      await expect(tab).toHaveAttribute("data-state", "active")
      await page.waitForTimeout(300)
      visitedTabs.push(tabName)
    }

    expect(visitedTabs.length).toBeGreaterThan(2)
    expect(pageErrors, `Runtime errors while switching tabs: ${pageErrors.join(" | ")}`).toEqual([])
    expect(apiFailures, `API 5xx while switching tabs: ${JSON.stringify(apiFailures)}`).toEqual([])
  })
})
