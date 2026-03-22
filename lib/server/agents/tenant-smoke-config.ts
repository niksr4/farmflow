import { z } from "zod"

export type TenantSmokeTarget = {
  slug: string
  tenantName: string
  username: string
  password: string
  expectedPlanId: string | null
}

export type TenantSmokeCheckDefinition = {
  key: string
  label: string
  path: string
  expectedText?: string
}

const tenantSmokeTargetSchema = z.object({
  slug: z.string().trim().min(1).optional(),
  tenantName: z.string().trim().min(1, "tenantName is required"),
  username: z.string().trim().min(1, "username is required"),
  password: z.string().min(1, "password is required"),
  expectedPlanId: z.string().trim().min(1).optional(),
})

const toSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "tenant"

const hasAnyModule = (enabledModules: Set<string>, requiredAnyModules?: string[]) => {
  if (!requiredAnyModules?.length) return true
  return requiredAnyModules.some((moduleId) => enabledModules.has(moduleId))
}

const BASE_PAGE_CHECKS: TenantSmokeCheckDefinition[] = [
  {
    key: "dashboard-launcher",
    label: "Dashboard launcher",
    path: "/dashboard?tab=launcher",
  },
  {
    key: "settings-page",
    label: "Workspace settings",
    path: "/settings",
  },
  {
    key: "manuals-page",
    label: "Training manuals",
    path: "/manuals",
    expectedText: "FarmFlow Training Manuals",
  },
]

const CONDITIONAL_PAGE_CHECKS: Array<TenantSmokeCheckDefinition & { requiredAnyModules: string[] }> = [
  {
    key: "inventory-page",
    label: "Inventory workspace",
    path: "/dashboard?tab=inventory",
    requiredAnyModules: ["inventory", "transactions"],
  },
  {
    key: "processing-page",
    label: "Processing workspace",
    path: "/dashboard?tab=processing",
    requiredAnyModules: ["processing", "pepper"],
  },
  {
    key: "dispatch-page",
    label: "Dispatch workspace",
    path: "/dashboard?tab=dispatch",
    requiredAnyModules: ["dispatch"],
  },
  {
    key: "sales-page",
    label: "Sales workspace",
    path: "/dashboard?tab=sales",
    requiredAnyModules: ["sales", "other-sales"],
  },
  {
    key: "accounts-page",
    label: "Accounts workspace",
    path: "/dashboard?tab=accounts",
    requiredAnyModules: ["accounts", "balance-sheet"],
  },
  {
    key: "rainfall-page",
    label: "Rainfall workspace",
    path: "/dashboard?tab=rainfall",
    requiredAnyModules: ["rainfall", "weather"],
  },
  {
    key: "season-page",
    label: "Season workspace",
    path: "/dashboard?tab=season",
    requiredAnyModules: ["season"],
  },
]

const CONDITIONAL_API_CHECKS: Array<TenantSmokeCheckDefinition & { requiredAnyModules: string[] }> = [
  {
    key: "locations-api",
    label: "Locations API",
    path: "/api/locations",
    requiredAnyModules: [
      "inventory",
      "transactions",
      "accounts",
      "processing",
      "dispatch",
      "sales",
      "other-sales",
      "rainfall",
      "pepper",
      "journal",
      "season",
    ],
  },
  {
    key: "processing-api",
    label: "Processing records API",
    path: "/api/processing-records?limit=1",
    requiredAnyModules: ["processing"],
  },
  {
    key: "dispatch-api",
    label: "Dispatch API",
    path: "/api/dispatch?limit=1",
    requiredAnyModules: ["dispatch"],
  },
  {
    key: "sales-api",
    label: "Sales API",
    path: "/api/sales?limit=1",
    requiredAnyModules: ["sales"],
  },
  {
    key: "journal-api",
    label: "Journal API",
    path: "/api/journal?limit=1",
    requiredAnyModules: ["journal"],
  },
  {
    key: "rainfall-api",
    label: "Rainfall API",
    path: "/api/rainfall",
    requiredAnyModules: ["rainfall"],
  },
  {
    key: "weather-api",
    label: "Weather API",
    path: "/api/weather",
    requiredAnyModules: ["weather"],
  },
]

export function parseTenantSmokeTargetsEnv(raw = process.env.TENANT_SMOKE_TARGETS_JSON || ""): TenantSmokeTarget[] {
  const normalized = String(raw || "").trim()
  if (!normalized) {
    throw new Error("TENANT_SMOKE_TARGETS_JSON is not configured")
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(normalized)
  } catch (error) {
    throw new Error(`TENANT_SMOKE_TARGETS_JSON is not valid JSON: ${String((error as Error)?.message || error)}`)
  }

  const result = z.array(tenantSmokeTargetSchema).safeParse(parsed)
  if (!result.success) {
    throw new Error(`TENANT_SMOKE_TARGETS_JSON is invalid: ${result.error.issues[0]?.message || "Unknown error"}`)
  }

  return result.data.map((target) => ({
    slug: toSlug(target.slug || target.tenantName),
    tenantName: target.tenantName.trim(),
    username: target.username.trim(),
    password: target.password,
    expectedPlanId: target.expectedPlanId ? target.expectedPlanId.trim().toLowerCase() : null,
  }))
}

export function resolveTenantSmokeBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const raw =
    String(env.TENANT_SMOKE_BASE_URL || "").trim() ||
    String(env.NEXT_PUBLIC_APP_URL || "").trim() ||
    String(env.NEXTAUTH_URL || "").trim()

  if (!raw) {
    throw new Error("TENANT_SMOKE_BASE_URL or NEXT_PUBLIC_APP_URL/NEXTAUTH_URL must be configured")
  }

  try {
    return new URL(raw).origin
  } catch {
    throw new Error("TENANT_SMOKE_BASE_URL must be a valid absolute URL")
  }
}

export function buildTenantSmokeCoverage(enabledModules: string[]) {
  const moduleSet = new Set(enabledModules.map((moduleId) => String(moduleId || "").trim()).filter(Boolean))

  return {
    pages: [
      ...BASE_PAGE_CHECKS,
      ...CONDITIONAL_PAGE_CHECKS.filter((check) => hasAnyModule(moduleSet, check.requiredAnyModules)).map(
        ({ requiredAnyModules: _requiredAnyModules, ...check }) => check,
      ),
    ],
    apis: CONDITIONAL_API_CHECKS.filter((check) => hasAnyModule(moduleSet, check.requiredAnyModules)).map(
      ({ requiredAnyModules: _requiredAnyModules, ...check }) => check,
    ),
  }
}
