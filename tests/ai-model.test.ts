import { afterEach, describe, expect, it } from "vitest"

import { resolveAgentModel } from "../lib/server/agents/ai-model"

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "AGENT_ANTHROPIC_MODEL",
  "AGENT_OPENAI_MODEL",
  "AGENT_GROQ_MODEL",
] as const

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

describe("resolveAgentModel", () => {
  it("returns null when no provider API key is configured", () => {
    clearKeys()
    expect(resolveAgentModel()).toBeNull()
  })

  it("prefers Anthropic when ANTHROPIC_API_KEY is set, even if others are too", () => {
    clearKeys()
    process.env.ANTHROPIC_API_KEY = "test-key"
    process.env.OPENAI_API_KEY = "test-key"
    process.env.GROQ_API_KEY = "test-key"
    const model = resolveAgentModel()
    expect(model).not.toBeNull()
    expect((model as any).modelId ?? (model as any).model).toBe("claude-haiku-4-5-20251001")
  })

  it("respects AGENT_ANTHROPIC_MODEL override", () => {
    clearKeys()
    process.env.ANTHROPIC_API_KEY = "test-key"
    process.env.AGENT_ANTHROPIC_MODEL = "claude-sonnet-4-6"
    const model = resolveAgentModel()
    expect((model as any).modelId ?? (model as any).model).toBe("claude-sonnet-4-6")
  })

  it("falls back to OpenAI when only OPENAI_API_KEY is set", () => {
    clearKeys()
    process.env.OPENAI_API_KEY = "test-key"
    const model = resolveAgentModel()
    expect(model).not.toBeNull()
    expect((model as any).modelId ?? (model as any).model).toBe("gpt-4o-mini")
  })

  it("falls back to Groq when only GROQ_API_KEY is set", () => {
    clearKeys()
    process.env.GROQ_API_KEY = "test-key"
    const model = resolveAgentModel()
    expect(model).not.toBeNull()
    expect((model as any).modelId ?? (model as any).model).toBe("llama-3.3-70b-versatile")
  })

  it("respects AGENT_OPENAI_MODEL and AGENT_GROQ_MODEL overrides", () => {
    clearKeys()
    process.env.OPENAI_API_KEY = "test-key"
    process.env.AGENT_OPENAI_MODEL = "gpt-4o"
    expect((resolveAgentModel() as any).modelId ?? (resolveAgentModel() as any).model).toBe("gpt-4o")

    clearKeys()
    process.env.GROQ_API_KEY = "test-key"
    process.env.AGENT_GROQ_MODEL = "llama-3.1-8b-instant"
    expect((resolveAgentModel() as any).modelId ?? (resolveAgentModel() as any).model).toBe("llama-3.1-8b-instant")
  })
})
