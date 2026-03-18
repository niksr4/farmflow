import type { DefaultSession } from "next-auth"

type FarmFlowRole = "admin" | "user" | "owner"
type SessionMode = "app" | "web"

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string
      role: FarmFlowRole
      tenantId: string
      sessionMode?: SessionMode
      passwordResetRequired: boolean
    }
  }

  interface User {
    id: string
    role: FarmFlowRole
    tenantId: string
    sessionMode?: SessionMode
    passwordResetRequired?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    role?: FarmFlowRole
    tenantId?: string
    sessionMode?: SessionMode
    passwordResetRequired?: boolean
  }
}
