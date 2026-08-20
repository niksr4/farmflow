import { afterEach, describe, expect, it, vi } from "vitest"

import { sendSignupVerificationEmail } from "../lib/server/onboarding/email"

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

describe("sendSignupVerificationEmail", () => {
  it("sends via Resend with the verification link embedded once configured", async () => {
    process.env.RESEND_API_KEY = "test_key"
    process.env.AUTH_EMAIL_FROM = "FarmFlow <hello@farmflow.app>"
    process.env.AUTH_EMAIL_PREVIEW_DIR = ""

    const fetchMock = stubResendFetch()

    const result = await sendSignupVerificationEmail({
      email: "person@example.com",
      name: "Priya",
      estateName: "Green Valley Estate",
      token: "tok-123",
    })

    expect(result).toEqual({ sent: true, provider: "resend", statusCode: 200 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.html).toContain("verify-email?token=tok-123")
    expect(body.to).toEqual(["person@example.com"])
  })

  // Fixed by the 2026-08-10 code scan (lib/server/onboarding/email.ts now escapes
  // `input.name`/`input.estateName` via lib/html-escape's `escapeHtml` before interpolating
  // them into the HTML email body — the exact helper this codebase built for this exact
  // problem (see its own doc comment: "Every transactional email in this codebase is built
  // by string-interpolating values into an HTML template"), and which app/api/contact/route.ts
  // and app/api/feedback/route.ts already used. `input.name` and `input.estateName` come
  // straight from the public signup form (lib/server/onboarding/signup.ts ->
  // createOrRefreshSignupRequest), so this is the highest-severity of the three sites fixed in
  // this pass: zero authentication required to reach it.
  it("escapes HTML metacharacters in name/estateName before embedding them in the HTML body", async () => {
    process.env.RESEND_API_KEY = "test_key"
    process.env.AUTH_EMAIL_FROM = "FarmFlow <hello@farmflow.app>"
    process.env.AUTH_EMAIL_PREVIEW_DIR = ""

    const fetchMock = stubResendFetch()

    await sendSignupVerificationEmail({
      email: "attacker@example.com",
      name: '<img src=x onerror=alert(1)>',
      estateName: "Estate & Co",
      token: "tok-456",
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    // Both the raw tag and the raw ampersand must be neutralised — ampersand-first escaping is
    // what stops a pre-encoded payload (`&lt;img ... &gt;`) from surviving a second pass.
    expect(body.html).not.toContain('<img src=x onerror=alert(1)>')
    expect(body.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(body.html).not.toContain("Estate & Co")
    expect(body.html).toContain("Estate &amp; Co")
  })

  it("skips sending and reports the reason when RESEND_API_KEY is not configured", async () => {
    process.env.RESEND_API_KEY = ""
    process.env.AUTH_EMAIL_FROM = "FarmFlow <hello@farmflow.app>"
    process.env.AUTH_EMAIL_PREVIEW_DIR = ""

    const result = await sendSignupVerificationEmail({
      email: "person@example.com",
      name: "Priya",
      estateName: "Green Valley Estate",
      token: "tok-789",
    })

    expect(result).toEqual({ sent: false, provider: "none", reason: "RESEND_API_KEY not configured" })
  })

  it("reports a sender configuration error instead of sending from an unverified/test address", async () => {
    process.env.RESEND_API_KEY = "test_key"
    process.env.AUTH_EMAIL_FROM = "FarmFlow <onboarding@resend.dev>"
    process.env.AUTH_EMAIL_PREVIEW_DIR = ""

    const result = await sendSignupVerificationEmail({
      email: "person@example.com",
      name: "Priya",
      estateName: "Green Valley Estate",
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

    const result = await sendSignupVerificationEmail({
      email: "preview@example.com",
      name: "Priya",
      estateName: "Green Valley Estate",
      token: "tok-preview",
    })

    expect(result.sent).toBe(true)
    expect(result.provider).toBe("preview")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
