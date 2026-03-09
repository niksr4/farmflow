import { readFile } from "node:fs/promises"
import { expect, test, type Page } from "@playwright/test"
import { resolveDashboardRouteContext } from "./dashboard-route"
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

const requestJson = async (page: Page, method: "GET" | "POST", url: string, body?: Record<string, unknown>): Promise<JsonResult> => {
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

test.describe("accounts export e2e", () => {
  test.skip(!hasRequiredAuthCredentials, "Set E2E credentials to run authenticated accounts export checks")

  test("accounts CSV and QIF exports download correct filenames and formats", async ({ page }) => {
    const token = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)
      .toString(36)
      .padStart(2, "0")}`.toUpperCase()
    const activityCode = `E${token}`.slice(0, 10)
    const now = new Date().toISOString().slice(0, 10)

    const { route, context } = await resolveDashboardRouteContext(page, "accounts", {
      requiredModules: ["accounts"],
      preferredTenantName: "E2E Accounts Export Tenant",
    })

    await page.goto(route)
    await waitForDashboardReady(page)
    await applyPreviewTenantCookie(page, context.tenantId)

    const ensureActivity = await requestJson(page, "POST", "/api/add-activity", {
      code: activityCode,
      reference: `E2E export code ${token}`,
    })
    expect(
      ensureActivity.ok || ensureActivity.status === 400,
      `Failed to create activity code (status ${ensureActivity.status}): ${ensureActivity.text}`,
    ).toBeTruthy()

    const laborResult = await requestJson(page, "POST", "/api/labor-neon", {
      date: now,
      code: activityCode,
      laborEntries: [
        {
          name: "Estate Labor",
          laborCount: 2,
          costPerLabor: 550,
        },
      ],
      notes: `E2E labor ${token}`,
    })
    expect(laborResult.ok, `Failed to seed labor entry (status ${laborResult.status}): ${laborResult.text}`).toBeTruthy()
    expect(Boolean(laborResult.data?.success), `Labor seed API did not return success: ${laborResult.text}`).toBeTruthy()

    const expenseResult = await requestJson(page, "POST", "/api/expenses-neon", {
      date: now,
      code: activityCode,
      amount: 1250,
      notes: `E2E expense ${token}`,
    })
    expect(
      expenseResult.ok,
      `Failed to seed expense entry (status ${expenseResult.status}): ${expenseResult.text}`,
    ).toBeTruthy()
    expect(Boolean(expenseResult.data?.success), `Expense seed API did not return success: ${expenseResult.text}`).toBeTruthy()

    await page.goto(route)
    await waitForDashboardReady(page)

    const accountsExportHeading = page.getByRole("heading", { name: "Combined Accounts Export" })
    if ((await accountsExportHeading.count()) === 0) {
      const accountsTab = page.getByRole("tab", { name: "Accounts" })
      if ((await accountsTab.count()) > 0) {
        await accountsTab.first().click()
      }
    }
    if ((await accountsExportHeading.count()) === 0) {
      test.skip(true, "Accounts export UI is not visible for this role or tenant configuration")
    }
    await expect(accountsExportHeading).toBeVisible()

    const csvButton = page.getByRole("button", { name: "Export CSV" }).first()
    await expect(csvButton).toBeEnabled()
    const [csvDownload] = await Promise.all([page.waitForEvent("download"), csvButton.click()])
    expect(csvDownload.suggestedFilename()).toBe("accounts_summary_all_entries.csv")
    const csvPath = await csvDownload.path()
    expect(csvPath, "CSV download path is unavailable").toBeTruthy()
    const csvContent = await readFile(String(csvPath), "utf8")
    expect(csvContent).toContain("Entry Type")
    expect(csvContent).toContain(activityCode)

    const qifButton = page.getByRole("button", { name: "Export QIF" }).first()
    await expect(qifButton).toBeEnabled()
    const [qifDownload] = await Promise.all([page.waitForEvent("download"), qifButton.click()])
    expect(qifDownload.suggestedFilename()).toBe("accounts_export_all_entries.qif")
    const qifPath = await qifDownload.path()
    expect(qifPath, "QIF download path is unavailable").toBeTruthy()
    const qifContent = await readFile(String(qifPath), "utf8")
    expect(qifContent).toContain("!Type:Bank")
    expect(qifContent).toContain(`L${activityCode}`)
    expect(qifContent).toContain("^")
  })

  test("inventory export hub surfaces accounts CSV and QIF shortcuts", async ({ page }) => {
    const { route } = await resolveDashboardRouteContext(page, "inventory", {
      requiredModules: ["inventory", "accounts"],
      preferredTenantName: "E2E Accounts Export Tenant",
    })

    await page.goto(route)
    await waitForDashboardReady(page)

    const csvShortcut = page.getByRole("button", { name: "Accounts CSV" })
    if ((await csvShortcut.count()) === 0) {
      const toggleButton = page.getByRole("button", { name: "Exports / Import" }).first()
      if ((await toggleButton.count()) > 0) {
        await toggleButton.click()
      }
    }

    if ((await csvShortcut.count()) === 0) {
      test.skip(true, "Accounts export shortcuts are not visible for this role or tenant configuration")
    }

    await expect(csvShortcut).toBeVisible()
    await expect(page.getByRole("button", { name: "Accounts QIF" })).toBeVisible()
  })
})
