import { devices, expect, test, type Page } from "@playwright/test"
import { expectOwnerUser, hasRequiredAuthCredentials, waitForDashboardReady } from "./helpers"

type PreviewTenant = { id: string; name?: string }
type DashboardRouteContext = { route: string; tenantId: string | null }

const E2E_MOBILE_OWNER_TENANT_NAME = "E2E Mobile Smoke Tenant"
const WRITE_QUEUE_DB = "farmflow-offline-db"

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

const buildPreviewRoute = (tenant: PreviewTenant, tab: string) => {
  const params = new URLSearchParams({
    tab,
    previewTenantId: tenant.id,
    previewRole: "admin",
  })
  if (tenant.name) params.set("previewTenantName", tenant.name)
  return `/dashboard?${params.toString()}`
}

const parsePreviewTenants = (payload: any): PreviewTenant[] =>
  (Array.isArray(payload?.tenants) ? payload.tenants : [])
    .map((tenant: any) => ({
      id: String(tenant?.id || "").trim(),
      name: String(tenant?.name || "").trim() || undefined,
    }))
    .filter((tenant: PreviewTenant) => Boolean(tenant.id))

const listPreviewTenants = async (page: Page): Promise<PreviewTenant[]> => {
  const tenantsResponse = await page.request.get("/api/admin/tenants")
  if (!tenantsResponse.ok()) {
    const body = await tenantsResponse.text().catch(() => "")
    throw new Error(`Failed to list preview tenants (${tenantsResponse.status()}): ${body || "no response body"}`)
  }
  const payload = await tenantsResponse.json()
  return parsePreviewTenants(payload)
}

const createPreviewTenant = async (page: Page): Promise<PreviewTenant | null> => {
  const createResponse = await page.request.post("/api/admin/tenants", {
    data: { name: E2E_MOBILE_OWNER_TENANT_NAME },
  })
  if (!createResponse.ok()) {
    return null
  }
  const createPayload = await createResponse.json().catch(() => ({}))
  const createdId = String(createPayload?.tenant?.id || "").trim()
  if (!createdId) return null
  await ensurePreviewTenantUser(page, createdId)
  return {
    id: createdId,
    name: String(createPayload?.tenant?.name || "").trim() || E2E_MOBILE_OWNER_TENANT_NAME,
  }
}

const ensurePreviewTenantUser = async (page: Page, tenantId: string) => {
  const usersResponse = await page.request.get(`/api/admin/users?tenantId=${encodeURIComponent(tenantId)}`)
  if (usersResponse.ok()) {
    const usersPayload = await usersResponse.json().catch(() => ({}))
    if (Array.isArray(usersPayload?.users) && usersPayload.users.length > 0) {
      return
    }
  }

  const username = `e2e.mobile.${tenantId.slice(0, 8)}`
  const createResponse = await page.request.post("/api/admin/users", {
    data: {
      tenantId,
      username,
      password: "MobilePass123!",
      role: "admin",
    },
  })
  if (!createResponse.ok()) {
    const body = await createResponse.text().catch(() => "")
    throw new Error(`Failed to seed preview tenant user (${createResponse.status()}): ${body || "no response body"}`)
  }
}

const ensureOwnerPreviewTenant = async (page: Page): Promise<PreviewTenant> => {
  const tenants = await listPreviewTenants(page)
  const matchingTenant = tenants.find(
    (tenant) => String(tenant.name || "").toLowerCase() === E2E_MOBILE_OWNER_TENANT_NAME.toLowerCase(),
  )
  if (matchingTenant) {
    await ensurePreviewTenantUser(page, matchingTenant.id)
    return matchingTenant
  }

  const createdTenant = await createPreviewTenant(page)
  if (createdTenant) return createdTenant

  if (tenants.length > 0) return tenants[0]
  throw new Error("No owner preview tenant is available and automatic E2E tenant creation failed.")
}

const getDashboardRouteContext = async (page: Page, tab: string): Promise<DashboardRouteContext> => {
  if (!expectOwnerUser) {
    return {
      route: `/dashboard?tab=${encodeURIComponent(tab)}`,
      tenantId: null,
    }
  }

  const ownerTenant = await ensureOwnerPreviewTenant(page)
  return {
    route: buildPreviewRoute(ownerTenant, tab),
    tenantId: ownerTenant.id,
  }
}

const applyPreviewTenantCookie = async (page: Page, tenantId: string | null) => {
  if (!tenantId) return
  const origin = new URL(page.url()).origin
  await page.context().addCookies([
    {
      name: "farmflow_preview_tenant",
      value: tenantId,
      url: origin,
    },
  ])
}

const ensureMovementItemType = async (page: Page, uniqueSuffix: string): Promise<{ itemType: string; created: boolean }> => {
  const inventoryResponse = await page.request.get("/api/inventory-neon")
  if (!inventoryResponse.ok()) {
    const body = await inventoryResponse.text().catch(() => "")
    throw new Error(`Failed to inspect inventory (${inventoryResponse.status()}): ${body || "no response body"}`)
  }

  const inventoryPayload = await inventoryResponse.json()
  const inventoryItems = Array.isArray(inventoryPayload?.inventory) ? inventoryPayload.inventory : []
  const existingItemType = inventoryItems
    .map((item: any) => String(item?.name || "").trim())
    .find((value: string) => Boolean(value))

  if (existingItemType) {
    return { itemType: existingItemType, created: false }
  }

  const seededItemType = `E2E Movement ${uniqueSuffix}`.slice(0, 24)
  const createResponse = await page.request.post("/api/inventory-neon", {
    data: {
      item_type: seededItemType,
      quantity: 1,
      unit: "kg",
      price: 0,
      notes: "E2E seeded inventory item",
    },
  })
  if (!createResponse.ok()) {
    const body = await createResponse.text().catch(() => "")
    throw new Error(`Failed to seed inventory item (${createResponse.status()}): ${body || "no response body"}`)
  }

  return { itemType: seededItemType, created: true }
}

test.describe("mobile public smoke", () => {
  test("landing and signup are usable on phone", async ({ page }) => {
    let payload: any = null
    await page.route("**/api/auth/signup", async (route) => {
      payload = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          email: "mobile.qa@example.com",
          maskedEmail: "mo****@example.com",
          signupRequestId: "signup-mobile-123",
          verificationSent: true,
        }),
      })
    })

    await page.goto("/")
    await expect(page.getByRole("link", { name: "Create your workspace" }).first()).toBeVisible()
    await expect(page.getByText("Install FarmFlow on your phone")).toHaveCount(0)
    await expectNoHorizontalOverflow(page, "landing")

    await page.goto("/signup")
    await page.locator("#name").fill("Mobile QA")
    await page.locator("#email").fill("mobile.qa@example.com")
    await page.locator("#password").fill("MobilePass123!")
    await page.locator("#estateName").fill("Mobile Estate")
    await page.locator("#country").fill("Coorg")
    await page.getByRole("button", { name: "Create Account" }).click()

    await expect(page).toHaveURL(/\/verify-email(?:\?|$)/)
    await expect(page.getByText("Verify Your Email", { exact: true })).toBeVisible()
    await expect(payload?.source).toBe("signup-page")
    await expect(payload?.estateName).toBe("Mobile Estate")
    await expect(page.getByText("Install FarmFlow on your phone")).toHaveCount(0)
    await expectNoHorizontalOverflow(page, "signup")
  })

  test("manifest and mobile metadata are present", async ({ page, request }) => {
    await page.goto("/")

    const manifestLink = page.locator('link[rel="manifest"]').first()
    await expect(manifestLink).toHaveAttribute("href", "/manifest.webmanifest")

    const webAppCapable = page.locator('meta[name="apple-mobile-web-app-capable"]').first()
    await expect(webAppCapable).toHaveAttribute("content", /yes/i)

    const manifestResponse = await request.get("/manifest.webmanifest")
    expect(manifestResponse.ok()).toBeTruthy()
    const manifest = await manifestResponse.json()
    expect(String(manifest?.display || "").toLowerCase()).toBe("standalone")
    expect(Array.isArray(manifest?.icons)).toBeTruthy()
    expect((manifest?.icons || []).length).toBeGreaterThanOrEqual(3)
  })
})

test.describe("mobile dashboard smoke", () => {
  test.skip(!hasRequiredAuthCredentials, "Set E2E credentials to run authenticated mobile dashboard checks")

  test("inventory tab keeps phone navigation and actions usable", async ({ page }) => {
    const routeContext = await getDashboardRouteContext(page, "inventory")

    await page.goto(routeContext.route)
    await waitForDashboardReady(page)
    await expect(page.getByTestId("inventory-quick-actions")).toBeVisible()

    await expect(page.locator("div.sticky.top-2", { hasText: "Workspace Sections" })).toHaveCount(0)

    const mobileBottomNav = page.locator("div.fixed.inset-x-0.bottom-0").first()
    await expect(mobileBottomNav).toBeVisible()
    await expect(mobileBottomNav.getByRole("button").first()).toBeVisible()

    const actionsHeading = page.getByTestId("inventory-quick-actions").first()
    const inventoryHeading = page.getByRole("heading", { name: /Inventory Levels/ }).first()
    const [actionsBox, inventoryBox] = await Promise.all([actionsHeading.boundingBox(), inventoryHeading.boundingBox()])
    expect(actionsBox).toBeTruthy()
    expect(inventoryBox).toBeTruthy()
    expect((actionsBox as { y: number }).y).toBeLessThan((inventoryBox as { y: number }).y)

    const sectionDescriptions = [
      "Inventory handles stock usage directly",
      "Use Deplete here when you only need stock tracking for fertiliser, chemicals, fuel, or other consumables. Use Accounts → Other Expenses only when the same usage should also land in Accounts and P&L.",
    ]
    for (const copy of sectionDescriptions) {
      const description = page.getByText(copy, { exact: true }).first()
      await expect(description).toBeVisible()
      const overflows = await description.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
      expect(overflows, `Section copy overflows its container: "${copy}"`).toBe(false)
    }

    await expectNoHorizontalOverflow(page, "dashboard inventory")
  })

  test("inventory movement form supports item-type selection and mobile submit flow", async ({ page }) => {
    const routeContext = await getDashboardRouteContext(page, "inventory")
    const uniqueSuffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)
      .toString(36)
      .padStart(2, "0")}`.toUpperCase()
    const note = `E2E movement ${uniqueSuffix}`

    await page.goto(routeContext.route)
    await waitForDashboardReady(page)
    await applyPreviewTenantCookie(page, routeContext.tenantId)

    const movementSeed = await ensureMovementItemType(page, uniqueSuffix)
    if (movementSeed.created) {
      await page.reload()
      await waitForDashboardReady(page)
      await applyPreviewTenantCookie(page, routeContext.tenantId)
    }

    await page.getByTestId("inventory-action-record-movement").click()
    await expect(page.getByRole("heading", { name: /Record inventory movement/i })).toBeVisible()

    const itemTypeSelect = page.getByTestId("movement-item-type-select")
    await itemTypeSelect.click()
    const movementOptions = (await page.getByRole("option").allTextContents()).map((value) => value.trim())
    const selectedItemType = movementOptions.find((value) => value && !/add an inventory item first/i.test(value))
    expect(selectedItemType, "Expected at least one inventory item type to be available for movement").toBeTruthy()
    await page.getByRole("option", { name: selectedItemType as string, exact: true }).first().click()

    await page.getByLabel("Restocking").click()
    await expect(page.getByLabel("Restocking")).toBeChecked()
    await page.getByLabel("Depleting").click()
    await expect(page.getByLabel("Depleting")).toBeChecked()
    await page.getByLabel("Restocking").click()

    const qtyInput = page.getByTestId("movement-quantity-input")
    await qtyInput.fill("4.5")
    await page.getByPlaceholder("Add any additional details").fill(note)

    await page.getByTestId("movement-record-transaction").click()
    await expect(page.getByText("Transaction recorded", { exact: true }).first()).toBeVisible()
    const transactionsResponse = await page.request.get("/api/transactions-neon?limit=50")
    expect(transactionsResponse.ok()).toBeTruthy()
    const transactionsPayload = await transactionsResponse.json()
    const transactions = Array.isArray(transactionsPayload?.transactions) ? transactionsPayload.transactions : []
    expect(
      transactions.some(
        (transaction: any) =>
          String(transaction?.item_type || "") === selectedItemType &&
          String(transaction?.notes || "").includes(note),
      ),
      `Expected a saved mobile movement transaction for ${selectedItemType}`,
    ).toBe(true)
    await expectNoHorizontalOverflow(page, "mobile movement form")
  })

  test("inventory item creation with opening stock persists on mobile", async ({ page }) => {
    const routeContext = await getDashboardRouteContext(page, "inventory")
    const uniqueSuffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)
      .toString(36)
      .padStart(2, "0")}`.toUpperCase()
    const itemName = `E2E Fert ${uniqueSuffix}`.slice(0, 24)
    const note = `E2E opening stock ${uniqueSuffix}`

    await page.goto(routeContext.route)
    await waitForDashboardReady(page)
    await applyPreviewTenantCookie(page, routeContext.tenantId)

    await page.getByTestId("inventory-action-add-item").click()
    await expect(page.getByRole("heading", { name: "Add Inventory Item", exact: true })).toBeVisible()

    await page.locator("#new-item-name").fill(itemName)
    await page.locator("#new-item-qty").fill("12.5")
    await page.locator("#new-item-price").fill("24")
    await page.locator("#new-item-notes").fill(note)

    await page.getByRole("button", { name: "Add Item", exact: true }).click()
    await expect(page.getByText("Item added", { exact: true }).first()).toBeVisible()
    await expect(page.getByRole("heading", { name: "Add Inventory Item", exact: true })).toHaveCount(0)

    const inventoryResponse = await page.request.get("/api/inventory-neon")
    expect(inventoryResponse.ok()).toBeTruthy()
    const inventoryPayload = await inventoryResponse.json()
    const inventoryItems = Array.isArray(inventoryPayload?.inventory) ? inventoryPayload.inventory : []
    const savedItem = inventoryItems.find((item: any) => String(item?.name || "") === itemName)
    expect(savedItem, `Expected saved inventory item ${itemName}`).toBeTruthy()
    expect(Number(savedItem?.quantity) || 0).toBeGreaterThanOrEqual(12.5)

    const transactionsResponse = await page.request.get("/api/transactions-neon?limit=100")
    expect(transactionsResponse.ok()).toBeTruthy()
    const transactionsPayload = await transactionsResponse.json()
    const transactions = Array.isArray(transactionsPayload?.transactions) ? transactionsPayload.transactions : []
    expect(
      transactions.some(
        (transaction: any) =>
          String(transaction?.item_type || "") === itemName &&
          String(transaction?.notes || "").includes(note),
      ),
      `Expected a saved opening stock transaction for ${itemName}`,
    ).toBe(true)
  })

  test("home tab shows execution scorecard outcomes", async ({ page }) => {
    const routeContext = await getDashboardRouteContext(page, "home")

    await page.goto(routeContext.route)
    await waitForDashboardReady(page)
    await expect(page.getByTestId("home-smart-next-steps")).toBeVisible()
    const installPrompt = page.getByText("Install FarmFlow on your phone")
    const installPromptCount = await installPrompt.count()
    if (installPromptCount > 0) {
      await expect(installPrompt.first()).toBeVisible()
    }
    const executionScorecardHeading = page.getByText("Execution Scorecard", { exact: true })
    if ((await executionScorecardHeading.count()) > 0) {
      await expect(executionScorecardHeading.first()).toBeVisible()

      const expectedOutcomes = [
        "Fewer Missed Field Tasks",
        "Better Harvest Records",
        "Input Usage Tracking",
        "Labor Visibility",
        "Structured Daily Updates",
        "Reports for Owner, Exporter, and Manager",
      ]
      for (const outcome of expectedOutcomes) {
        await expect(page.getByText(outcome, { exact: true })).toBeVisible()
      }
    } else {
      await expect(page.getByText("Estate command center", { exact: true })).toBeVisible()
      await expect(page.getByText("Quick Actions", { exact: true })).toBeVisible()
    }

    await expectNoHorizontalOverflow(page, "dashboard home")
  })

  test("offline sync queue stays retired", async ({ page }) => {
    const routeContext = await getDashboardRouteContext(page, "inventory")
    await page.goto(routeContext.route)
    await waitForDashboardReady(page)

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            if (!("serviceWorker" in navigator)) {
              return 0
            }
            const registrations = await navigator.serviceWorker.getRegistrations()
            return registrations.length
          }),
        { timeout: 15_000 },
      )
      .toBe(0)

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            if (!("indexedDB" in window) || typeof indexedDB.databases !== "function") {
              return false
            }
            const databases = await indexedDB.databases()
            return databases.some((database) => database?.name === WRITE_QUEUE_DB)
          }),
        { timeout: 15_000 },
      )
      .toBe(false)

    await expect(page.getByText("Offline Sync Queue")).toHaveCount(0)
  })
})
