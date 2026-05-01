import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import type { MessageCreateParamsNonStreaming, TextBlockParam } from "@anthropic-ai/sdk/resources/messages"
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
  /**
   * When true, wraps the system prompt with Anthropic's ephemeral cache_control.
   * Reduces cost ~80% and latency ~30-50% for long, stable system prompts.
   * Has no effect when falling back to OpenAI.
   */
  cacheSystem?: boolean
}

/** Build a system param with ephemeral cache_control for cost/latency reduction. */
function buildCachedSystem(text: string): Anthropic.TextBlockParam[] {
  return [{ type: "text", text, cache_control: { type: "ephemeral" } }]
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
    const claudeParams: Anthropic.MessageCreateParamsNonStreaming = {
      model: params.model,
      max_tokens: params.max_tokens,
      temperature: params.temperature,
      messages: params.messages,
      ...(params.system
        ? { system: params.cacheSystem ? buildCachedSystem(params.system) : params.system }
        : {}),
    }
    const response = await client.messages.create(claudeParams)
    return extractClaudeText(response)
  } catch (error) {
    if (shouldFallbackToOpenAI(error) && isOpenAIConfigured()) {
      logServerWarning("Claude unavailable, falling back to OpenAI", { error })
      return callWithOpenAI(params)
    }
    throw error
  }
}
