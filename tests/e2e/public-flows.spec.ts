import { expect, test } from "@playwright/test"

test("landing page shows concise header links and CTAs", async ({ page }) => {
  await page.goto("/")

  const desktopNavLinks = page.locator("header nav .lg\\:flex a")
  await expect(page.getByRole("link", { name: "Login" }).first()).toBeVisible()
  await expect(page.getByRole("link", { name: /try free/i }).first()).toBeVisible()
  await expect(page.getByRole("link", { name: "Plans" }).first()).toBeVisible()
  await expect(page.getByRole("link", { name: "Contact" }).first()).toBeVisible()
  await expect(page.getByRole("link", { name: "Trust" }).first()).toBeVisible()
  await expect(desktopNavLinks).toHaveCount(5)
})

test("self-serve signup submits and routes to login", async ({ page }) => {
  let payload: any = null
  await page.route("**/api/auth/signup", async (route) => {
    payload = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, signupRequestId: "signup-123", verificationSent: false }),
    })
  })

  await page.goto("/signup")
  await page.locator("#name").fill("Regression QA")
  await page.locator("#email").fill("regression.qa@example.com")
  await page.locator("#password").fill("RegressionPass123!")
  await page.locator("#estateName").fill("Regression Estate")
  await page.locator("#country").fill("Coorg")
  await page.getByRole("button", { name: "Create Account" }).click()

  await expect(page).toHaveURL(/\/login(?:\?|$)/)
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible()
  expect(payload?.source).toBe("signup-page")
  expect(payload?.estateName).toBe("Regression Estate")
  expect(payload?.password).toBe("RegressionPass123!")
})
