"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import posthog from "posthog-js"
import { useLocale } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DEFAULT_APP_LOCALE } from "@/lib/i18n"
import { Info } from "lucide-react"

export default function SignupRoute() {
  const router = useRouter()
  const { t } = useLocale()
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07110f] px-4 text-stone-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_24%),radial-gradient(circle_at_82%_12%,rgba(245,158,11,0.12),transparent_18%),linear-gradient(180deg,#07110f_0%,#091916_42%,#081310_100%)]" />
        <div className="absolute -top-24 left-[-8%] h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.18),transparent_70%)] blur-[120px]" />
        <div className="absolute bottom-[-18%] right-[10%] h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.16),transparent_70%)] blur-[120px]" />
      </div>
      <div className="w-full max-w-md space-y-6 relative z-10">
        <Card className="border border-white/10 bg-[#0a1714]/92 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="font-display text-stone-50">{t("public.signup.title")}</CardTitle>
            <CardDescription className="text-stone-300">
              {t("public.signup.description")}
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
                  preferredLocale: DEFAULT_APP_LOCALE,
                }
                if (!normalized.name || !normalized.email || !normalized.password || !normalized.estateName) {
                  setErrorMessage(t("public.signup.requiredError"))
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
                  if (data.verificationSent) {
                    const params = new URLSearchParams({ email: data.email || normalized.email })
                    router.push(`/verify-email?${params.toString()}`)
                  } else {
                    router.push("/login")
                  }
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
                    <Label htmlFor="name" className="text-stone-200">{t("public.signup.name")}</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Name help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 text-stone-400 hover:text-stone-200"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t("public.signup.nameHelp")}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    className="border-white/10 bg-[#111d1a] text-stone-100 placeholder:text-stone-500 focus-visible:bg-[#15231f]"
                    placeholder="Your name"
                    autoComplete="name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="email" className="text-stone-200">{t("public.signup.email")}</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Work email help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 text-stone-400 hover:text-stone-200"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t("public.signup.emailHelp")}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                    className="border-white/10 bg-[#111d1a] text-stone-100 placeholder:text-stone-500 focus-visible:bg-[#15231f]"
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
                    <Label htmlFor="password" className="text-stone-200">{t("public.signup.password")}</Label>
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
                        <TooltipContent>{t("public.signup.passwordHelp")}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                    className="border-white/10 bg-[#111d1a] text-stone-100 placeholder:text-stone-500 focus-visible:bg-[#15231f]"
                    placeholder="Create password"
                    autoComplete="new-password"
                    required
                  />
                  <p className="text-xs text-stone-400">{t("public.signup.passwordHelp")}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="estateName" className="text-stone-200">{t("public.signup.estateName")}</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Estate name help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 text-stone-400 hover:text-stone-200"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t("public.signup.estateHelp")}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="estateName"
                    value={form.estateName}
                    onChange={(event) => setForm((prev) => ({ ...prev, estateName: event.target.value }))}
                    className="border-white/10 bg-[#111d1a] text-stone-100 placeholder:text-stone-500 focus-visible:bg-[#15231f]"
                    placeholder="Estate or cooperative name"
                    autoComplete="organization"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="country" className="text-stone-200">{t("public.signup.country")}</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Country or region help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 text-stone-400 hover:text-stone-200"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t("public.signup.countryHelp")}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="country"
                    value={form.country}
                    onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value }))}
                    className="border-white/10 bg-[#111d1a] text-stone-100 placeholder:text-stone-500 focus-visible:bg-[#15231f]"
                    placeholder="India, Colombia, Brazil..."
                    autoComplete="country-name"
                  />
                </div>
                {errorMessage && (
                  <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200" aria-live="polite">
                    {errorMessage}
                  </p>
                )}
                <Button
                  type="submit"
                  className="w-full border-emerald-300/40 bg-emerald-300 text-[#06110f] shadow-[0_18px_36px_-18px_rgba(110,231,183,0.6)] hover:bg-emerald-200"
                  disabled={isSubmitting || !form.name.trim() || !form.email.trim() || !form.password || !form.estateName.trim()}
                >
                  {isSubmitting ? t("public.signup.creating") : t("public.signup.submit")}
                </Button>
                <p className="text-xs text-stone-400">{t("public.signup.footer")}</p>
                <p className="text-xs text-stone-400">
                  By creating an account, you acknowledge the{" "}
                  <Link href="/privacy" className="text-emerald-200 underline">
                    Privacy Notice
                  </Link>
                  .
                </p>
            </form>
            <div className="mt-6 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-xs text-emerald-100">
              {t("public.signup.verifiedNext")}
            </div>
          </CardContent>
        </Card>
        <div className="text-center text-sm text-stone-400">
          Already have access?{" "}
          <Link href="/login" className="text-emerald-200 underline">
            {t("common.signIn")}
          </Link>
        </div>
      </div>
    </div>
  )
}
