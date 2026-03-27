import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"
import { buildTenantAiDataSummary } from "@/lib/server/ai-analysis"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { logServerError } from "@/lib/server/safe-logging"
import { getClaudeClient, isClaudeConfigured, extractClaudeText, CLAUDE_HAIKU } from "@/lib/server/claude"

export const dynamic = "force-dynamic"
export const revalidate = 0

export type ProactiveInsight = {
  text: string
  severity: "good" | "warning" | "info"
}

const SYSTEM_PROMPT = `You are FarmFlow Smart Insights, an expert agricultural analyst for coffee estates in India.

Your job is to scan estate operations data and surface the 3 most important signals the manager should know about right now — things that are trending wrong, unusually good, or need action today.

Rules:
- Ground every number in the data provided. Never invent figures.
- Be specific: name the location, coffee type, or cost code where relevant.
- Use plain language. One sentence per insight.
- Use INR (₹) for currency, KG for weight.
- Respond ONLY with valid JSON — no markdown, no extra text.`

const buildInsightPrompt = (dataSummary: string) => `
Given this estate operations data, identify exactly 3 insights the manager most needs to know right now.

${dataSummary}

Return ONLY this JSON structure:
{
  "insights": [
    { "text": "<one sentence insight with specific numbers>", "severity": "warning" | "good" | "info" },
    { "text": "<one sentence insight with specific numbers>", "severity": "warning" | "good" | "info" },
    { "text": "<one sentence insight with specific numbers>", "severity": "warning" | "good" | "info" }
  ]
}

Severity guide:
- "warning": something is declining, anomalous, or needs attention
- "good": a metric is performing well or has improved
- "info": a neutral but important operational fact

If data is sparse, return fewer insights. If there is no meaningful data, return an empty insights array.`

export async function GET() {
  try {
    const sessionUser = await requireModuleAccess("ai-analysis")
    const rateLimit = await checkRateLimit("aiProactiveInsights", sessionUser.tenantId)
    const rateHeaders = buildRateLimitHeaders(rateLimit)

    if (!rateLimit.success) {
      return Response.json(
        { success: false, error: "Rate limit exceeded. Insights refresh every 30 minutes." },
        { status: 429, headers: rateHeaders },
      )
    }

    if (!isClaudeConfigured()) {
      return Response.json({ success: false, error: "AI is not configured" }, { status: 503, headers: rateHeaders })
    }

    const { dataSummary } = await buildTenantAiDataSummary({
      tenantId: sessionUser.tenantId,
      role: sessionUser.role,
    })

    const client = getClaudeClient()
    const message = await client.messages.create({
      model: CLAUDE_HAIKU,
      max_tokens: 600,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildInsightPrompt(dataSummary) }],
    })

    const raw = extractClaudeText(message).trim()

    let insights: ProactiveInsight[] = []
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.insights)) {
        insights = parsed.insights
          .filter(
            (i: any) =>
              typeof i?.text === "string" &&
              i.text.trim().length > 0 &&
              ["good", "warning", "info"].includes(i?.severity),
          )
          .slice(0, 3)
      }
    } catch {
      // Claude returned something non-JSON — surface nothing rather than bad data
    }

    return Response.json({ success: true, insights }, { headers: rateHeaders })
  } catch (error) {
    logServerError("Proactive insights error", error)
    if (isModuleAccessError(error)) {
      return Response.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to generate insights" },
      { status: 500 },
    )
  }
}
