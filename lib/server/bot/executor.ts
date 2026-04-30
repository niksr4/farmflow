import "server-only"

import { sql, accountsSql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import type { BotIntent, BotUser, TenantBotContext } from "./types"

const toRows = (r: unknown) => (Array.isArray(r) ? r : (r as any)?.rows ?? [])

// Resolve a location name to a UUID for this tenant
async function resolveLocationId(
  tenantId: string,
  locationName: string | null | undefined,
  ctx: TenantBotContext,
): Promise<string | null> {
  if (!locationName) return null
  const lower = locationName.toLowerCase().trim()
  const match = ctx.locations.find(
    (l) => l.name.toLowerCase() === lower || l.name.toLowerCase().includes(lower),
  )
  return match?.id ?? null
}

// Resolve an inventory item name to the exact item_type string
function resolveInventoryItemType(
  itemType: string | null | undefined,
  ctx: TenantBotContext,
): string | null {
  if (!itemType) return null
  const lower = itemType.toLowerCase().trim()
  const match = ctx.inventoryItems.find(
    (i) => i.itemType.toLowerCase() === lower || i.itemType.toLowerCase().includes(lower),
  )
  return match?.itemType ?? itemType
}

export type IntentPreview = {
  label: string
  lines: string[]
}

// Generate a human-readable preview for a YES/NO confirmation
export function buildPreview(intents: BotIntent[], ctx: TenantBotContext): string {
  const blocks: string[] = []

  for (const intent of intents) {
    if (intent.type === "record_expense") {
      const location = ctx.locations.find((l) => l.id === intent.locationId)
      const inventoryLine = intent.inventoryItemType
        ? `\n   Inventory: ${intent.inventoryQuantity}${intent.inventoryUnit ?? "kg"} ${intent.inventoryItemType}`
        : ""
      const stock = intent.inventoryItemType
        ? ctx.inventoryItems.find((i) => i.itemType === intent.inventoryItemType)
        : null
      const stockLine = stock
        ? ` (stock: ${stock.quantity.toFixed(1)} ${stock.unit})`
        : ""
      blocks.push(
        `📋 *Expense*: ${intent.notes || intent.activityCode}${location ? ` — ${location.name}` : ""}\n` +
        `   Amount: ₹${intent.amountInr.toLocaleString("en-IN")}${inventoryLine}${stockLine}\n` +
        `   Date: ${intent.date}`,
      )
    } else if (intent.type === "record_labor") {
      const location = ctx.locations.find((l) => l.id === intent.locationId)
      const total = (intent.hfLaborers + intent.outsideLaborers) * intent.costPerLaborer
      blocks.push(
        `👷 *Labor*: ${intent.notes || intent.activityCode}${location ? ` — ${location.name}` : ""}\n` +
        `   Workers: ${intent.hfLaborers} estate + ${intent.outsideLaborers} outside\n` +
        `   Cost: ₹${intent.costPerLaborer}/person = ₹${total.toLocaleString("en-IN")}\n` +
        `   Date: ${intent.date}`,
      )
    } else if (intent.type === "record_processing") {
      const location = ctx.locations.find((l) => l.id === intent.locationId)
      blocks.push(
        `⚙️ *Processing*: ${intent.coffeeType}${location ? ` — ${location.name}` : ""}\n` +
        `   Cherry: ${intent.cropToday} kg${intent.ripeToday != null ? `, Ripe: ${intent.ripeToday} kg` : ""}\n` +
        `   Date: ${intent.date}`,
      )
    } else if (intent.type === "record_picking") {
      const location = ctx.locations.find((l) => l.id === intent.locationId)
      blocks.push(
        `🍒 *Picking*${location ? ` — ${location.name}` : ""}\n` +
        `   ${intent.workerCount} pickers, ${intent.totalKg} kg total\n` +
        `   Date: ${intent.date}`,
      )
    } else if (intent.type === "query_inventory") {
      const items = intent.itemFilter
        ? ctx.inventoryItems.filter((i) =>
            i.itemType.toLowerCase().includes(intent.itemFilter!.toLowerCase()),
          )
        : ctx.inventoryItems
      const lines = items.length
        ? items.map((i) => `  • ${i.itemType}: *${i.quantity.toFixed(2)} ${i.unit}*`).join("\n")
        : "  No items found."
      return `📦 *Current Stock*\n${lines}`
    } else if (intent.type === "query_today") {
      return "📊 Checking today's activity — one moment..."
    } else if (intent.type === "unknown") {
      return `❓ I couldn't understand that. Could you rephrase?\n\nExamples:\n• "Cherry intake 280kg block A"\n• "50kg urea fertilizing, 3 laborers, ₹500 each"\n• "How much urea do we have?"`
    }
  }

  if (!blocks.length) return "Nothing to log."

  return (
    blocks.join("\n\n") +
    "\n\n✅ Reply *YES* to confirm, *NO* to cancel, or correct anything."
  )
}

// Execute a single parsed intent against the DB (internal, no HTTP session required)
async function executeIntent(
  intent: BotIntent,
  botUser: BotUser,
  ctx: TenantBotContext,
): Promise<string> {
  if (!sql || !accountsSql) throw new Error("Database not configured")

  const tenantContext = normalizeTenantContext(botUser.tenantId, botUser.role)
  const today = new Date().toISOString().slice(0, 10)

  switch (intent.type) {
    case "record_expense": {
      const locationId = await resolveLocationId(botUser.tenantId, null, ctx)
      void locationId // locationId already resolved during parse

      const rows = await accountsSql`
        INSERT INTO expense_transactions
          (entry_date, code, total_amount, notes, tenant_id, location_id)
        VALUES (
          ${intent.date || today}::timestamp,
          ${intent.activityCode},
          ${intent.amountInr},
          ${intent.notes || ""},
          ${botUser.tenantId},
          ${intent.locationId}::uuid
        )
        RETURNING id
      `
      const expenseId = toRows(rows)[0]?.id

      // Deplete inventory if specified
      if (intent.inventoryItemType && intent.inventoryQuantity && expenseId) {
        const resolvedItem = resolveInventoryItemType(intent.inventoryItemType, ctx)
        const unit = intent.inventoryUnit ?? ctx.inventoryItems.find(
          (i) => i.itemType === resolvedItem,
        )?.unit ?? "kg"

        await accountsSql`
          INSERT INTO transaction_history
            (item_type, quantity, transaction_type, notes, transaction_date, user_id, price, total_cost, tenant_id, location_id, unit)
          VALUES (
            ${resolvedItem},
            ${intent.inventoryQuantity},
            'deplete',
            ${`Used in expense: ${intent.activityCode} [expense_id:${expenseId}]`},
            ${intent.date || today}::timestamp,
            ${botUser.username},
            0,
            0,
            ${botUser.tenantId},
            ${intent.locationId}::uuid,
            ${unit}
          )
        `
      }

      const locationLabel = intent.locationId
        ? ctx.locations.find((l) => l.id === intent.locationId)?.name ?? ""
        : ""
      return `✅ Expense logged${locationLabel ? ` (${locationLabel})` : ""} — ₹${intent.amountInr.toLocaleString("en-IN")} [#${expenseId}]`
    }

    case "record_labor": {
      const totalCost =
        (intent.hfLaborers * intent.costPerLaborer) +
        (intent.outsideLaborers * intent.costPerLaborer)

      const supportsTaskDescriptionRows = await accountsSql`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'labor_transactions' AND column_name = 'task_description' LIMIT 1
      `
      const supportsTaskDescription = toRows(supportsTaskDescriptionRows).length > 0

      if (supportsTaskDescription) {
        await accountsSql`
          INSERT INTO labor_transactions
            (deployment_date, code, hf_laborers, hf_cost_per_laborer,
             outside_laborers, outside_cost_per_laborer, total_cost, notes, task_description, tenant_id, location_id)
          VALUES (
            ${intent.date || today}::date,
            ${intent.activityCode},
            ${intent.hfLaborers},
            ${intent.costPerLaborer},
            ${intent.outsideLaborers},
            ${intent.costPerLaborer},
            ${totalCost},
            ${intent.notes || ""},
            ${intent.notes || ""},
            ${botUser.tenantId},
            ${intent.locationId}::uuid
          )
        `
      } else {
        await accountsSql`
          INSERT INTO labor_transactions
            (deployment_date, code, hf_laborers, hf_cost_per_laborer,
             outside_laborers, outside_cost_per_laborer, total_cost, notes, tenant_id, location_id)
          VALUES (
            ${intent.date || today}::date,
            ${intent.activityCode},
            ${intent.hfLaborers},
            ${intent.costPerLaborer},
            ${intent.outsideLaborers},
            ${intent.costPerLaborer},
            ${totalCost},
            ${intent.notes || ""},
            ${botUser.tenantId},
            ${intent.locationId}::uuid
          )
        `
      }

      return `✅ Labor logged — ${intent.hfLaborers + intent.outsideLaborers} workers, ₹${totalCost.toLocaleString("en-IN")}`
    }

    case "record_processing": {
      await sql`
        INSERT INTO processing_records
          (process_date, coffee_type, location_id, crop_today, ripe_today, green_today, wet_parchment, tenant_id)
        VALUES (
          ${intent.date || today}::date,
          ${intent.coffeeType || "Arabica"},
          ${intent.locationId}::uuid,
          ${intent.cropToday},
          ${intent.ripeToday ?? null},
          ${intent.greenToday ?? null},
          ${intent.wetParchment ?? null},
          ${botUser.tenantId}
        )
      `
      return `✅ Processing logged — ${intent.cropToday} kg ${intent.coffeeType || "cherry"}`
    }

    case "record_picking": {
      await sql`
        INSERT INTO picking_records
          (pick_date, location_id, worker_count, total_kg, notes, tenant_id)
        VALUES (
          ${intent.date || today}::date,
          ${intent.locationId}::uuid,
          ${intent.workerCount},
          ${intent.totalKg},
          ${intent.notes || ""},
          ${botUser.tenantId}
        )
      `
      return `✅ Picking logged — ${intent.workerCount} pickers, ${intent.totalKg} kg`
    }

    case "query_inventory": {
      const rows = await sql`
        SELECT item_type, COALESCE(SUM(quantity), 0) AS qty, COALESCE(unit, 'kg') AS unit
        FROM current_inventory
        WHERE tenant_id = ${botUser.tenantId}
          ${intent.itemFilter ? sql`AND lower(item_type) ILIKE ${`%${intent.itemFilter.toLowerCase()}%`}` : sql``}
        GROUP BY item_type, unit
        ORDER BY item_type
        LIMIT 20
      `
      const items = toRows(rows)
      if (!items.length) return "📦 No inventory items found."
      return (
        "📦 *Current Stock*\n" +
        items.map((r: any) => `• ${r.item_type}: *${Number(r.qty).toFixed(2)} ${r.unit}*`).join("\n")
      )
    }

    case "query_today": {
      const rows = await Promise.all([
        sql`
          SELECT COUNT(*) AS cnt, COALESCE(SUM(crop_today), 0) AS kg
          FROM processing_records
          WHERE tenant_id = ${botUser.tenantId} AND process_date = ${today}::date
        `.catch(() => null),
        accountsSql`
          SELECT COUNT(*) AS cnt, COALESCE(SUM(total_cost), 0) AS cost
          FROM labor_transactions
          WHERE tenant_id = ${botUser.tenantId} AND deployment_date = ${today}::date
        `.catch(() => null),
        accountsSql`
          SELECT COUNT(*) AS cnt, COALESCE(SUM(total_amount), 0) AS amount
          FROM expense_transactions
          WHERE tenant_id = ${botUser.tenantId} AND entry_date::date = ${today}::date
        `.catch(() => null),
      ])

      const [proc, labor, expense] = rows.map((r) => toRows(r ?? [])[0] ?? {})
      return (
        `📊 *Today — ${today}*\n` +
        `• Processing: ${proc?.cnt ?? 0} record(s), ${Number(proc?.kg ?? 0).toFixed(0)} kg cherry\n` +
        `• Labor: ${labor?.cnt ?? 0} deployment(s), ₹${Number(labor?.cost ?? 0).toLocaleString("en-IN")}\n` +
        `• Expenses: ${expense?.cnt ?? 0} entry(ies), ₹${Number(expense?.amount ?? 0).toLocaleString("en-IN")}`
      )
    }

    default:
      return "❓ I couldn't understand that message. Try something like:\n• \"Cherry intake 280kg block A\"\n• \"How much urea do we have?\""
  }
}

// Execute all pending intents and return a combined result message
export async function executeIntents(
  intents: BotIntent[],
  botUser: BotUser,
  ctx: TenantBotContext,
): Promise<string> {
  if (!intents.length) return "Nothing to execute."

  // For read-only queries, run immediately without confirmation flow
  const readOnly = intents.every((i) => i.type === "query_inventory" || i.type === "query_today")
  if (readOnly) {
    const results = await Promise.all(intents.map((i) => executeIntent(i, botUser, ctx)))
    return results.join("\n\n")
  }

  const results: string[] = []
  for (const intent of intents) {
    try {
      results.push(await executeIntent(intent, botUser, ctx))
    } catch (err: any) {
      const msg = String(err?.message || err)
      if (msg.toLowerCase().includes("insufficient stock")) {
        results.push(`❌ Not enough stock for ${(intent as any).inventoryItemType ?? "item"}. Restock first.`)
      } else {
        results.push(`❌ Failed to log entry: ${msg}`)
      }
    }
  }

  return results.join("\n")
}
