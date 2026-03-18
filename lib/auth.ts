import "server-only"

import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { decode as defaultJwtDecode, encode as defaultJwtEncode } from "next-auth/jwt"
import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { hashPassword, verifyPassword } from "@/lib/passwords"
import { logSecurityEvent } from "@/lib/server/security-events"
import { checkRateLimit } from "@/lib/rate-limit"

type SessionMode = "app" | "web"
type FarmFlowRole = "admin" | "user" | "owner"

type UserRow = {
  id: string
  username: string
  role: FarmFlowRole
  tenant_id: string
  password_hash: string
  password_reset_required: boolean
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

export const authOptions: NextAuthOptions = {
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
        const username = String(credentialValues.username || "").trim()
        const password = String(credentialValues.password || "")
        const sessionMode = resolveSessionMode(credentialValues.sessionMode)
        const headers = toRequestHeaders((req as { headers?: unknown } | undefined)?.headers)
        const ipAddress = getHeaderValue(headers, "x-forwarded-for") || getHeaderValue(headers, "x-real-ip") || null
        const userAgent = getHeaderValue(headers, "user-agent") || null

        if (!username || !password) {
          throw new Error("Username and password are required")
        }

        try {
          const rateLimit = await checkRateLimit("authLogin", `${String(ipAddress || "unknown")}::${username.toLowerCase()}`)
          if (!rateLimit.success) {
            await logSecurityEvent({
              eventType: "auth_login_failure",
              severity: "warning",
              source: "next-auth",
              ipAddress,
              userAgent,
              metadata: { username, reason: "rate_limited" },
            })
            return null
          }
        } catch (rateLimitError) {
          console.warn("Auth rate-limit check failed:", rateLimitError)
        }

        const ownerContext = normalizeTenantContext(undefined, "owner")
        let users: UserRow[] = []
        try {
          users = (await runTenantQuery(
            sql,
            ownerContext,
            sql`
              SELECT id, username, role, tenant_id, password_hash, password_reset_required
              FROM users
              WHERE LOWER(username) = LOWER(${username})
              ORDER BY
                CASE WHEN username = ${username} THEN 0 ELSE 1 END,
                CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
                created_at ASC
              LIMIT 25
            `,
          )) as UserRow[]
        } catch (error) {
          if (!isMissingPasswordResetColumnError(error)) {
            throw error
          }
          // Backward compatibility for databases that haven't run password rotation migration yet.
          const fallbackUsers = (await runTenantQuery(
            sql,
            ownerContext,
            sql`
              SELECT id, username, role, tenant_id, password_hash
              FROM users
              WHERE LOWER(username) = LOWER(${username})
              ORDER BY
                CASE WHEN username = ${username} THEN 0 ELSE 1 END,
                CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
                created_at ASC
              LIMIT 25
            `,
          )) as Array<Omit<UserRow, "password_reset_required">>
          users = fallbackUsers.map((row) => ({ ...row, password_reset_required: false }))
        }

        if (!users || users.length === 0) {
          await logSecurityEvent({
            eventType: "auth_login_failure",
            severity: "warning",
            source: "next-auth",
            ipAddress,
            userAgent,
            metadata: { username, reason: "user_not_found" },
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
            metadata: { username, reason: "invalid_password", candidates: users.length },
          })
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
            console.warn("Password rehash failed:", error)
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
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = normalizeRole(user.role)
        token.tenantId = String(user.tenantId || "")
        token.sessionMode = resolveSessionMode(user.sessionMode)
        token.passwordResetRequired = Boolean(user.passwordResetRequired)
      } else {
        token.sessionMode = resolveSessionMode(token.sessionMode)
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = normalizeRole(token.role)
        session.user.tenantId = String(token.tenantId || "")
        session.user.sessionMode = resolveSessionMode(token.sessionMode)
        session.user.passwordResetRequired = Boolean(token.passwordResetRequired)
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
}
