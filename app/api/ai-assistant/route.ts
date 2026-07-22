import {
  buildAssistantWorkspaceContextFromModules,
  buildAssistantWorkspaceContextSummary,
  sanitizeAssistantMessages,
} from "@/lib/ai-assistant"
import { findAssistantActions } from "@/lib/assistant-search"
import { buildAgronomyContext } from "@/lib/coffee-agronomy"
import { resolveFiscalYearWindows } from "@/lib/fiscal-year-utils"
import { buildRateLimitHeaders, checkRateLimit } from "@/lib/rate-limit"
import { buildTenantAiDataSummary } from "@/lib/server/ai-analysis"
import { buildClaudeRouteErrorResponse, classifyClaudeRouteError } from "@/lib/server/claude-errors"
import { CLAUDE_HAIKU } from "@/lib/server/claude"
import { callAI, isAIConfigured } from "@/lib/server/ai-provider"
import { searchAssistantData } from "@/lib/server/assistant-search"
import { getEnabledModules, isModuleAccessError } from "@/lib/server/module-access"
import { requireSessionUser } from "@/lib/server/auth"
import { logServerError, logServerWarning } from "@/lib/server/safe-logging"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"

export const dynamic = "force-dynamic"
export const revalidate = 0

const AGRONOMY_CONTEXT = buildAgronomyContext()

const normalizePreviewRole = (value: unknown) => {
  const normalized = String(value || "").trim().toLowerCase()
  return normalized === "admin" || normalized === "user" ? normalized : null
}

const buildSearchFallbackAnswer = (input: {
  currentWorkspaceLabel: string | null
  actionsCount: number
  resultsCount: number
  aiUnavailableReason?: string
}) => {
  const reason = input.aiUnavailableReason
    ? `I could not run the full AI analysis right now because ${input.aiUnavailableReason}.`
    : "I could not run the full AI analysis right now."

  if (input.resultsCount > 0 && input.actionsCount > 0) {
    return `${reason} I did find matching records and direct links you can use next${input.currentWorkspaceLabel ? ` from ${input.currentWorkspaceLabel}` : ""}.`
  }
  if (input.resultsCount > 0) {
    return `${reason} I did find matching records you can open directly${input.currentWorkspaceLabel ? ` from ${input.currentWorkspaceLabel}` : ""}.`
  }
  if (input.actionsCount > 0) {
    return `${reason} I did find the closest FarmFlow pages for that task${input.currentWorkspaceLabel ? ` from ${input.currentWorkspaceLabel}` : ""}.`
  }

  return `${reason} Try a more specific keyword such as an item name, worker, buyer, location, or account code.`
}

export async function POST(req: Request) {
  let rateHeaders: Record<string, string> = {}
  try {
    const sessionUser = await requireSessionUser()
    if (!sessionUser.tenantId) {
      return Response.json(
        { success: false, error: "Open a tenant workspace first before using the assistant." },
        { status: 400 },
      )
    }

    const rateLimit = await checkRateLimit("aiAssistant", sessionUser.tenantId)
    rateHeaders = buildRateLimitHeaders(rateLimit)
    if (!rateLimit.success) {
      return Response.json({ success: false, error: "Rate limit exceeded" }, { status: 429, headers: rateHeaders })
    }

    const body = await req.json().catch(() => ({}))
    const messages = sanitizeAssistantMessages(body?.messages)
    if (!messages.length || messages[messages.length - 1]?.role !== "user") {
      return Response.json({ success: false, error: "A user question is required" }, { status: 400, headers: rateHeaders })
    }

    const effectiveAssistantRole =
      sessionUser.role === "owner" ? normalizePreviewRole(body?.previewRole) || sessionUser.role : sessionUser.role
    const enabledModules = await getEnabledModules(sessionUser)
    const currentWorkspaceLabel = typeof body?.currentWorkspaceLabel === "string" ? body.currentWorkspaceLabel : null
    const workspaceContext = buildAssistantWorkspaceContextFromModules(enabledModules, effectiveAssistantRole)
    const latestQuestion = messages[messages.length - 1]?.content || ""
    const actions = findAssistantActions({
      query: latestQuestion,
      enabledModules,
      role: effectiveAssistantRole,
      maxActions: 4,
    })
    const results = await searchAssistantData({
      tenantId: sessionUser.tenantId,
      role: effectiveAssistantRole,
      query: latestQuestion,
      enabledModules,
      maxResults: 6,
    })
    const emptyAnswerFallback =
      actions.length || results.length
        ? `I could not turn that into a useful explanation, but I did find direct links${results.length ? " and matching records" : ""} below.`
        : "I could not find a useful answer from the current tenant data. Try a more specific keyword such as an item name, worker, buyer, location, or account code."

    const workspaceContextSummary = buildAssistantWorkspaceContextSummary({
      currentWorkspaceLabel,
      availableWorkspaces: workspaceContext.availableWorkspaces,
      workspaceHints: workspaceContext.workspaceHints,
    })

    if (!isAIConfigured()) {
      return Response.json(
        {
          success: true,
          degraded: true,
          answer: buildSearchFallbackAnswer({
            currentWorkspaceLabel,
            actionsCount: actions.length,
            resultsCount: results.length,
            aiUnavailableReason: "the assistant provider is not configured",
          }),
          actions,
          results,
        },
        { headers: rateHeaders },
      )
    }

    const { primary: primaryFiscalYear, secondary: secondaryFiscalYear } = resolveFiscalYearWindows(latestQuestion)

    let dataSummary: string
    let fiscalYearLabel: string
    if (secondaryFiscalYear) {
      const [primaryResult, secondaryResult] = await Promise.all([
        buildTenantAiDataSummary({
          tenantId: sessionUser.tenantId,
          role: effectiveAssistantRole,
          fiscalYear: primaryFiscalYear,
        }),
        buildTenantAiDataSummary({
          tenantId: sessionUser.tenantId,
          role: effectiveAssistantRole,
          fiscalYear: secondaryFiscalYear,
          includeInventory: false,
        }),
      ])
      dataSummary = `# ${primaryFiscalYear.label} (primary period asked about)\n${primaryResult.dataSummary}\n\n# ${secondaryFiscalYear.label} (comparison period)\n${secondaryResult.dataSummary}`
      fiscalYearLabel = `${primaryFiscalYear.label} compared with ${secondaryFiscalYear.label}`
    } else {
      const result = await buildTenantAiDataSummary({
        tenantId: sessionUser.tenantId,
        role: effectiveAssistantRole,
        fiscalYear: primaryFiscalYear,
      })
      dataSummary = result.dataSummary
      fiscalYearLabel = result.fiscalYearLabel
    }

    const systemPrompt = `You are FarmFlow Assistant — this estate's own agronomy advisor, not a generic chatbot and not a data lookup tool. You have two sources of knowledge and must fuse them on every answer: (1) deep agronomic expertise for South Indian coffee, pepper, and rubber estates (variety behaviour, nutrition schedules, pest/disease thresholds, processing and yield benchmarks, cost economics), and (2) this tenant's actual operational numbers loaded below.

Always read the tenant's numbers against the agronomic benchmarks, never just against each other. When their data shows a ratio, cost, yield, or timing, check it against the benchmark ranges in your reference and say explicitly whether it looks normal, borderline, or a red flag — citing the actual figure next to the benchmark. When giving agronomic advice (fertiliser timing, pest thresholds, irrigation, harvest maturity, processing technique), don't answer generically — pull in this tenant's own recent data (rainfall, processing dates, locations, season) wherever it's relevant so the advice is specific to their estate, not a textbook answer. Never hand back tenant data and agronomy advice as two separate answers — weave them into one diagnosis with a clear recommendation and next action, the way a senior estate manager would during a walk-around.

Point users to the exact FarmFlow tab or button when there's something to act on there. If data needed to fully answer is missing, say so plainly and tell them what to log going forward. Do not invent numbers — only use figures present in the tenant data below. Keep answers specific and actionable, not a list of caveats.

${AGRONOMY_CONTEXT}`

    const matchingRecordsSection =
      results.length > 0
        ? `\n## Matching records for this question\n${results.map((result) => `- ${result.title}: ${result.detail}`).join("\n")}\n`
        : ""

    const groundingMessage = `Grounding context for the current tenant:

${dataSummary}
${matchingRecordsSection}${workspaceContextSummary ? `\n${workspaceContextSummary}\n` : ""}
Treat the tenant data above as the working dataset for ${fiscalYearLabel}.${
      secondaryFiscalYear
        ? " The data above covers two separate fiscal-year periods, each under its own heading — compare them directly and cite both period labels explicitly when answering."
        : ""
    }${
      results.length > 0
        ? " The matching records above were pulled specifically for this question — use their exact names, dates, and amounts in your answer instead of speaking only in aggregates."
        : ""
    } Use the exact workspace labels from the navigation guidance when telling the user where to go.`

    // Prepend grounding as the first user message, then alternate correctly for Claude
    const claudeMessages: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: groundingMessage },
      { role: "assistant", content: "Understood. I have your estate data and workspace context loaded. How can I help?" },
      ...messages,
    ]

    let answer = ""
    try {
      answer = (
        await callAI({
          model: CLAUDE_HAIKU,
          max_tokens: 900,
          temperature: 0.25,
          system: systemPrompt,
          cacheSystem: true,
          messages: claudeMessages,
        })
      ).trim()
    } catch (error) {
      const claudeClassification = classifyClaudeRouteError(error)
      if (!claudeClassification) {
        throw error
      }
      logServerWarning("AI Assistant Claude request failed", {
        classification: claudeClassification,
        error,
      })
      if (!actions.length && !results.length) {
        return buildClaudeRouteErrorResponse(claudeClassification, rateHeaders)
      }
      return Response.json(
        {
          success: true,
          degraded: true,
          answer: buildSearchFallbackAnswer({
            currentWorkspaceLabel,
            actionsCount: actions.length,
            resultsCount: results.length,
            aiUnavailableReason:
              claudeClassification.kind === "provider"
                ? "the AI provider is temporarily unavailable"
                : "the upstream request was cancelled",
          }),
          actions,
          results,
        },
        { headers: rateHeaders },
      )
    }

    return Response.json(
      {
        success: true,
        answer: answer || emptyAnswerFallback,
        actions,
        results,
      },
      { headers: rateHeaders },
    )
  } catch (error) {
    if (isModuleAccessError(error)) {
      return Response.json({ success: false, error: "Module access disabled" }, { status: 403, headers: rateHeaders })
    }
    logServerError("AI Assistant error", error)
    return Response.json(
      { success: false, error: sanitizeRouteError(error, "Failed to answer assistant question") },
      { status: 500, headers: rateHeaders },
    )
  }
}
