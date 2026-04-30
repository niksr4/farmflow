import "server-only"

import { sql, accountsSql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQueries } from "@/lib/server/tenant-db"
import type { BotUser, PendingSession, TenantBotContext } from "./types"

// Resolve a WhatsApp phone number to a tenant user
export async function resolveBotUser(phone: string): Promise<BotUser | null> {
  if (!sql) return null
  const normalized = phone.replace(/^whatsapp:/, "").replace(/\s+/g, "")

  const rows = await sql`
    SELECT
      tu.id         AS user_id,
      tu.role,
      tu.username,
      tu.whatsapp_phone,
      t.id          AS tenant_id
    FROM tenant_users tu
    JOIN tenants t ON t.id = tu.tenant_id
    WHERE tu.whatsapp_phone = ${normalized}
      AND tu.disabled IS NOT TRUE
    LIMIT 1
  `
  const row = Array.isArray(rows) ? rows[0] : (rows as any)?.rows?.[0]
  if (!row) return null

  return {
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    role: String(row.role || "user"),
    username: String(row.username || "bot"),
    phone: normalized,
  }
}

// Load tenant context (locations, inventory, activity codes) for Claude's system prompt
export async function loadTenantBotContext(botUser: BotUser): Promise<TenantBotContext> {
  if (!sql || !accountsSql) {
    return {
      tenantId: botUser.tenantId,
      tenantName: "Estate",
      cropFamily: "coffee",
      locations: [],
      inventoryItems: [],
      activityCodes: [],
      today: new Date().toISOString().slice(0, 10),
    }
  }

  const tenantContext = normalizeTenantContext(botUser.tenantId, botUser.role)

  const [tenantRows, locationRows, inventoryRows, activityRows] = await runTenantQueries(sql, tenantContext, [
    sql.query(
      `SELECT name, crop_family FROM tenants WHERE id = $1 LIMIT 1`,
      [botUser.tenantId],
    ),
    sql.query(
      `SELECT id, name FROM locations WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name LIMIT 50`,
      [botUser.tenantId],
    ),
    sql.query(
      `SELECT item_type, COALESCE(unit, 'kg') AS unit, COALESCE(SUM(quantity), 0) AS quantity
       FROM current_inventory
       WHERE tenant_id = $1
       GROUP BY item_type, unit
       ORDER BY item_type
       LIMIT 100`,
      [botUser.tenantId],
    ),
    accountsSql.query(
      `SELECT code, activity FROM account_activities WHERE tenant_id = $1 ORDER BY code LIMIT 60`,
      [botUser.tenantId],
    ),
  ])

  const toRows = (r: unknown) => (Array.isArray(r) ? r : (r as any)?.rows ?? [])
  const tenant = toRows(tenantRows)[0]

  return {
    tenantId: botUser.tenantId,
    tenantName: String(tenant?.name || "Estate"),
    cropFamily: String(tenant?.crop_family || "coffee"),
    locations: toRows(locationRows).map((r: any) => ({ id: String(r.id), name: String(r.name) })),
    inventoryItems: toRows(inventoryRows).map((r: any) => ({
      itemType: String(r.item_type),
      unit: String(r.unit),
      quantity: Number(r.quantity),
    })),
    activityCodes: toRows(activityRows).map((r: any) => ({
      code: String(r.code),
      activity: String(r.activity),
    })),
    today: new Date().toISOString().slice(0, 10),
  }
}

// Load a pending session by phone number (unexpired)
export async function loadPendingSession(phone: string): Promise<PendingSession | null> {
  if (!sql) return null
  const normalized = phone.replace(/^whatsapp:/, "")

  const rows = await sql`
    SELECT id, phone, tenant_id, user_id, user_role, pending_intent
    FROM whatsapp_bot_sessions
    WHERE phone = ${normalized}
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `
  const row = Array.isArray(rows) ? rows[0] : (rows as any)?.rows?.[0]
  if (!row) return null

  return {
    id: Number(row.id),
    phone: String(row.phone),
    tenantId: String(row.tenant_id),
    userId: String(row.user_id),
    userRole: String(row.user_role),
    pendingIntent: row.pending_intent ?? [],
  }
}

// Upsert a session (replaces any existing session for this phone)
export async function upsertBotSession(
  botUser: BotUser,
  intents: unknown[],
): Promise<void> {
  if (!sql) return
  await sql`
    DELETE FROM whatsapp_bot_sessions
    WHERE phone = ${botUser.phone}
  `
  await sql`
    INSERT INTO whatsapp_bot_sessions (phone, tenant_id, user_id, user_role, pending_intent, expires_at)
    VALUES (
      ${botUser.phone},
      ${botUser.tenantId}::uuid,
      ${botUser.userId},
      ${botUser.role},
      ${JSON.stringify(intents)},
      NOW() + INTERVAL '10 minutes'
    )
  `
}

// Clear any session for this phone
export async function clearBotSession(phone: string): Promise<void> {
  if (!sql) return
  const normalized = phone.replace(/^whatsapp:/, "")
  await sql`DELETE FROM whatsapp_bot_sessions WHERE phone = ${normalized}`
}
