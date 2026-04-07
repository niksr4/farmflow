"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { User, Lock, Info, CheckCircle2, Eye, EyeOff, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useLocale } from "@/components/locale-provider"
import { shouldForceGuidedSetup } from "@/lib/guided-setup"
import { useAuth } from "@/hooks/use-auth"
import posthog from "posthog-js"

export default function LoginPage() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [capsLockOn, setCapsLockOn] = useState(false)
  const [sessionMode, setSessionMode] = useState<"app" | "web">("web")
  const { login } = useAuth()
  const { t } = useLocale()
  const router = useRouter()

  useEffect(() => {
    if (typeof window === "undefined") return
    const isIosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
    const isStandalone = isIosStandalone || window.matchMedia("(display-mode: standalone)").matches
    setSessionMode(isStandalone ? "app" : "web")
  }, [])

  const ensurePrivacyNoticeAccepted = async (role: string, tenantId: string) => {
    if (!tenantId || role === "owner") {
      return
    }

    try {
      const statusResponse = await fetch("/api/privacy/notice-status", { cache: "no-store" })
      const statusPayload = await statusResponse.json().catch(() => null)
      if (!statusResponse.ok || !statusPayload?.success) {
        return
      }

      if (!statusPayload?.status?.acceptedAt) {
        await fetch("/api/privacy/accept", { method: "POST" }).catch(() => null)
      }
    } catch {
      // Privacy acknowledgement should not block login if the workspace is not migrated yet.
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setError("")
    const normalizedIdentifier = username.trim()
    if (!normalizedIdentifier || !password) {
      setError("Enter your email or username and password.")
      return
    }

    try {
      setIsSubmitting(true)
      const result = await login(normalizedIdentifier, password, sessionMode)
      if (!result.ok) {
        throw new Error(result.error || "Invalid email, username, or password")
      }
      const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" })
      const sessionPayload = await sessionResponse.json().catch(() => null)
      const role = String(sessionPayload?.user?.role || "").toLowerCase()
      const tenantId = String(sessionPayload?.user?.tenantId || "")
      const distinctId = `${tenantId || "global"}:${normalizedIdentifier}`
      // Identify user in PostHog and capture sign-in event
      posthog.identify(distinctId, {
        username: normalizedIdentifier,
        role,
        tenant_id: tenantId || "global",
      })
      posthog.capture("user_signed_in", {
        username: normalizedIdentifier,
        role,
        tenant_id: tenantId || "global",
      })
      posthog.capture("funnel_login_succeeded", {
        role,
        tenant_id: tenantId || "global",
      })
      await ensurePrivacyNoticeAccepted(role, tenantId)
      const mustCompleteGuidedSetup = shouldForceGuidedSetup({
        role,
        requiresGuidedSetup: sessionPayload?.user?.requiresGuidedSetup,
        setupCompleted: sessionPayload?.user?.setupCompleted,
      })
      router.push(role === "owner" ? "/admin/tenants" : mustCompleteGuidedSetup ? "/welcome" : "/dashboard")
    } catch (err: any) {
      posthog.captureException(err)
      const fallback = "Unable to sign in right now. Please try again."
      const message = String(err?.message || fallback)
      const isCredentialError = message.includes("Invalid email, username, or password")
      const isAuthSystemError = message.includes("Authentication is temporarily unavailable")
      setError(isCredentialError || isAuthSystemError ? message : fallback)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07110f] px-6 py-10 text-stone-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_24%),radial-gradient(circle_at_82%_12%,rgba(245,158,11,0.12),transparent_18%),linear-gradient(180deg,#07110f_0%,#091916_42%,#081310_100%)]" />
        <div className="absolute -top-28 left-[-6%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.18),transparent_70%)] blur-[120px]" />
        <div className="absolute bottom-[-18%] right-[10%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.16),transparent_70%)] blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-[1.05fr_0.95fr] items-center">
        <div className="space-y-6">
          <div className="inline-flex rounded-2xl border border-white/10 bg-[#081613]/75 px-3 py-2 shadow-sm backdrop-blur">
            <Image src="/brand-logo.svg" alt="FarmFlow" width={220} height={86} className="h-14 w-auto" priority />
          </div>
          <h1 className="font-display text-3xl text-stone-50 sm:text-4xl">{t("public.login.heroTitle")}</h1>
          <p className="text-stone-300">
            {t("public.login.heroDescription")}
          </p>
          <div className="space-y-2 text-sm text-stone-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              <span>{t("public.login.point1")}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              <span>{t("public.login.point2")}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              <span>{t("public.login.point3")}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              <span>{t("public.login.point4")}</span>
            </div>
          </div>
          <p className="text-xs text-stone-400">
            {t("public.login.needAccess")}{" "}
            <Link href="/signup" className="text-emerald-200 underline">
              {t("public.login.createWorkspace")}
            </Link>
            .
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0a1714]/92 p-6 shadow-2xl backdrop-blur-md sm:p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold text-emerald-200">{t("public.login.title")}</h1>
            <p className="mt-2 text-stone-300">{t("public.login.subtitle")}</p>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200" aria-live="polite">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <Label htmlFor="username" className="mb-1 block text-stone-200">
                  {t("public.login.identifier")}
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Username help"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 text-stone-400 hover:text-stone-200"
                      >
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t("public.login.identifierHelp")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-stone-500" />
                </div>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value)
                    if (error) setError("")
                  }}
                  className="border-white/10 bg-[#111d1a] pl-10 text-stone-100 placeholder:text-stone-500 focus-visible:bg-[#15231f]"
                  placeholder="you@estate.com or username"
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
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="password" className="mb-1 block text-stone-200">
                  {t("public.login.password")}
                </Label>
                <a
                  href="mailto:support@thefarmflow.in?subject=Password%20Reset%20Request"
                  className="mb-1 text-xs text-emerald-300 hover:text-emerald-200"
                >
                  Forgot password?
                </a>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Password help"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 text-stone-400 hover:text-stone-200"
                      >
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t("public.login.passwordHelp")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-stone-500" />
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
                  className="border-white/10 bg-[#111d1a] pl-10 pr-10 text-stone-100 placeholder:text-stone-500 focus-visible:bg-[#15231f]"
                  placeholder="Enter password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-stone-400 hover:text-stone-200"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {capsLockOn && (
              <p className="flex items-center gap-2 rounded-md border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t("public.login.capsLock")}
              </p>
            )}

            <Button
              type="submit"
              className="w-full border-emerald-300/40 bg-emerald-300 text-[#06110f] shadow-[0_18px_36px_-18px_rgba(110,231,183,0.6)] hover:bg-emerald-200"
              disabled={isSubmitting || !username.trim() || !password}
            >
              {isSubmitting ? "Signing in..." : t("public.login.title")}
            </Button>
            <p className="text-[11px] text-stone-400">
              {sessionMode === "app" ? t("public.login.sessionModeApp") : t("public.login.sessionModeWeb")}
            </p>
          </form>
          <p className="mt-4 text-xs text-stone-400">
            By signing in, you acknowledge the{" "}
            <Link href="/privacy" className="text-emerald-200 underline">
              Privacy Notice
            </Link>
            .
          </p>
          <p className="mt-2 text-xs text-stone-400">
            {t("public.login.newToFarmFlow")}{" "}
            <Link href="/signup" className="text-emerald-200 underline">
              {t("public.login.createWorkspace")}
            </Link>{" "}
            {t("public.login.createAndVerify")}
          </p>
        </div>
      </div>
    </div>
  )
}
