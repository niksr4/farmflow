import "server-only"

import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { decode as defaultJwtDecode, encode as defaultJwtEncode } from "next-auth/jwt"
import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { hashPassword, verifyPassword } from "@/lib/passwords"
import { logSecurityEvent } from "@/lib/server/security-events"
import { checkRateLimit, isRateLimitUnavailableError } from "@/lib/rate-limit"
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from "@/lib/i18n"
import { isEmailIdentifier, normalizeSignupEmail } from "@/lib/server/onboarding/utils"
import { assertCoreRuntimeConfig } from "@/lib/runtime-config"
import { logServerWarning } from "@/lib/server/safe-logging"
import { sendAgentAlertEmail } from "@/lib/server/agents/alert-email"
import { normalizeUsername, normalizeUsernameLookup } from "@/lib/usernames"

type SessionMode = "app" | "web"
type FarmFlowRole = "admin" | "user" | "owner"

type UserRow = {
  id: string
  username: string
  role: FarmFlowRole
  tenant_id: string
  password_hash: string
  password_reset_required: boolean
  preferred_locale: string | null
  setup_completed_at: string | null
  requires_guided_setup: boolean
}

type CredentialsInput = {
  username: string
  password: string
  sessionMode?: SessionMode
}

type RequestHeadersLike = Record<string, string | string[] | undefined>

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {}

const toRequestHeaders = (value: unknown): RequestHeadersLike => asRecord(value) as RequestHeadersLike

const getHeaderValue = (headers: RequestHeadersLike, key: string): string | null => {
  const value = headers[key]
  if (Array.isArray(value)) {
    return value[0] ? String(value[0]) : null
  }
  return value ? String(value) : null
}

const normalizeRole = (value: unknown): FarmFlowRole => {
  const role = String(value || "").toLowerCase()
  if (role === "owner" || role === "admin" || role === "user") return role
  return "user"
}

const parseMaxAgeSeconds = (raw: string | undefined, fallback: number) => {
  const parsed = Number(raw || "")
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const APP_SESSION_MAX_AGE_SECONDS = parseMaxAgeSeconds(process.env.AUTH_APP_SESSION_MAX_AGE_SECONDS, 60 * 60 * 24 * 30)
const WEB_SESSION_MAX_AGE_SECONDS = parseMaxAgeSeconds(process.env.AUTH_WEB_SESSION_MAX_AGE_SECONDS, 60 * 60 * 12)

const resolveSessionMode = (value: unknown): SessionMode => (String(value || "").toLowerCase() === "app" ? "app" : "web")

const resolveSessionMaxAge = (mode: SessionMode): number =>
  mode === "app" ? APP_SESSION_MAX_AGE_SECONDS : WEB_SESSION_MAX_AGE_SECONDS

const isMissingPasswordResetColumnError = (error: unknown) => {
  const code = String(asRecord(error).code || "")
  const message = String(asRecord(error).message || "")
  return code === "42703" || message.includes('column "password_reset_required" does not exist')
}

const isMissingSetupCompletedColumnError = (error: unknown) => {
  const code = String(asRecord(error).code || "")
  const message = String(asRecord(error).message || "")
  return code === "42703" || message.includes('column "setup_completed_at" does not exist')
}

const isMissingRequiresGuidedSetupColumnError = (error: unknown) => {
  const code = String(asRecord(error).code || "")
  const message = String(asRecord(error).message || "")
  return code === "42703" || message.includes('column "requires_guided_setup" does not exist')
}

const isMissingPreferredLocaleColumnError = (error: unknown) => {
  const code = String(asRecord(error).code || "")
  const message = String(asRecord(error).message || "")
  return code === "42703" || message.includes('column "preferred_locale" does not exist')
}

const isMissingEmailIdentityColumnError = (error: unknown) => {
  const code = String(asRecord(error).code || "")
  const message = String(asRecord(error).message || "")
  if (code !== "42703" && !message.includes('column "email"') && !message.includes('column "normalized_email"')) {
    return false
  }
  return (
    message.includes('column "email"') ||
    message.includes('column "normalized_email"') ||
    message.includes('column "email_verified_at"') ||
    message.includes('column "preferred_locale"')
  )
}

const ownerContext = normalizeTenantContext(undefined, "owner")

assertCoreRuntimeConfig()

const selectUsersByUsername = (identifier: string, normalizedIdentifier: string) => sql`
  SELECT id, username, role, tenant_id, password_hash, password_reset_required, preferred_locale, setup_completed_at, requires_guided_setup
  FROM users
  WHERE LOWER(BTRIM(username)) = ${normalizedIdentifier}
  ORDER BY
    CASE WHEN BTRIM(username) = ${identifier} THEN 0 ELSE 1 END,
    CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
    created_at ASC
  LIMIT 25
`

const selectUsersByUsernameLegacy = (identifier: string, normalizedIdentifier: string) => sql`
  SELECT id, username, role, tenant_id, password_hash
  FROM users
  WHERE LOWER(BTRIM(username)) = ${normalizedIdentifier}
  ORDER BY
    CASE WHEN BTRIM(username) = ${identifier} THEN 0 ELSE 1 END,
    CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
    created_at ASC
  LIMIT 25
`

const selectUsersByEmail = (normalizedEmail: string) => sql`
  SELECT id, username, role, tenant_id, password_hash, password_reset_required, preferred_locale, setup_completed_at, requires_guided_setup
  FROM users
  WHERE normalized_email = ${normalizedEmail}
  ORDER BY
    CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
    created_at ASC
  LIMIT 25
`

const selectUsersByEmailLegacy = (normalizedEmail: string) => sql`
  SELECT id, username, role, tenant_id, password_hash
  FROM users
  WHERE normalized_email = ${normalizedEmail}
  ORDER BY
    CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
    created_at ASC
  LIMIT 25
`

const loadUsersByUsername = async (identifier: string, normalizedIdentifier: string) => {
  try {
    return (await runTenantQuery(
      sql,
      ownerContext,
      selectUsersByUsername(identifier, normalizedIdentifier),
    )) as UserRow[]
  } catch (error) {
    if (
      !isMissingPasswordResetColumnError(error) &&
      !isMissingPreferredLocaleColumnError(error) &&
      !isMissingSetupCompletedColumnError(error) &&
      !isMissingRequiresGuidedSetupColumnError(error)
    ) {
      throw error
    }
    const fallbackUsers = (await runTenantQuery(
      sql,
      ownerContext,
      selectUsersByUsernameLegacy(identifier, normalizedIdentifier),
    )) as Array<Omit<UserRow, "password_reset_required" | "preferred_locale" | "setup_completed_at" | "requires_guided_setup">>
    return fallbackUsers.map((row) => ({
      ...row,
      password_reset_required: false,
      preferred_locale: DEFAULT_APP_LOCALE,
      setup_completed_at: null,
      requires_guided_setup: false,
    }))
  }
}

const loadUsersByEmail = async (normalizedEmail: string) => {
  try {
    return (await runTenantQuery(
      sql,
      ownerContext,
      selectUsersByEmail(normalizedEmail),
    )) as UserRow[]
  } catch (error) {
    if (isMissingEmailIdentityColumnError(error)) {
      return [] as UserRow[]
    }
    if (
      !isMissingPasswordResetColumnError(error) &&
      !isMissingPreferredLocaleColumnError(error) &&
      !isMissingSetupCompletedColumnError(error) &&
      !isMissingRequiresGuidedSetupColumnError(error)
    ) {
      throw error
    }
    const fallbackUsers = (await runTenantQuery(
      sql,
      ownerContext,
      selectUsersByEmailLegacy(normalizedEmail),
    )) as Array<Omit<UserRow, "password_reset_required" | "preferred_locale" | "setup_completed_at" | "requires_guided_setup">>
    return fallbackUsers.map((row) => ({
      ...row,
      password_reset_required: false,
      preferred_locale: DEFAULT_APP_LOCALE,
      setup_completed_at: null,
      requires_guided_setup: false,
    }))
  }
}

export const authOptions: NextAuthOptions = {
  useSecureCookies: process.env.NODE_ENV === "production",
  session: {
    strategy: "jwt",
    maxAge: APP_SESSION_MAX_AGE_SECONDS,
  },
  jwt: {
    async encode(params) {
      const mode = resolveSessionMode(params.token?.sessionMode)
      return defaultJwtEncode({
        ...params,
        maxAge: resolveSessionMaxAge(mode),
      })
    },
    async decode(params) {
      return defaultJwtDecode(params)
    },
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!sql) {
          throw new Error("Database not configured")
        }

        const credentialValues = (credentials || {}) as CredentialsInput
        const identifier = normalizeUsername(credentialValues.username)
        const password = String(credentialValues.password || "")
        const sessionMode = resolveSessionMode(credentialValues.sessionMode)
        const isEmailLogin = isEmailIdentifier(identifier)
        const normalizedEmail = normalizeSignupEmail(identifier)
        const headers = toRequestHeaders((req as { headers?: unknown } | undefined)?.headers)
        const ipAddress = getHeaderValue(headers, "x-forwarded-for") || getHeaderValue(headers, "x-real-ip") || null
        const userAgent = getHeaderValue(headers, "user-agent") || null

        if (!identifier || !password) {
          throw new Error("Email or username and password are required")
        }

        const normalizedUsername = normalizeUsernameLookup(identifier)

        try {
          const rateLimit = await checkRateLimit("authLogin", `${String(ipAddress || "unknown")}::${normalizedUsername}`)
          if (!rateLimit.success) {
            await logSecurityEvent({
              eventType: "auth_login_failure",
              severity: "warning",
              source: "next-auth",
              ipAddress,
              userAgent,
              metadata: { identifier, reason: "rate_limited" },
            })
            // Fire-and-forget — don't let alerting add latency to the auth response.
            // Rate-limit hit means 10+ failed attempts: could be a legitimate user
            // locked out or a brute-force attempt. Either warrants owner visibility.
            sendAgentAlertEmail({
              subject: `[FarmFlow] Login alert: ${identifier} is being rate-limited`,
              text: [
                `User "${identifier}" has been blocked after too many failed login attempts.`,
                ``,
                `IP: ${ipAddress || "unknown"}`,
                `Time: ${new Date().toISOString()}`,
                ``,
                `If this is a legitimate user who has forgotten their password, reset it via the admin console:`,
                `https://thefarmflow.in/admin/tenants`,
              ].join("\n"),
            }).catch(() => {})
            return null
          }
        } catch (rateLimitError) {
          logServerWarning("Auth rate-limit check failed", rateLimitError)
          if (isRateLimitUnavailableError(rateLimitError)) {
            throw rateLimitError
          }
        }

        let users: UserRow[] = []
        try {
          if (isEmailLogin) {
            users = await loadUsersByEmail(normalizedEmail)
          }
          if (!users.length) {
            users = await loadUsersByUsername(identifier, normalizedUsername)
          }
        } catch (error) {
          if (!isMissingEmailIdentityColumnError(error)) {
            throw error
          }
          users = await loadUsersByUsername(identifier, normalizedUsername)
        }

        if (!users || users.length === 0) {
          await logSecurityEvent({
            eventType: "auth_login_failure",
            severity: "warning",
            source: "next-auth",
            ipAddress,
            userAgent,
            metadata: { identifier, reason: "user_not_found" },
          })
          return null
        }

        let user: UserRow | null = null
        let needsRehash = false
        for (const candidate of users) {
          const storedHash = String(candidate.password_hash || "")
          const verifyResult = verifyPassword(password, storedHash)
          if (verifyResult.matches) {
            user = candidate
            needsRehash = verifyResult.needsRehash
            break
          }
        }

        if (!user) {
          await logSecurityEvent({
            eventType: "auth_login_failure",
            severity: "warning",
            source: "next-auth",
            ipAddress,
            userAgent,
            metadata: { identifier, reason: "invalid_password", candidates: users.length },
          })
          // Alert the owner immediately — at current scale (small user base) any
          // wrong-password attempt for a known account warrants visibility. Add a
          // threshold here once the user base grows to avoid noise.
          const knownUser = users[0]
          sendAgentAlertEmail({
            subject: `[FarmFlow] Login failure: ${knownUser.username} entered wrong password`,
            text: [
              `User "${knownUser.username}" failed to log in with an incorrect password.`,
              ``,
              `IP:   ${ipAddress || "unknown"}`,
              `Time: ${new Date().toISOString()}`,
              ``,
              `If they are locked out, reset their password from the admin console:`,
              `https://thefarmflow.in/admin/tenants`,
            ].join("\n"),
          }).catch(() => {})
          return null
        }

        const passwordResetRequired = Boolean(user.password_reset_required)

        if (needsRehash) {
          try {
            const nextHash = hashPassword(password)
            await runTenantQuery(
              sql,
              ownerContext,
              sql`
                UPDATE users
                SET password_hash = ${nextHash}
                WHERE id = ${user.id}
              `,
            )
          } catch (error) {
            logServerWarning("Password rehash failed", error)
          }
        }

        await logSecurityEvent({
          tenantId: String(user.tenant_id),
          actorUserId: String(user.id),
          actorUsername: String(user.username),
          actorRole: String(user.role),
          eventType: "auth_login_success",
          severity: "info",
          source: "next-auth",
          ipAddress,
          userAgent,
        })

        return {
          id: String(user.id),
          name: String(user.username),
          role: normalizeRole(user.role),
          tenantId: String(user.tenant_id),
          sessionMode,
          passwordResetRequired,
          preferredLocale: normalizeAppLocale(user.preferred_locale || DEFAULT_APP_LOCALE),
          setupCompleted: Boolean(user.setup_completed_at),
          requiresGuidedSetup: Boolean(user.requires_guided_setup),
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.sub = String(user.id || token.sub || "")
        token.role = normalizeRole(user.role)
        token.tenantId = String(user.tenantId || "")
        token.sessionMode = resolveSessionMode(user.sessionMode)
        token.passwordResetRequired = Boolean(user.passwordResetRequired)
        token.preferredLocale = normalizeAppLocale(user.preferredLocale || DEFAULT_APP_LOCALE)
        token.setupCompleted = Boolean(user.setupCompleted)
        token.requiresGuidedSetup = Boolean(user.requiresGuidedSetup)
      } else if (trigger === "update" && session) {
        const sessionUpdate = session as Record<string, unknown>
        if ("preferredLocale" in sessionUpdate) {
          token.preferredLocale = normalizeAppLocale(sessionUpdate.preferredLocale || DEFAULT_APP_LOCALE)
        }
        if ("setupCompleted" in sessionUpdate) {
          token.setupCompleted = Boolean(sessionUpdate.setupCompleted)
        }
        if ("requiresGuidedSetup" in sessionUpdate) {
          token.requiresGuidedSetup = Boolean(sessionUpdate.requiresGuidedSetup)
        }
      } else {
        token.sessionMode = resolveSessionMode(token.sessionMode)
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.sub || "")
        session.user.role = normalizeRole(token.role)
        session.user.tenantId = String(token.tenantId || "")
        session.user.sessionMode = resolveSessionMode(token.sessionMode)
        session.user.passwordResetRequired = Boolean(token.passwordResetRequired)
        session.user.preferredLocale = normalizeAppLocale(token.preferredLocale || DEFAULT_APP_LOCALE)
        session.user.setupCompleted = Boolean(token.setupCompleted)
        session.user.requiresGuidedSetup = Boolean(token.requiresGuidedSetup)
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
}
