"use client"

import { useState } from "react"
import Link from "next/link"
import posthog from "posthog-js"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Info } from "lucide-react"

export default function SignupRoute() {
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [form, setForm] = useState({
    name: "",
    email: "",
    estate: "",
    region: "",
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
            <CardTitle className="font-display">Request Access</CardTitle>
            <CardDescription>
              Tell us about your estate and we will set up your tenant, modules, and farmer-first traceability workflow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Thanks. We will reach out with your login details and onboarding plan shortly.
                </p>
                <Button asChild className="w-full">
                  <Link href="/login">Go to Sign In</Link>
                </Button>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={async (event) => {
                  event.preventDefault()
                  if (isSubmitting) return
                  const normalized = {
                    name: form.name.trim(),
                    email: form.email.trim().toLowerCase(),
                    estate: form.estate.trim(),
                    region: form.region.trim(),
                  }
                  if (!normalized.name || !normalized.email || !normalized.estate) {
                    setErrorMessage("Please fill in name, work email, and estate name.")
                    return
                  }
                  setIsSubmitting(true)
                  setErrorMessage("")
                  try {
                    const response = await fetch("/api/register-interest", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        name: normalized.name,
                        email: normalized.email,
                        estate: normalized.estate,
                        region: normalized.region,
                        organization: normalized.estate,
                        source: "signup-page",
                      }),
                    })
                    const data = await response.json()
                    if (!response.ok || !data?.success) {
                      throw new Error(data?.error || "Failed to submit request")
                    }
                    posthog.capture("access_requested", {
                      estate: normalized.estate,
                      region: normalized.region,
                    })
                    setSubmitted(true)
                  } catch (error: any) {
                    posthog.captureException(error)
                    setErrorMessage(error?.message || "Unable to submit right now. Please try again.")
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
                    <Label htmlFor="estate">Estate Name</Label>
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
                        <TooltipContent>This name appears in dashboards and reports.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="estate"
                    value={form.estate}
                    onChange={(event) => setForm((prev) => ({ ...prev, estate: event.target.value }))}
                    placeholder="Estate or cooperative name"
                    autoComplete="organization"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="region">Region</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Region help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Helps us tailor onboarding and regional reporting.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="region"
                    value={form.region}
                    onChange={(event) => setForm((prev) => ({ ...prev, region: event.target.value }))}
                    placeholder="Coorg, Chikmagalur, Wayanad..."
                    autoComplete="address-level1"
                  />
                </div>
                {errorMessage && (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" aria-live="polite">
                    {errorMessage}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={isSubmitting || !form.name.trim() || !form.email.trim() || !form.estate.trim()}>
                  {isSubmitting ? "Submitting..." : "Request Access"}
                </Button>
                <p className="text-xs text-muted-foreground">Most requests are reviewed within one business day.</p>
                <p className="text-xs text-muted-foreground">
                  By requesting access, you acknowledge the{" "}
                  <Link href="/privacy" className="underline">
                    Privacy Notice
                  </Link>
                  .
                </p>
              </form>
            )}
            {!submitted && (
              <div className="mt-6 rounded-xl border border-emerald-200/70 bg-emerald-50/70 p-4 text-xs text-emerald-800">
                We will set up: estate profile, module access, rainfall logging, quality notes, and buyer-ready exports.
              </div>
            )}
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
