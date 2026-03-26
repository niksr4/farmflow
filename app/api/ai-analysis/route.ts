import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"
import { buildTenantAiDataSummary } from "@/lib/server/ai-analysis"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { logServerError } from "@/lib/server/safe-logging"
import { getClaudeClient, isClaudeConfigured, extractClaudeText, CLAUDE_SONNET } from "@/lib/server/claude"
import type { InventoryItem, Transaction } from "@/lib/inventory-types"

export const dynamic = "force-dynamic"
export const revalidate = 0

const SYSTEM_PROMPT = `You are an expert agricultural business analyst specialising in multi-estate coffee and pepper operations in India.

Your job is to analyse the provided estate operations data and deliver precise, actionable insights that help the estate manager make better decisions this week — not just understand history.

Rules:
- Ground every number in the data provided. Never invent figures, percentages, or trends that are not in the dataset.
- When data is sparse or missing, say so plainly rather than speculating.
- Use INR (₹) for currency. Use KG for weight.
- Keep the tone professional but direct — estate managers are practical people.
- Format with clear markdown headers (##) and bullet points.`

const buildAnalysisPrompt = (dataSummary: string) => `Analyse the following FarmFlow estate operations data and provide actionable insights.

${dataSummary}

Provide a comprehensive analysis covering:

## 1. Processing Performance
Evaluate cherry-to-dry conversion efficiency by location and coffee type. Flag any ratios that look anomalous compared to the season average. Identify the strongest and weakest processing days.

## 2. Labor & Cost Efficiency
Review labor deployment — estate workers vs outside workers, cost per laborer per day, activity distribution. Identify weeks or periods where outside labor cost spiked relative to processing volume.

## 3. Transaction & Inventory Patterns
Analyse stock movement trends: top restocking spend, fastest-depleting items, months with unusual inflow/outflow ratios. Flag items that may need restocking soon.

## 4. Dispatch & Sales
Review dispatch volume, confirmation rates, and any pending unconfirmed dispatches. Analyse revenue by buyer — identify which buyers consistently pay above or below average price per kg.

## 5. Rainfall & Operational Timing
If rainfall data is present, correlate heavy rain periods with processing dips or labor adjustments. Suggest optimal upcoming windows for drying based on current rainfall patterns.

## 6. Key Recommendations
Provide 3–5 specific, actionable recommendations the estate manager can act on this week. Be concrete — name the location, coffee type, or cost code where relevant.`

export async function POST(req: Request) {
  try {
    const sessionUser = await requireModuleAccess("ai-analysis")
    const rateLimit = await checkRateLimit("aiAnalysis", sessionUser.tenantId)
    const rateHeaders = buildRateLimitHeaders(rateLimit)
    if (!rateLimit.success) {
      return Response.json({ success: false, error: "Rate limit exceeded" }, { status: 429, headers: rateHeaders })
    }

    if (!isClaudeConfigured()) {
      return Response.json({ success: false, error: "AI analysis is not configured" }, { status: 503, headers: rateHeaders })
    }

    const body = await req.json().catch(() => ({}))
    const inventory = Array.isArray(body?.inventory) ? (body.inventory as InventoryItem[]) : []
    const transactions = Array.isArray(body?.transactions) ? (body.transactions as Transaction[]) : []

    const { dataSummary } = await buildTenantAiDataSummary({
      tenantId: sessionUser.tenantId,
      role: sessionUser.role,
      inventory,
      transactions,
    })

    const client = getClaudeClient()
    const message = await client.messages.create({
      model: CLAUDE_SONNET,
      max_tokens: 2048,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildAnalysisPrompt(dataSummary) }],
    })

    const analysisText = extractClaudeText(message)

    return Response.json(
      { success: true, analysis: analysisText || "No analysis could be generated from the current data." },
      { headers: rateHeaders },
    )
  } catch (error) {
    logServerError("AI Analysis error", error)
    if (isModuleAccessError(error)) {
      return Response.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to generate analysis" },
      { status: 500 },
    )
  }
}
