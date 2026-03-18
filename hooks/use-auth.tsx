"use client"

import { SessionProvider, signIn, signOut, useSession } from "next-auth/react"
import type { ReactNode } from "react"

interface User {
  username: string
  role: "admin" | "user" | "owner"
  tenantId: string
  sessionMode?: "app" | "web"
  passwordResetRequired?: boolean
}

interface AuthContextType {
  user: User | null
  login: (
    username: string,
    password: string,
    sessionMode?: "app" | "web",
  ) => Promise<{ ok: boolean; error?: string }>
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
          role: session.user.role,
          tenantId: String(session.user.tenantId || ""),
          sessionMode: session.user.sessionMode,
          passwordResetRequired: Boolean(session.user.passwordResetRequired),
        }
    : null

  const login = async (username: string, password: string, sessionMode: "app" | "web" = "web") => {
    const result = await signIn("credentials", {
      username,
      password,
      sessionMode,
      redirect: false,
    })

    if (result?.ok) {
      return { ok: true }
    }

    const rawError = String(result?.error || "")
    const mappedError =
      rawError === "CredentialsSignin"
        ? "Invalid username or password"
        : rawError === "Configuration"
          ? "Authentication is temporarily unavailable"
          : rawError || "Invalid username or password"

    return { ok: false, error: mappedError }
  }

  const logout = () => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const clearPayload = { type: "CLEAR_SENSITIVE_DATA" }
      navigator.serviceWorker.controller?.postMessage(clearPayload)
      navigator.serviceWorker.ready
        .then((registration) => {
          registration.active?.postMessage(clearPayload)
        })
        .catch(() => {
          // Ignore failures and continue logout.
        })
    }
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
