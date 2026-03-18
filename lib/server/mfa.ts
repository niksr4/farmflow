import "server-only"
import { requireSessionUser, type SessionUser } from "@/lib/server/auth"

export async function requireAdminSession() {
  const sessionUser = await requireSessionUser()
  if (!["owner", "admin"].includes(sessionUser.role)) {
    throw new Error("Admin role required")
  }
  return sessionUser
}
