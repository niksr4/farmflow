import type { Page } from "@playwright/test"
import { expect } from "@playwright/test"
import { loadEnvConfig } from "@next/env"

// Align Playwright env resolution with Next.js so `.env.local` credentials work in local runs.
loadEnvConfig(process.cwd())

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
  // Wait for the page to finish loading — works on both desktop (sidebar) and mobile (no sidebar)
  await page.waitForLoadState("networkidle", { timeout: 25000 })
}

export type DashboardRouteContext = { route: string; tenantId: string | null }

// Owner accounts land on the admin console, so dashboard specs must open a
// tenant preview route. Non-owner accounts go straight to /dashboard.
export const getDashboardRouteContext = async (page: Page, tab: string): Promise<DashboardRouteContext> => {
  if (!expectOwnerUser) {
    return { route: `/dashboard?tab=${encodeURIComponent(tab)}`, tenantId: null }
  }

  const tenantsResponse = await page.request.get("/api/admin/tenants")
  if (!tenantsResponse.ok()) {
    throw new Error(`Failed to list tenants for preview routing (${tenantsResponse.status()})`)
  }
  const payload = await tenantsResponse.json()
  const tenant = (Array.isArray(payload?.tenants) ? payload.tenants : [])
    .map((entry: any) => ({
      id: String(entry?.id || "").trim(),
      name: String(entry?.name || "").trim() || undefined,
    }))
    .find((entry: { id: string }) => Boolean(entry.id))
  if (!tenant) {
    throw new Error("No tenant available for owner preview routing")
  }

  const params = new URLSearchParams({ tab, previewTenantId: tenant.id, previewRole: "admin" })
  if (tenant.name) params.set("previewTenantName", tenant.name)
  return { route: `/dashboard?${params.toString()}`, tenantId: tenant.id }
}
