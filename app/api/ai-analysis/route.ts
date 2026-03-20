import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"
import { fetchWithTimeout } from "@/lib/server/http"
import { buildTenantAiDataSummary } from "@/lib/server/ai-analysis"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { logServerError } from "@/lib/server/safe-logging"
import type { InventoryItem, Transaction } from "@/lib/inventory-types"

export async function POST(req: Request) {
  try {
    const sessionUser = await requireModuleAccess("ai-analysis")
    const rateLimit = await checkRateLimit("aiAnalysis", sessionUser.tenantId)
    const rateHeaders = buildRateLimitHeaders(rateLimit)
    if (!rateLimit.success) {
      return Response.json({ success: false, error: "Rate limit exceeded" }, { status: 429, headers: rateHeaders })
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

    const groqApiKey = String(process.env.GROQ_API_KEY || "").trim()
    if (!groqApiKey) {
      return Response.json({ success: false, error: "AI analysis is not configured" }, { status: 503, headers: rateHeaders })
    }

    const groqResponse = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "You are an expert agricultural business analyst for a multi-estate coffee and pepper operation in India. Provide detailed, actionable insights based on the data provided.",
          },
          {
            role: "user",
            content: `Analyze the following data from the FarmFlow operations system and provide actionable insights.

${dataSummary}

Please provide a comprehensive analysis covering:

0. **Transaction Patterns (priority)**: Focus on transaction history trends, volumes, and costs. Use current inventory only as a secondary snapshot.

1. **Inventory Insights**: Analyze stock levels, consumption patterns, and restocking needs. Identify items that may need attention.

2. **Processing Performance**: Evaluate coffee processing efficiency across locations and coffee types. Compare yields, dry parchment vs dry cherry output, and identify any anomalies or trends.

3. **Labor & Cost Analysis**: Review labor deployment patterns - estate workers vs outside workers, cost per day, and activity distribution. Identify opportunities for cost optimization and labor efficiency.

4. **Weather Impact**: If rainfall data is available, correlate it with processing activities and suggest optimal timing for various operations.

5. **Cross-Tab Patterns**: Identify connections between different data points (e.g., labor costs vs processing output, inventory consumption vs processing volume, rainfall vs labor deployment).

6. **Recommendations**: Provide 3-5 specific, actionable recommendations to improve operations, reduce costs, and increase efficiency.

Format your response with clear sections using markdown headers (##). Keep the tone professional but accessible. Be specific with numbers and percentages where data allows.`,
          },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
      timeoutMs: 15_000,
    })

    if (!groqResponse.ok) {
      const errorData = await groqResponse.json().catch(() => ({}))
      throw new Error(errorData.error?.message || "Groq API request failed")
    }

    const groqData = await groqResponse.json()
    const analysisText = groqData.choices?.[0]?.message?.content || "No analysis generated"

    return Response.json({
      success: true,
      analysis: analysisText,
    }, { headers: rateHeaders })
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
