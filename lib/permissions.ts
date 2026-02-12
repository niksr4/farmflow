export type UserRole = "owner" | "admin" | "user"

const USER_WRITE_MODULES = new Set<string>([
  "inventory",
  "transactions",
  "accounts",
  "processing",
  "dispatch",
  "sales",
  "rainfall",
  "pepper",
  "journal",
])

export const isAdminRole = (role?: string | null) => role === "owner" || role === "admin"
export const isOwnerRole = (role?: string | null) => role === "owner"

export const canWriteModule = (role: UserRole, moduleId: string) => {
  if (isAdminRole(role)) return true
  return role === "user" && USER_WRITE_MODULES.has(moduleId)
}

export const canDeleteModule = (role: UserRole, moduleId: string) => {
  if (isAdminRole(role)) return true
  return false
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
