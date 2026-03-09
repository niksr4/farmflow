import { readFile } from "node:fs/promises"
import { expect, test, type Page } from "@playwright/test"
import { buildDashboardRouteForTab, resolveDashboardRouteContext } from "./dashboard-route"
import { hasRequiredAuthCredentials, waitForDashboardReady } from "./helpers"

type JsonResult = {
  ok: boolean
  status: number
  data: any
  text: string
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

const requestJson = async (
  page: Page,
  method: "GET" | "POST",
  url: string,
  body?: Record<string, unknown>,
): Promise<JsonResult> => {
  const response =
    method === "GET"
      ? await page.request.get(url)
      : await page.request.post(url, {
          data: body,
        })

  const text = await response.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }

  return {
    ok: response.ok(),
    status: response.status(),
    data,
    text,
  }
}

const ensureActivityCode = async (page: Page, code: string, reference: string) => {
  const createResult = await requestJson(page, "POST", "/api/add-activity", { code, reference })
  expect(
    createResult.ok || createResult.status === 400,
    `Failed to create activity code (status ${createResult.status}): ${createResult.text}`,
  ).toBeTruthy()
}

const ensureLocation = async (page: Page, tenantId: string | null, name: string, code: string) => {
  const listUrl = tenantId
    ? `/api/locations?tenantId=${encodeURIComponent(tenantId)}`
    : "/api/locations"
  const listResult = await requestJson(page, "GET", listUrl)
  expect(listResult.ok, `Failed to load locations (status ${listResult.status}): ${listResult.text}`).toBeTruthy()
  const existingLocations = Array.isArray(listResult.data?.locations) ? listResult.data.locations : []
  const existing = existingLocations.find((location: any) => String(location?.code || "").toUpperCase() === code.toUpperCase())
  if (existing?.id) {
    return {
      id: String(existing.id),
      name: String(existing.name || name),
      code,
    }
  }

  const createResult = await requestJson(page, "POST", "/api/locations", {
    name,
    code,
    ...(tenantId ? { tenantId } : {}),
  })

  if (createResult.ok && createResult.data?.location?.id) {
    return {
      id: String(createResult.data.location.id),
      name: String(createResult.data.location.name || name),
      code: String(createResult.data.location.code || code),
    }
  }

  const refreshResult = await requestJson(page, "GET", listUrl)
  expect(refreshResult.ok, `Failed to reload locations (status ${refreshResult.status}): ${refreshResult.text}`).toBeTruthy()
  const refreshedLocations = Array.isArray(refreshResult.data?.locations) ? refreshResult.data.locations : []
  const matched = refreshedLocations.find((location: any) => String(location?.code || "").toUpperCase() === code.toUpperCase())
  expect(
    Boolean(matched?.id),
    `Unable to resolve location ${code}. Create response status ${createResult.status}: ${createResult.text}`,
  ).toBe(true)

  return {
    id: String(matched.id),
    name: String(matched.name || name),
    code,
  }
}

test.describe("day-in-life workflow regression", () => {
  test.skip(!hasRequiredAuthCredentials, "Set E2E credentials to run authenticated workflow checks")

  test("inventory through accounts export flow remains healthy", async ({ page }) => {
    const token = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)
      .toString(36)
      .padStart(2, "0")}`.toUpperCase()
    const today = new Date().toISOString().slice(0, 10)
    const dispatchLot = `DSP-${token}`.slice(0, 20)
    const salesLot = `SAL-${token}`.slice(0, 20)
    const locationCode = `E2E-${token}`.slice(0, 16)
    const activityCode = `A${token}`.slice(0, 10)

    const { route, context } = await resolveDashboardRouteContext(page, "inventory", {
      requiredModules: ["inventory", "transactions", "processing", "dispatch", "sales", "accounts"],
      preferredTenantName: "E2E Workflow Tenant",
    })

    await page.goto(route)
    await waitForDashboardReady(page)
    await applyPreviewTenantCookie(page, context.tenantId)

    const requiredTabs = ["Processing", "Dispatch", "Sales", "Accounts"] as const
    for (const tabName of requiredTabs) {
      const tab = page.getByRole("tab", { name: tabName })
      if ((await tab.count()) === 0) {
        test.skip(true, `${tabName} tab is not visible for the authenticated role or tenant modules`)
      }
    }

    const location = await ensureLocation(
      page,
      context.tenantId,
      `E2E Workflow ${token}`,
      locationCode,
    )

    const dispatchSeed = await requestJson(page, "POST", "/api/dispatch", {
      dispatch_date: today,
      locationId: location.id,
      estate: location.name,
      lot_id: dispatchLot,
      coffee_type: "Arabica",
      bag_type: "Dry Cherry",
      bags_dispatched: 4,
      kgs_received: 220,
      notes: `Workflow dispatch ${token}`,
    })
    expect(dispatchSeed.ok, `Failed to seed dispatch record (status ${dispatchSeed.status}): ${dispatchSeed.text}`).toBeTruthy()
    expect(Boolean(dispatchSeed.data?.success), `Dispatch API did not return success: ${dispatchSeed.text}`).toBeTruthy()

    const salesSeed = await requestJson(page, "POST", "/api/sales", {
      sale_date: today,
      batch_no: `B-${token}`.slice(0, 20),
      lot_id: salesLot,
      locationId: location.id,
      estate: location.name,
      coffee_type: "Arabica",
      bag_type: "Dry Cherry",
      buyer_name: `E2E Buyer ${token}`,
      bags_sold: 2,
      price_per_bag: 9200,
      bank_account: "E2E Bank",
      notes: `Workflow sale ${token}`,
    })
    expect(salesSeed.ok, `Failed to seed sales record (status ${salesSeed.status}): ${salesSeed.text}`).toBeTruthy()
    expect(Boolean(salesSeed.data?.success), `Sales API did not return success: ${salesSeed.text}`).toBeTruthy()

    await ensureActivityCode(page, activityCode, `Workflow account ${token}`)

    const laborSeed = await requestJson(page, "POST", "/api/labor-neon", {
      date: today,
      code: activityCode,
      locationId: location.id,
      notes: `Workflow labor ${token}`,
      laborEntries: [
        {
          name: "Estate Labor",
          laborCount: 3,
          costPerLabor: 500,
        },
      ],
    })
    expect(laborSeed.ok, `Failed to seed labor record (status ${laborSeed.status}): ${laborSeed.text}`).toBeTruthy()
    expect(Boolean(laborSeed.data?.success), `Labor API did not return success: ${laborSeed.text}`).toBeTruthy()

    const expenseSeed = await requestJson(page, "POST", "/api/expenses-neon", {
      date: today,
      code: activityCode,
      locationId: location.id,
      amount: 1500,
      notes: `Workflow expense ${token}`,
    })
    expect(expenseSeed.ok, `Failed to seed expense record (status ${expenseSeed.status}): ${expenseSeed.text}`).toBeTruthy()
    expect(Boolean(expenseSeed.data?.success), `Expense API did not return success: ${expenseSeed.text}`).toBeTruthy()

    await page.goto(route)
    await waitForDashboardReady(page)
    await expect(page.getByText("Quick shortcuts for inventory work.", { exact: true })).toBeVisible()

    await page.goto(buildDashboardRouteForTab(context, "processing"))
    await waitForDashboardReady(page)
    await expect(page.getByRole("heading", { name: "Processing Records" })).toBeVisible()

    await page.goto(buildDashboardRouteForTab(context, "dispatch"))
    await waitForDashboardReady(page)
    await expect(page.getByRole("heading", { name: "Dispatch Records" })).toBeVisible()
    await expect(page.getByText(dispatchLot).first()).toBeVisible()

    await page.goto(buildDashboardRouteForTab(context, "sales"))
    await waitForDashboardReady(page)
    await expect(page.getByRole("heading", { name: "Sales Records" })).toBeVisible()
    await expect(page.getByText(`E2E Buyer ${token}`).first()).toBeVisible()

    await page.goto(buildDashboardRouteForTab(context, "accounts"))
    await waitForDashboardReady(page)
    const accountsExportHeading = page.getByRole("heading", { name: "Combined Accounts Export" })
    if ((await accountsExportHeading.count()) === 0) {
      test.skip(true, "Accounts export UI is not visible for this role or tenant configuration")
    }
    await expect(accountsExportHeading).toBeVisible()

    const [qifDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export QIF" }).first().click(),
    ])
    expect(qifDownload.suggestedFilename()).toBe("accounts_export_all_entries.qif")
    const qifPath = await qifDownload.path()
    expect(qifPath, "QIF download path is unavailable").toBeTruthy()
    const qifContent = await readFile(String(qifPath), "utf8")
    expect(qifContent).toContain("!Type:Bank")
    expect(qifContent).toContain(`L${activityCode}`)
  })
})
