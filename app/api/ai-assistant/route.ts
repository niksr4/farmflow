import { buildAssistantWorkspaceContextSummary, sanitizeAssistantMessages } from "@/lib/ai-assistant"
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"
import { buildTenantAiDataSummary } from "@/lib/server/ai-analysis"
import { getClaudeClient, isClaudeConfigured, extractClaudeText, CLAUDE_HAIKU } from "@/lib/server/claude"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { logServerError } from "@/lib/server/safe-logging"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function POST(req: Request) {
  try {
    const sessionUser = await requireModuleAccess("ai-analysis")
    if (!sessionUser.tenantId) {
      return Response.json(
        { success: false, error: "Open a tenant workspace first before using the assistant." },
        { status: 400 },
      )
    }

    const rateLimit = await checkRateLimit("aiAssistant", sessionUser.tenantId)
    const rateHeaders = buildRateLimitHeaders(rateLimit)
    if (!rateLimit.success) {
      return Response.json({ success: false, error: "Rate limit exceeded" }, { status: 429, headers: rateHeaders })
    }

    const body = await req.json().catch(() => ({}))
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
    })

    if (!isClaudeConfigured()) {
      return Response.json({ success: false, error: "AI assistant is not configured" }, { status: 503, headers: rateHeaders })
    }

    const systemPrompt = `You are FarmFlow Assistant, a concise operations guide for coffee estates. Answer only from the tenant data and workspace guidance provided. Help users understand their data, explain discrepancies, and point them to the exact FarmFlow workspace or button they should use. If data is missing, say so plainly. Do not invent numbers or hidden features. Keep answers practical and easy to follow.`

    const groundingMessage = `Grounding context for the current tenant:

${dataSummary}
${workspaceContextSummary ? `\n${workspaceContextSummary}\n` : ""}
Treat the tenant data above as the working dataset for ${fiscalYearLabel}. Use the exact workspace labels from the navigation guidance when telling the user where to go.`

    // Prepend grounding as the first user message, then alternate correctly for Claude
    const claudeMessages: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: groundingMessage },
      { role: "assistant", content: "Understood. I have your estate data and workspace context loaded. How can I help?" },
      ...messages,
    ]

    const client = getClaudeClient()
    const claudeResponse = await client.messages.create({
      model: CLAUDE_HAIKU,
      max_tokens: 900,
      temperature: 0.25,
      system: systemPrompt,
      messages: claudeMessages,
    })

    const answer = extractClaudeText(claudeResponse).trim()

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
