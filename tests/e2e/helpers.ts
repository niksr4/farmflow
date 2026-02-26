import type { Page } from "@playwright/test"
import { expect } from "@playwright/test"

export const expectOwnerUser = process.env.E2E_EXPECT_OWNER !== "0"
export const expectAdminUser = process.env.E2E_EXPECT_ADMIN === "1"

const resolveCredentialPair = (username?: string, password?: string) => {
  const resolvedUsername = String(username || "").trim()
  const resolvedPassword = String(password || "")
  return {
    username: resolvedUsername,
    password: resolvedPassword,
    isConfigured: Boolean(resolvedUsername && resolvedPassword),
  }
}

export const ownerCredentials = resolveCredentialPair(
  process.env.E2E_OWNER_USERNAME,
  process.env.E2E_OWNER_PASSWORD,
)

export const authCredentials = resolveCredentialPair(process.env.E2E_USERNAME, process.env.E2E_PASSWORD)
export const adminCredentials = resolveCredentialPair(process.env.E2E_ADMIN_USERNAME, process.env.E2E_ADMIN_PASSWORD)

export const hasAuthCredentials = authCredentials.isConfigured
export const hasOwnerCredentials = ownerCredentials.isConfigured
export const hasAdminCredentials = adminCredentials.isConfigured
export const hasRequiredAuthCredentials = expectOwnerUser ? hasOwnerCredentials : hasAuthCredentials

export const waitForDashboardReady = async (page: Page) => {
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/)
  await expect(page.getByRole("tab", { name: "Home" })).toBeVisible()
}
