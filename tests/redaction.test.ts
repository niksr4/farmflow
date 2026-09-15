import { describe, it, expect } from "vitest"
import {
  redactText,
  redactValue,
  serializeError,
  SENSITIVE_KEY_PATTERN,
  MAX_REDACTION_DEPTH,
} from "@/lib/redaction"

describe("redactText", () => {
  it("redacts Bearer tokens", () => {
    expect(redactText("Authorization: Bearer abc123.def-456_ghi")).toBe(
      "Authorization: Bearer [REDACTED]",
    )
  })

  it("redacts Basic auth headers", () => {
    expect(redactText("Authorization: Basic dXNlcjpwYXNz")).toBe("Authorization: Basic [REDACTED]")
  })

  it("redacts secret-looking query params but keeps the key name", () => {
    expect(redactText("GET /callback?token=abc123&next=/home")).toBe(
      "GET /callback?token=[REDACTED]&next=/home",
    )
    expect(redactText("?api_key=xyz")).toBe("?api_key=[REDACTED]")
    expect(redactText("?password=hunter2")).toBe("?password=[REDACTED]")
  })

  it("redacts email addresses", () => {
    expect(redactText("contact nik@example.com for help")).toBe(
      "contact [REDACTED_EMAIL] for help",
    )
  })

  it("handles null/undefined/non-string input without throwing", () => {
    expect(redactText(null as unknown as string)).toBe("")
    expect(redactText(undefined as unknown as string)).toBe("")
  })

  it("leaves ordinary text untouched", () => {
    expect(redactText("Nothing sensitive here")).toBe("Nothing sensitive here")
  })
})

describe("redactValue", () => {
  it("passes through null, undefined, numbers, and booleans unchanged", () => {
    expect(redactValue(null)).toBe(null)
    expect(redactValue(undefined)).toBe(undefined)
    expect(redactValue(42)).toBe(42)
    expect(redactValue(true)).toBe(true)
  })

  it("redacts string values recursively", () => {
    expect(redactValue("Bearer abc123")).toBe("Bearer [REDACTED]")
  })

  it("redacts values under sensitive key names regardless of content", () => {
    const result = redactValue({ password: "hunter2", note: "hello" }) as Record<string, unknown>
    expect(result.password).toBe("[REDACTED]")
    expect(result.note).toBe("hello")
  })

  it("matches sensitive keys case-insensitively and as substrings", () => {
    const result = redactValue({
      Authorization: "x",
      COOKIE: "y",
      apiKey: "z",
      normalized_email: "nik@example.com",
    }) as Record<string, unknown>
    expect(result.Authorization).toBe("[REDACTED]")
    expect(result.COOKIE).toBe("[REDACTED]")
    expect(result.apiKey).toBe("[REDACTED]")
    expect(result.normalized_email).toBe("[REDACTED]")
  })

  it("recurses into arrays", () => {
    const result = redactValue(["Bearer abc", { password: "x" }]) as unknown[]
    expect(result[0]).toBe("Bearer [REDACTED]")
    expect((result[1] as Record<string, unknown>).password).toBe("[REDACTED]")
  })

  it("truncates past MAX_REDACTION_DEPTH rather than recursing forever", () => {
    // Build a nested object deeper than MAX_REDACTION_DEPTH.
    let nested: Record<string, unknown> = { leaf: "Bearer abc" }
    for (let i = 0; i < MAX_REDACTION_DEPTH + 3; i++) {
      nested = { child: nested }
    }
    const result = JSON.stringify(redactValue(nested))
    expect(result).toContain("[Truncated]")
  })

  it("serializes Error instances via serializeError", () => {
    const err = new Error("failed with token=abc123")
    const result = redactValue(err) as { name: string; message: string }
    expect(result.name).toBe("Error")
    expect(result.message).toBe("failed with token=[REDACTED]")
  })

  it("stringifies other object-ish values it doesn't otherwise handle", () => {
    expect(redactValue(Symbol("x"))).toBe(String(Symbol("x")))
  })
})

describe("serializeError", () => {
  it("redacts the message and omits the stack in production", () => {
    const originalEnv = process.env.NODE_ENV
    // @ts-expect-error - test-only override of a readonly-in-types env var
    process.env.NODE_ENV = "production"
    try {
      const err = new Error("leaked token=abc123")
      const result = serializeError(err) as { name: string; message: string; stack?: string }
      expect(result.message).toBe("leaked token=[REDACTED]")
      expect(result.stack).toBeUndefined()
    } finally {
      // @ts-expect-error - restore
      process.env.NODE_ENV = originalEnv
    }
  })

  it("redacts (but keeps) the stack outside production", () => {
    const originalEnv = process.env.NODE_ENV
    // @ts-expect-error - test-only override
    process.env.NODE_ENV = "development"
    try {
      const err = new Error("boom")
      const result = serializeError(err) as { stack?: string }
      expect(typeof result.stack).toBe("string")
    } finally {
      // @ts-expect-error - restore
      process.env.NODE_ENV = originalEnv
    }
  })

  it("falls back to redactValue for non-Error input", () => {
    expect(serializeError("Bearer abc123")).toBe("Bearer [REDACTED]")
  })
})

describe("SENSITIVE_KEY_PATTERN", () => {
  it("matches the documented sensitive key names", () => {
    for (const key of [
      "authorization",
      "cookie",
      "token",
      "secret",
      "password",
      "api_key",
      "apiKey",
      "email",
      "phone",
      "file_data_base64",
      "normalized_email",
      "twilio_auth_token",
    ]) {
      expect(SENSITIVE_KEY_PATTERN.test(key)).toBe(true)
    }
  })

  it("does not match unrelated key names", () => {
    for (const key of ["name", "estate", "location_id", "notes"]) {
      expect(SENSITIVE_KEY_PATTERN.test(key)).toBe(false)
    }
  })
})
