import { test, expect } from "@playwright/test"

/**
 * Covers /settings and /settings/import (app/settings/page.tsx, app/settings/import/page.tsx):
 * server components that call `await requireSessionUser()` and redirect non-admin
 * "user" role sessions to /dashboard.
 *
 * Use case: an admin/owner opens Tenant Settings or the CSV import tool; a plain
 * "user" role is bounced to /dashboard; an unauthenticated visitor should be sent
 * to sign in.
 *
 * Known bug (see .farmflow-scanner/findings_log.md): requireSessionUser() (lib/auth-server.ts)
 * throws a plain Error("Unauthorized") when there is no session, and neither page wraps
 * the call in a try/catch — there's also no app/error.tsx in the repo. So today, an
 * unauthenticated visit to either route surfaces Next.js's generic unhandled server-error
 * page (an HTTP 500-class response) instead of redirecting to /login the way the
 * client-side /dashboard route does. These two tests encode the *intended* behavior and
 * are expected to fail until that's fixed.
 */

test.describe("settings route protection", () => {
  test("redirects unauthenticated visitors away from /settings instead of crashing", async ({ page }) => {
    const response = await page.goto("/settings")
    expect(response?.status() ?? 200).toBeLessThan(500)
    await expect(page).not.toHaveURL(/\/settings$/, { timeout: 10_000 })
  })

  test("redirects unauthenticated visitors away from /settings/import instead of crashing", async ({ page }) => {
    const response = await page.goto("/settings/import")
    expect(response?.status() ?? 200).toBeLessThan(500)
    await expect(page).not.toHaveURL(/\/settings\/import$/, { timeout: 10_000 })
  })
})
