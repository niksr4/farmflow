import { afterEach, describe, expect, it } from "vitest"

import { isAIConfigured } from "../lib/server/ai-provider"

const ENV_KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"] as const
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = originalEnv[key]
    }
  }
})

const clearKeys = () => {
  for (const key of ENV_KEYS) delete process.env[key]
}

describe("isAIConfigured", () => {
  it("returns false when neither provider is configured", () => {
    clearKeys()
    expect(isAIConfigured()).toBe(false)
  })

  it("returns true when only Claude is configured", () => {
    clearKeys()
    process.env.ANTHROPIC_API_KEY = "sk-claude"
    expect(isAIConfigured()).toBe(true)
  })

  it("returns true when only OpenAI is configured", () => {
    clearKeys()
    process.env.OPENAI_API_KEY = "sk-openai"
    expect(isAIConfigured()).toBe(true)
  })

  it("returns true when both are configured", () => {
    clearKeys()
    process.env.ANTHROPIC_API_KEY = "sk-claude"
    process.env.OPENAI_API_KEY = "sk-openai"
    expect(isAIConfigured()).toBe(true)
  })

  it("treats a whitespace-only key as not configured", () => {
    clearKeys()
    process.env.ANTHROPIC_API_KEY = "   "
    process.env.OPENAI_API_KEY = "  "
    expect(isAIConfigured()).toBe(false)
  })
})
