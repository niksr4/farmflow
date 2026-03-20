"use client"

import Link from "next/link"
import Image from "next/image"
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CloudRain,
  Coffee,
  Leaf,
  MapPin,
  PackageCheck,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
} from "lucide-react"
import { PublicSiteShell } from "@/components/public-site-shell"
import { useLocale } from "@/components/locale-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MODULE_BUNDLES, MODULES } from "@/lib/modules"

const proofCards = [
  {
    title: "Stock and finance baseline",
    description: "Know what is in store, what moved, and what it cost without reconciling three different ledgers.",
    icon: Wallet,
  },
  {
    title: "Processing to sales continuity",
    description: "Run coffee from processing through dispatch confirmation and into saleable stock with fewer blind spots.",
    icon: PackageCheck,
  },
  {
    title: "Control and accountability",
    description: "Keep roles, module access, and change history visible as teams and estates grow.",
    icon: ShieldCheck,
  },
]

const planBadges: Record<string, string> = {
  basic: "Good first rollout",
  core: "Recommended for estates",
  enterprise: "Full module estate stack",
}

const moduleLabelById = new Map(MODULES.map((module) => [module.id, module.label]))

const representativeEstateFlow = [
  {
    label: "Cherry intake",
    value: "183,766 KG",
    detail: "Recorded across 88 processing entries",
    icon: Leaf,
    accent: "bg-amber-100 text-amber-700",
  },
  {
    label: "Dry output",
    value: "50,229 KG",
    detail: "27.3% cherry-to-dry conversion",
    icon: PackageCheck,
    accent: "bg-emerald-100 text-emerald-700",
  },
  {
    label: "Confirmed receipts",
    value: "19,347 KG",
    detail: "88.4% of dispatched nominal weight",
    icon: Truck,
    accent: "bg-sky-100 text-sky-700",
  },
  {
    label: "Coffee sold",
    value: "11,910 KG",
    detail: "₹55.6L booked coffee revenue",
    icon: Wallet,
    accent: "bg-violet-100 text-violet-700",
  },
]

const representativeMonthlyDryOutput = [
  { month: "Oct", value: 75 },
  { month: "Nov", value: 2728 },
  { month: "Dec", value: 16595 },
  { month: "Jan", value: 30831 },
]

const representativeCoffeeMix = [
  { label: "Robusta dry output", value: 43345, percent: 86.3, accent: "bg-emerald-600" },
  { label: "Arabica dry output", value: 6884, percent: 13.7, accent: "bg-amber-500" },
]

const representativeOpsSignals = [
  { label: "Locations live", value: "3", icon: MapPin },
  { label: "Labor logs", value: "429", icon: Users },
  { label: "Expense entries", value: "258", icon: Coffee },
]

export default function LandingPage() {
  const { t } = useLocale()
  const heroBullets = [
    t("public.landing.bullet1"),
    t("public.landing.bullet2"),
    t("public.landing.bullet3"),
    t("public.landing.bullet4"),
    t("public.landing.bullet5"),
  ]
  const maxMonthlyDryOutput = Math.max(...representativeMonthlyDryOutput.map((item) => item.value))

  return (
    <PublicSiteShell>
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
          <div className="flex h-full flex-col justify-between gap-6 rounded-[2rem] border border-white/60 bg-gradient-to-br from-[#0f6f66] via-[#0b4f49] to-[#083730] p-6 text-white shadow-[0_38px_95px_-48px_rgba(15,111,102,0.8)] sm:p-10">
            <Badge className="w-fit border-white/25 bg-white/15 text-white">{t("public.landing.badge")}</Badge>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-3xl font-semibold leading-tight sm:text-5xl">{t("public.landing.title")}</h1>
              <p className="max-w-2xl text-sm text-white/85 sm:text-base">{t("public.landing.description")}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {heroBullets.map((bullet) => (
                <div key={bullet} className="flex items-start gap-2 text-sm text-white/86">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-200" />
                  <span>{bullet}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link href="/signup">{t("public.landing.ctaPrimary")}</Link>
              </Button>
              <Button size="lg" variant="secondary" asChild>
                <Link href="/plans">See plans</Link>
              </Button>
            </div>
          </div>

          <div className="h-full">
            <Card className="flex h-full flex-col overflow-hidden border-white/70 bg-white/92 shadow-[0_28px_75px_-50px_rgba(15,111,102,0.4)]">
              <div className="relative h-60 w-full border-b border-emerald-100/70 bg-emerald-50">
                <Image
                  src="/images/estate-journey-processing.jpg"
                  alt="Coffee processing workflow"
                  fill
                  sizes="(min-width: 1024px) 46vw, 100vw"
                  className="object-cover"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent" />
                <div className="absolute inset-x-4 bottom-4 grid gap-2 sm:grid-cols-3">
                  {representativeOpsSignals.map((signal) => {
                    const Icon = signal.icon
                    return (
                      <div key={signal.label} className="rounded-2xl border border-white/20 bg-white/15 px-3 py-3 text-white backdrop-blur-md">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-white/70">
                          <Icon className="h-3.5 w-3.5" />
                          <span>{signal.label}</span>
                        </div>
                        <p className="mt-2 text-2xl font-semibold">{signal.value}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
              <CardContent className="flex flex-1 flex-col gap-5 p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-2xl">
                    <p className="text-sm font-medium text-emerald-700">Representative estate control board</p>
                    <h2 className="mt-1 text-2xl font-semibold text-slate-900">{t("public.landing.visualFlowTitle")}</h2>
                    <p className="mt-2 text-sm text-slate-600">
                      This visual is based on the current estate data shape in the app: real intake, dry output, dispatch confirmations, sales, and operating workload.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Current dry-output peak</p>
                    <p className="mt-2 text-2xl font-semibold">30,831 KG</p>
                    <p className="mt-1 text-xs text-emerald-800/80">January was the strongest production month in the current dataset.</p>
                  </div>
                </div>

                <div className="grid flex-1 gap-4 xl:grid-cols-[1.1fr_0.9fr] xl:items-stretch">
                  <div className="h-full rounded-3xl border border-slate-200/70 bg-slate-50/90 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Operational flow</p>
                        <p className="mt-1 text-sm text-slate-600">The numbers below follow the same coffee chain the product manages.</p>
                      </div>
                      <Badge variant="secondary" className="bg-white text-slate-700">
                        Live estate pattern
                      </Badge>
                    </div>
                    <div className="mt-4 grid gap-3">
                      {representativeEstateFlow.map((step, index) => {
                        const Icon = step.icon
                        return (
                          <div key={step.label} className="rounded-2xl border border-white/80 bg-white px-4 py-4 shadow-sm">
                            <div className="flex items-start gap-3">
                              <div className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl ${step.accent}`}>
                                <Icon className="h-5 w-5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-medium text-slate-600">{step.label}</p>
                                  <p className="text-lg font-semibold text-slate-900">{step.value}</p>
                                </div>
                                <p className="mt-1 text-xs text-slate-500">{step.detail}</p>
                              </div>
                            </div>
                            {index < representativeEstateFlow.length - 1 ? (
                              <div className="ml-5 mt-3 h-5 w-px border-l border-dashed border-slate-300" />
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="flex h-full flex-col gap-4">
                    <div className="rounded-3xl border border-slate-200/70 bg-slate-950 p-4 text-white">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/55">Monthly dry output</p>
                          <p className="mt-1 text-sm text-white/75">A real estate curve, not a generic SaaS trend line.</p>
                        </div>
                        <BarChart3 className="h-5 w-5 text-emerald-300" />
                      </div>
                      <div className="mt-5 grid h-40 grid-cols-4 items-end gap-3">
                        {representativeMonthlyDryOutput.map((item) => {
                          const barHeight = Math.max((item.value / maxMonthlyDryOutput) * 100, 8)
                          return (
                            <div key={item.month} className="flex h-full flex-col justify-end gap-2">
                              <div className="relative flex-1 rounded-t-2xl bg-white/5">
                                <div
                                  className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-gradient-to-t from-emerald-400 via-emerald-300 to-emerald-200"
                                  style={{ height: `${barHeight}%` }}
                                />
                              </div>
                              <div className="text-center">
                                <p className="text-[11px] font-semibold text-white">{item.month}</p>
                                <p className="text-[11px] text-white/65">{item.value.toLocaleString("en-IN")}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="flex-1 rounded-3xl border border-slate-200/70 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Coffee mix and dispatch reality</p>
                          <p className="mt-1 text-sm text-slate-600">Robusta dominates output, and dispatch becomes sellable only after confirmed receipt.</p>
                        </div>
                        <Coffee className="h-5 w-5 text-emerald-700" />
                      </div>
                      <div className="mt-4 space-y-4">
                        {representativeCoffeeMix.map((item) => (
                          <div key={item.label}>
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="text-slate-600">{item.label}</span>
                              <span className="font-semibold text-slate-900">
                                {item.value.toLocaleString("en-IN")} KG
                              </span>
                            </div>
                            <div className="mt-2 h-2.5 rounded-full bg-slate-100">
                              <div className={`h-2.5 rounded-full ${item.accent}`} style={{ width: `${item.percent}%` }} />
                            </div>
                          </div>
                        ))}
                        <div className="rounded-2xl border border-sky-200/70 bg-sky-50/70 px-3 py-3">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-sky-900">Dispatch receipts confirmed</span>
                            <span className="font-semibold text-sky-950">19,347 / 21,884 KG</span>
                          </div>
                          <div className="mt-2 h-2.5 rounded-full bg-sky-100">
                            <div className="h-2.5 w-[88.4%] rounded-full bg-sky-500" />
                          </div>
                          <p className="mt-2 text-xs text-sky-900/80">That is the same confirmation logic the app now uses before coffee becomes sellable stock.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          {proofCards.map((card) => {
            const Icon = card.icon
            return (
              <Card key={card.title} className="h-full border-white/70 bg-white/90">
                <CardHeader className="h-full">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle>{card.title}</CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </CardHeader>
              </Card>
            )
          })}
        </section>

        <section className="rounded-[2rem] border border-white/70 bg-white/92 p-6 shadow-[0_30px_80px_-56px_rgba(15,111,102,0.55)] sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-700">Plans</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">Basic, Core, and Enterprise are now visible up front</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                The homepage now shows the rollout choices immediately, then the deeper detail lives on dedicated sub-pages instead of one long scroll.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href="/plans">Open full plan comparison</Link>
            </Button>
          </div>
          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            {MODULE_BUNDLES.map((bundle) => (
              <Card
                key={bundle.id}
                className={`flex h-full flex-col border-slate-200/80 ${bundle.id === "core" ? "bg-emerald-50/70" : "bg-slate-50/70"}`}
              >
                <CardHeader>
                  <Badge variant={bundle.id === "core" ? "default" : "secondary"}>{planBadges[bundle.id] || "Plan"}</Badge>
                  <CardTitle>{bundle.label}</CardTitle>
                  <CardDescription>{bundle.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <div className="flex flex-wrap gap-2">
                    {bundle.modules.slice(0, 6).map((moduleId) => (
                      <span key={moduleId} className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-700">
                        {moduleLabelById.get(moduleId) || moduleId}
                      </span>
                    ))}
                    {bundle.modules.length > 6 ? (
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-500">
                        +{bundle.modules.length - 6} more
                      </span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          <Card className="flex h-full flex-col border-white/70 bg-white/90">
            <CardHeader>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <CloudRain className="h-5 w-5" />
              </div>
              <CardTitle>Capabilities</CardTitle>
              <CardDescription>See the real operating surfaces and how the product supports the estate day to day.</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button variant="outline" asChild>
                <Link href="/capabilities">
                  Explore capabilities
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="flex h-full flex-col border-white/70 bg-white/90">
            <CardHeader>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <PackageCheck className="h-5 w-5" />
              </div>
              <CardTitle>Journey</CardTitle>
              <CardDescription>Walk the coffee chain from harvest intake through dispatch and buyer-facing evidence.</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button variant="outline" asChild>
                <Link href="/journey">
                  View the journey
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="flex h-full flex-col border-white/70 bg-white/90">
            <CardHeader>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <CardTitle>Trust</CardTitle>
              <CardDescription>Review privacy, governance, and how tenant isolation is handled across the product.</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button variant="outline" asChild>
                <Link href="/trust">
                  Read trust details
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="rounded-[2rem] border border-slate-200/70 bg-slate-950 p-6 text-white shadow-[0_34px_90px_-60px_rgba(15,23,42,0.9)] sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-300">Self-serve onboarding</p>
              <h2 className="mt-1 text-2xl font-semibold">Create the workspace, verify email, then finish setup with bag weight and locations.</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" asChild>
                <Link href="/login">{t("common.login")}</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">{t("public.landing.ctaPrimary")}</Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </PublicSiteShell>
  )
}
