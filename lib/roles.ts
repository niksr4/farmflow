export const roleLabel = (role?: string | null) => {
  const normalized = String(role || "").toLowerCase()
  if (normalized === "owner") return "Super Admin"
  if (normalized === "admin") return "Admin"
  if (normalized === "user") return "User"
  return role ? String(role) : "User"
}
