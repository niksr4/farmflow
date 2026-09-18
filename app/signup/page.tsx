"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import posthog from "posthog-js"
import { CloudRain, Mail, Scale, Smartphone, Wallet } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DEFAULT_APP_LOCALE } from "@/lib/i18n"

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

  const valuePoints = [
    { icon: Wallet, text: "What a kilo of parchment cost you. Labour, fertiliser, spray, fuel, all of it." },
    { icon: Mail, text: "A short brief every Monday at six on the week that went." },
    { icon: Scale, text: "Dispatch set against sales, so nothing gets sold below what it cost." },
    { icon: CloudRain, text: "The rain gauge, drying windows and where coffee is trading." },
    { icon: Smartphone, text: "Marked from a phone in the field, and it holds when the signal drops." },
  ]

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-[#07110f] text-stone-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_24%),radial-gradient(circle_at_82%_12%,rgba(245,158,11,0.12),transparent_18%),linear-gradient(180deg,#07110f_0%,#091916_42%,#081310_100%)]" />
        <div className="absolute -top-24 left-[-8%] h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.18),transparent_70%)] blur-[120px]" />
        <div className="absolute bottom-[-18%] right-[10%] h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.16),transparent_70%)] blur-[120px]" />
      </div>

      {/* Left panel — desktop only */}
      <div className="relative z-10 hidden lg:flex lg:w-[45%] lg:flex-col lg:justify-between lg:px-14 lg:py-14">
        <div>
          <Link href="/" className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors text-sm font-semibold">
            ← FarmFlow
          </Link>
          <h2 className="mt-10 font-display text-4xl font-black leading-tight text-stone-50">
            One book for<br />
            the whole season.
          </h2>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-stone-400">
            The notebook, the Excel sheet and the WhatsApp thread, replaced by one place that
            already knows what outturn means.
          </p>
          <div className="mt-10 space-y-4">
            {valuePoints.map((pt) => {
              const Icon = pt.icon
              return (
                <div key={pt.text} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-emerald-300/20 bg-emerald-300/[0.08]">
                    <Icon className="h-3.5 w-3.5 text-emerald-200" />
                  </span>
                  <p className="text-sm leading-relaxed text-stone-300">{pt.text}</p>
                </div>
              )
            })}
          </div>
        </div>
        <div className="mt-10 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-500">What happens next</p>
          <div className="mt-3 space-y-2 text-sm text-stone-400">
            <p>1. Your estate is ready inside a minute</p>
            <p>2. Eighty activity codes are already loaded, so no blank slate</p>
            <p>3. A guided setup walks you through the first entry</p>
            <p>4. Your first Monday brief arrives the week after</p>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-12 lg:px-14">
      <div className="w-full max-w-md space-y-6">
        <Card className="border border-white/10 bg-[#0a1714]/92 backdrop-blur-md">
          <CardHeader className="pb-4">
            <CardTitle className="font-display text-stone-50">{t("public.signup.title")}</CardTitle>
            <CardDescription className="text-stone-400">
              {t("public.signup.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-5"
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
                    throw new Error(data?.error || "Failed to create estate")
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
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-stone-300 text-sm">{t("public.signup.name")}</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="border-white/10 bg-[#111d1a] text-stone-100 placeholder:text-stone-600 focus-visible:bg-[#15231f] focus-visible:ring-emerald-700/40"
                  placeholder="Your name"
                  autoComplete="name"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-stone-300 text-sm">{t("public.signup.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  className="border-white/10 bg-[#111d1a] text-stone-100 placeholder:text-stone-600 focus-visible:bg-[#15231f] focus-visible:ring-emerald-700/40"
                  placeholder="your@email.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-stone-300 text-sm">{t("public.signup.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  className="border-white/10 bg-[#111d1a] text-stone-100 placeholder:text-stone-600 focus-visible:bg-[#15231f] focus-visible:ring-emerald-700/40"
                  placeholder="Create a password"
                  autoComplete="new-password"
                  required
                />
                <p className="text-xs text-stone-500">{t("public.signup.passwordHelp")}</p>
              </div>
              <div className="border-t border-white/5 pt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="estateName" className="text-stone-300 text-sm">{t("public.signup.estateName")}</Label>
                  <Input
                    id="estateName"
                    value={form.estateName}
                    onChange={(event) => setForm((prev) => ({ ...prev, estateName: event.target.value }))}
                    className="border-white/10 bg-[#111d1a] text-stone-100 placeholder:text-stone-600 focus-visible:bg-[#15231f] focus-visible:ring-emerald-700/40"
                    placeholder="Estate or cooperative name"
                    autoComplete="organization"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="country" className="text-stone-300 text-sm">
                    {t("public.signup.country")}{" "}
                    <span className="text-stone-600 font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="country"
                    value={form.country}
                    onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value }))}
                    className="border-white/10 bg-[#111d1a] text-stone-100 placeholder:text-stone-600 focus-visible:bg-[#15231f] focus-visible:ring-emerald-700/40"
                    placeholder="India, Colombia, Brazil..."
                    autoComplete="country-name"
                  />
                </div>
              </div>
              {errorMessage && (
                <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200" aria-live="polite">
                  {errorMessage}
                </p>
              )}
              <Button
                type="submit"
                className="w-full border-emerald-300/40 bg-emerald-300 text-[#06110f] shadow-[0_18px_36px_-18px_rgba(110,231,183,0.6)] hover:bg-emerald-200 font-semibold"
                disabled={isSubmitting || !form.name.trim() || !form.email.trim() || !form.password || !form.estateName.trim()}
              >
                {isSubmitting ? t("public.signup.creating") : t("public.signup.submit")}
              </Button>
              <p className="text-xs text-stone-500 text-center">
                By creating an account you agree to our{" "}
                <Link href="/privacy" className="text-emerald-400/80 hover:text-emerald-300 underline underline-offset-2">
                  Privacy Notice
                </Link>
                .
              </p>
            </form>
            <div className="mt-5 rounded-xl border border-emerald-800/40 bg-emerald-950/40 p-4 text-xs text-emerald-300/80">
              {t("public.signup.verifiedNext")}
            </div>
          </CardContent>
        </Card>
        <div className="text-center text-sm text-stone-500">
          Already have access?{" "}
          <Link href="/login" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
            {t("common.signIn")}
          </Link>
        </div>
      </div>
      </div>
    </div>
  )
}
