import "server-only"

import { accountsSql } from "@/lib/server/db"
import { runTenantQuery } from "@/lib/server/tenant-db"

/**
 * Does this activity code exist for this tenant?
 *
 * Lifted out of app/api/labor-neon/route.ts, where it was private, because labour assignments
 * need the identical check. Two copies of "is this code real" is how the two paths end up
 * disagreeing about which codes are acceptable -- the same class of drift as the free-text
 * group labels this whole change exists to remove.
 *
 * Codes are per-tenant (scripts/87 changed the constraint from a global unique `code` to
 * `(tenant_id, code)`), so the tenant filter is load-bearing, not decoration.
 */
export async function activityCodeExistsForTenant(
  tenantContext: { tenantId: string; role: string },
  code: string,
): Promise<boolean> {
  const normalized = String(code || "").trim()
  if (!normalized) return false

  const rows = await runTenantQuery(
    accountsSql,
    tenantContext,
    accountsSql`
      SELECT code
      FROM account_activities
      WHERE code = ${normalized}
        AND tenant_id = ${tenantContext.tenantId}
      LIMIT 1
    `,
  )
  return Boolean(rows?.length)
}
