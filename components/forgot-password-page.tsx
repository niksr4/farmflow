"use client"

import { useState } from "react"
import Link from "next/link"

import { useLocale } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ForgotPasswordPage() {
  const { t } = useLocale()
  const [identifier, setIdentifier] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")

    const trimmed = identifier.trim()
    if (!trimmed) {
      setError(t("public.forgotPassword.requiredError"))
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: trimmed }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Unable to send reset link")
      }
      setSubmitted(true)
    } catch (err: any) {
      setError(err?.message || "Unable to send reset link")
    } finally {
      setIsSubmitting(false)
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
            <CardTitle className="font-display">{t("public.forgotPassword.title")}</CardTitle>
            <CardDescription>
              {submitted ? t("public.forgotPassword.genericSuccess") : t("public.forgotPassword.subtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {submitted ? (
              <div className="space-y-3">
                <Button asChild className="w-full">
                  <Link href="/login">{t("public.forgotPassword.backToLogin")}</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error ? (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="identifier">{t("public.forgotPassword.identifier")}</Label>
                  <Input
                    id="identifier"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="you@estate.com or username"
                    autoFocus
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? t("public.forgotPassword.submitting") : t("public.forgotPassword.submit")}
                </Button>
                <p className="text-xs text-muted-foreground">
                  <Link href="/login" className="underline">
                    {t("public.forgotPassword.backToLogin")}
                  </Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
