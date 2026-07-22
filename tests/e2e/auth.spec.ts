import { test, expect } from "@playwright/test"

/**
 * Covers the login flow: the primary entry point for every FarmFlow user.
 * Use cases: signing in with valid/invalid credentials, required-field validation,
 * and route protection for authenticated-only pages.
 */

test.describe("landing page", () => {
  test("renders and links to login/signup", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(page.getByRole("link", { name: "Login" }).first()).toBeVisible()
    await expect(page.getByRole("link", { name: "Sign Up" }).first()).toBeVisible()
  })
})

test.describe("login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login")
  })

  test("renders username/password fields and submit button", async ({ page }) => {
    await expect(page.getByLabel("Username")).toBeVisible()
    await expect(page.getByLabel("Password")).toBeVisible()
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible()
  })

  // Edge case: required-field (HTML5) validation blocks submission with empty fields.
  test("blocks submission when fields are empty", async ({ page }) => {
    await page.getByRole("button", { name: "Sign In" }).click()
    // Still on /login — the form never actually submitted.
    await expect(page).toHaveURL(/\/login/)
  })

  // Edge case: wrong credentials should surface an inline error, not a silent failure
  // or an unhandled exception, and must not redirect to /dashboard.
  test("shows an error message for invalid credentials", async ({ page }) => {
    await page.getByLabel("Username").fill(`not-a-real-user-${Date.now()}`)
    await page.getByLabel("Password").fill("definitely-wrong-password")
    await page.getByRole("button", { name: "Sign In" }).click()

    await expect(page.getByText(/invalid username or password/i)).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })

  // Use case: a valid user can sign in and lands on the dashboard.
  // Skips itself when no test credentials are configured (e.g. local runs without a seeded user),
  // so the rest of the suite still provides signal.
  test("signs in with valid credentials and reaches the dashboard", async ({ page }) => {
    const username = process.env.E2E_TEST_USERNAME
    const password = process.env.E2E_TEST_PASSWORD
    test.skip(!username || !password, "E2E_TEST_USERNAME / E2E_TEST_PASSWORD not configured")

    await page.getByLabel("Username").fill(username!)
    await page.getByLabel("Password").fill(password!)
    await page.getByRole("button", { name: "Sign In" }).click()

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
  })
})

test.describe("route protection", () => {
  // Edge case: an unauthenticated visitor hitting a protected route directly (deep link)
  // must not see protected content — should be redirected away from /dashboard.
  test("redirects unauthenticated visitors away from /dashboard", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page).not.toHaveURL(/\/dashboard$/, { timeout: 10_000 })
  })
})
