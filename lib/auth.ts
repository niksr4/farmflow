import "server-only"

import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { hashPassword, verifyPassword } from "@/lib/passwords"
import { logSecurityEvent } from "@/lib/server/security-events"
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
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

        const username = String(credentials?.username || "").trim()
        const password = String(credentials?.password || "")
        const headers = (req as any)?.headers || {}
        const ipAddress =
          (Array.isArray(headers["x-forwarded-for"]) ? headers["x-forwarded-for"][0] : headers["x-forwarded-for"]) ||
          headers["x-real-ip"] ||
          null
        const userAgent =
          (Array.isArray(headers["user-agent"]) ? headers["user-agent"][0] : headers["user-agent"]) || null

        if (!username || !password) {
          throw new Error("Username and password are required")
        }

        const ownerContext = normalizeTenantContext(undefined, "owner")
        const users = await runTenantQuery(
          sql,
          ownerContext,
          sql`
            SELECT id, username, role, tenant_id, password_hash
            FROM users
            WHERE username = ${username}
            LIMIT 1
          `,
        )

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

        const user = users[0]
        const storedHash = String(user.password_hash || "")
        const { matches, needsRehash } = verifyPassword(password, storedHash)

        if (!matches) {
          await logSecurityEvent({
            tenantId: String(user.tenant_id),
            actorUserId: String(user.id),
            actorUsername: String(user.username),
            actorRole: String(user.role),
            eventType: "auth_login_failure",
            severity: "warning",
            source: "next-auth",
            ipAddress,
            userAgent,
            metadata: { username, reason: "invalid_password" },
          })
          return null
        }

        const mfaEnabled = false
        const mfaVerified = false

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
          role: String(user.role),
          tenantId: String(user.tenant_id),
          mfaVerified,
          mfaEnabled,
        } as any
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.tenantId = (user as any).tenantId
        token.mfaVerified = (user as any).mfaVerified || false
        token.mfaEnabled = (user as any).mfaEnabled || false
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).role = token.role
        ;(session.user as any).tenantId = token.tenantId
        ;(session.user as any).mfaVerified = Boolean(token.mfaVerified)
        ;(session.user as any).mfaEnabled = Boolean(token.mfaEnabled)
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
}
