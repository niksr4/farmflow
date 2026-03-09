import type { DefaultSession } from "next-auth"

type FarmFlowRole = "admin" | "user" | "owner"
type SessionMode = "app" | "web"

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      role: FarmFlowRole
      tenantId: string
      sessionMode?: SessionMode
      mfaEnabled: boolean
      mfaVerified: boolean
      passwordResetRequired: boolean
    }
  }

  interface User {
    role: FarmFlowRole
    tenantId: string
    sessionMode?: SessionMode
    mfaEnabled?: boolean
    mfaVerified?: boolean
    passwordResetRequired?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: FarmFlowRole
    tenantId?: string
    sessionMode?: SessionMode
    mfaEnabled?: boolean
    mfaVerified?: boolean
    passwordResetRequired?: boolean
  }
}
