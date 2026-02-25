import { expect, test, type Page } from "@playwright/test"
import { expectOwnerUser, hasAuthCredentials, waitForDashboardReady } from "./helpers"

test.describe("dashboard regression", () => {
  test.skip(!hasAuthCredentials, "Set E2E_USERNAME and E2E_PASSWORD to run authenticated dashboard tests")

  const getDashboardRoute = async (page: Page, tab: string) => {
    if (!expectOwnerUser) {
      return `/dashboard?tab=${encodeURIComponent(tab)}`
    }

    const tenantsResponse = await page.request.get("/api/admin/tenants")
    expect(tenantsResponse.ok()).toBeTruthy()
    const payload = await tenantsResponse.json()
    const firstTenant = Array.isArray(payload?.tenants) ? payload.tenants[0] : null
    const previewTenantId = String(firstTenant?.id || "").trim()
    expect(previewTenantId).toBeTruthy()
    const params = new URLSearchParams({
      tab,
      previewTenantId,
      previewRole: "admin",
    })
    if (firstTenant?.name) {
      params.set("previewTenantName", String(firstTenant.name))
    }
    return `/dashboard?${params.toString()}`
  }

  test("home brief and exceptions drill down to actionable tabs", async ({ page }) => {
    await page.route("**/api/intelligence-brief**", async (route) => {
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

    await page.route("**/api/exception-alerts**", async (route) => {
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

    const homeRoute = await getDashboardRoute(page, "home")
    await page.goto(homeRoute)
    await waitForDashboardReady(page)

    await expect(page.getByText("Today's Brief")).toBeVisible()
    await expect(page.getByText("Priority Alerts")).toBeVisible()

    await page.getByTestId("home-brief-insight-1").click()
    await expect(page).toHaveURL(/tab=dispatch/)

    await page.goto(homeRoute)
    await page.getByTestId("home-priority-alert-1").click()
    await expect(page).toHaveURL(/seasonAlertId=e2e-alert-1/)
    await expect(page).toHaveURL(/tab=processing|tab=season/)
  })

  test("inventory system-status alerts remain clickable drilldowns", async ({ page }) => {
    await page.route("**/api/exception-alerts**", async (route) => {
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

    const inventoryRoute = await getDashboardRoute(page, "inventory")
    await page.goto(inventoryRoute)
    await waitForDashboardReady(page)
    await page.getByRole("tab", { name: "Inventory" }).click()
    await expect(page.getByText("System status")).toBeVisible()

    await page.getByTestId("inventory-system-alert-1").click()
    await expect(page).toHaveURL(/seasonAlertId=e2e-alert-2/)
    await expect(page).toHaveURL(/tab=dispatch|tab=season/)
  })
})
