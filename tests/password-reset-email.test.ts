import { afterEach, describe, expect, it, vi } from "vitest"

import { sendPasswordResetEmail } from "../lib/server/password-reset-email"

const originalEnv = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
  ALERT_EMAIL_FROM: process.env.ALERT_EMAIL_FROM,
  AUTH_EMAIL_PREVIEW_DIR: process.env.AUTH_EMAIL_PREVIEW_DIR,
}

afterEach(() => {
  process.env.RESEND_API_KEY = originalEnv.RESEND_API_KEY
  process.env.AUTH_EMAIL_FROM = originalEnv.AUTH_EMAIL_FROM
  process.env.ALERT_EMAIL_FROM = originalEnv.ALERT_EMAIL_FROM
  process.env.AUTH_EMAIL_PREVIEW_DIR = originalEnv.AUTH_EMAIL_PREVIEW_DIR
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const stubResendFetch = () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => "{}",
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("sendPasswordResetEmail", () => {
  it("sends via Resend with the reset link embedded once configured", async () => {
    process.env.RESEND_API_KEY = "test_key"
    process.env.AUTH_EMAIL_FROM = "FarmFlow <hello@farmflow.app>"
    process.env.AUTH_EMAIL_PREVIEW_DIR = ""

    const fetchMock = stubResendFetch()

    const result = await sendPasswordResetEmail({
      email: "person@example.com",
      username: "priya",
      token: "tok-123",
    })

    expect(result).toEqual({ sent: true, provider: "resend", statusCode: 200 })
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.html).toContain("reset-password?token=tok-123")
    expect(body.to).toEqual(["person@example.com"])
  })

  // Fixed by the 2026-08-10 code scan (lib/server/password-reset-email.ts now escapes
  // `input.username` via lib/html-escape's `escapeHtml` before interpolating it into the HTML
  // body), the same fix applied to lib/server/onboarding/email.ts and lib/server/email-change-email.ts.
  // Usernames are generated from user-controlled signup input (see
  // lib/server/onboarding/utils.ts buildUsernameSeeds / normalizeCandidate), which strips most
  // HTML-unsafe characters — but existing accounts (created before that normalization, or via
  // other paths) are not guaranteed to have a clean username, so escaping at the email layer
  // stays the real fix rather than relying on upstream normalization alone.
  it("escapes HTML metacharacters in username before embedding it in the HTML body", async () => {
    process.env.RESEND_API_KEY = "test_key"
    process.env.AUTH_EMAIL_FROM = "FarmFlow <hello@farmflow.app>"
    process.env.AUTH_EMAIL_PREVIEW_DIR = ""

    const fetchMock = stubResendFetch()

    await sendPasswordResetEmail({
      email: "attacker@example.com",
      username: '<img src=x onerror=alert(1)>',
      token: "tok-456",
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.html).not.toContain('<img src=x onerror=alert(1)>')
    expect(body.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it("skips sending and reports the reason when RESEND_API_KEY is not configured", async () => {
    process.env.RESEND_API_KEY = ""
    process.env.AUTH_EMAIL_FROM = "FarmFlow <hello@farmflow.app>"
    process.env.AUTH_EMAIL_PREVIEW_DIR = ""

    const result = await sendPasswordResetEmail({
      email: "person@example.com",
      username: "priya",
      token: "tok-789",
    })

    expect(result).toEqual({ sent: false, provider: "none", reason: "RESEND_API_KEY not configured" })
  })

  it("reports a sender configuration error instead of sending from an unverified/test address", async () => {
    process.env.RESEND_API_KEY = "test_key"
    process.env.AUTH_EMAIL_FROM = "FarmFlow <onboarding@resend.dev>"
    process.env.AUTH_EMAIL_PREVIEW_DIR = ""

    const result = await sendPasswordResetEmail({
      email: "person@example.com",
      username: "priya",
      token: "tok-000",
    })

    expect(result.sent).toBe(false)
    expect(result.provider).toBe("none")
    expect(result.reason).toContain("AUTH_EMAIL_FROM")
  })

  it("writes a JSON preview file instead of calling Resend when AUTH_EMAIL_PREVIEW_DIR is set", async () => {
    const fetchMock = stubResendFetch()
    process.env.RESEND_API_KEY = "test_key"
    process.env.AUTH_EMAIL_FROM = "FarmFlow <hello@farmflow.app>"
    process.env.AUTH_EMAIL_PREVIEW_DIR = require("node:os").tmpdir()

    const result = await sendPasswordResetEmail({
      email: "preview@example.com",
      username: "priya",
      token: "tok-preview",
    })

    expect(result.sent).toBe(true)
    expect(result.provider).toBe("preview")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
