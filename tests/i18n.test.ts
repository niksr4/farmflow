import { describe, expect, it } from "vitest"

import { getLocaleLabel, normalizeAppLocale, translate } from "../lib/i18n"

describe("i18n helpers", () => {
  it("normalizes locale families to supported app locales", () => {
    expect(normalizeAppLocale("en-US")).toBe("en")
    expect(normalizeAppLocale("es-419")).toBe("es")
    expect(normalizeAppLocale("pt-PT")).toBe("pt-BR")
    expect(normalizeAppLocale("fr-CA")).toBe("fr")
    expect(normalizeAppLocale("kn-IN")).toBe("kn")
    expect(normalizeAppLocale("ta-IN")).toBe("ta")
  })

  it("falls back safely for unknown locales", () => {
    expect(normalizeAppLocale("de-DE")).toBe("en")
    expect(normalizeAppLocale("", "fr")).toBe("fr")
  })

  it("translates with token substitution and english fallback", () => {
    expect(translate("es", "public.verify.sentMessage", { email: "te****@estate.com" })).toContain("te****@estate.com")
    expect(translate("fr", "public.landing.ctaPrimary")).toBe("Essai gratuit 30 jours")
    expect(translate("es", "missing.key")).toBe("missing.key")
  })

  it("returns locale labels for supported languages", () => {
    expect(getLocaleLabel("en")).toBe("English")
    expect(getLocaleLabel("pt-BR")).toContain("Portugu")
    expect(getLocaleLabel("kn")).toBe("ಕನ್ನಡ")
    expect(getLocaleLabel("ta")).toBe("தமிழ்")
  })
})
