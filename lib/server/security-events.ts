import "server-only"

import type { NeonQueryFunction } from "@neondatabase/serverless"
import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

type Severity = "info" | "warning" | "critical"

type SecurityEvent = {
  tenantId?: string | null
  actorUserId?: string | null
  actorUsername?: string | null
  actorRole?: string | null
  eventType: string
  severity?: Severity
  source?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown> | null
}

const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error)
  return message.includes(`relation "${relation}" does not exist`)
}

const resolveActorId = async (
  client: NeonQueryFunction<boolean, boolean>,
  tenantId: string,
  actorUsername?: string | null,
): Promise<string | null> => {
  if (!actorUsername) return null
  const tenantContext = normalizeTenantContext(tenantId, "owner")
  const rows = await runTenantQuery(
    client,
    tenantContext,
    client`
      SELECT id
      FROM users
      WHERE tenant_id = ${tenantId}
        AND username = ${actorUsername}
      LIMIT 1
    `,
  )
  return rows?.[0]?.id ?? null
}

export async function logSecurityEvent(event: SecurityEvent) {
  if (!sql) return
  const client = sql
  const tenantId = event.tenantId || null
  const tenantContext = normalizeTenantContext(tenantId ?? undefined, "owner")
  let actorUserId = event.actorUserId || null

  if (!actorUserId && tenantId && event.actorUsername) {
    try {
      actorUserId = await resolveActorId(client, tenantId, event.actorUsername)
    } catch (error) {
      if (!isMissingRelation(error, "users")) {
        console.warn("Security event user lookup failed:", error)
      }
    }
  }

  const metadata = event.metadata ? JSON.stringify(event.metadata) : null

  try {
    await runTenantQuery(
      client,
      tenantContext,
      client`
        INSERT INTO security_events (
          tenant_id,
          actor_user_id,
          actor_username,
          actor_role,
          event_type,
          severity,
          source,
          ip_address,
          user_agent,
          metadata
        )
        VALUES (
          ${tenantId},
          ${actorUserId},
          ${event.actorUsername || null},
          ${event.actorRole || null},
          ${event.eventType},
          ${event.severity || "info"},
          ${event.source || null},
          ${event.ipAddress || null},
          ${event.userAgent || null},
          ${metadata}::jsonb
        )
      `,
    )
  } catch (error) {
    if (!isMissingRelation(error, "security_events")) {
      console.warn("Security event write failed:", error)
    }
  }
}
