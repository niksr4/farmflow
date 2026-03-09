import type { Page } from "@playwright/test"
import { expectOwnerUser } from "./helpers"

type PreviewTenant = {
  id: string
  name?: string
}

export type DashboardRouteContext = {
  isOwnerPreview: boolean
  tenantId: string | null
  tenantName?: string
}

type ResolveRouteOptions = {
  requiredModules?: string[]
  preferredTenantName?: string
}

const DEFAULT_OWNER_TENANT_NAME = "E2E Automation Tenant"

const toPreviewTenant = (raw: any): PreviewTenant | null => {
  const id = String(raw?.id || "").trim()
  if (!id) return null
  const name = String(raw?.name || "").trim() || undefined
  return { id, name }
}

const buildPreviewRoute = (tenant: PreviewTenant, tab: string) => {
  const params = new URLSearchParams({
    tab,
    previewTenantId: tenant.id,
    previewRole: "admin",
  })
  if (tenant.name) params.set("previewTenantName", tenant.name)
  return `/dashboard?${params.toString()}`
}

const fetchPreviewTenants = async (page: Page): Promise<PreviewTenant[]> => {
  const response = await page.request.get("/api/admin/tenants")
  if (!response.ok()) {
    const body = await response.text().catch(() => "")
    throw new Error(`Failed to load tenants (${response.status()}): ${body || "no response body"}`)
  }
  const payload = await response.json().catch(() => ({}))
  const tenants = (Array.isArray(payload?.tenants) ? payload.tenants : []) as unknown[]
  return tenants.map((entry: unknown) => toPreviewTenant(entry)).filter((entry): entry is PreviewTenant => Boolean(entry))
}

const fetchTenantModules = async (page: Page, tenantId: string) => {
  const response = await page.request.get(`/api/admin/tenant-modules?tenantId=${encodeURIComponent(tenantId)}`)
  if (!response.ok()) {
    return null
  }
  const payload = await response.json().catch(() => ({}))
  const modules = (Array.isArray(payload?.modules) ? payload.modules : []) as unknown[]
  return modules.map((module: unknown) => {
    const moduleRecord = module as { id?: unknown; enabled?: unknown }
    return {
      id: String(moduleRecord.id || ""),
      enabled: Boolean(moduleRecord.enabled),
    }
  })
}

const tenantSatisfiesModules = (modules: Array<{ id: string; enabled: boolean }> | null, requiredModules: string[]) => {
  if (!requiredModules.length) return true
  if (!modules) return false
  const moduleState = new Map(modules.map((module) => [module.id, module.enabled]))
  return requiredModules.every((moduleId) => moduleState.get(moduleId) === true)
}

const ensureTenantModules = async (page: Page, tenantId: string, requiredModules: string[]) => {
  if (!requiredModules.length) return
  const existing = await fetchTenantModules(page, tenantId)
  if (!existing || !existing.length) return

  const normalizedModules = existing.map((module) => ({
    id: module.id,
    enabled: requiredModules.includes(module.id) ? true : module.enabled,
  }))

  const response = await page.request.put("/api/admin/tenant-modules", {
    data: {
      tenantId,
      modules: normalizedModules,
    },
  })
  if (!response.ok()) {
    const body = await response.text().catch(() => "")
    throw new Error(`Failed to update tenant modules (${response.status()}): ${body || "no response body"}`)
  }
}

const createPreviewTenant = async (page: Page, preferredName: string): Promise<PreviewTenant | null> => {
  const response = await page.request.post("/api/admin/tenants", {
    data: { name: preferredName },
  })
  if (!response.ok()) return null
  const payload = await response.json().catch(() => ({}))
  return toPreviewTenant(payload?.tenant)
}

const resolveOwnerTenant = async (
  page: Page,
  requiredModules: string[],
  preferredTenantName: string,
): Promise<PreviewTenant> => {
  const tenants = await fetchPreviewTenants(page)
  const preferredByName = tenants.find(
    (tenant) => String(tenant.name || "").toLowerCase() === preferredTenantName.toLowerCase(),
  )

  const orderedCandidates = preferredByName
    ? [preferredByName, ...tenants.filter((tenant) => tenant.id !== preferredByName.id)]
    : tenants

  for (const tenant of orderedCandidates) {
    const modules = await fetchTenantModules(page, tenant.id)
    if (tenantSatisfiesModules(modules, requiredModules)) {
      return tenant
    }
  }

  const createdTenant = await createPreviewTenant(page, preferredTenantName)
  if (createdTenant) {
    await ensureTenantModules(page, createdTenant.id, requiredModules)
    return createdTenant
  }

  if (tenants.length > 0) {
    await ensureTenantModules(page, tenants[0].id, requiredModules)
    return tenants[0]
  }

  throw new Error("No owner preview tenant available and tenant creation failed.")
}

export const resolveDashboardRouteContext = async (
  page: Page,
  tab: string,
  options: ResolveRouteOptions = {},
): Promise<{ route: string; context: DashboardRouteContext }> => {
  if (!expectOwnerUser) {
    const context: DashboardRouteContext = {
      isOwnerPreview: false,
      tenantId: null,
    }
    return {
      route: `/dashboard?tab=${encodeURIComponent(tab)}`,
      context,
    }
  }

  const requiredModules = Array.isArray(options.requiredModules) ? options.requiredModules : []
  const preferredTenantName = String(options.preferredTenantName || "").trim() || DEFAULT_OWNER_TENANT_NAME
  const tenant = await resolveOwnerTenant(page, requiredModules, preferredTenantName)
  const context: DashboardRouteContext = {
    isOwnerPreview: true,
    tenantId: tenant.id,
    tenantName: tenant.name,
  }
  return {
    route: buildPreviewRoute(tenant, tab),
    context,
  }
}

export const buildDashboardRouteForTab = (context: DashboardRouteContext, tab: string) => {
  if (!context.isOwnerPreview || !context.tenantId) {
    return `/dashboard?tab=${encodeURIComponent(tab)}`
  }
  return buildPreviewRoute({ id: context.tenantId, name: context.tenantName }, tab)
}
