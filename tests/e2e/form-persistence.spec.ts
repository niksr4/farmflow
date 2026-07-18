import { devices, expect, test } from "@playwright/test"
import { getDashboardRouteContext, hasRequiredAuthCredentials, waitForDashboardReady } from "./helpers"

/**
 * Guards the regression that lost the labour code + category when the user scrolled to the
 * quantity field: on a phone the activity-code box is a search input whose value was committed
 * to the form only when a dropdown row was tapped, so blurring (which scrolling does) discarded
 * anything typed. Runs on a phone viewport because that mobile-only selector is where the bug
 * lived. Part of `pnpm test:e2e:auth`.
 *
 * The form prefills from the last entry, so the test types a code that is DIFFERENT from the
 * prefill and asserts THAT code survives a blur — otherwise a buggy build would "pass" simply
 * by showing the prefilled code.
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

  test("a typed activity code survives a blur (scroll away)", async ({ page }) => {
    const { route } = await getDashboardRouteContext(page, "accounts")
    await page.goto(route)
    await waitForDashboardReady(page)

    const activityPayload = await (await page.request.get("/api/get-activity")).json().catch(() => ({}))
    const codes: string[] = (Array.isArray(activityPayload?.activities) ? activityPayload.activities : [])
      .map((a: any) => String(a?.code || "").trim())
      .filter(Boolean)
    test.skip(codes.length < 2, "Tenant needs at least two activity codes to exercise the labour form")
    if (codes.length < 2) return

    // accounts → Labour sub-view (last "Labour" button; the first is the bottom nav) → open form.
    await page.getByRole("button", { name: "Labour", exact: true }).last().click()
    await page.getByRole("button", { name: /log with more detail/i }).first().click()

    const codeInput = page.locator("#code")
    await expect(codeInput).toBeVisible({ timeout: 10_000 })
    // The buggy selector is the MOBILE one, which only renders once activity codes have loaded.
    // Until then the component shows the desktop datalist (which commits directly and has no
    // bug), so wait for the mobile search box or we'd test the wrong code path.
    await expect(codeInput).toHaveAttribute("placeholder", /search activity/i, { timeout: 10_000 })

    // The form may be prefilled from the last entry; pick a target code that is NOT what is
    // already shown, so "did MY code persist?" can't be masked by the prefill.
    const prefilled = (await codeInput.inputValue()).toLowerCase()
    const targetCode = codes.find((c) => !prefilled.includes(c.toLowerCase())) ?? codes[0]

    // Type the target code, then blur by focusing the date field — the phone-scroll equivalent.
    await codeInput.click()
    await codeInput.fill(targetCode)
    await page.locator("#date").click()
    await page.waitForTimeout(400) // let the debounced blur-commit (150ms) run

    // Regression: a buggy build shows the prefilled code (or blank) here, never the typed one.
    const displayed = (await codeInput.inputValue()).toLowerCase()
    expect(
      displayed,
      `The typed activity code "${targetCode}" was lost after blur — the labour entry did not persist`,
    ).toContain(targetCode.toLowerCase())
  })
})
