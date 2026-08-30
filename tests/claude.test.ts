import { afterEach, describe, expect, it } from "vitest"
import type Anthropic from "@anthropic-ai/sdk"

import { extractClaudeText, isClaudeConfigured } from "../lib/server/claude"

const originalKey = process.env.ANTHROPIC_API_KEY

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY
  } else {
    process.env.ANTHROPIC_API_KEY = originalKey
  }
})

describe("isClaudeConfigured", () => {
  it("returns false when the key is unset", () => {
    delete process.env.ANTHROPIC_API_KEY
    expect(isClaudeConfigured()).toBe(false)
  })

  it("returns false when the key is only whitespace", () => {
    process.env.ANTHROPIC_API_KEY = "   "
    expect(isClaudeConfigured()).toBe(false)
  })

  it("returns true when a non-empty key is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-123"
    expect(isClaudeConfigured()).toBe(true)
  })
})

describe("extractClaudeText", () => {
  const buildMessage = (content: Anthropic.Message["content"]): Anthropic.Message =>
    ({ content } as Anthropic.Message)

  it("returns the text of the first text block", () => {
    const message = buildMessage([
      { type: "text", text: "hello world", citations: [] } as any,
    ])
    expect(extractClaudeText(message)).toBe("hello world")
  })

  it("skips non-text blocks and returns the first text block found", () => {
    const message = buildMessage([
      { type: "tool_use", id: "1", name: "lookup", input: {} } as any,
      { type: "text", text: "second block wins", citations: [] } as any,
    ])
    expect(extractClaudeText(message)).toBe("second block wins")
  })

  it("returns an empty string when there is no text block", () => {
    const message = buildMessage([{ type: "tool_use", id: "1", name: "lookup", input: {} } as any])
    expect(extractClaudeText(message)).toBe("")
  })

  it("returns an empty string for empty content", () => {
    const message = buildMessage([])
    expect(extractClaudeText(message)).toBe("")
  })

  it("returns only the first text block's text when there are multiple", () => {
    const message = buildMessage([
      { type: "text", text: "first", citations: [] } as any,
      { type: "text", text: "second", citations: [] } as any,
    ])
    expect(extractClaudeText(message)).toBe("first")
  })
})
