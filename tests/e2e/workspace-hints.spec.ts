import { expect, test, type Route } from "@playwright/test"

type JsonPayload = Record<string, unknown>

const fulfillJson = async (route: Route, body: JsonPayload, status = 200) => {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  })
}

test.describe("workspace hints browser flow", () => {
  test("dashboard guidance buttons and dismissal work end to end", async ({ page }) => {
    const sessionPayload = {
      user: {
        name: "Guidance QA",
        role: "user",
        tenantId: "tenant-guidance-qa",
        sessionMode: "web",
        preferredLocale: "en",
        setupCompleted: true,
        requiresGuidedSetup: false,
      },
      expires: "2099-01-01T00:00:00.000Z",
    }

    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url())
      const { pathname } = url

      if (pathname === "/api/auth/session") {
        await fulfillJson(route, sessionPayload)
        return
      }

      if (pathname === "/api/dashboard/bootstrap") {
        await fulfillJson(route, {
          success: true,
          modules: ["accounts"],
          locations: [],
          planId: "basic",
        })
        return
      }

      if (pathname === "/api/accounts-totals") {
        await fulfillJson(route, {
          success: true,
          laborTotal: 500,
          otherTotal: 250,
          grandTotal: 750,
        })
        return
      }

      if (pathname === "/api/inventory-neon") {
        await fulfillJson(route, {
          success: true,
          items: [],
          summary: { total_items: 0, total_quantity: 0 },
        })
        return
      }

      if (pathname === "/api/labor-neon") {
        await fulfillJson(route, {
          success: true,
          deployments: [
            {
              id: "labor-1",
              code: "AC-1",
              reference: "Accounts",
              laborEntries: [{ name: "Estate Labor", laborCount: 1, costPerLabor: 500 }],
              totalCost: 500,
              date: "2026-04-07",
              notes: "Guidance QA",
              user: "Guidance QA",
            },
          ],
          totalCount: 1,
          totalCost: 500,
        })
        return
      }

      if (pathname === "/api/expenses-neon") {
        await fulfillJson(route, {
          success: true,
          deployments: [
            {
              id: 1,
              date: "2026-04-07",
              code: "AC-1",
              reference: "Accounts",
              amount: 250,
              notes: "Guidance QA",
              user: "Guidance QA",
              inventoryItems: [],
            },
          ],
          totalCount: 1,
          totalAmount: 250,
        })
        return
      }

      if (pathname === "/api/get-activity") {
        await fulfillJson(route, {
          success: true,
          activities: [
            {
              code: "AC-1",
              reference: "Accounts",
              labor_count: 1,
              expense_count: 1,
            },
          ],
          suggestions: [],
        })
        return
      }

      if (pathname === "/api/recent-activity") {
        await fulfillJson(route, {
          success: true,
          entries: [],
        })
        return
      }

      if (pathname === "/api/dashboard/hints") {
        await fulfillJson(route, {
          success: true,
          hints: [
            {
              id: "no-account-codes",
              type: "warning",
              title: "Account codes are missing",
              body: "Labour and expense entry needs account codes. Open Accounts → Codes and add the few codes your team actually uses every week.",
              action: { label: "Go to Codes", tab: "accounts", panel: "activities" },
              dismissible: false,
            },
            {
              id: "no-locations",
              type: "setup",
              title: "Add locations to keep records traceable",
              body: "Locations keep pulping, dispatch, and sales records tied to the right estate block or mill. Add your main sections in Settings → Locations.",
              action: { label: "Go to Locations", href: "/settings#locations" },
              dismissible: false,
            },
            {
              id: "welcome-get-started",
              type: "tip",
              title: "Start with one live entry",
              body: "Open Accounts and log today's labour or an expense.",
              action: { label: "Open Accounts", tab: "accounts", panel: "labor" },
            },
          ],
        })
        return
      }

      if (pathname === "/settings") {
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<!doctype html><html><head><title>Settings</title></head><body><main>Settings stub</main></body></html>",
        })
        return
      }

      await route.continue()
    })

    await page.goto("/dashboard?tab=home")

    const hintsSection = page.getByRole("heading", { name: "Next steps for this workspace" })
    await expect(hintsSection).toBeVisible()
    await expect(page.getByRole("button", { name: "Go to Codes" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Go to Locations" })).toBeVisible()
    await expect(page.getByText("Start with one live entry")).toBeVisible()

    await page.getByLabel("Dismiss").click()
    await expect(page.getByText("Start with one live entry")).toHaveCount(0)

    await page.getByRole("button", { name: "Go to Codes" }).click()
    await expect(page).toHaveURL(/tab=accounts/)
    await expect(page.getByText("Keep cost coding simple")).toBeVisible()

    await page.goto("/dashboard?tab=home")
    await expect(page.getByText("Start with one live entry")).toHaveCount(0)

    await page.getByRole("button", { name: "Go to Locations" }).click()
    await expect(page).toHaveURL(/\/settings#locations/)
  })
})
