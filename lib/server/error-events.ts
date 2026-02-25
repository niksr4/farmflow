import "server-only"

import { sql } from "@/lib/server/db"
import { buildErrorFingerprint } from "@/lib/server/agents/utils"

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

  try {
    await sql`
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
        ${input.tenantId || null}::uuid,
        ${source},
        ${endpoint},
        ${errorCode},
        ${severity},
        ${message},
        ${fingerprint},
        ${JSON.stringify(input.metadata || {})}::jsonb
      )
    `
  } catch (error) {
    if (!isMissingRelation(error, "app_error_events")) {
      console.warn("Error event write failed:", error)
    }
  }
}
