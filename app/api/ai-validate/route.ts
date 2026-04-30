import { NextResponse } from "next/server"
import { sql, accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { getClaudeClient, CLAUDE_HAIKU, isClaudeConfigured, extractClaudeText } from "@/lib/server/claude"

export const dynamic = "force-dynamic"
export const revalidate = 0

type ValidateRequest = {
  field: string      // e.g. "processing.cropToday", "expense.amount", "labor.workerCount"
  value: number | string
  context?: Record<string, unknown>  // surrounding form data for richer validation
}

type ValidateResponse = {
  ok: boolean
  warning: string | null
  severity: "info" | "warning" | "error" | null
}

// Build a compact historical baseline for the relevant field
async function buildBaseline(
  field: string,
  tenantId: string,
  context: Record<string, unknown>,
): Promise<string> {
  if (!sql || !accountsSql) return "No historical data available."

  try {
    if (field === "processing.cropToday") {
      const locationId = context?.locationId as string | null
      const coffeeType = context?.coffeeType as string | null

      const rows = await sql`
        SELECT
          AVG(crop_today) AS avg,
          STDDEV(crop_today) AS stddev,
          MIN(crop_today) AS min,
          MAX(crop_today) AS max,
          COUNT(*) AS cnt
        FROM processing_records
        WHERE tenant_id = ${tenantId}
          AND crop_today > 0
          AND process_date >= CURRENT_DATE - INTERVAL '60 days'
          ${locationId ? sql`AND location_id = ${locationId}::uuid` : sql``}
          ${coffeeType ? sql`AND coffee_type = ${coffeeType}` : sql``}
        LIMIT 1
      `
      const r = (Array.isArray(rows) ? rows[0] : (rows as any)?.rows?.[0]) ?? {}
      if (!r.cnt || Number(r.cnt) < 3) return "Insufficient history to compute baseline (< 3 records)."
      return `Last 60 days — avg: ${Number(r.avg).toFixed(0)} kg, stddev: ${Number(r.stddev).toFixed(0)} kg, range: ${Number(r.min).toFixed(0)}–${Number(r.max).toFixed(0)} kg (${r.cnt} records)`
    }

    if (field === "processing.wetParchment" || field === "processing.dryParch") {
      const cropToday = Number(context?.cropToday ?? 0)
      if (!cropToday) return "No cherry intake value to compare against."
      const parchField = field === "processing.wetParchment" ? "wet_parchment" : "dry_parch"
      const rows = await sql`
        SELECT AVG(${sql.unsafe(parchField)} / NULLIF(crop_today, 0) * 100) AS avg_ratio, COUNT(*) AS cnt
        FROM processing_records
        WHERE tenant_id = ${tenantId}
          AND crop_today > 0
          AND ${sql.unsafe(parchField)} > 0
          AND process_date >= CURRENT_DATE - INTERVAL '60 days'
      `
      const r = (Array.isArray(rows) ? rows[0] : (rows as any)?.rows?.[0]) ?? {}
      if (!r.cnt || Number(r.cnt) < 3) return "Insufficient history."
      return `Average conversion ratio last 60 days: ${Number(r.avg_ratio).toFixed(1)}%`
    }

    if (field === "expense.amount") {
      const code = String(context?.code ?? "")
      if (!code) return "No activity code to baseline against."
      const rows = await accountsSql`
        SELECT AVG(total_amount) AS avg, MAX(total_amount) AS max, COUNT(*) AS cnt
        FROM expense_transactions
        WHERE tenant_id = ${tenantId}
          AND code = ${code}
          AND total_amount > 0
          AND entry_date >= NOW() - INTERVAL '90 days'
      `
      const r = (Array.isArray(rows) ? rows[0] : (rows as any)?.rows?.[0]) ?? {}
      if (!r.cnt || Number(r.cnt) < 2) return "Insufficient history for this activity."
      return `Last 90 days for ${code} — avg: ₹${Number(r.avg).toFixed(0)}, max: ₹${Number(r.max).toFixed(0)} (${r.cnt} records)`
    }

    if (field === "labor.workerCount") {
      const rows = await accountsSql`
        SELECT AVG(hf_laborers + outside_laborers) AS avg, MAX(hf_laborers + outside_laborers) AS max, COUNT(*) AS cnt
        FROM labor_transactions
        WHERE tenant_id = ${tenantId}
          AND deployment_date >= CURRENT_DATE - INTERVAL '60 days'
      `
      const r = (Array.isArray(rows) ? rows[0] : (rows as any)?.rows?.[0]) ?? {}
      if (!r.cnt || Number(r.cnt) < 3) return "Insufficient history."
      return `Last 60 days — avg workers/day: ${Number(r.avg).toFixed(1)}, max: ${r.max}`
    }

    if (field === "inventory.quantity") {
      const itemType = String(context?.itemType ?? "")
      if (!itemType) return ""
      const rows = await sql`
        SELECT COALESCE(SUM(quantity), 0) AS current_stock, COALESCE(unit, 'kg') AS unit
        FROM current_inventory
        WHERE tenant_id = ${tenantId}
          AND lower(item_type) = lower(${itemType})
        GROUP BY unit
        LIMIT 1
      `
      const r = (Array.isArray(rows) ? rows[0] : (rows as any)?.rows?.[0]) ?? {}
      return `Current stock: ${Number(r.current_stock).toFixed(2)} ${r.unit ?? "kg"}`
    }
  } catch {
    // Non-critical — baseline failure should not block the UI
  }

  return "No baseline data available."
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("inventory")
    if (!isClaudeConfigured()) {
      return NextResponse.json<ValidateResponse>({ ok: true, warning: null, severity: null })
    }

    const body: ValidateRequest = await request.json().catch(() => ({ field: "", value: "" }))
    const { field, value, context = {} } = body

    if (!field || value === "" || value === null || value === undefined) {
      return NextResponse.json<ValidateResponse>({ ok: true, warning: null, severity: null })
    }

    const baseline = await buildBaseline(field, sessionUser.tenantId, context)
    const client = getClaudeClient()

    const fieldLabel: Record<string, string> = {
      "processing.cropToday": "daily cherry intake (kg)",
      "processing.wetParchment": "wet parchment yield (kg)",
      "processing.dryParch": "dry parchment yield (kg)",
      "expense.amount": "expense amount (INR)",
      "labor.workerCount": "number of workers",
      "inventory.quantity": "inventory quantity",
    }

    const prompt = `You are a data validation assistant for an Indian coffee estate management system.

Field being validated: ${fieldLabel[field] ?? field}
Value entered: ${value}
Historical baseline: ${baseline}
Additional context: ${JSON.stringify(context)}

Evaluate whether this value is plausible. Consider:
- Is it statistically anomalous vs the historical baseline?
- Is it physically possible (e.g., cherry kg can't exceed estate capacity)?
- Could it be a data entry error (e.g., extra zero, wrong unit)?

Respond with ONLY a JSON object:
{
  "ok": true or false,
  "warning": "concise human-readable warning in ≤15 words, or null if no concern",
  "severity": "info" | "warning" | "error" | null
}

Examples of good warnings:
- "This is 3× your 60-day average — double-check the quantity."
- "Amount exceeds maximum ever recorded for this activity."
- "Insufficient stock for this withdrawal."
Be silent (null) for normal values.`

    const response = await client.messages.create({
      model: CLAUDE_HAIKU,
      max_tokens: 128,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    })

    const raw = extractClaudeText(response).trim()
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json<ValidateResponse>({ ok: true, warning: null, severity: null })
    }

    const parsed: ValidateResponse = JSON.parse(jsonMatch[0])
    return NextResponse.json<ValidateResponse>({
      ok: parsed.ok ?? true,
      warning: parsed.warning ?? null,
      severity: parsed.severity ?? null,
    })
  } catch (err: any) {
    if (isModuleAccessError(err)) {
      return NextResponse.json<ValidateResponse>({ ok: true, warning: null, severity: null })
    }
    // Non-critical — swallow errors so validation never blocks form submission
    return NextResponse.json<ValidateResponse>({ ok: true, warning: null, severity: null })
  }
}
