import fs from "node:fs"
import path from "node:path"
import { expect, test as setup } from "@playwright/test"
import { authCredentials, expectOwnerUser, ownerCredentials } from "./helpers"

const authFile = path.join(__dirname, ".auth", "owner.json")

setup("authenticate owner session", async ({ page }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true })

  const selectedCredentials = expectOwnerUser ? ownerCredentials : authCredentials
  const username = selectedCredentials.username
  const password = selectedCredentials.password

  // Keep an explicit empty state so local runs can still execute public-flow tests.
  if (!username || !password) {
    await page.context().storageState({ path: authFile })
    return
  }

  await page.goto("/login")
  await page.locator("#username").fill(username)
  await page.locator("#password").fill(password)
  await page.getByRole("button", { name: "Sign In" }).click()
  try {
    await expect(page).toHaveURL(/\/(?:dashboard|admin\/tenants)(?:\?|$)/)
  } catch (error) {
    const loginErrorText = (await page.locator("div.bg-red-50").first().textContent().catch(() => "")) || ""
    const envHint = expectOwnerUser
      ? "E2E_OWNER_USERNAME/E2E_OWNER_PASSWORD"
      : "E2E_USERNAME/E2E_PASSWORD"
    throw new Error(
      `E2E login failed. Check ${envHint} for a valid account. Login page message: ${loginErrorText.trim() || "none"}`,
      { cause: error as Error },
    )
  }
  await page.context().storageState({ path: authFile })
})
