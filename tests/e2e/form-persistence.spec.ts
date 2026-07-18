import { devices, expect, test } from "@playwright/test"
import { getDashboardRouteContext, hasRequiredAuthCredentials, waitForDashboardReady } from "./helpers"

/**
 * Guards the class of regression that lost the labour code + category when the user scrolled
 * to the quantity field: an entry-form input whose value is committed only on an explicit tap,
 * so blurring (which scrolling does on a phone) discards it. Runs on a phone viewport because
 * that mobile-only code selector was where the bug lived. Part of `pnpm test:e2e:auth`.
 *
 * The navigation into the labour form is defensive: if the accounts/labour UI differs from what
 * this test expects it skips (with a reason) rather than false-failing — but once the code field
 * is filled, the persistence assertion is hard.
 */
const iPhone13 = devices["iPhone 13"]
test.use({
  viewport: iPhone13.viewport,
  userAgent: iPhone13.userAgent,
  isMobile: iPhone13.isMobile,
  hasTouch: iPhone13.hasTouch,
})

test.describe("labour form field persistence (mobile)", () => {
  test.skip(!hasRequiredAuthCredentials, "Set E2E owner credentials to run authenticated form-persistence tests")

  test("activity code survives a blur (scroll away) after being typed", async ({ page }) => {
    const { route } = await getDashboardRouteContext(page, "accounts")
    await page.goto(route)
    await waitForDashboardReady(page)

    // Reach the Daily Labour sub-view.
    const labourNav = page.getByRole("button", { name: /daily labour|labour/i }).first()
    if (await labourNav.count()) {
      await labourNav.click().catch(() => {})
    }

    // Open the entry form.
    const openForm = page.getByRole("button", { name: /log labour entry|add labour entry/i }).first()
    if (!(await openForm.count())) {
      test.skip(true, "Could not locate the labour entry form open button on this build")
      return
    }
    await openForm.click()

    const codeInput = page.locator("#code")
    await expect(codeInput).toBeVisible({ timeout: 10_000 })

    // Read the first available activity code from the API so we type a real one.
    const activityResponse = await page.request.get("/api/get-activity")
    const activityPayload = await activityResponse.json().catch(() => ({}))
    const firstActivity = (Array.isArray(activityPayload?.activities) ? activityPayload.activities : [])
      .map((a: any) => ({ code: String(a?.code || "").trim(), reference: String(a?.reference || "").trim() }))
      .find((a: { code: string }) => Boolean(a.code))
    if (!firstActivity) {
      test.skip(true, "Tenant has no activity codes to exercise the labour form")
      return
    }

    // Type the code, then blur by focusing another field — the phone-scroll equivalent.
    await codeInput.click()
    await codeInput.fill(firstActivity.code)
    await page.locator("#date").click().catch(() => {})
    // Allow the debounced blur-commit (150ms) to run.
    await page.waitForTimeout(400)

    // The regression: after blur the field went blank because the code was never committed.
    const displayed = await codeInput.inputValue()
    expect(
      displayed.trim(),
      "Activity code was lost after blur — the entry did not persist",
    ).not.toBe("")
    expect(displayed.toLowerCase()).toContain(firstActivity.code.toLowerCase())
  })
})
