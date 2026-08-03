import "server-only"

import { sql } from "@/lib/server/db"
import { buildErrorFingerprint } from "@/lib/server/agents/utils"
import { logServerWarning } from "@/lib/server/safe-logging"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

type ErrorEventInput = {
  tenantId?: string | null
  source: string
  endpoint?: string | null
  errorCode?: string | null
  severity?: "warning" | "error" | "critical"
  message: string
  fingerprint?: string | null
  metadata?: Record<string, unknown> | null
}

const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error)
  return message.includes(`relation "${relation}" does not exist`)
}

export async function logAppErrorEvent(input: ErrorEventInput) {
  if (!sql) return

  const source = String(input.source || "app").slice(0, 120)
  const endpoint = input.endpoint ? String(input.endpoint).slice(0, 220) : null
  const errorCode = input.errorCode ? String(input.errorCode).slice(0, 120) : null
  const severity = input.severity || "error"
  const message = String(input.message || "").slice(0, 2000)
  const fingerprint =
    String(input.fingerprint || "").trim() ||
    buildErrorFingerprint({
      source,
      code: errorCode || undefined,
      endpoint: endpoint || undefined,
      message,
    })

  const tenantId = input.tenantId || null
  // app_error_events carries tenant_id, so RLS is enabled + FORCED on it (script 98). Writing
  // through the bare client leaves app.tenant_id unset, the WITH CHECK predicate evaluates to
  // NULL, and every insert is rejected — silently, because the catch below swallows it. That is
  // exactly what happened in production: error events stopped being recorded entirely.
  //
  // Role "owner" here is the app.role GUC the policy reads, not a Postgres role — it satisfies
  // the policy without needing a BYPASSRLS connection, and it is what lets genuinely
  // platform-level errors (tenantId === null) be recorded at all. Same shape as
  // lib/server/security-events.ts, which is why that table kept writing when this one didn't.
  const tenantContext = normalizeTenantContext(tenantId ?? undefined, "owner")

  try {
    await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO app_error_events (
          tenant_id,
          source,
          endpoint,
          error_code,
          severity,
          message,
          fingerprint,
          metadata
        )
        VALUES (
          ${tenantId}::uuid,
          ${source},
          ${endpoint},
          ${errorCode},
          ${severity},
          ${message},
          ${fingerprint},
          ${JSON.stringify(input.metadata || {})}::jsonb
        )
      `,
    )
  } catch (error) {
    if (!isMissingRelation(error, "app_error_events")) {
      logServerWarning("Error event write failed", error)
    }
  }
}
