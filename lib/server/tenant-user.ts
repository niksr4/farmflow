import "server-only"

import { sql } from "@/lib/server/db"
import type { SessionUser } from "@/lib/server/auth"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

export async function resolveTenantUserUuid(sessionUser: SessionUser): Promise<string> {
  if (!sql) return sessionUser.id

  const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
  try {
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT id
        FROM users
        WHERE tenant_id = ${tenantContext.tenantId}::uuid
          AND username = ${sessionUser.username}
        LIMIT 1
      `,
    )
    const resolvedId = String(rows?.[0]?.id || "").trim()
    if (resolvedId) return resolvedId

    const fallbackRows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT id
        FROM users
        WHERE tenant_id = ${tenantContext.tenantId}::uuid
        ORDER BY (role = 'admin') DESC, username ASC
        LIMIT 1
      `,
    )
    const fallbackId = String(fallbackRows?.[0]?.id || "").trim()
    return fallbackId || sessionUser.id
  } catch {
    return sessionUser.id
  }
}
