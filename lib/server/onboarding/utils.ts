import { createHash, randomBytes } from "crypto"

import { isReservedPlatformUsername, isSystemUsername, normalizeUsername } from "../../usernames"

export const SIGNUP_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LOCALE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/
const USERNAME_MAX_LENGTH = 32

export const AUTH_EMAIL_SENDER_CONFIGURATION_MESSAGE =
  "Unable to send verification email. Configure AUTH_EMAIL_FROM with an address on a verified Resend domain."

const toAscii = (value: string) =>
  value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")

const normalizeCandidate = (value: string) => {
  const slug = toAscii(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, USERNAME_MAX_LENGTH)

  const username = normalizeUsername(slug)
  if (!username) return null
  if (isReservedPlatformUsername(username) || isSystemUsername(username)) return null
  return username
}

const pushUnique = (list: string[], seen: Set<string>, value: string | null) => {
  if (!value) return
  const normalized = value.toLowerCase()
  if (seen.has(normalized)) return
  seen.add(normalized)
  list.push(value)
}

export const normalizeSignupEmail = (value: unknown) => String(value || "").trim().toLowerCase()

export const isEmailIdentifier = (value: unknown) => SIGNUP_EMAIL_PATTERN.test(normalizeSignupEmail(value))

export const normalizeLocale = (value: unknown, fallback = "en") => {
  const locale = String(value || "").trim()
  return LOCALE_PATTERN.test(locale) ? locale : fallback
}

export const slugifyText = (value: unknown) =>
  toAscii(String(value || ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

export const buildUsernameSeeds = (input: { email: string; name: string; estateName: string }) => {
  const emailLocalPart = normalizeSignupEmail(input.email).split("@")[0] || ""
  const nameSlug = slugifyText(input.name)
  const estateSlug = slugifyText(input.estateName)
  const out: string[] = []
  const seen = new Set<string>()

  pushUnique(out, seen, normalizeCandidate(emailLocalPart))
  pushUnique(out, seen, normalizeCandidate(nameSlug))
  pushUnique(out, seen, normalizeCandidate(`${estateSlug}-admin`))
  pushUnique(out, seen, normalizeCandidate(`${emailLocalPart}-${estateSlug}`))
  pushUnique(out, seen, normalizeCandidate("farmflow-admin"))

  return out
}

export const buildUsernameAttempt = (base: string, attempt: number) => {
  if (attempt <= 0) return base
  const suffix = `-${attempt + 1}`
  const maxBaseLength = USERNAME_MAX_LENGTH - suffix.length
  return `${base.slice(0, maxBaseLength)}${suffix}`
}

export const buildStarterLocationName = (estateName: string) => {
  const trimmed = String(estateName || "").trim()
  return trimmed ? `${trimmed} Main` : "Main Estate"
}

export const buildStarterLocationCode = () => "MAIN"

export const generateSignupToken = () => randomBytes(32).toString("hex")

export const hashSignupToken = (token: string) =>
  createHash("sha256").update(`farmflow-signup:${String(token || "").trim()}`).digest("hex")

export const resolvePublicAppUrl = () => {
  const explicitUrl = String(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "").trim()
  if (explicitUrl) {
    return explicitUrl.replace(/\/+$/, "")
  }

  const vercelUrl = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "").trim()
  if (vercelUrl) {
    const normalized = vercelUrl.startsWith("http://") || vercelUrl.startsWith("https://") ? vercelUrl : `https://${vercelUrl}`
    return normalized.replace(/\/+$/, "")
  }

  return "http://localhost:3000"
}

export const buildVerificationLink = (token: string) =>
  `${resolvePublicAppUrl()}/verify-email?token=${encodeURIComponent(token)}`

export const maskEmailAddress = (email: string) => {
  const normalized = normalizeSignupEmail(email)
  const [localPart, domain] = normalized.split("@")
  if (!localPart || !domain) return normalized
  const safeLocal =
    localPart.length <= 2
      ? `${localPart[0] || "*"}*`
      : `${localPart.slice(0, 2)}${"*".repeat(Math.max(2, localPart.length - 2))}`
  return `${safeLocal}@${domain}`
}

export const isResendTestSender = (value: unknown) => String(value || "").trim().toLowerCase().includes("@resend.dev")

export const getAuthEmailSenderConfigurationError = (input: {
  sender?: string | null
  providerMessage?: string | null
}) => {
  const sender = String(input.sender || "").trim()
  if (!sender || isResendTestSender(sender)) {
    return AUTH_EMAIL_SENDER_CONFIGURATION_MESSAGE
  }

  const providerMessage = String(input.providerMessage || "").toLowerCase()
  if (
    providerMessage.includes("you can only send testing emails to your own email address") ||
    providerMessage.includes("domain is not verified")
  ) {
    return AUTH_EMAIL_SENDER_CONFIGURATION_MESSAGE
  }

  return null
}

export const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error)
  return message.includes(`relation "${relation}" does not exist`)
}

const hasMissingUserEmailColumn = (message: string) =>
  message.includes('column "email"') ||
  message.includes('column "normalized_email"') ||
  message.includes('column "email_verified_at"') ||
  message.includes('column "preferred_locale"')

const hasMissingGuidedSetupColumn = (message: string) =>
  message.includes('column "setup_completed_at"') || message.includes('column "requires_guided_setup"')

export const normalizeOnboardingError = (error: unknown) => {
  const message = String((error as Error)?.message || error || "")
  if (isMissingRelation(error, "signup_requests") || isMissingRelation(error, "signup_tokens")) {
    return new Error("Self-serve signup schema missing. Run scripts/61-signup-requests.sql and scripts/62-signup-tokens.sql.")
  }
  if (hasMissingUserEmailColumn(message)) {
    return new Error("Email auth schema missing. Run scripts/63-user-email-auth.sql.")
  }
  if (hasMissingGuidedSetupColumn(message)) {
    return new Error("Guided setup schema missing. Run scripts/65-user-guided-setup.sql.")
  }
  if (error instanceof Error) return error
  return new Error(message || "Self-serve onboarding failed")
}
