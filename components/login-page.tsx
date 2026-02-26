"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { User, Lock, Info, CheckCircle2, Eye, EyeOff, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/hooks/use-auth"
import posthog from "posthog-js"

export default function LoginPage() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [capsLockOn, setCapsLockOn] = useState(false)
  const { login } = useAuth()
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setError("")
    const normalizedUsername = username.trim()
    if (!normalizedUsername || !password) {
      setError("Enter your username and password.")
      return
    }

    try {
      setIsSubmitting(true)
      const result = await login(normalizedUsername, password)
      if (!result.ok) {
        throw new Error(result.error || "Invalid username or password")
      }
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" })
      const sessionPayload = await sessionResponse.json().catch(() => null)
      const role = String(sessionPayload?.user?.role || "").toLowerCase()
      const tenantId = String(sessionPayload?.user?.tenantId || "")
      const distinctId = `${tenantId || "global"}:${normalizedUsername}`
      // Identify user in PostHog and capture sign-in event
      posthog.identify(distinctId, {
        username: normalizedUsername,
        role,
        tenant_id: tenantId || "global",
      })
      posthog.capture("user_signed_in", {
        username: normalizedUsername,
        role,
        tenant_id: tenantId || "global",
      })
      router.push(role === "owner" ? "/admin/tenants" : "/dashboard")
    } catch (err: any) {
      posthog.captureException(err)
      const fallback = "Unable to sign in right now. Please try again."
      const message = String(err?.message || fallback)
      const isCredentialError = message.includes("Invalid username or password")
      const isAuthSystemError = message.includes("Authentication is temporarily unavailable")
      setError(isCredentialError || isAuthSystemError ? message : fallback)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-6 py-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-28 left-[-6%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle_at_center,rgba(152,85,42,0.35),transparent_70%)] blur-[120px]" />
        <div className="absolute bottom-[-18%] right-[10%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle_at_center,rgba(70,120,90,0.3),transparent_70%)] blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-[1.05fr_0.95fr] items-center">
        <div className="space-y-6">
          <div className="inline-flex rounded-2xl border border-white/60 bg-white/75 px-3 py-2 shadow-sm backdrop-blur">
            <Image src="/brand-logo.svg" alt="FarmFlow" width={220} height={86} className="h-14 w-auto" priority />
          </div>
          <h1 className="font-display text-3xl sm:text-4xl text-slate-900">
            Welcome back to your estate workspace
          </h1>
          <p className="text-muted-foreground">
            Sign in to manage lots, yields, quality evidence, and farmer-first traceability across the season.
          </p>
          <div className="space-y-2 text-sm text-slate-700">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Traceability across lots and locations</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Processing, moisture, and quality notes</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Dispatch and sales reconciliation</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Rainfall and weather context</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Need access?{" "}
            <Link href="/signup" className="underline">
              Request access
            </Link>
            .
          </p>
        </div>

        <div className="bg-white/90 dark:bg-slate-900/80 rounded-2xl border border-white/60 dark:border-white/10 shadow-2xl backdrop-blur-md p-6 sm:p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold text-emerald-700">Sign in</h1>
            <p className="text-gray-600 mt-2">Access your estate operations workspace</p>
          </div>

          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700" aria-live="polite">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <Label htmlFor="username" className="block text-gray-700 mb-1">
                  Username
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Username help"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                      >
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Use the username created for your estate account.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value)
                    if (error) setError("")
                  }}
                  className="pl-10"
                  placeholder="Enter username"
                  autoFocus
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <Label htmlFor="password" className="block text-gray-700 mb-1">
                  Password
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Password help"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                      >
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Credentials are unique to each estate tenant.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (error) setError("")
                  }}
                  onKeyUp={(event) => {
                    setCapsLockOn(event.getModifierState("CapsLock"))
                  }}
                  onBlur={() => setCapsLockOn(false)}
                  className="pl-10 pr-10"
                  placeholder="Enter password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-700"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {capsLockOn && (
              <p className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                Caps Lock is on. Passwords are case-sensitive.
              </p>
            )}

            <Button
              type="submit"
              className="w-full bg-emerald-700 hover:bg-emerald-800"
              disabled={isSubmitting || !username.trim() || !password}
            >
              {isSubmitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <p className="mt-4 text-xs text-gray-500">
            By signing in, you acknowledge the{" "}
            <Link href="/privacy" className="underline">
              Privacy Notice
            </Link>
            .
          </p>
          <p className="mt-2 text-xs text-gray-500">
            New to FarmFlow?{" "}
            <Link href="/signup" className="underline">
              Request access
            </Link>{" "}
            and we will provision your tenant.
          </p>
        </div>
      </div>
    </div>
  )
}
