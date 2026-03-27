import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logServerError } from "@/lib/server/safe-logging"
import { getClaudeClient, isClaudeConfigured, extractClaudeText, CLAUDE_HAIKU } from "@/lib/server/claude"

export const dynamic = "force-dynamic"
export const revalidate = 0

// Flag an entry if its conversion deviates more than this percentage from the historical average.
const ANOMALY_THRESHOLD_PCT = 20

export async function POST(req: Request) {
  try {
    const sessionUser = await requireModuleAccess("processing")

    if (!sql) {
      return Response.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const body = await req.json().catch(() => ({}))
    const cropToday = Number(body?.cropToday)
    const dryParch = Number(body?.dryParch)
    const coffeeType = typeof body?.coffeeType === "string" ? body.coffeeType.trim() : null
    const locationId = typeof body?.locationId === "string" ? body.locationId.trim() : null

    // Need valid positive values to compute a conversion rate
    if (!cropToday || cropToday <= 0 || dryParch == null || dryParch < 0) {
      return Response.json({ success: true, anomaly: false })
    }

    const currentRate = (dryParch / cropToday) * 100

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    // Fetch the last 90 days of processing records for this tenant to build a baseline.
    // We scope to coffeeType when provided, falling back to all types if the history is thin.
    const params: any[] = [tenantContext.tenantId]
    let whereClause = `tenant_id = $1 AND crop_today > 0 AND dry_parch > 0 AND process_date >= CURRENT_DATE - INTERVAL '90 days'`

    if (coffeeType) {
      params.push(coffeeType)
      whereClause += ` AND coffee_type = $${params.length}`
    }

    if (locationId) {
      params.push(locationId)
      whereClause += ` AND location_id = $${params.length}`
    }

    const historyRows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT crop_today, dry_parch
        FROM processing_records
        WHERE ${sql.unsafe(whereClause)}
        ORDER BY process_date DESC
        LIMIT 60
      `,
    )

    const rows: Array<{ crop_today: number; dry_parch: number }> = Array.isArray(historyRows)
      ? historyRows
      : ((historyRows as any)?.rows ?? [])

    // Need at least 5 historical data points for a meaningful baseline
    if (rows.length < 5) {
      return Response.json({ success: true, anomaly: false })
    }

    const rates = rows.map((r) => (Number(r.dry_parch) / Number(r.crop_today)) * 100)
    const historicalAvg = rates.reduce((sum, r) => sum + r, 0) / rates.length

    const deviation = Math.abs(currentRate - historicalAvg)
    const deviationPct = historicalAvg > 0 ? (deviation / historicalAvg) * 100 : 0

    if (deviationPct < ANOMALY_THRESHOLD_PCT) {
      return Response.json({ success: true, anomaly: false, currentRate, historicalAvg })
    }

    // Anomaly detected — generate a human-readable message if Claude is available
    let message = `Conversion rate of ${currentRate.toFixed(1)}% is ${deviationPct.toFixed(0)}% away from your ${coffeeType || "recent"} average of ${historicalAvg.toFixed(1)}%.`

    if (isClaudeConfigured()) {
      try {
        const client = getClaudeClient()
        const direction = currentRate < historicalAvg ? "lower" : "higher"
        const response = await client.messages.create({
          model: CLAUDE_HAIKU,
          max_tokens: 120,
          temperature: 0.2,
          system:
            "You are a concise estate operations assistant. Write one plain-language sentence (under 25 words) flagging a conversion rate anomaly. No markdown.",
          messages: [
            {
              role: "user",
              content: `The ${coffeeType || "coffee"} dry-parchment conversion rate today is ${currentRate.toFixed(1)}% — ${direction} than the 90-day average of ${historicalAvg.toFixed(1)}%. Write a one-sentence flag for the estate manager.`,
            },
          ],
        })
        const generated = extractClaudeText(response).trim()
        if (generated) message = generated
      } catch {
        // Fall back to the computed message above
      }
    }

    return Response.json({
      success: true,
      anomaly: true,
      currentRate: Math.round(currentRate * 10) / 10,
      historicalAvg: Math.round(historicalAvg * 10) / 10,
      deviationPct: Math.round(deviationPct),
      message,
    })
  } catch (error) {
    logServerError("Processing anomaly check error", error)
    if (isModuleAccessError(error)) {
      return Response.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to check anomaly" },
      { status: 500 },
    )
  }
}
