import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"

import { getClaudeClient, isClaudeConfigured, extractClaudeText } from "./claude"
import { logServerWarning } from "./safe-logging"

// Maps Claude model IDs to equivalent OpenAI fallback models
const OPENAI_FALLBACK_MODEL: Record<string, string> = {
  "claude-haiku-4-5-20251001": "gpt-4o-mini",
  "claude-sonnet-4-6": "gpt-4o",
}

function isOpenAIConfigured(): boolean {
  return Boolean(String(process.env.OPENAI_API_KEY || "").trim())
}

export function isAIConfigured(): boolean {
  return isClaudeConfigured() || isOpenAIConfigured()
}

/**
 * Returns true for errors that indicate Claude is unavailable due to billing,
 * auth, or server-side failures — and where falling back to OpenAI makes sense.
 * Rate limits are excluded: they are temporary and OpenAI may also be limited.
 */
function shouldFallbackToOpenAI(error: unknown): boolean {
  if (!(error instanceof Anthropic.APIError)) return false
  if (error instanceof Anthropic.AuthenticationError) return true
  if (error instanceof Anthropic.PermissionDeniedError) return true
  if (error instanceof Anthropic.BadRequestError && /credit/i.test(error.message)) return true
  if (error instanceof Anthropic.InternalServerError) return true
  if (error instanceof Anthropic.APIConnectionError) return true
  return false
}

export type AIMessageParam = { role: "user" | "assistant"; content: string }

export type CallAIParams = {
  model: string
  max_tokens: number
  temperature?: number
  system?: string
  messages: AIMessageParam[]
}

async function callWithOpenAI(params: CallAIParams): Promise<string> {
  const openaiModel = OPENAI_FALLBACK_MODEL[params.model] ?? "gpt-4o-mini"
  const { text } = await generateText({
    model: openai(openaiModel),
    system: params.system,
    messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
    maxOutputTokens: params.max_tokens,
    temperature: params.temperature,
  })
  return text
}

/**
 * Calls Claude with the given params and returns the response text.
 * Automatically falls back to OpenAI (gpt-4o-mini / gpt-4o) when Claude
 * is unavailable due to billing, auth, or server-side failures.
 */
export async function callAI(params: CallAIParams): Promise<string> {
  if (!isClaudeConfigured()) {
    if (!isOpenAIConfigured()) throw new Error("No AI provider is configured")
    return callWithOpenAI(params)
  }

  try {
    const client = getClaudeClient()
    const response = await client.messages.create(params)
    return extractClaudeText(response)
  } catch (error) {
    if (shouldFallbackToOpenAI(error) && isOpenAIConfigured()) {
      logServerWarning("Claude unavailable, falling back to OpenAI", { error })
      return callWithOpenAI(params)
    }
    throw error
  }
}
