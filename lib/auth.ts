import "server-only"

import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { sql } from "@/lib/server/db"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { hashPassword, verifyPassword } from "@/lib/passwords"

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
      async authorize(credentials) {
        if (!sql) {
          throw new Error("Database not configured")
        }

        const username = String(credentials?.username || "").trim()
        const password = String(credentials?.password || "")

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
          return null
        }

        const user = users[0]
        const storedHash = String(user.password_hash || "")
        const { matches, needsRehash } = verifyPassword(password, storedHash)

        if (!matches) {
          return null
        }

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

        return {
          id: String(user.id),
          name: String(user.username),
          role: String(user.role),
          tenantId: String(user.tenant_id),
        } as any
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.tenantId = (user as any).tenantId
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).role = token.role
        ;(session.user as any).tenantId = token.tenantId
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
}
