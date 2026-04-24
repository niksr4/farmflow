import "server-only"

import Anthropic from "@anthropic-ai/sdk"

// Model IDs
export const CLAUDE_SONNET = "claude-sonnet-4-6"
export const CLAUDE_HAIKU = "claude-haiku-4-5-20251001"

let _client: Anthropic | null = null

export function getClaudeClient(): Anthropic {
  if (!_client) {
    const apiKey = String(process.env.ANTHROPIC_API_KEY || "").trim()
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured")
    _client = new Anthropic({ apiKey, timeout: 90_000 })
  }
  return _client
}

export function isClaudeConfigured(): boolean {
  return Boolean(String(process.env.ANTHROPIC_API_KEY || "").trim())
}

/** Extract text from the first text block in a Claude response. */
export function extractClaudeText(message: Anthropic.Message): string {
  for (const block of message.content) {
    if (block.type === "text") return block.text
  }
  return ""
}
