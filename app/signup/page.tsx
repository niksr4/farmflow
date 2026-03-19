"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import posthog from "posthog-js"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Info } from "lucide-react"

export default function SignupRoute() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    estateName: "",
    country: "",
  })

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-[-8%] h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle_at_center,rgba(152,85,42,0.35),transparent_70%)] blur-[120px]" />
        <div className="absolute bottom-[-18%] right-[10%] h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle_at_center,rgba(70,120,90,0.3),transparent_70%)] blur-[120px]" />
      </div>
      <div className="w-full max-w-md space-y-6 relative z-10">
        <Card className="border border-white/60 bg-white/85 backdrop-blur-md dark:bg-slate-900/75">
          <CardHeader>
            <CardTitle className="font-display">Create Your Workspace</CardTitle>
            <CardDescription>
              Start your FarmFlow workspace with your email, then verify it to provision your tenant and sign in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault()
                if (isSubmitting) return
                const normalized = {
                  name: form.name.trim(),
                  email: form.email.trim().toLowerCase(),
                  password: form.password,
                  estateName: form.estateName.trim(),
                  country: form.country.trim(),
                  preferredLocale:
                    typeof window !== "undefined" && window.navigator?.language ? String(window.navigator.language) : "en",
                }
                if (!normalized.name || !normalized.email || !normalized.password || !normalized.estateName) {
                  setErrorMessage("Please fill in name, email, password, and estate name.")
                  return
                }
                setIsSubmitting(true)
                setErrorMessage("")
                try {
                  const response = await fetch("/api/auth/signup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: normalized.name,
                      email: normalized.email,
                      password: normalized.password,
                      estateName: normalized.estateName,
                      country: normalized.country,
                      preferredLocale: normalized.preferredLocale,
                      source: "signup-page",
                    }),
                  })
                  const data = await response.json()
                  if (!response.ok || !data?.success) {
                    throw new Error(data?.error || "Failed to create workspace")
                  }
                  posthog.capture("signup_started", {
                    estate: normalized.estateName,
                    country: normalized.country,
                    source: "signup-page",
                  })
                  posthog.capture("funnel_signup_submitted", {
                    source: "signup-page",
                    has_country: Boolean(normalized.country),
                  })
                  router.push(`/verify-email?email=${encodeURIComponent(normalized.email)}`)
                } catch (error: any) {
                  posthog.captureException(error)
                  setErrorMessage(error?.message || "Unable to create your workspace right now. Please try again.")
                } finally {
                  setIsSubmitting(false)
                }
              }}
            >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="name">Name</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Name help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Primary contact for estate onboarding.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Your name"
                    autoComplete="name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="email">Work Email</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Work email help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>We send login details and onboarding updates here.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="you@estate.com"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="password">Password</Label>
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
                        <TooltipContent>At least 8 characters. You will use this after email verification.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder="Create password"
                    autoComplete="new-password"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="estateName">Estate Name</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Estate name help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>This name appears in your dashboard and tenant profile.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="estateName"
                    value={form.estateName}
                    onChange={(event) => setForm((prev) => ({ ...prev, estateName: event.target.value }))}
                    placeholder="Estate or cooperative name"
                    autoComplete="organization"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="country">Country / Region</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Country or region help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Helps us shape onboarding and future localization.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="country"
                    value={form.country}
                    onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value }))}
                    placeholder="India, Colombia, Brazil..."
                    autoComplete="country-name"
                  />
                </div>
                {errorMessage && (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" aria-live="polite">
                    {errorMessage}
                  </p>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting || !form.name.trim() || !form.email.trim() || !form.password || !form.estateName.trim()}
                >
                  {isSubmitting ? "Creating..." : "Create Account"}
                </Button>
                <p className="text-xs text-muted-foreground">We will email a verification link before provisioning your workspace.</p>
                <p className="text-xs text-muted-foreground">
                  By creating an account, you acknowledge the{" "}
                  <Link href="/privacy" className="underline">
                    Privacy Notice
                  </Link>
                  .
                </p>
            </form>
            <div className="mt-6 rounded-xl border border-emerald-200/70 bg-emerald-50/70 p-4 text-xs text-emerald-800">
              Verification comes first, then your tenant, starter access, and workspace are provisioned automatically.
            </div>
          </CardContent>
        </Card>
        <div className="text-center text-sm text-muted-foreground">
          Already have access?{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
