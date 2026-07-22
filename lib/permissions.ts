import { assertValidModuleIds } from "@/lib/modules"

export type UserRole = "owner" | "admin" | "user"

const USER_MUTATION_MODULES_LIST = [
  "inventory",
  "transactions",
  "accounts",
  "processing",
  "dispatch",
  "other-sales",
  "receivables",
  "billing",
  "rainfall",
  "pepper",
  "curing",
  "quality",
  "journal",
]
assertValidModuleIds(USER_MUTATION_MODULES_LIST, "USER_MUTATION_MODULES")
const USER_MUTATION_MODULES = new Set<string>(USER_MUTATION_MODULES_LIST)

export const isAdminRole = (role?: string | null) => role === "owner" || role === "admin"
export const isOwnerRole = (role?: string | null) => role === "owner"

export const canWriteModule = (role: UserRole, moduleId: string) => {
  if (isAdminRole(role)) return true
  return role === "user" && USER_MUTATION_MODULES.has(moduleId)
}

export const canDeleteModule = (role: UserRole, moduleId: string) => {
  if (isAdminRole(role)) return true
  return role === "user" && USER_MUTATION_MODULES.has(moduleId)
}

export const requireAdminRole = (role?: string | null) => {
  if (!isAdminRole(role)) {
    throw new Error("Admin role required")
  }
}

export const requireOwnerRole = (role?: string | null) => {
  if (!isOwnerRole(role)) {
    throw new Error("Owner role required")
  }
}

type ScopedSessionUser = { role?: string | null; tenantId?: string | null }

// Owner (the platform account) may target any tenant via a requested tenant id; everyone
// else is locked to their own. With fallbackToSessionTenant, an owner who didn't pass a
// tenant id falls back to their own tenantId instead of getting null — used by routes an
// owner also operates against directly (not just the admin console).
export const resolveRequestedTenantId = (
  sessionUser: ScopedSessionUser,
  requestedTenantId?: string | null,
  options?: { fallbackToSessionTenant?: boolean },
): string | null => {
  const requested = requestedTenantId ? String(requestedTenantId) : null
  if (isOwnerRole(sessionUser.role)) {
    if (requested) return requested
    return options?.fallbackToSessionTenant && sessionUser.tenantId ? String(sessionUser.tenantId) : null
  }
  return sessionUser.tenantId ? String(sessionUser.tenantId) : null
}

// True when a non-owner is requesting or touching a tenant that isn't their own.
export const isForbiddenTenantAccess = (
  sessionUser: ScopedSessionUser,
  candidateTenantId?: string | null,
): boolean => {
  if (isOwnerRole(sessionUser.role)) return false
  if (!candidateTenantId) return false
  return String(candidateTenantId) !== String(sessionUser.tenantId || "")
}

// Tenant filter for owner-spanning lookups: undefined (no filter) for owner, own tenant otherwise.
export const resolveOwnerScopedTenantId = (sessionUser: ScopedSessionUser): string | undefined =>
  isOwnerRole(sessionUser.role) ? undefined : sessionUser.tenantId ? String(sessionUser.tenantId) : undefined
