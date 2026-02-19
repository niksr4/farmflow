import "server-only"

import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

export type SessionUser = {
  username: string
  role: "admin" | "user" | "owner"
  tenantId: string
  mfaVerified?: boolean
  passwordResetRequired?: boolean
}

export async function requireSessionUser(): Promise<SessionUser> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any

  if (user?.tenantId && user?.role) {
    return {
      username: String(user.name || ""),
      role: user.role,
      tenantId: String(user.tenantId),
      mfaVerified: Boolean((user as any).mfaVerified),
      passwordResetRequired: Boolean((user as any).passwordResetRequired),
    }
  }

  if (user?.name && sql) {
    const ownerContext = normalizeTenantContext(undefined, "owner")
    const rows = await runTenantQuery(
      sql,
      ownerContext,
      sql`
        SELECT role, tenant_id, password_reset_required
        FROM users
        WHERE username = ${String(user.name)}
        LIMIT 1
      `,
    )
    if (rows.length) {
      return {
        username: String(user.name || ""),
        role: String(rows[0].role) as SessionUser["role"],
        tenantId: String(rows[0].tenant_id),
        mfaVerified: Boolean((user as any)?.mfaVerified),
        passwordResetRequired: Boolean(rows[0].password_reset_required),
      }
    }
  }

  throw new Error("Unauthorized")
}
