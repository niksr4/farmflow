"use client"

import { SessionProvider, signIn, signOut, useSession } from "next-auth/react"
import type { ReactNode } from "react"

interface User {
  username: string
  role: "admin" | "user" | "owner"
  tenantId: string
  mfaEnabled?: boolean
  mfaVerified?: boolean
}

interface AuthContextType {
  user: User | null
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  isAdmin: boolean
  isOwner: boolean
  status: "loading" | "authenticated" | "unauthenticated"
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}

export function useAuth(): AuthContextType {
  const { data: session, status } = useSession()
  const user = session?.user
    ? {
        username: String(session.user.name || ""),
        role: (session.user as any).role as User["role"],
        tenantId: String((session.user as any).tenantId || ""),
        mfaEnabled: Boolean((session.user as any).mfaEnabled),
        mfaVerified: Boolean((session.user as any).mfaVerified),
      }
    : null

  const login = async (username: string, password: string) => {
    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    })

    if (result?.ok) {
      return { ok: true }
    }

    return { ok: false, error: result?.error || "Invalid username or password" }
  }

  const logout = () => {
    signOut({ callbackUrl: "/" })
  }

  return {
    user,
    login,
    logout,
    isAdmin: user?.role === "admin",
    isOwner: user?.role === "owner",
    status,
  }
}
