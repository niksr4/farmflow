"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { ArrowRight, BookOpen, CheckCircle2, Globe2, MapPin, PackageCheck } from "lucide-react"
import { LocaleSelector } from "@/components/locale-selector"
import { useLocale } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { apiRequest } from "@/lib/api-client"
import type { ModuleBundle } from "@/lib/modules"
import type { AppLocale } from "@/lib/i18n"

type GuidedSetupState = {
  complete: boolean
  email: string
  username: string
  estateName: string
  bagWeightKg: number
  preferredLocale: AppLocale
  primaryLocationName: string
  primaryLocationCode: string
  moduleBundleId: string
}

type OnboardingResponse = {
  success: boolean
  setup: GuidedSetupState
  moduleBundles: ModuleBundle[]
}

const setupHighlights = [
  {
    icon: Globe2,
    title: "Choose your language",
    description: "Set the language for your setup and account surfaces from the start.",
  },
  {
    icon: MapPin,
    title: "Define your first location",
    description: "Name your primary estate location so records land in the right place.",
  },
  {
    icon: PackageCheck,
    title: "Start with the right plan",
    description: "Enable the plan that matches how your estate operates today.",
  },
]

export default function WelcomeOnboardingPage() {
  const router = useRouter()
  const { update } = useSession()
  const { toast } = useToast()
  const { setLocale, t } = useLocale()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [setup, setSetup] = useState<GuidedSetupState | null>(null)
  const [moduleBundles, setModuleBundles] = useState<ModuleBundle[]>([])
  const [error, setError] = useState("")
  const [draft, setDraft] = useState<GuidedSetupState | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const data = await apiRequest<OnboardingResponse>("/api/onboarding/setup")
        if (cancelled) return
        setSetup(data.setup)
        setModuleBundles(data.moduleBundles || [])
        setDraft(data.setup)
        setLocale(data.setup.preferredLocale)
      } catch (loadError: any) {
        if (cancelled) return
        setError(loadError?.message || "Failed to load onboarding setup")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [setLocale])

  const selectedBundle = useMemo(
    () => moduleBundles.find((entry) => entry.id === draft?.moduleBundleId) || moduleBundles[0] || null,
    [draft?.moduleBundleId, moduleBundles],
  )
  const setupBlockers = useMemo(() => {
    if (!draft) return []
    const blockers: string[] = []
    if (!String(draft.estateName || "").trim()) blockers.push("Enter your estate name.")
    if (!Number.isFinite(Number(draft.bagWeightKg)) || Number(draft.bagWeightKg) < 40 || Number(draft.bagWeightKg) > 70) {
      blockers.push("Bag weight must be between 40 and 70 kg.")
    }
    if (!String(draft.primaryLocationName || "").trim()) blockers.push("Enter your first location name.")
    if (!String(draft.primaryLocationCode || "").trim()) blockers.push("Enter a short location code.")
    if (!String(draft.moduleBundleId || "").trim()) blockers.push("Choose a starting plan.")
    return blockers
  }, [draft])
  const setupProgressPct = useMemo(() => {
    if (!draft) return 0
    const checks = [
      Boolean(String(draft.estateName || "").trim()),
      Number.isFinite(Number(draft.bagWeightKg)) && Number(draft.bagWeightKg) >= 40 && Number(draft.bagWeightKg) <= 70,
      Boolean(String(draft.primaryLocationName || "").trim()),
      Boolean(String(draft.primaryLocationCode || "").trim()),
      Boolean(String(draft.moduleBundleId || "").trim()),
    ]
    return Math.round((checks.filter(Boolean).length / checks.length) * 100)
  }, [draft])

  if (loading || !draft) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#d8efe7,transparent_30%),linear-gradient(180deg,#f7fbfa_0%,#eef6f3_100%)] px-4 py-10">
        <div className="mx-auto max-w-5xl">
          <Card className="border-white/70 bg-white/90">
            <CardContent className="py-10 text-sm text-muted-foreground">{t("common.loading")}</CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (setup?.complete) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#d8efe7,transparent_30%),linear-gradient(180deg,#f7fbfa_0%,#eef6f3_100%)] px-4 py-10">
        <div className="mx-auto max-w-xl">
          <Card className="border-white/70 bg-white/90">
            <CardHeader>
              <CardTitle className="font-display">{t("public.welcome.completeTitle")}</CardTitle>
              <CardDescription>{t("public.welcome.completeDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => router.push("/dashboard")}>
                {t("public.welcome.continueToDashboard")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#d8efe7,transparent_30%),linear-gradient(180deg,#f7fbfa_0%,#eef6f3_100%)] px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_35px_90px_-50px_rgba(14,93,82,0.45)] lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700">{t("public.welcome.eyebrow")}</p>
            <h1 className="font-display text-3xl text-slate-900">{t("public.welcome.title")}</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">{t("public.welcome.description")}</p>
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              <span className="rounded-full bg-emerald-50 px-3 py-1">{draft.email}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1">@{draft.username}</span>
              <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
                {setupProgressPct}% ready
              </Badge>
            </div>
          </div>
          <div className="w-full max-w-[220px]">
            <Label className="mb-2 block">{t("common.language")}</Label>
            <LocaleSelector
              value={draft.preferredLocale}
              onValueChange={(value) => {
                setLocale(value)
                setDraft((current) => (current ? { ...current, preferredLocale: value } : current))
              }}
            />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="border-white/70 bg-white/92">
            <CardHeader>
              <CardTitle className="font-display">{t("public.welcome.title")}</CardTitle>
              <CardDescription>{t("public.welcome.helper")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="welcome-estate-name">{t("public.welcome.estateName")}</Label>
                  <Input
                    id="welcome-estate-name"
                    value={draft.estateName}
                    onChange={(event) => setDraft((current) => (current ? { ...current, estateName: event.target.value } : current))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="welcome-bag-weight">{t("public.welcome.bagWeight")}</Label>
                  <Input
                    id="welcome-bag-weight"
                    type="number"
                    min={40}
                    max={70}
                    step={1}
                    value={draft.bagWeightKg}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, bagWeightKg: Number(event.target.value || current.bagWeightKg) } : current,
                      )
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="welcome-location-name">{t("public.welcome.locationName")}</Label>
                  <Input
                    id="welcome-location-name"
                    value={draft.primaryLocationName}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, primaryLocationName: event.target.value } : current))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="welcome-location-code">{t("public.welcome.locationCode")}</Label>
                  <Input
                    id="welcome-location-code"
                    value={draft.primaryLocationCode}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, primaryLocationCode: event.target.value } : current))
                    }
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label>{t("public.welcome.moduleBundle")}</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Start with the plan that best matches your operation today. You can change it later in Settings.
                  </p>
                </div>
                <div className="grid gap-3">
                  {moduleBundles.map((bundle) => {
                    const selected = draft.moduleBundleId === bundle.id
                    return (
                      <button
                        key={bundle.id}
                        type="button"
                        onClick={() => setDraft((current) => (current ? { ...current, moduleBundleId: bundle.id } : current))}
                        className={`rounded-2xl border p-4 text-left transition ${
                          selected ? "border-emerald-500 bg-emerald-50 shadow-sm" : "border-border/70 bg-white hover:border-emerald-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{bundle.label}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{bundle.description}</p>
                          </div>
                          {selected ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {bundle.modules.slice(0, 6).map((moduleName) => (
                            <span key={moduleName} className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] text-slate-700">
                              {moduleName}
                            </span>
                          ))}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={setupBlockers.length === 0 ? "border-emerald-200 bg-white text-emerald-700" : "border-cyan-200 bg-white text-cyan-700"}>
                    {setupBlockers.length === 0 ? "Ready to continue" : `${setupBlockers.length} thing${setupBlockers.length === 1 ? "" : "s"} left`}
                  </Badge>
                  <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                    5-minute setup
                  </Badge>
                </div>
                <p className="mt-3 text-sm text-slate-700">
                  This setup saves your estate basics, creates or updates your first location, applies your starting plan,
                  and then sends you to the dashboard.
                </p>
                {setupBlockers.length > 0 ? (
                  <ul className="ml-4 mt-3 list-disc space-y-1 text-xs text-slate-700">
                    {setupBlockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-emerald-700">
                    Core setup looks complete. Review once, then continue to open the live workspace.
                  </p>
                )}
              </div>

              {error ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  disabled={submitting || setupBlockers.length > 0}
                  onClick={async () => {
                    if (submitting) return
                    setSubmitting(true)
                    setError("")
                    try {
                      await apiRequest("/api/onboarding/setup", {
                        method: "POST",
                        body: JSON.stringify(draft),
                      })
                      await update({
                        preferredLocale: draft.preferredLocale,
                        setupCompleted: true,
                        requiresGuidedSetup: false,
                      })
                      setSetup((current) => (current ? { ...current, complete: true, preferredLocale: draft.preferredLocale } : current))
                      setLocale(draft.preferredLocale)
                      toast({
                        title: t("public.welcome.completeTitle"),
                        description: t("public.welcome.completeDescription"),
                      })
                      router.push("/dashboard")
                    } catch (saveError: any) {
                      setError(saveError?.message || "Setup was not saved. Review the fields above and try again.")
                    } finally {
                      setSubmitting(false)
                    }
                  }}
                >
                  {submitting ? t("public.welcome.submitting") : t("public.welcome.submit")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <p className="text-xs text-muted-foreground">
                  {selectedBundle ? `${selectedBundle.label}: ${selectedBundle.description}` : t("public.welcome.helper")}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {setupHighlights.map((item) => (
              <Card key={item.title} className="border-white/70 bg-white/90">
                <CardContent className="flex gap-4 p-5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Card className="border-emerald-100 bg-emerald-50/70">
              <CardContent className="space-y-4 p-5">
                <div className="flex gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900">Need a simple walkthrough?</p>
                    <p className="text-sm text-muted-foreground">
                      Open the beginner manuals for plain-language explanations of Dashboard, Operations, Finance,
                      Insights, and admin screens.
                    </p>
                  </div>
                </div>
                <Button asChild variant="outline" className="w-full bg-white">
                  <Link href="/manuals">Open training manuals</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
