import "server-only"

import { sql } from "@/lib/server/db"
import { logServerWarning } from "@/lib/server/safe-logging"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

type ProductIntelligenceEvent = {
  tenantId?: string | null
  actorUserId?: string | null
  actorUsername?: string | null
  actorRole?: string | null
  eventType: string
  moduleId?: string | null
  entityType?: string | null
  entityId?: string | null
  source?: string | null
  metadata?: Record<string, unknown> | null
  occurredAt?: string | null
}

const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error || "")
  return message.includes(`relation "${relation}"`) && message.includes("does not exist")
}

export async function logProductIntelligenceEvent(event: ProductIntelligenceEvent) {
  if (!sql || !event.tenantId) return

  const tenantContext = normalizeTenantContext(event.tenantId, "owner")

  try {
    await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO tenant_usage_events (
          tenant_id,
          actor_user_id,
          actor_username,
          actor_role,
          event_type,
          module_id,
          entity_type,
          entity_id,
          source,
          metadata,
          occurred_at
        )
        VALUES (
          ${event.tenantId},
          ${event.actorUserId || null},
          ${event.actorUsername || null},
          ${event.actorRole || null},
          ${event.eventType},
          ${event.moduleId || null},
          ${event.entityType || null},
          ${event.entityId || null},
          ${event.source || null},
          ${JSON.stringify(event.metadata || {})}::jsonb,
          COALESCE(${event.occurredAt || null}::timestamptz, CURRENT_TIMESTAMP)
        )
      `,
    )
  } catch (error) {
    if (!isMissingRelation(error, "tenant_usage_events")) {
      logServerWarning("Product intelligence event write failed", error)
    }
  }
}
