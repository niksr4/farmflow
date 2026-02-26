import { expect, test } from "@playwright/test"
import { adminCredentials, expectAdminUser, hasAdminCredentials } from "./helpers"

test.describe("tenant admin auth regression", () => {
  test.skip(!expectAdminUser, "Set E2E_EXPECT_ADMIN=1 to run tenant-admin auth smoke test")
  test.skip(!hasAdminCredentials, "Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD to run tenant-admin auth smoke test")

  test.use({ storageState: { cookies: [], origins: [] } })

  test("tenant admin signs in to dashboard and cannot open owner console", async ({ page }) => {
    await page.goto("/login")
    await page.locator("#username").fill(adminCredentials.username)
    await page.locator("#password").fill(adminCredentials.password)
    await page.getByRole("button", { name: "Sign In" }).click()

    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/)
    await expect(page.getByRole("button", { name: /Operations|Finance|Insights/ }).first()).toBeVisible()

    await page.goto("/admin/tenants")
    await expect(page).toHaveURL(/\/settings(?:\?|$)/)
    await expect(page.getByText("Platform Owner Tools")).toHaveCount(0)
  })
})
