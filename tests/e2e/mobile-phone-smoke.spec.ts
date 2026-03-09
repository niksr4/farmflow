import { devices, expect, test, type Page } from "@playwright/test"
import { expectOwnerUser, hasRequiredAuthCredentials, waitForDashboardReady } from "./helpers"

type PreviewTenant = { id: string; name?: string }
type DashboardRouteContext = { route: string; tenantId: string | null }

const E2E_MOBILE_OWNER_TENANT_NAME = "E2E Mobile Smoke Tenant"
const WRITE_QUEUE_DB = "farmflow-offline-db"
const WRITE_QUEUE_STORE = "writeQueue"

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
  return {
    id: createdId,
    name: String(createPayload?.tenant?.name || "").trim() || E2E_MOBILE_OWNER_TENANT_NAME,
  }
}

const ensureOwnerPreviewTenant = async (page: Page): Promise<PreviewTenant> => {
  const tenants = await listPreviewTenants(page)
  const matchingTenant = tenants.find(
    (tenant) => String(tenant.name || "").toLowerCase() === E2E_MOBILE_OWNER_TENANT_NAME.toLowerCase(),
  )
  if (matchingTenant) return matchingTenant

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

const ensureServiceWorkerControl = async (page: Page) => {
  await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service workers are not supported in this browser context.")
    }
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
    await navigator.serviceWorker.ready
    registration.waiting?.postMessage({ type: "SKIP_WAITING" })
  })

  await page.reload()
  await waitForDashboardReady(page)
  await expect
    .poll(async () => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), {
      timeout: 20000,
    })
    .toBe(true)

  await page.evaluate(() => {
    navigator.serviceWorker.controller?.postMessage({
      type: "SET_RUNTIME_CONFIG",
      config: {
        writeQueue: true,
      },
    })
  })
}

const withWriteQueueStore = async <T>(page: Page, action: "clear" | "getAll"): Promise<T> =>
  page.evaluate(
    async ({ dbName, storeName, mode }) => {
      const openDb = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(dbName, 1)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })

      const db = await openDb()
      const value = await new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction(storeName, mode === "clear" ? "readwrite" : "readonly")
        const store = tx.objectStore(storeName)
        if (mode === "clear") {
          store.clear()
          tx.oncomplete = () => resolve(true)
          tx.onerror = () => reject(tx.error)
          return
        }

        const request = store.getAll()
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : [])
        request.onerror = () => reject(request.error)
      })
      db.close()
      return value
    },
    { dbName: WRITE_QUEUE_DB, storeName: WRITE_QUEUE_STORE, mode: action },
  ) as Promise<T>

const clearWriteQueueStore = async (page: Page) => {
  await withWriteQueueStore<boolean>(page, "clear")
}

const getQueuedWrites = async (page: Page) => withWriteQueueStore<Array<Record<string, unknown>>>(page, "getAll")

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
    await expect(page.getByText("Install FarmFlow on your phone")).toHaveCount(0)
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
    await expect(page.getByText("Quick shortcuts for inventory work.", { exact: true })).toBeVisible()

    await expect(page.locator("div.sticky.top-2", { hasText: "Workspace Sections" })).toHaveCount(0)

    const mobileBottomNav = page.locator("div.fixed.inset-x-0.bottom-0").first()
    await expect(mobileBottomNav).toBeVisible()
    await expect(mobileBottomNav.getByRole("button").first()).toBeVisible()

    const actionsHeading = page.getByText("Actions", { exact: true }).first()
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

  test("inventory movement form supports item-type selection and mobile submit flow", async ({ page }) => {
    const routeContext = await getDashboardRouteContext(page, "inventory")
    const uniqueSuffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)
      .toString(36)
      .padStart(2, "0")}`.toUpperCase()
    const note = `E2E movement ${uniqueSuffix}`

    await page.goto(routeContext.route)
    await waitForDashboardReady(page)
    await applyPreviewTenantCookie(page, routeContext.tenantId)

    await page.getByTestId("inventory-action-record-movement").click()
    await expect(page.getByRole("heading", { name: "Record Inventory Movement" })).toBeVisible()

    const itemTypeSelect = page.getByTestId("movement-item-type-select")
    if (await itemTypeSelect.isDisabled()) {
      test.skip(true, "Movement item type is disabled because no inventory items exist")
    }
    await itemTypeSelect.click()
    const movementOptions = (await page.getByRole("option").allTextContents()).map((value) => value.trim())
    const selectedItemType = movementOptions.find((value) => value && !/add an inventory item first/i.test(value))
    if (!selectedItemType) {
      test.skip(true, "No inventory item type is available for movement test")
    }
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
    await expect(page.getByText("Transaction recorded")).toBeVisible()
    const transactionsResponse = await page.request.get("/api/transactions-neon?limit=50")
    expect(transactionsResponse.ok()).toBeTruthy()
    const transactionsPayload = await transactionsResponse.json()
    const transactions = Array.isArray(transactionsPayload?.transactions) ? transactionsPayload.transactions : []
    expect(
      transactions.some(
        (transaction: any) =>
          String(transaction?.item_type || "") === selectedItemType && String(transaction?.notes || "").includes(note),
      ),
      `Expected a saved mobile movement transaction for ${selectedItemType}`,
    ).toBe(true)
    await expectNoHorizontalOverflow(page, "mobile movement form")
  })

  test("home tab shows execution scorecard outcomes", async ({ page }) => {
    const routeContext = await getDashboardRouteContext(page, "home")

    await page.goto(routeContext.route)
    await waitForDashboardReady(page)
    await expect(page.getByText("Install FarmFlow on your phone")).toBeVisible()
    const executionScorecardHeading = page.getByRole("heading", { name: "Execution Scorecard" })
    if ((await executionScorecardHeading.count()) > 0) {
      await expect(executionScorecardHeading.first()).toBeVisible()

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
    } else {
      await expect(page.getByRole("heading", { name: "Estate command center" })).toBeVisible()
      await expect(page.getByText("Setup Health", { exact: true })).toBeVisible()
      await expect(page.getByText("First 30 Days", { exact: true })).toBeVisible()
      await expect(page.getByText("Quick Actions", { exact: true })).toBeVisible()
    }

    await expectNoHorizontalOverflow(page, "dashboard home")
  })

  test("offline queued writes sync after reconnect", async ({ page }) => {
    const routeContext = await getDashboardRouteContext(page, "inventory")
    await page.goto(routeContext.route)
    await waitForDashboardReady(page)

    await ensureServiceWorkerControl(page)
    await clearWriteQueueStore(page)

    const uniqueSuffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)
      .toString(36)
      .padStart(2, "0")}`.toUpperCase()
    const locationCode = `E2E-${uniqueSuffix}`.slice(0, 16)
    const locationName = `E2E Offline ${uniqueSuffix}`

    await page.context().setOffline(true)

    const queuedWrite = await page.evaluate(
      async ({ name, code, tenantId }) => {
        const response = await fetch("/api/locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            code,
            ...(tenantId ? { tenantId } : {}),
          }),
        })

        let data: any = null
        try {
          data = await response.json()
        } catch {
          data = null
        }

        return {
          status: response.status,
          ok: response.ok,
          data,
        }
      },
      { name: locationName, code: locationCode, tenantId: routeContext.tenantId },
    )

    expect(queuedWrite.status).toBe(202)
    expect(Boolean(queuedWrite.ok)).toBe(true)
    expect(Boolean(queuedWrite.data?.offline)).toBe(true)

    await expect
      .poll(async () => {
        const queuedEntries = await getQueuedWrites(page)
        return queuedEntries.some((entry) => {
          const url = String(entry?.url || "")
          const body = String(entry?.body || "")
          return url.includes("/api/locations") && body.includes(locationCode)
        })
      })
      .toBe(true)

    await page.context().setOffline(false)
    await page.evaluate(() => {
      navigator.serviceWorker.controller?.postMessage({ type: "FLUSH_WRITE_QUEUE" })
    })

    await expect
      .poll(
        async () => {
          const queuedEntries = await getQueuedWrites(page)
          return queuedEntries.some((entry) => {
            const url = String(entry?.url || "")
            const body = String(entry?.body || "")
            return url.includes("/api/locations") && body.includes(locationCode)
          })
        },
        { timeout: 30000 },
      )
      .toBe(false)

    const locationsUrl = routeContext.tenantId
      ? `/api/locations?tenantId=${encodeURIComponent(routeContext.tenantId)}`
      : "/api/locations"
    const locationsResponse = await page.request.get(locationsUrl)
    expect(locationsResponse.ok()).toBeTruthy()
    const locationsPayload = await locationsResponse.json()
    const locations = Array.isArray(locationsPayload?.locations) ? locationsPayload.locations : []
    expect(
      locations.some((location: any) => String(location?.code || "").toUpperCase() === locationCode),
      `Expected queued location ${locationCode} to exist after reconnect sync`,
    ).toBe(true)
  })
})
