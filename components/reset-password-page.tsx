"use client"

import { useState } from "react"
import Link from "next/link"

import { useLocale } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type ResetPasswordPageProps = {
  initialToken?: string
}

export default function ResetPasswordPage({ initialToken = "" }: ResetPasswordPageProps) {
  const { t } = useLocale()
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  const token = initialToken.trim()

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")

    if (!token) {
      setError(t("public.resetPassword.missingToken"))
      return
    }
    if (newPassword.length < 8) {
      setError(t("public.resetPassword.lengthError"))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t("public.resetPassword.mismatchError"))
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Unable to reset password")
      }
      setSuccess(true)
    } catch (err: any) {
      setError(err?.message || "Unable to reset password")
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
            <CardTitle className="font-display">
              {success ? t("public.resetPassword.successTitle") : t("public.resetPassword.title")}
            </CardTitle>
            <CardDescription>
              {success ? t("public.resetPassword.successMessage") : t("public.resetPassword.subtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {success ? (
              <Button asChild className="w-full">
                <Link href="/login">{t("public.resetPassword.signIn")}</Link>
              </Button>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error ? (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                    {!token || error === t("public.resetPassword.missingToken") ? (
                      <>
                        {" "}
                        <Link href="/forgot-password" className="underline">
                          {t("public.resetPassword.requestNewLink")}
                        </Link>
                      </>
                    ) : null}
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="newPassword">{t("public.resetPassword.newPassword")}</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    autoFocus
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">{t("public.resetPassword.confirmPassword")}</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? t("public.resetPassword.submitting") : t("public.resetPassword.submit")}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
