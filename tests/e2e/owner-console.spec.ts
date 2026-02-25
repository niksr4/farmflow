import { expect, test } from "@playwright/test"
import { expectOwnerUser, hasAuthCredentials } from "./helpers"

test.describe("owner console regression", () => {
  test.skip(!hasAuthCredentials, "Set E2E_USERNAME and E2E_PASSWORD to run authenticated owner-console tests")
  test.skip(!expectOwnerUser, "Set E2E_EXPECT_OWNER=1 to run owner-only admin tests")

  test("system health section renders triage status and check cards", async ({ page }) => {
    let healthCallCount = 0
    await page.route("**/api/admin/system-health", async (route) => {
      healthCallCount += 1
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          generatedAt: "2026-02-25T09:30:00.000Z",
          checks: [
            {
              id: "data-integrity-agent",
              label: "Data integrity agent",
              status: "critical",
              value: "Last run failed",
              detail: "Failed at 2026-02-25T09:10:00.000Z",
              actionPath: "/api/admin/data-integrity-exceptions",
            },
            {
              id: "import-jobs",
              label: "Import pipeline",
              status: "warning",
              value: "2 failed / 24h",
              detail: "1 validated imports waiting for commit.",
            },
            {
              id: "app-errors",
              label: "App errors",
              status: "healthy",
              value: "0 error events / 24h",
              detail: "No critical events reported.",
            },
          ],
        }),
      })
    })

    await page.goto("/admin/tenants")
    await expect(page.getByText("Owner Console")).toBeVisible()
    await expect(page.locator("#system-health").getByText("System Health")).toBeVisible()
    await expect(page.getByText("Critical 1")).toBeVisible()
    await expect(page.getByText("Warning 1")).toBeVisible()
    await expect(page.getByText("Healthy 1")).toBeVisible()
    await expect(page.getByTestId("system-health-check-data-integrity-agent")).toBeVisible()

    await page.locator("#system-health").getByRole("button", { name: "Refresh" }).click()
    await expect.poll(() => healthCallCount).toBeGreaterThan(1)

    const detailsLink = page.getByTestId("system-health-check-data-integrity-agent").getByRole("link", { name: "Open details" })
    await expect(detailsLink).toHaveAttribute("href", "/api/admin/data-integrity-exceptions")
  })
})
