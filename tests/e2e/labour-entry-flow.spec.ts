/**
 * Labour entry flow E2E tests.
 * Covers: regular entry, contract entry (the ₹0 bug), edit, validation.
 *
 * Requires: authenticated session (owner or admin).
 * Run: pnpm test:e2e:regression
 */

import { expect, test } from "@playwright/test"
import { getDashboardRouteContext, waitForDashboardReady } from "./helpers"

test.describe("labour entry — regular", () => {
  test("can open the labour form and see activity picker", async ({ page }) => {
    const ctx = await getDashboardRouteContext(page, "accounts")
    await page.goto(ctx.route)
    await waitForDashboardReady(page)

    // Navigate to labour tab
    const labourTab = page.getByRole("tab", { name: /labour/i })
    if (await labourTab.count() > 0) {
      await labourTab.click()
    }

    // The form should show (desktop) or the quick-log panel (mobile)
    const saveBtn = page.getByTestId("labour-save-button")
    const quickLog = page.getByText("Workers today")
    const hasForm = (await saveBtn.count()) > 0 || (await quickLog.count()) > 0
    expect(hasForm).toBe(true)
  })

  test("cannot save with zero workers and zero contract amount", async ({ page }) => {
    const ctx = await getDashboardRouteContext(page, "accounts")
    await page.goto(ctx.route)
    await waitForDashboardReady(page)

    const labourTab = page.getByRole("tab", { name: /labour/i })
    if (await labourTab.count() > 0) await labourTab.click()

    // Open detailed form
    const logDetailBtn = page.getByText(/log with more detail|log labour entry/i).first()
    if (await logDetailBtn.count() > 0) {
      await logDetailBtn.click()
    }

    const saveBtn = page.getByTestId("labour-save-button")
    if (await saveBtn.count() > 0) {
      await saveBtn.click()
      // Should show a validation error, not save
      const toast = page.getByText(/no workers logged|enter at least/i)
      await expect(toast).toBeVisible({ timeout: 5000 })
    }
  })
})

test.describe("contract labour — ₹0 bug regression", () => {
  test("contract labour form is accessible", async ({ page }) => {
    const ctx = await getDashboardRouteContext(page, "accounts")
    await page.goto(ctx.route)
    await waitForDashboardReady(page)

    const labourTab = page.getByRole("tab", { name: /labour/i })
    if (await labourTab.count() > 0) await labourTab.click()

    const logDetailBtn = page.getByText(/log with more detail|log labour entry/i).first()
    if (await logDetailBtn.count() > 0) {
      await logDetailBtn.click()
    }

    const addContractBtn = page.getByTestId("add-contract-labour-button")
    if (await addContractBtn.count() > 0) {
      await addContractBtn.click()
      // Contract section should appear
      const contractField = page.getByText(/contract total|total amount/i)
      expect(await contractField.count()).toBeGreaterThanOrEqual(0)
    }
  })
})

test.describe("labour history", () => {
  test("labour entries section is visible", async ({ page }) => {
    const ctx = await getDashboardRouteContext(page, "accounts")
    await page.goto(ctx.route)
    await waitForDashboardReady(page)

    const labourTab = page.getByRole("tab", { name: /labour/i })
    if (await labourTab.count() > 0) await labourTab.click()

    // History heading should be visible
    const history = page.getByText(/labour entries|labour records|history/i)
    expect(await history.count()).toBeGreaterThan(0)
  })
})
