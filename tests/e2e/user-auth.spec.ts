import { expect, test, type Page } from "@playwright/test"
import { expectOwnerUser, hasOwnerCredentials, waitForDashboardReady } from "./helpers"

const USER_TENANT_NAME_PREFIX = "E2E User Role Tenant"
const USER_ENABLED_MODULES = new Set(["inventory", "transactions", "processing", "dispatch"])

const toAppUrl = (baseURL: string | undefined, pathname: string) => new URL(pathname, baseURL || "http://127.0.0.1:3000").toString()

const createTenant = async (page: Page, tenantName: string) => {
  const createResponse = await page.request.post("/api/admin/tenants", {
    data: { name: tenantName },
  })
  expect(createResponse.ok()).toBeTruthy()
  const createPayload = await createResponse.json().catch(() => ({}))
  return String(createPayload?.tenant?.id || "")
}

const ensureTenantModules = async (page: Page, tenantId: string) => {
  const modulesResponse = await page.request.get(`/api/admin/tenant-modules?tenantId=${encodeURIComponent(tenantId)}`)
  expect(modulesResponse.ok()).toBeTruthy()
  const modulesPayload = await modulesResponse.json().catch(() => ({}))
  const modules = Array.isArray(modulesPayload?.modules) ? modulesPayload.modules : []

  const updateResponse = await page.request.put("/api/admin/tenant-modules", {
    data: {
      tenantId,
      modules: modules.map((module: any) => ({
        id: String(module?.id || ""),
        enabled: USER_ENABLED_MODULES.has(String(module?.id || "")) ? true : Boolean(module?.enabled),
      })),
    },
  })
  expect(updateResponse.ok()).toBeTruthy()
}

const createTenantUser = async (
  page: Page,
  tenantId: string,
  username: string,
  password: string,
) => {
  const createResponse = await page.request.post("/api/admin/users", {
    data: {
      tenantId,
      username,
      password,
      role: "user",
    },
  })
  expect(createResponse.ok()).toBeTruthy()
  const createPayload = await createResponse.json().catch(() => ({}))
  const userId = String(createPayload?.user?.id || "")
  expect(userId).toBeTruthy()

  const modulesResponse = await page.request.get(`/api/admin/user-modules?userId=${encodeURIComponent(userId)}`)
  expect(modulesResponse.ok()).toBeTruthy()
  const modulesPayload = await modulesResponse.json().catch(() => ({}))
  const modules = Array.isArray(modulesPayload?.modules) ? modulesPayload.modules : []

  const updateResponse = await page.request.put("/api/admin/user-modules", {
    data: {
      userId,
      modules: modules.map((module: any) => ({
        id: String(module?.id || ""),
        enabled: USER_ENABLED_MODULES.has(String(module?.id || "")),
      })),
    },
  })
  expect(updateResponse.ok()).toBeTruthy()

  return userId
}

test.describe("tenant user auth regression", () => {
  test.skip(!expectOwnerUser, "Set E2E_EXPECT_OWNER=1 to provision tenant-user auth smoke coverage")
  test.skip(!hasOwnerCredentials, "Set E2E_OWNER_USERNAME and E2E_OWNER_PASSWORD to run tenant-user auth smoke test")

  test("tenant user signs in to inventory workspace without inaccessible tab errors", async ({ page, browser, baseURL }) => {
    const uniqueSuffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000)
      .toString(36)
      .padStart(2, "0")}`.toLowerCase()
    const tenantName = `${USER_TENANT_NAME_PREFIX} ${uniqueSuffix}`
    const username = `e2e_user_${uniqueSuffix}`
    const password = `UserPass!${uniqueSuffix}`

    let tenantId = ""
    let userId = ""
    let userContext: Awaited<ReturnType<typeof browser.newContext>> | null = null
    const pageErrors: string[] = []
    const apiFailures: string[] = []
    let salesRouteHits = 0

    try {
      tenantId = await createTenant(page, tenantName)
      expect(tenantId).toBeTruthy()
      await ensureTenantModules(page, tenantId)
      userId = await createTenantUser(page, tenantId, username, password)

      userContext = await browser.newContext()
      const userPage = await userContext.newPage()

      userPage.on("pageerror", (error) => {
        pageErrors.push(error.message)
      })
      await userPage.route("**/api/sales**", async (route) => {
        salesRouteHits += 1
        await route.continue()
      })
      userPage.on("response", (response) => {
        if (response.url().includes("/api/") && response.status() >= 500) {
          apiFailures.push(`${response.status()} ${response.url()}`)
        }
      })

      await userPage.goto(toAppUrl(baseURL, "/login"))
      await userPage.locator("#username").fill(username)
      await userPage.locator("#password").fill(password)
      await userPage.getByRole("button", { name: "Sign In" }).click()

      await waitForDashboardReady(userPage)
      await userPage.goto(toAppUrl(baseURL, "/dashboard?tab=inventory"))
      await waitForDashboardReady(userPage)
      await expect(userPage.getByRole("tab", { name: "Inventory" })).toBeVisible()
      await userPage.getByRole("tab", { name: "Inventory" }).click()
      await expect(userPage.getByText("Current Inventory Levels")).toBeVisible()
      await expect(userPage.getByText("Estate Launch Checklist")).toBeVisible()
      await expect
        .poll(() => salesRouteHits, {
          timeout: 3000,
          message: "Inventory workspace should not call sales endpoints for tenant users",
        })
        .toBe(0)

      await expect(userPage.getByText("Some checklist data could not be loaded. Refresh to try again.")).toHaveCount(0)
      await expect(userPage.getByRole("tab", { name: "Sales" })).toHaveCount(0)
      await expect(userPage.getByRole("tab", { name: "Balance Sheet" })).toHaveCount(0)
      expect(pageErrors, `Runtime errors for tenant user flow: ${pageErrors.join(" | ")}`).toEqual([])
      expect(apiFailures, `API 5xx for tenant user flow: ${apiFailures.join(" | ")}`).toEqual([])

      await userPage.goto(toAppUrl(baseURL, "/admin/tenants"))
      await expect(userPage).toHaveURL(/\/(?:dashboard|settings)(?:\?|$)/)
      await expect(userPage).not.toHaveURL(/\/admin\/tenants(?:\?|$)/)
    } finally {
      await userContext?.close()
      if (userId) {
        const deleteUserResponse = await page.request.delete(`/api/admin/users?userId=${encodeURIComponent(userId)}`)
        expect(deleteUserResponse.ok()).toBeTruthy()
      }
      if (tenantId) {
        const deleteResponse = await page.request.delete(`/api/admin/tenants?tenantId=${encodeURIComponent(tenantId)}`)
        expect(deleteResponse.ok()).toBeTruthy()
      }
    }
  })
})
