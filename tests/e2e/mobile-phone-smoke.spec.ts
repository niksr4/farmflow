import { devices, expect, test, type Page } from "@playwright/test"
import { expectOwnerUser, hasRequiredAuthCredentials, waitForDashboardReady } from "./helpers"

const iPhone13 = devices["iPhone 13"]
test.use({
  viewport: iPhone13.viewport,
  userAgent: iPhone13.userAgent,
  deviceScaleFactor: iPhone13.deviceScaleFactor,
  isMobile: iPhone13.isMobile,
  hasTouch: iPhone13.hasTouch,
})

const expectNoHorizontalOverflow = async (page: Page, label: string) => {
  const metrics = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }))
  expect.soft(
    metrics.pageWidth,
    `${label}: unexpected horizontal overflow (page=${metrics.pageWidth}, viewport=${metrics.viewportWidth})`,
  ).toBeLessThanOrEqual(metrics.viewportWidth + 1)
}

test.describe("mobile public smoke", () => {
  test("landing and signup are usable on phone", async ({ page }) => {
    let payload: any = null
    await page.route("**/api/register-interest", async (route) => {
      payload = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, notified: true, emailed: true }),
      })
    })

    await page.goto("/")
    await expect(page.getByRole("link", { name: "Request Access" }).first()).toBeVisible()
    await expectNoHorizontalOverflow(page, "landing")

    await page.goto("/signup")
    await page.locator("#name").fill("Mobile QA")
    await page.locator("#email").fill("mobile.qa@example.com")
    await page.locator("#estate").fill("Mobile Estate")
    await page.locator("#region").fill("Coorg")
    await page.getByRole("button", { name: "Request Access" }).click()

    await expect(page.getByText("Thanks. We will reach out with your login details and onboarding plan shortly.")).toBeVisible()
    await expect(payload?.source).toBe("signup-page")
    await expect(payload?.organization).toBe("Mobile Estate")
    await expectNoHorizontalOverflow(page, "signup")
  })
})

test.describe("mobile dashboard smoke", () => {
  test.skip(!hasRequiredAuthCredentials, "Set E2E credentials to run authenticated mobile dashboard checks")

  const buildPreviewRoute = (tenant: { id: string; name?: string }, tab: string) => {
    const params = new URLSearchParams({
      tab,
      previewTenantId: tenant.id,
      previewRole: "admin",
    })
    if (tenant.name) params.set("previewTenantName", tenant.name)
    return `/dashboard?${params.toString()}`
  }

  const getRoute = async (page: Page, tab: string) => {
    if (!expectOwnerUser) return `/dashboard?tab=${encodeURIComponent(tab)}`

    const tenantsResponse = await page.request.get("/api/admin/tenants")
    expect(tenantsResponse.ok()).toBeTruthy()
    const payload = await tenantsResponse.json()
    const tenants = (Array.isArray(payload?.tenants) ? payload.tenants : [])
      .map((tenant: any) => ({
        id: String(tenant?.id || "").trim(),
        name: String(tenant?.name || "").trim() || undefined,
      }))
      .filter((tenant: { id: string }) => Boolean(tenant.id))

    if (!tenants.length) return null
    return buildPreviewRoute(tenants[0], tab)
  }

  test("inventory tab keeps phone navigation and actions usable", async ({ page }) => {
    const route = await getRoute(page, "inventory")
    test.skip(!route, "No tenant route available for mobile inventory checks")
    if (!route) return

    await page.goto(route)
    await waitForDashboardReady(page)
    await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible()

    const stickyHeader = page.locator("div.sticky.top-2").first()
    await expect(stickyHeader.locator('[role="tablist"]')).toHaveCount(0)

    const mobileBottomNav = page.locator("div.fixed.inset-x-0.bottom-0").first()
    await expect(mobileBottomNav).toBeVisible()
    await expect(mobileBottomNav.getByRole("button").first()).toBeVisible()

    const actionsHeading = page.getByRole("heading", { name: "Actions" }).first()
    const inventoryHeading = page.getByRole("heading", { name: /Current Inventory Levels/ }).first()
    const [actionsBox, inventoryBox] = await Promise.all([actionsHeading.boundingBox(), inventoryHeading.boundingBox()])
    expect(actionsBox).toBeTruthy()
    expect(inventoryBox).toBeTruthy()
    expect((actionsBox as { y: number }).y).toBeLessThan((inventoryBox as { y: number }).y)

    const sectionDescriptions = [
      "Inventory, processing, dispatch, sales",
      "Accounts, balance sheet, receivables",
      "Season patterns, rainfall, AI analysis",
    ]
    for (const copy of sectionDescriptions) {
      const description = page.getByText(copy, { exact: true }).first()
      await expect(description).toBeVisible()
      const overflows = await description.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
      expect(overflows, `Section copy overflows its container: "${copy}"`).toBe(false)
    }

    await expectNoHorizontalOverflow(page, "dashboard inventory")
  })

  test("home tab shows execution scorecard outcomes", async ({ page }) => {
    const route = await getRoute(page, "home")
    test.skip(!route, "No tenant route available for mobile home checks")
    if (!route) return

    await page.goto(route)
    await waitForDashboardReady(page)
    await expect(page.getByRole("heading", { name: "Execution Scorecard" })).toBeVisible()

    const expectedOutcomes = [
      "Fewer Missed Field Tasks",
      "Better Harvest Records",
      "Input Usage Tracking",
      "Labor Visibility",
      "Less Spreadsheet / WhatsApp Chaos",
      "Cleaner Reports for Owner / Exporter / Manager",
    ]
    for (const outcome of expectedOutcomes) {
      await expect(page.getByText(outcome, { exact: true })).toBeVisible()
    }

    await expectNoHorizontalOverflow(page, "dashboard home")
  })
})
