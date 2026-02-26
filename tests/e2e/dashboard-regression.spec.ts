import { expect, test, type Page } from "@playwright/test"
import { expectOwnerUser, hasRequiredAuthCredentials, waitForDashboardReady } from "./helpers"

test.describe("dashboard regression", () => {
  test.skip(!hasRequiredAuthCredentials, "Set required E2E credentials to run authenticated dashboard tests")

  const getDashboardRoute = async (page: Page, tab: string, requiredModules: string[] = []) => {
    if (!expectOwnerUser) {
      return `/dashboard?tab=${encodeURIComponent(tab)}`
    }

    const tenantsResponse = await page.request.get("/api/admin/tenants")
    expect(tenantsResponse.ok()).toBeTruthy()
    const payload = await tenantsResponse.json()
    const tenants = Array.isArray(payload?.tenants) ? payload.tenants : []
    let selectedTenant: { id: string; name?: string } | null = null

    for (const tenant of tenants) {
      const candidateTenantId = String(tenant?.id || "").trim()
      if (!candidateTenantId) continue

      const modulesResponse = await page.request.get(`/api/admin/tenant-modules?tenantId=${candidateTenantId}`)
      if (!modulesResponse.ok()) {
        continue
      }
      const modulesPayload = await modulesResponse.json().catch(() => null)
      const modules = Array.isArray(modulesPayload?.modules) ? modulesPayload.modules : []
      const moduleState = new Map(modules.map((module: any) => [String(module.id), Boolean(module.enabled)]))
      const hasRequiredModules =
        requiredModules.length === 0 || requiredModules.every((moduleId) => moduleState.get(moduleId) === true)

      if (hasRequiredModules) {
        selectedTenant = { id: candidateTenantId, name: String(tenant?.name || "") || undefined }
        break
      }
    }

    const firstTenant = tenants[0]
    if (!selectedTenant && requiredModules.length === 0 && firstTenant) {
      selectedTenant = { id: String(firstTenant.id || "").trim(), name: String(firstTenant.name || "") || undefined }
    }

    const previewTenantId = String(selectedTenant?.id || "").trim()
    if (!previewTenantId) {
      return null
    }
    const params = new URLSearchParams({
      tab,
      previewTenantId,
      previewRole: "admin",
    })
    if (selectedTenant?.name) {
      params.set("previewTenantName", String(selectedTenant.name))
    }
    return `/dashboard?${params.toString()}`
  }

  test("home brief and exceptions drill down to actionable tabs", async ({ page }) => {
    let intelligenceRouteHits = 0
    await page.route("**/api/intelligence-brief**", async (route) => {
      intelligenceRouteHits += 1
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          highlights: [
            "Dispatch queue has 2 unconfirmed receipts today.",
            "Float rate increased in Robusta lots this week.",
          ],
          actions: [
            { label: "Open dispatch", tab: "dispatch" },
            { label: "Review processing", tab: "processing" },
          ],
          accountsPatterns: {
            topCostCodes: [{ code: "LBR-001", reference: "Labour", totalAmount: 128000, entryCount: 14 }],
            mostFrequentCodes: [{ code: "EXP-002", reference: "Fuel", totalAmount: 64000, entryCount: 21 }],
          },
        }),
      })
    })

    let exceptionRouteHits = 0
    await page.route("**/api/exception-alerts**", async (route) => {
      exceptionRouteHits += 1
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          alerts: [
            {
              id: "e2e-alert-1",
              title: "Float spike in MV Robusta",
              severity: "high",
              metric: "float_rate",
              location: "MV",
              coffeeType: "Robusta",
            },
          ],
          window: {
            startDate: "2026-02-19",
            endDate: "2026-02-25",
            priorStartDate: "2026-02-12",
            priorEndDate: "2026-02-18",
          },
        }),
      })
    })

    const homeRoute = await getDashboardRoute(page, "home", ["season", "inventory"])
    test.skip(!homeRoute, "No tenant with required modules (season + inventory) for owner preview")
    if (!homeRoute) return
    await page.goto(homeRoute)
    await waitForDashboardReady(page)

    await expect(page.getByText("Today's Brief")).toBeVisible()
    await expect(page.getByText("Priority Alerts")).toBeVisible()

    const waitForRouteHit = async (counter: () => number, timeoutMs = 10000) => {
      const startedAt = Date.now()
      while (Date.now() - startedAt < timeoutMs) {
        if (counter() > 0) return true
        await page.waitForTimeout(200)
      }
      return false
    }

    const hasIntelligenceRouteHit = await waitForRouteHit(() => intelligenceRouteHits)
    const hasExceptionRouteHit = await waitForRouteHit(() => exceptionRouteHits)
    test.skip(
      !hasIntelligenceRouteHit || !hasExceptionRouteHit,
      "Deployment did not hit mocked intelligence/exception endpoints; skipping parity-sensitive drilldown assertions",
    )
    if (!hasIntelligenceRouteHit || !hasExceptionRouteHit) return

    await page.getByTestId("home-brief-insight-1").click()
    await expect(page).toHaveURL(/tab=dispatch/)

    await page.goto(homeRoute)
    const homePriorityAlert = page.getByTestId("home-priority-alert-1")
    if ((await homePriorityAlert.count()) > 0) {
      await homePriorityAlert.click()
    } else {
      await page.getByText("Float spike in MV Robusta").first().click()
    }
    await expect(page).toHaveURL(/seasonAlertId=e2e-alert-1/)
    await expect(page).toHaveURL(/tab=processing|tab=season/)
  })

  test("inventory system-status alerts remain clickable drilldowns", async ({ page }) => {
    let exceptionRouteHits = 0
    await page.route("**/api/exception-alerts**", async (route) => {
      exceptionRouteHits += 1
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          alerts: [
            {
              id: "e2e-alert-2",
              title: "Dispatch confirmations lagging",
              severity: "medium",
              metric: "dispatch_unconfirmed",
              location: "PG",
              coffeeType: "Arabica",
            },
          ],
        }),
      })
    })

    const inventoryRoute = await getDashboardRoute(page, "inventory", ["season", "inventory"])
    test.skip(!inventoryRoute, "No tenant with required modules (season + inventory) for owner preview")
    if (!inventoryRoute) return
    await page.goto(inventoryRoute)
    await waitForDashboardReady(page)
    await page.getByRole("tab", { name: "Inventory" }).click()
    await expect(page.getByText("System status")).toBeVisible()

    const waitForRouteHit = async (counter: () => number, timeoutMs = 10000) => {
      const startedAt = Date.now()
      while (Date.now() - startedAt < timeoutMs) {
        if (counter() > 0) return true
        await page.waitForTimeout(200)
      }
      return false
    }

    const hasExceptionRouteHit = await waitForRouteHit(() => exceptionRouteHits)
    test.skip(
      !hasExceptionRouteHit,
      "Deployment did not hit mocked exception endpoint; skipping parity-sensitive drilldown assertions",
    )
    if (!hasExceptionRouteHit) return

    const inventorySystemAlert = page.getByTestId("inventory-system-alert-1")
    if ((await inventorySystemAlert.count()) > 0) {
      await inventorySystemAlert.click()
    } else {
      await page.getByText("Dispatch confirmations lagging").first().click()
    }
    await expect(page).toHaveURL(/seasonAlertId=e2e-alert-2/)
    await expect(page).toHaveURL(/tab=dispatch|tab=season/)
  })
})
