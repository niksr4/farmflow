import "server-only"

import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

const isMissingPasswordResetColumnError = (error: unknown) => {
  const code = String((error as any)?.code || "")
  const message = String((error as any)?.message || "")
  return code === "42703" || message.includes('column "password_reset_required" does not exist')
}

export type SessionUser = {
  username: string
  role: "admin" | "user" | "owner"
  tenantId: string
  mfaEnabled?: boolean
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
      mfaEnabled: Boolean((user as any).mfaEnabled),
      mfaVerified: Boolean((user as any).mfaVerified),
      passwordResetRequired: Boolean((user as any).passwordResetRequired),
    }
  }

  if (user?.name && sql) {
    const ownerContext = normalizeTenantContext(undefined, "owner")
    let rows: any[] = []
    try {
      rows = await runTenantQuery(
        sql,
        ownerContext,
        sql`
          SELECT role, tenant_id, password_reset_required
          FROM users
          WHERE username = ${String(user.name)}
          LIMIT 1
        `,
      )
    } catch (error) {
      if (!isMissingPasswordResetColumnError(error)) {
        throw error
      }
      rows = await runTenantQuery(
        sql,
        ownerContext,
        sql`
          SELECT role, tenant_id
          FROM users
          WHERE username = ${String(user.name)}
          LIMIT 1
        `,
      )
      rows = rows.map((row) => ({ ...row, password_reset_required: false }))
    }
    if (rows.length) {
      return {
        username: String(user.name || ""),
        role: String(rows[0].role) as SessionUser["role"],
        tenantId: String(rows[0].tenant_id),
        mfaEnabled: Boolean((user as any)?.mfaEnabled),
        mfaVerified: Boolean((user as any)?.mfaVerified),
        passwordResetRequired: Boolean(rows[0].password_reset_required),
      }
    }
  }

  throw new Error("Unauthorized")
}
