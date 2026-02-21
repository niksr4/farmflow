export const roleLabel = (role?: string | null) => {
  const normalized = String(role || "").toLowerCase()
  if (normalized === "owner") return "Platform Owner"
  if (normalized === "admin") return "Estate Admin"
  if (normalized === "user") return "Estate User"
  if (normalized === "viewer") return "Read-only Viewer"
  return role ? String(role) : "User"
}
