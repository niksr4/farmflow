import "server-only"

import { getClaudeClient, CLAUDE_HAIKU } from "@/lib/server/claude"
import { buildBotSystemPrompt, BOT_TOOLS } from "./tools"
import type { BotIntent, TenantBotContext } from "./types"

function resolveLocationFromCtx(
  locationName: string | null | undefined,
  ctx: TenantBotContext,
): string | null {
  if (!locationName) return null
  const lower = locationName.toLowerCase().trim()
  const match = ctx.locations.find(
    (l) => l.name.toLowerCase() === lower || l.name.toLowerCase().includes(lower),
  )
  return match?.id ?? null
}

function resolveInventoryItem(
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

// Parse a raw WhatsApp message into one or more BotIntents using Claude
export async function parseMessage(
  message: string,
  ctx: TenantBotContext,
): Promise<BotIntent[]> {
  const client = getClaudeClient()
  const today = ctx.today

  const response = await client.messages.create({
    model: CLAUDE_HAIKU,
    max_tokens: 1024,
    system: buildBotSystemPrompt(ctx),
    tools: BOT_TOOLS,
    tool_choice: { type: "any" },
    messages: [{ role: "user", content: message }],
  })

  const intents: BotIntent[] = []

  for (const block of response.content) {
    if (block.type !== "tool_use") continue

    const input = block.input as Record<string, any>

    switch (block.name) {
      case "record_expense": {
        intents.push({
          type: "record_expense",
          activityCode: String(input.activity_code || "MISC"),
          date: String(input.date || today),
          amountInr: Number(input.amount_inr ?? 0),
          notes: String(input.notes || ""),
          inventoryItemType: resolveInventoryItem(input.inventory_item_type, ctx),
          inventoryQuantity: input.inventory_quantity != null ? Number(input.inventory_quantity) : null,
          inventoryUnit: input.inventory_unit ? String(input.inventory_unit) : null,
          locationId: resolveLocationFromCtx(input.location_name, ctx),
        })
        break
      }

      case "record_labor": {
        intents.push({
          type: "record_labor",
          date: String(input.date || today),
          activityCode: String(input.activity_code || "LABOR"),
          notes: String(input.notes || ""),
          hfLaborers: Number(input.hf_laborers ?? 0),
          outsideLaborers: Number(input.outside_laborers ?? 0),
          costPerLaborer: Number(input.cost_per_laborer ?? 0),
          locationId: resolveLocationFromCtx(input.location_name, ctx),
        })
        break
      }

      case "record_processing": {
        intents.push({
          type: "record_processing",
          date: String(input.date || today),
          coffeeType: String(input.coffee_type || "Arabica"),
          locationId: resolveLocationFromCtx(input.location_name, ctx),
          cropToday: Number(input.crop_today ?? 0),
          ripeToday: input.ripe_today != null ? Number(input.ripe_today) : null,
          greenToday: input.green_today != null ? Number(input.green_today) : null,
          wetParchment: input.wet_parchment != null ? Number(input.wet_parchment) : null,
        })
        break
      }

      case "record_picking": {
        intents.push({
          type: "record_picking",
          date: String(input.date || today),
          locationId: resolveLocationFromCtx(input.location_name, ctx),
          workerCount: Number(input.worker_count ?? 0),
          totalKg: Number(input.total_kg ?? 0),
          notes: String(input.notes || ""),
        })
        break
      }

      case "query_inventory": {
        intents.push({
          type: "query_inventory",
          itemFilter: input.item_filter ? String(input.item_filter) : null,
        })
        break
      }

      case "query_today": {
        intents.push({ type: "query_today" })
        break
      }

      default: {
        intents.push({ type: "unknown", rawMessage: message })
      }
    }
  }

  if (!intents.length) {
    intents.push({ type: "unknown", rawMessage: message })
  }

  return intents
}
