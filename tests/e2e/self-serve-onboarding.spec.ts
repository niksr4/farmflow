import { expect, test } from "@playwright/test"

import { cleanupSelfServeSignup } from "./self-serve-db"

test("self-serve signup provisions a basic workspace end to end", async ({ page }) => {
  test.setTimeout(120_000)

  const stamp = Date.now()
  const email = `self-serve-${stamp}@example.com`
  const password = "SelfServePass123!"
  const estateName = `Self Serve Estate ${stamp}`

  await cleanupSelfServeSignup(email)

  try {
    await page.goto("/signup")
    await page.locator("#name").fill("Self Serve QA")
    await page.locator("#email").fill(email)
    await page.locator("#password").fill(password)
    await page.locator("#estateName").fill(estateName)
    await page.locator("#country").fill("India")
    await page.getByRole("button", { name: "Create Account" }).click()

    await expect(page).toHaveURL(/\/login(?:\?|$)/)

    await page.locator("#username").fill(email)
    await page.locator("#password").fill(password)
    await page.getByRole("button", { name: "Sign In" }).click()

    await expect(page).toHaveURL(/\/welcome(?:\?|$)/)
    await expect(page.getByRole("heading", { name: "Finish your workspace in five minutes" }).first()).toBeVisible()

    await page.getByRole("button", { name: /Basic/i }).click()
    await page.locator("#welcome-location-name").fill("Main Estate")
    await page.locator("#welcome-location-code").fill("MAIN")
    await page.getByRole("button", { name: "Finish setup" }).click()

    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/)

    const modulesResponse = await page.context().request.get("/api/tenant-modules")
    const modulesPayload = await modulesResponse.json()
    expect(modulesResponse.ok()).toBe(true)
    expect(modulesPayload.planId).toBe("basic")
    expect(modulesPayload.modules).toEqual(["inventory", "transactions", "accounts", "balance-sheet"])
  } finally {
    await cleanupSelfServeSignup(email)
  }
})
