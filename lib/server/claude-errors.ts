import Anthropic from "@anthropic-ai/sdk"

export const CLAUDE_ROUTE_ERROR_MESSAGE = "AI provider is temporarily unavailable. Please try again shortly."

export type ClaudeRouteError = {
  status: number
  message: string
  kind: "cancelled" | "provider"
}

export const classifyClaudeRouteError = (error: unknown): ClaudeRouteError | null => {
  if (!(error instanceof Anthropic.APIError)) return null

  if (error instanceof Anthropic.APIUserAbortError) {
    return {
      status: 503,
      message: CLAUDE_ROUTE_ERROR_MESSAGE,
      kind: "cancelled",
    }
  }

  return {
    status: 503,
    message: CLAUDE_ROUTE_ERROR_MESSAGE,
    kind: "provider",
  }
}

export const buildClaudeRouteErrorResponse = (classification: ClaudeRouteError, headers?: HeadersInit) =>
  Response.json(
    {
      success: false,
      error: classification.message,
    },
    { status: classification.status, headers },
  )
