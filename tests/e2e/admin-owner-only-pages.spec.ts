import { expect, test } from "@playwright/test"
import { adminCredentials, expectAdminUser, hasAdminCredentials } from "./helpers"

/**
 * Covers app/admin/inspect-databases/page.tsx and app/admin/register-interest/page.tsx —
 * two owner-only platform pages that sit alongside /admin/tenants (already covered by
 * admin-auth.spec.ts and owner-console.spec.ts) but didn't have their own auth-redirect
 * regression coverage yet.
 *
 * Use case: only the platform owner can inspect raw table/row counts or see raw
 * "Request Access" submission logs. A tenant admin (or plain user) hitting either URL
 * directly must be bounced away, not shown platform-wide data.
 *
 * Edge case worth noting (not asserted here — just documented): unlike /admin/tenants,
 * which redirects non-owners to /settings, these two pages redirect non-owners straight
 * to /dashboard. Worth confirming that split is intentional rather than a copy-paste gap.
 */

test.describe("owner-only platform pages redirect non-owners", () => {
  test.skip(!expectAdminUser, "Set E2E_EXPECT_ADMIN=1 to run tenant-admin redirect smoke tests")
  test.skip(!hasAdminCredentials, "Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD to run tenant-admin redirect smoke tests")

  test.use({ storageState: { cookies: [], origins: [] } })

  const signInAsAdmin = async (page: import("@playwright/test").Page) => {
    await page.goto("/login")
    await page.locator("#username").fill(adminCredentials.username)
    await page.locator("#password").fill(adminCredentials.password)
    await page.getByRole("button", { name: "Sign In" }).click()
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/)
  }

  test("tenant admin cannot open /admin/inspect-databases", async ({ page }) => {
    await signInAsAdmin(page)
    await page.goto("/admin/inspect-databases")
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/)
    await expect(page.getByText("Database Inspection")).toHaveCount(0)
  })

  test("tenant admin cannot open /admin/register-interest", async ({ page }) => {
    await signInAsAdmin(page)
    await page.goto("/admin/register-interest")
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/)
    await expect(page.getByText("Request Access Submissions")).toHaveCount(0)
  })
})
