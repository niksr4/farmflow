import { buildAssistantWorkspaceContextSummary, sanitizeAssistantMessages } from "@/lib/ai-assistant"
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"
import { fetchWithTimeout } from "@/lib/server/http"
import { buildTenantAiDataSummary } from "@/lib/server/ai-analysis"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { logServerError } from "@/lib/server/safe-logging"
import type { InventoryItem, Transaction } from "@/lib/inventory-types"

export async function POST(req: Request) {
  try {
    const sessionUser = await requireModuleAccess("ai-analysis")
    const rateLimit = await checkRateLimit("aiAssistant", sessionUser.tenantId)
    const rateHeaders = buildRateLimitHeaders(rateLimit)
    if (!rateLimit.success) {
      return Response.json({ success: false, error: "Rate limit exceeded" }, { status: 429, headers: rateHeaders })
    }

    const body = await req.json().catch(() => ({}))
    const inventory = Array.isArray(body?.inventory) ? (body.inventory as InventoryItem[]) : []
    const transactions = Array.isArray(body?.transactions) ? (body.transactions as Transaction[]) : []
    const messages = sanitizeAssistantMessages(body?.messages)
    if (!messages.length || messages[messages.length - 1]?.role !== "user") {
      return Response.json({ success: false, error: "A user question is required" }, { status: 400, headers: rateHeaders })
    }

    const workspaceContextSummary = buildAssistantWorkspaceContextSummary({
      currentWorkspaceLabel: typeof body?.currentWorkspaceLabel === "string" ? body.currentWorkspaceLabel : null,
      availableWorkspaces: Array.isArray(body?.availableWorkspaces) ? body.availableWorkspaces : [],
      workspaceHints: Array.isArray(body?.workspaceHints) ? body.workspaceHints : [],
    })

    const { dataSummary, fiscalYearLabel } = await buildTenantAiDataSummary({
      tenantId: sessionUser.tenantId,
      role: sessionUser.role,
      inventory,
      transactions,
    })

    const groqApiKey = String(process.env.GROQ_API_KEY || "").trim()
    if (!groqApiKey) {
      return Response.json({ success: false, error: "AI assistant is not configured" }, { status: 503, headers: rateHeaders })
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
              "You are FarmFlow Assistant, a concise operations guide for coffee estates. Answer only from the tenant data and workspace guidance provided. Help users understand their data, explain discrepancies, and point them to the exact FarmFlow workspace or button they should use. If data is missing, say so plainly. Do not invent numbers or hidden features. Keep answers practical and easy to follow.",
          },
          {
            role: "user",
            content: `Grounding context for the current tenant:

${dataSummary}

${workspaceContextSummary ? `\n${workspaceContextSummary}\n` : ""}

Treat the tenant data above as the working dataset for ${fiscalYearLabel}. Use the exact workspace labels from the navigation guidance when telling the user where to go.`,
          },
          ...messages,
        ],
        max_tokens: 900,
        temperature: 0.25,
      }),
      timeoutMs: 18_000,
    })

    if (!groqResponse.ok) {
      const errorData = await groqResponse.json().catch(() => ({}))
      throw new Error(errorData.error?.message || "Groq API request failed")
    }

    const groqData = await groqResponse.json()
    const answer = String(groqData.choices?.[0]?.message?.content || "").trim()

    return Response.json(
      {
        success: true,
        answer: answer || "I could not generate a useful answer from the current tenant data.",
      },
      { headers: rateHeaders },
    )
  } catch (error) {
    logServerError("AI Assistant error", error)
    if (isModuleAccessError(error)) {
      return Response.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to answer assistant question" },
      { status: 500 },
    )
  }
}
