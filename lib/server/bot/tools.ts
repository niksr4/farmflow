import "server-only"

import type Anthropic from "@anthropic-ai/sdk"
import type { TenantBotContext } from "./types"

// Build the Claude system prompt with tenant context injected
export function buildBotSystemPrompt(ctx: TenantBotContext): string {
  const locationList = ctx.locations.length
    ? ctx.locations.map((l) => `  - "${l.name}" (id: ${l.id})`).join("\n")
    : "  (no locations configured)"

  const inventoryList = ctx.inventoryItems.length
    ? ctx.inventoryItems
        .map((i) => `  - ${i.itemType}: ${i.quantity.toFixed(2)} ${i.unit}`)
        .join("\n")
    : "  (no inventory items)"

  const activityList = ctx.activityCodes.length
    ? ctx.activityCodes.map((a) => `  - ${a.code}: ${a.activity}`).join("\n")
    : "  (no activity codes configured)"

  return `You are FarmFlow's WhatsApp data-entry assistant for ${ctx.tenantName}.
Today's date: ${ctx.today}. Primary crop: ${ctx.cropFamily}.

You parse natural-language messages from estate supervisors and map them to structured farm operations.
Always extract every action mentioned. A single message may contain multiple operations.

## Estate Locations
${locationList}

## Current Inventory (stock levels)
${inventoryList}

## Activity Codes (for expenses and labor)
${activityList}

## Rules
- When the user mentions a location by name, match it to the closest location above and use its id.
- When the user mentions an inventory item, match it case-insensitively to the items above.
- Default date is ${ctx.today} unless the user says "yesterday" or a specific date.
- If amount/cost is not mentioned, use 0.
- If worker count is ambiguous between estate and outside workers, put them all in hf_laborers.
- Always call at least one tool. If you cannot parse anything useful, call record_unknown.
- Do NOT make up inventory items, locations, or activity codes that are not listed above.`
}

// Claude tool definitions — these map directly to DB operations
export const BOT_TOOLS: Anthropic.Tool[] = [
  {
    name: "record_expense",
    description:
      "Log an expense transaction (fertilizer, spray, fuel, tools, etc.) that may also consume inventory stock.",
    input_schema: {
      type: "object" as const,
      properties: {
        activity_code: {
          type: "string",
          description: "Expense activity code (e.g. FERT, SPRAY, FUEL). Match from the activity codes list.",
        },
        date: { type: "string", description: "ISO date YYYY-MM-DD. Default: today." },
        amount_inr: { type: "number", description: "Cost in INR. Use 0 if not mentioned." },
        notes: { type: "string", description: "Free-text description of the activity." },
        inventory_item_type: {
          type: "string",
          description: "Inventory item consumed (exact name from the inventory list). Null if none consumed.",
        },
        inventory_quantity: {
          type: "number",
          description: "Quantity of inventory consumed. Null if not specified.",
        },
        inventory_unit: { type: "string", description: "Unit (kg, L, bags). Match from inventory list." },
        location_name: {
          type: "string",
          description: "Location/block name if mentioned. Must match a location from the list.",
        },
      },
      required: ["activity_code", "amount_inr"],
    },
  },
  {
    name: "record_labor",
    description: "Log a labor deployment — workers assigned to a task for the day.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: { type: "string", description: "ISO date YYYY-MM-DD. Default: today." },
        activity_code: {
          type: "string",
          description: "Labor activity code. Match from the activity codes list.",
        },
        notes: { type: "string", description: "Description of the work done." },
        hf_laborers: { type: "number", description: "Number of estate/home-farm laborers." },
        outside_laborers: { type: "number", description: "Number of hired outside laborers." },
        cost_per_laborer: { type: "number", description: "Cost per laborer in INR. Use 0 if not mentioned." },
        location_name: { type: "string", description: "Location/block name if mentioned." },
      },
      required: ["activity_code", "hf_laborers", "outside_laborers"],
    },
  },
  {
    name: "record_processing",
    description: "Log a daily coffee/crop processing entry (cherry intake, wet parchment yield, etc.).",
    input_schema: {
      type: "object" as const,
      properties: {
        date: { type: "string", description: "ISO date YYYY-MM-DD. Default: today." },
        coffee_type: {
          type: "string",
          description: "Crop/coffee type (e.g. Arabica, Robusta). Default: Arabica.",
        },
        location_name: { type: "string", description: "Location/pulping unit name if mentioned." },
        crop_today: { type: "number", description: "Total cherry received today (kg)." },
        ripe_today: { type: "number", description: "Ripe cherry (kg). Optional." },
        green_today: { type: "number", description: "Green cherry (kg). Optional." },
        wet_parchment: { type: "number", description: "Wet parchment output (kg). Optional." },
      },
      required: ["crop_today"],
    },
  },
  {
    name: "record_picking",
    description: "Log a picking/harvest entry for a day.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: { type: "string", description: "ISO date YYYY-MM-DD. Default: today." },
        location_name: { type: "string", description: "Block/location name if mentioned." },
        worker_count: { type: "number", description: "Number of pickers." },
        total_kg: { type: "number", description: "Total kg picked." },
        notes: { type: "string", description: "Any notes." },
      },
      required: ["worker_count", "total_kg"],
    },
  },
  {
    name: "query_inventory",
    description: "Check current stock levels. Use when the user asks 'how much X do we have'.",
    input_schema: {
      type: "object" as const,
      properties: {
        item_filter: {
          type: "string",
          description: "Partial name to filter by (e.g. 'urea'). Null = show all items.",
        },
      },
      required: [],
    },
  },
  {
    name: "query_today",
    description: "Summarise what has been logged today for this estate.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "record_unknown",
    description: "Call this when you cannot parse any actionable intent from the message.",
    input_schema: {
      type: "object" as const,
      properties: {
        raw_message: { type: "string", description: "The original unparseable message." },
      },
      required: ["raw_message"],
    },
  },
]
