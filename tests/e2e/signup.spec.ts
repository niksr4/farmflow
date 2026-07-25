import { test, expect } from "@playwright/test"

/**
 * Covers /signup (app/signup/page.tsx): a public, unauthenticated "Request Access"
 * form. Use case: a prospective estate owner submits their name/email/estate name
 * to request a tenant be provisioned for them.
 *
 * Note: the form only flips local state to a "submitted" thank-you view on submit —
 * it does not currently POST anywhere (no backend call). These tests cover the
 * client-side behavior that exists today (validation + thank-you state + navigation),
 * not a backend integration, since none exists yet.
 */

test.describe("signup page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/signup")
  })

  test("renders without requiring authentication", async ({ page }) => {
    await expect(page).toHaveURL(/\/signup$/)
    await expect(page.getByRole("heading", { name: "Request Access" })).toBeVisible()
  })

  test("renders name/email/estate fields and a submit button", async ({ page }) => {
    await expect(page.getByLabel("Name")).toBeVisible()
    await expect(page.getByLabel("Work Email")).toBeVisible()
    await expect(page.getByLabel("Estate Name")).toBeVisible()
    await expect(page.getByRole("button", { name: "Request Access" })).toBeVisible()
  })

  // Edge case: required-field (HTML5) validation blocks submission with empty fields,
  // so the thank-you view must not appear.
  test("blocks submission when required fields are empty", async ({ page }) => {
    await page.getByRole("button", { name: "Request Access" }).click()
    await expect(page.getByText(/we will reach out with your login details/i)).not.toBeVisible()
  })

  // Edge case: malformed email should be rejected by the input's type="email" validation.
  test("rejects a malformed email address", async ({ page }) => {
    await page.getByLabel("Name").fill("Test Estate Owner")
    await page.getByLabel("Work Email").fill("not-an-email")
    await page.getByLabel("Estate Name").fill("Test Estate")
    await page.getByRole("button", { name: "Request Access" }).click()
    // Still showing the form, not the thank-you view.
    await expect(page.getByText(/we will reach out with your login details/i)).not.toBeVisible()
  })

  // Use case: filling all required fields and submitting shows the thank-you state
  // and a way back to sign in.
  test("shows a thank-you message and sign-in link after a valid submission", async ({ page }) => {
    await page.getByLabel("Name").fill("Test Estate Owner")
    await page.getByLabel("Work Email").fill(`test-${Date.now()}@estate.com`)
    await page.getByLabel("Estate Name").fill("Test Estate")
    await page.getByRole("button", { name: "Request Access" }).click()

    await expect(page.getByText(/we will reach out with your login details/i)).toBeVisible()
    await expect(page.getByRole("link", { name: "Go to Sign In" })).toBeVisible()
  })

  test("links back to /login for existing users", async ({ page }) => {
    await page.getByRole("link", { name: "Sign in" }).click()
    await expect(page).toHaveURL(/\/login$/)
  })
})
