import type { Page } from "@playwright/test"
import { expect } from "@playwright/test"

export const hasAuthCredentials = Boolean(process.env.E2E_USERNAME && process.env.E2E_PASSWORD)
export const expectOwnerUser = process.env.E2E_EXPECT_OWNER !== "0"

export const waitForDashboardReady = async (page: Page) => {
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/)
  await expect(page.getByRole("tab", { name: "Home" })).toBeVisible()
}

