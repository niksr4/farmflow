import fs from "node:fs"
import path from "node:path"
import { expect, test as setup } from "@playwright/test"

const authFile = path.join(__dirname, ".auth", "owner.json")

setup("authenticate owner session", async ({ page }) => {
  fs.mkdirSync(path.dirname(authFile), { recursive: true })

  const username = process.env.E2E_USERNAME
  const password = process.env.E2E_PASSWORD

  // Keep an explicit empty state so local runs can still execute public-flow tests.
  if (!username || !password) {
    await page.context().storageState({ path: authFile })
    return
  }

  await page.goto("/login")
  await page.getByLabel("Username").fill(username)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign In" }).click()
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/)
  await page.context().storageState({ path: authFile })
})

