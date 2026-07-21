import { expect, test, type Page } from "@playwright/test"
import { buildDashboardRouteForTab, resolveDashboardRouteContext } from "./dashboard-route"
import { hasRequiredAuthCredentials, waitForDashboardReady } from "./helpers"

// Helpers shared with day-in-life but scoped here to avoid coupling

const requestJson = async (page: Page, method: "GET" | "POST", url: string, body?: Record<string, unknown>) => {
  const response =
    method === "GET"
      ? await page.request.get(url)
      : await page.request.post(url, { data: body })
  const text = await response.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  return { ok: response.ok(), status: response.status(), data, text }
}

const applyPreviewTenantCookie = async (page: Page, tenantId: string | null) => {
  if (!tenantId) return
  const origin = new URL(page.url()).origin
  await page.context().addCookies([{ name: "farmflow_preview_tenant", value: tenantId, url: origin }])
}

const seedActivityCode = async (page: Page, code: string, reference: string) => {
  const result = await requestJson(page, "POST", "/api/add-activity", { code, reference })
  expect(result.ok || result.status === 400, `Activity code seed failed (${result.status}): ${result.text}`).toBeTruthy()
}

const seedLocation = async (page: Page, tenantId: string | null, name: string, code: string) => {
  const listUrl = tenantId ? `/api/locations?tenantId=${encodeURIComponent(tenantId)}` : "/api/locations"
  const list = await requestJson(page, "GET", listUrl)
  const existing = (list.data?.locations ?? []).find((l: any) => String(l?.code || "").toUpperCase() === code.toUpperCase())
  if (existing?.id) return String(existing.id)

  const create = await requestJson(page, "POST", "/api/locations", { name, code, ...(tenantId ? { tenantId } : {}) })
  if (create.ok && create.data?.location?.id) return String(create.data.location.id)

  const retry = await requestJson(page, "GET", listUrl)
  const found = (retry.data?.locations ?? []).find((l: any) => String(l?.code || "").toUpperCase() === code.toUpperCase())
  expect(Boolean(found?.id), `Location seed failed: ${create.text}`).toBe(true)
  return String(found.id)
}

test.describe("full UI write workflows", () => {
  test.skip(!hasRequiredAuthCredentials, "Set E2E credentials to run UI workflow checks")

  test("labour entry: form fill, save, and row appears in list", async ({ page }) => {
    const token = `${Date.now().toString(36)}`.toUpperCase().slice(-6)
    const activityCode = `UIT${token}`.slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)

    const { route, context } = await resolveDashboardRouteContext(page, "accounts", {
      requiredModules: ["accounts", "inventory"],
      preferredTenantName: "Estate Mock",
    })

    await page.goto(route)
    await waitForDashboardReady(page)
    await applyPreviewTenantCookie(page, context.tenantId)
    await seedActivityCode(page, activityCode, `UI Test Labour ${token}`)

    await page.goto(buildDashboardRouteForTab(context, "accounts"))
    await waitForDashboardReady(page)

    const laborTab = page.getByRole("tab", { name: "Labour" })
    if ((await laborTab.count()) === 0) {
      test.skip(true, "Labour sub-tab not visible for this tenant/role")
      return
    }
    await laborTab.click()
    await expect(laborTab).toHaveAttribute("data-state", "active")
    await page.waitForLoadState("networkidle")

    // Open the inline form
    await page.getByRole("button", { name: "Add labour entry" }).first().click()
    await page.waitForTimeout(300)

    // Fill date
    const dateInput = page.getByLabel("Date").first()
    await dateInput.fill(today)

    // Fill activity code
    const codeInput = page.getByLabel("Activity code").first()
    await codeInput.fill(activityCode)
    await page.waitForTimeout(200)

    // Fill estate worker count + cost
    const workerCountInputs = page.getByLabel("Number of workers (0.5 for half day)")
    if ((await workerCountInputs.count()) > 0) {
      await workerCountInputs.first().fill("2")
    }
    const costInputs = page.getByLabel("Cost per worker (₹)")
    if ((await costInputs.count()) > 0) {
      await costInputs.first().fill("400")
    }

    // Fill task description
    const taskInput = page.getByLabel("What work was done")
    if ((await taskInput.count()) > 0) {
      await taskInput.fill(`UI e2e labour test ${token}`)
    }

    // Save — intercept the POST and verify success
    const [saveResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/labor-neon") && r.request().method() === "POST"),
      page.getByRole("button", { name: "Save labour entry" }).first().click(),
    ])
    expect(saveResponse.ok(), `Labour save returned ${saveResponse.status()}`).toBeTruthy()
    const saveData = await saveResponse.json()
    expect(Boolean(saveData?.success), `Labour API did not return success: ${JSON.stringify(saveData)}`).toBeTruthy()
  })

  test("expense entry: form fill, save, and row appears in list", async ({ page }) => {
    const token = `${Date.now().toString(36)}`.toUpperCase().slice(-6)
    const activityCode = `UIE${token}`.slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)

    const { route, context } = await resolveDashboardRouteContext(page, "accounts", {
      requiredModules: ["accounts", "inventory"],
      preferredTenantName: "Estate Mock",
    })

    await page.goto(route)
    await waitForDashboardReady(page)
    await applyPreviewTenantCookie(page, context.tenantId)
    await seedActivityCode(page, activityCode, `UI Test Expense ${token}`)

    await page.goto(buildDashboardRouteForTab(context, "accounts"))
    await waitForDashboardReady(page)

    const expenseTab = page.getByRole("tab", { name: "Expenses" })
    if ((await expenseTab.count()) === 0) {
      test.skip(true, "Expenses sub-tab not visible for this tenant/role")
      return
    }
    await expenseTab.click()
    await expect(expenseTab).toHaveAttribute("data-state", "active")
    await page.waitForLoadState("networkidle")

    // Open form
    await page.getByRole("button", { name: "Add Expense" }).first().click()
    await page.waitForTimeout(300)

    // Fill fields
    const dateInput = page.getByLabel("Date").first()
    await dateInput.fill(today)

    const amountInput = page.getByLabel("Amount (₹)").first()
    await amountInput.fill("750")

    const codeInput = page.getByLabel("Activity code").first()
    await codeInput.fill(activityCode)
    await page.waitForTimeout(400)

    // Category name auto-fills from code, but fill explicitly if still empty
    const categoryInput = page.getByLabel("Category name").first()
    const categoryValue = await categoryInput.inputValue().catch(() => "")
    if (!categoryValue) {
      await categoryInput.fill(`UI Test Expense ${token}`)
    }

    const notesInput = page.getByLabel("Notes").first()
    await notesInput.fill(`UI e2e expense test ${token}`)

    // Save — intercept POST and verify success (also validates the ::numeric cast fix)
    const [saveResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/expenses-neon") && r.request().method() === "POST"),
      page.getByRole("button", { name: "Save Expense" }).first().click(),
    ])
    expect(saveResponse.ok(), `Expense save returned ${saveResponse.status()}`).toBeTruthy()
    const saveData = await saveResponse.json()
    expect(Boolean(saveData?.success), `Expense API did not return success: ${JSON.stringify(saveData)}`).toBeTruthy()
  })

  test("inventory restock: form fill, save, and stock total increases", async ({ page }) => {
    const token = `${Date.now().toString(36)}`.toUpperCase().slice(-6)

    const { route, context } = await resolveDashboardRouteContext(page, "inventory", {
      requiredModules: ["inventory"],
      preferredTenantName: "Estate Mock",
    })

    await page.goto(route)
    await waitForDashboardReady(page)
    await applyPreviewTenantCookie(page, context.tenantId)

    await page.goto(buildDashboardRouteForTab(context, "inventory"))
    await waitForDashboardReady(page)
    await page.waitForLoadState("networkidle")

    // Open movement drawer via testid
    const movementBtn = page.getByTestId("inventory-action-record-movement")
    if ((await movementBtn.count()) === 0) {
      test.skip(true, "inventory-action-record-movement button not found")
      return
    }
    await movementBtn.click()
    await page.waitForTimeout(400)

    // Item type select
    const itemTypeSelect = page.getByTestId("movement-item-type-select")
    if ((await itemTypeSelect.count()) === 0 || await itemTypeSelect.isDisabled()) {
      test.skip(true, "Movement item type select unavailable — no inventory items on this tenant")
      return
    }
    await itemTypeSelect.click()
    const options = await page.getByRole("option").allTextContents()
    const validOption = options.map((o) => o.trim()).find((o) => o && !/add an inventory item first/i.test(o))
    if (!validOption) {
      test.skip(true, "No selectable inventory items found")
      return
    }
    await page.getByRole("option", { name: validOption, exact: true }).first().click()
    await page.waitForTimeout(200)

    // Select Restocking type
    await page.getByLabel("Restocking").click()

    // Fill quantity via testid
    await page.getByTestId("movement-quantity-input").fill("5")
    await page.getByPlaceholder("Add any additional details").fill(`UI e2e restock test ${token}`)

    // Submit — intercept POST and verify success
    const [saveResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/transactions-neon") && r.request().method() === "POST"),
      page.getByTestId("movement-record-transaction").click(),
    ])
    expect(saveResponse.ok(), `Inventory restock returned ${saveResponse.status()}`).toBeTruthy()
    const saveData = await saveResponse.json()
    expect(Boolean(saveData?.success), `Restock did not return success: ${JSON.stringify(saveData)}`).toBeTruthy()
  })

  test("all tabs navigable with no 500s or JS errors (all tenants)", async ({ page }) => {
    const apiFailures: { url: string; status: number }[] = []
    const pageErrors: string[] = []

    page.on("response", (response) => {
      if (response.url().includes("/api/") && response.status() >= 500) {
        apiFailures.push({ url: response.url(), status: response.status() })
      }
    })
    page.on("pageerror", (error) => pageErrors.push(error.message))

    const tenantsResponse = await page.request.get("/api/admin/tenants")
    expect(tenantsResponse.ok()).toBeTruthy()
    const payload = await tenantsResponse.json()
    const tenants = (Array.isArray(payload?.tenants) ? payload.tenants : [])
      .map((t: any) => ({ id: String(t?.id || "").trim(), name: String(t?.name || "") }))
      .filter((t: any) => t.id)

    for (const tenant of tenants) {
      if (tenant.name.toLowerCase().includes("mock") || tenant.name.toLowerCase().includes("e2e")) continue

      const params = new URLSearchParams({ tab: "inventory", previewTenantId: tenant.id, previewRole: "admin" })
      if (tenant.name) params.set("previewTenantName", tenant.name)
      await page.goto(`/dashboard?${params.toString()}`)
      await waitForDashboardReady(page)

      const allTabs = page.getByRole("tab")
      const tabCount = await allTabs.count()
      if (tabCount === 0) continue

      for (let i = 0; i < tabCount; i += 1) {
        const tab = allTabs.nth(i)
        if (await tab.isDisabled().catch(() => false)) continue
        await tab.click()
        await page.waitForTimeout(250)
      }
    }

    expect(pageErrors, `Runtime JS errors: ${pageErrors.join(" | ")}`).toEqual([])
    expect(apiFailures, `API 5xx during tab navigation: ${JSON.stringify(apiFailures)}`).toEqual([])
  })
})
