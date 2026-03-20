"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { ArrowRight, CheckCircle2, Globe2, MapPin, PackageCheck } from "lucide-react"
import { LocaleSelector } from "@/components/locale-selector"
import { useLocale } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
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

              {error ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  disabled={submitting}
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
                      setError(saveError?.message || "Failed to save onboarding setup")
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
          </div>
        </div>
      </div>
    </div>
  )
}
