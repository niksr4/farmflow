import { describe, it, expect } from "vitest"
import {
  DEFAULT_SUPPORT_EMAIL,
  DEFAULT_SUPPORT_EMAIL_FROM,
  DEFAULT_ALERT_EMAIL_FROM,
  DEFAULT_AUTH_EMAIL_FROM,
  DEFAULT_DIGEST_EMAIL_FROM,
  EMAIL_BCC_MONITORING,
} from "@/lib/email-addresses"

describe("email address constants", () => {
  it("all 'from' headers embed the support address in RFC5322 display form", () => {
    for (const from of [
      DEFAULT_SUPPORT_EMAIL_FROM,
      DEFAULT_ALERT_EMAIL_FROM,
      DEFAULT_AUTH_EMAIL_FROM,
      DEFAULT_DIGEST_EMAIL_FROM,
    ]) {
      expect(from).toContain(`<${DEFAULT_SUPPORT_EMAIL}>`)
      expect(from).toMatch(/^FarmFlow.*<.+@.+>$/)
    }
  })

  it("uses the thefarmflow.in domain", () => {
    expect(DEFAULT_SUPPORT_EMAIL).toMatch(/@thefarmflow\.in$/)
    expect(EMAIL_BCC_MONITORING).toMatch(/@thefarmflow\.in$/)
  })
})
