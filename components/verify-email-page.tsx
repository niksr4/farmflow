"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { useLocale } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type VerifyState = "idle" | "verifying" | "success" | "error"

type VerifyEmailPageProps = {
  initialToken?: string
  initialEmail?: string
}

export default function VerifyEmailPage({ initialToken = "", initialEmail = "" }: VerifyEmailPageProps) {
  const { t } = useLocale()
  const [email, setEmail] = useState(initialEmail)
  const [verifyState, setVerifyState] = useState<VerifyState>(initialToken ? "verifying" : "idle")
  const [statusDetail, setStatusDetail] = useState("")
  const [verifiedTenantName, setVerifiedTenantName] = useState("")
  const [isResending, setIsResending] = useState(false)
  const message = useMemo(() => {
    if (verifyState === "success") {
      return t("public.verify.successMessage", { tenant: verifiedTenantName || "Your workspace" })
    }
    if (verifyState === "verifying") {
      return t("public.verify.verifyingMessage")
    }
    if (statusDetail) {
      return statusDetail
    }
    return t("public.verify.idleMessage")
  }, [statusDetail, t, verifiedTenantName, verifyState])

  useEffect(() => {
    setEmail(initialEmail)
  }, [initialEmail])

  useEffect(() => {
    if (!initialToken) return

    let cancelled = false
    const verify = async () => {
      try {
        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: initialToken }),
        })
        const data = await response.json().catch(() => null)
        if (cancelled) return
        if (!response.ok || !data?.success) {
          throw new Error(data?.error || "Verification failed")
        }
        setVerifyState("success")
        setVerifiedTenantName(String(data.tenantName || "Your workspace"))
        setStatusDetail("")
      } catch (error: any) {
        if (cancelled) return
        setVerifyState("error")
        setStatusDetail(error?.message || "Verification failed. Request a new link below.")
      }
    }

    void verify()
    return () => {
      cancelled = true
    }
  }, [initialToken])

  const handleResend = async () => {
    if (!email.trim()) {
      setVerifyState("error")
      setStatusDetail(t("public.verify.resendPrompt"))
      return
    }

    try {
      setIsResending(true)
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Unable to resend verification email")
      }
      setVerifyState("idle")
      setStatusDetail(t("public.verify.sentMessage", { email: data.maskedEmail || email.trim().toLowerCase() }))
    } catch (error: any) {
      setVerifyState("error")
      setStatusDetail(error?.message || "Unable to resend verification email")
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-[-8%] h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle_at_center,rgba(152,85,42,0.35),transparent_70%)] blur-[120px]" />
        <div className="absolute bottom-[-18%] right-[10%] h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle_at_center,rgba(70,120,90,0.3),transparent_70%)] blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <Card className="border border-white/60 bg-white/90 backdrop-blur-md dark:bg-slate-900/80">
          <CardHeader>
            <CardTitle className="font-display">
              {verifyState === "success"
                ? t("public.verify.successTitle")
                : initialToken
                  ? t("public.verify.verifyingTitle")
                  : t("public.verify.title")}
            </CardTitle>
            <CardDescription>{message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {verifyState === "verifying" ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {t("public.verify.provisioningHint")}
              </div>
            ) : null}

            {verifyState === "success" ? (
              <div className="space-y-3">
                <Button asChild className="w-full">
                  <Link href="/login">{t("public.verify.signIn")}</Link>
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t("public.verify.signInHelp")}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("public.signup.email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@estate.com"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={handleResend} disabled={isResending}>
                  {isResending ? `${t("public.verify.resend")}...` : t("public.verify.resend")}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t("public.verify.alreadyVerified")}{" "}
                  <Link href="/login" className="underline">
                    {t("public.verify.signIn")}
                  </Link>
                  .
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
