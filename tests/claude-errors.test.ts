import Anthropic from "@anthropic-ai/sdk"
import { describe, expect, it } from "vitest"

import { CLAUDE_ROUTE_ERROR_MESSAGE, classifyClaudeRouteError } from "../lib/server/claude-errors"

describe("Claude route error classification", () => {
  it("ignores non-Claude errors", () => {
    expect(classifyClaudeRouteError(new Error("boom"))).toBeNull()
  })

  it("maps upstream Claude failures to a safe provider response", () => {
    const errors = [
      new Anthropic.RateLimitError(
        429,
        { type: "rate_limit_error", message: "request limit exceeded" } as any,
        "429 request limit exceeded",
        new Headers([["request-id", "rate-limit-123"]]),
      ),
      new Anthropic.AuthenticationError(
        401,
        { type: "authentication_error", message: "invalid api key" } as any,
        "401 invalid api key",
        new Headers([["request-id", "auth-123"]]),
      ),
      new Anthropic.APIConnectionTimeoutError({ message: "timed out" }),
    ]

    for (const error of errors) {
      expect(classifyClaudeRouteError(error)).toEqual({
        status: 503,
        message: CLAUDE_ROUTE_ERROR_MESSAGE,
        kind: "provider",
      })
    }
  })

  it("treats aborted Claude requests as cancelled", () => {
    expect(classifyClaudeRouteError(new Anthropic.APIUserAbortError({ message: "Request was aborted." }))).toEqual({
      status: 503,
      message: CLAUDE_ROUTE_ERROR_MESSAGE,
      kind: "cancelled",
    })
  })
})
