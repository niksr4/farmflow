import { expect, test } from "@playwright/test"

test("landing page shows concise header links and CTAs", async ({ page }) => {
  await page.goto("/")

  const desktopNavLinks = page.locator("header nav .lg\\:flex a")
  await expect(page.getByRole("link", { name: "Login" }).first()).toBeVisible()
  await expect(page.getByRole("link", { name: "Request Access" }).first()).toBeVisible()
  await expect(page.getByRole("link", { name: "Trust" }).first()).toBeVisible()
  await expect(desktopNavLinks).toHaveCount(5)
})

test("request access form submits and shows confirmation", async ({ page }) => {
  let payload: any = null
  await page.route("**/api/register-interest", async (route) => {
    payload = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, notified: true, emailed: true }),
    })
  })

  await page.goto("/signup")
  await page.locator("#name").fill("Regression QA")
  await page.locator("#email").fill("regression.qa@example.com")
  await page.locator("#estate").fill("Regression Estate")
  await page.locator("#region").fill("Coorg")
  await page.getByRole("button", { name: "Request Access" }).click()

  await expect(page.getByText("Thanks. We will reach out with your login details and onboarding plan shortly.")).toBeVisible()
  await expect(page.getByRole("link", { name: "Go to Sign In" })).toBeVisible()
  expect(payload?.source).toBe("signup-page")
  expect(payload?.organization).toBe("Regression Estate")
})
