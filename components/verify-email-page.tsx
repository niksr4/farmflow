"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

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
  const [email, setEmail] = useState(initialEmail)
  const [verifyState, setVerifyState] = useState<VerifyState>(initialToken ? "verifying" : "idle")
  const [message, setMessage] = useState(
    initialToken ? "Verifying your email and provisioning your workspace..." : "Check your inbox to verify your FarmFlow workspace."
  )
  const [isResending, setIsResending] = useState(false)

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
        setMessage(`Email verified. ${data.tenantName || "Your workspace"} is ready. Sign in with your email and password.`)
      } catch (error: any) {
        if (cancelled) return
        setVerifyState("error")
        setMessage(error?.message || "Verification failed. Request a new link below.")
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
      setMessage("Enter your email to resend the verification link.")
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
      setMessage(`Verification email sent to ${data.maskedEmail || email.trim().toLowerCase()}.`)
    } catch (error: any) {
      setVerifyState("error")
      setMessage(error?.message || "Unable to resend verification email")
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
              {verifyState === "success" ? "Workspace Ready" : initialToken ? "Verifying Email" : "Verify Your Email"}
            </CardTitle>
            <CardDescription>{message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {verifyState === "verifying" ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Setting up your tenant, access, and starter workspace...
              </div>
            ) : null}

            {verifyState === "success" ? (
              <div className="space-y-3">
                <Button asChild className="w-full">
                  <Link href="/login">Sign In</Link>
                </Button>
                <p className="text-xs text-muted-foreground">
                  Use the same email and password you entered during signup.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
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
                  {isResending ? "Resending..." : "Resend Verification Email"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Already verified?{" "}
                  <Link href="/login" className="underline">
                    Sign in
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
