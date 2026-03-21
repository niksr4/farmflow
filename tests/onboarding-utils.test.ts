import { afterEach, describe, expect, it } from "vitest"

import {
  AUTH_EMAIL_SENDER_CONFIGURATION_MESSAGE,
  buildUsernameAttempt,
  buildUsernameSeeds,
  buildVerificationLink,
  getAuthEmailSenderConfigurationError,
  hashSignupToken,
  isEmailIdentifier,
  isResendTestSender,
  maskEmailAddress,
  normalizeLocale,
  normalizeOnboardingError,
  normalizeSignupEmail,
  slugifyText,
} from "../lib/server/onboarding/utils"

const originalEnv = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  VERCEL_URL: process.env.VERCEL_URL,
}

afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = originalEnv.NEXT_PUBLIC_APP_URL
  process.env.NEXTAUTH_URL = originalEnv.NEXTAUTH_URL
  process.env.VERCEL_PROJECT_PRODUCTION_URL = originalEnv.VERCEL_PROJECT_PRODUCTION_URL
  process.env.VERCEL_URL = originalEnv.VERCEL_URL
})

describe("onboarding utils", () => {
  it("normalizes and detects email identifiers", () => {
    expect(normalizeSignupEmail("  Test.User@Example.com  ")).toBe("test.user@example.com")
    expect(isEmailIdentifier("test.user@example.com")).toBe(true)
    expect(isEmailIdentifier("estate-admin")).toBe(false)
  })

  it("builds stable username seeds from email, name, and estate", () => {
    expect(
      buildUsernameSeeds({
        email: "joao.silva@example.com",
        name: "Joao Silva",
        estateName: "Fazenda Sao Jose",
      }),
    ).toEqual([
      "joao-silva",
      "fazenda-sao-jose-admin",
      "joao-silva-fazenda-sao-jose",
      "farmflow-admin",
    ])
  })

  it("slugifies unicode input and appends numeric username suffixes safely", () => {
    expect(slugifyText("  São José Estate  ")).toBe("sao-jose-estate")
    expect(buildUsernameAttempt("very-long-estate-admin-account", 3)).toBe("very-long-estate-admin-account-4")
  })

  it("masks email addresses and hashes tokens deterministically", () => {
    expect(maskEmailAddress("person@example.com")).toBe("pe****@example.com")
    expect(hashSignupToken("abc")).toBe(hashSignupToken("abc"))
    expect(hashSignupToken("abc")).not.toBe(hashSignupToken("xyz"))
  })

  it("detects resend test senders and keeps the auth sender guidance stable", () => {
    expect(isResendTestSender("FarmFlow Alerts <onboarding@resend.dev>")).toBe(true)
    expect(isResendTestSender("FarmFlow <hello@farmflow.app>")).toBe(false)
    expect(AUTH_EMAIL_SENDER_CONFIGURATION_MESSAGE).toContain("AUTH_EMAIL_FROM")
    expect(getAuthEmailSenderConfigurationError({ sender: "" })).toBe(AUTH_EMAIL_SENDER_CONFIGURATION_MESSAGE)
    expect(getAuthEmailSenderConfigurationError({ sender: "FarmFlow Alerts <onboarding@resend.dev>" })).toBe(
      AUTH_EMAIL_SENDER_CONFIGURATION_MESSAGE,
    )
    expect(
      getAuthEmailSenderConfigurationError({
        sender: "FarmFlow <hello@farmflow.app>",
        providerMessage: "The farmflow.app domain is not verified.",
      }),
    ).toBe(AUTH_EMAIL_SENDER_CONFIGURATION_MESSAGE)
  })

  it("resolves verification links from configured app urls", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://farmflow.example.com/"
    expect(buildVerificationLink("token-123")).toBe("https://farmflow.example.com/verify-email?token=token-123")
  })

  it("normalizes locale input and maps missing schema errors clearly", () => {
    expect(normalizeLocale("pt-BR")).toBe("pt-BR")
    expect(normalizeLocale("??", "en")).toBe("en")
    expect(
      normalizeOnboardingError(new Error('relation "signup_requests" does not exist')).message,
    ).toContain("scripts/61-signup-requests.sql")
    expect(
      normalizeOnboardingError(new Error('column "requires_guided_setup" does not exist')).message,
    ).toContain("scripts/65-user-guided-setup.sql")
  })
})
