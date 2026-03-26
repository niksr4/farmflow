"use client"

import Link from "next/link"
import Image from "next/image"
import { motion, useReducedMotion } from "framer-motion"
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Coffee,
  MapPin,
  PackageCheck,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
  Zap,
  Lock,
  Smartphone,
} from "lucide-react"
import { PublicSiteShell } from "@/components/public-site-shell"
import { useLocale } from "@/components/locale-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MODULE_BUNDLES, MODULES } from "@/lib/modules"

const proofCards = [
  {
    title: "One source of operational truth",
    description: "Stock, processing, dispatch, and money movement stay connected instead of drifting across separate sheets.",
    icon: Wallet,
  },
  {
    title: "Live coffee-chain visibility",
    description: "Follow coffee from intake to dry output, confirmed receipt, and saleable stock without losing the chain.",
    icon: PackageCheck,
  },
  {
    title: "Control that still scales",
    description: "Roles, module access, and auditability stay reviewable as the estate team grows.",
    icon: ShieldCheck,
  },
]

const representativeEstateFlow = [
  {
    label: "Cherry intake",
    value: "183,766 KG",
    detail: "88 live processing entries",
    icon: Coffee,
    accentClassName: "bg-amber-400/15 text-amber-200 border-amber-300/20",
  },
  {
    label: "Dry output",
    value: "50,229 KG",
    detail: "27.3% cherry-to-dry conversion",
    icon: PackageCheck,
    accentClassName: "bg-emerald-400/15 text-emerald-200 border-emerald-300/20",
  },
  {
    label: "Confirmed receipts",
    value: "19,347 KG",
    detail: "Dispatch confirmed before saleable stock",
    icon: Truck,
    accentClassName: "bg-sky-400/15 text-sky-200 border-sky-300/20",
  },
  {
    label: "Coffee sold",
    value: "11,910 KG",
    detail: "₹55.6L booked revenue",
    icon: Wallet,
    accentClassName: "bg-violet-400/15 text-violet-200 border-violet-300/20",
  },
]

const representativeMonthlyDryOutput = [
  { month: "Oct", value: 75 },
  { month: "Nov", value: 2728 },
  { month: "Dec", value: 16595 },
  { month: "Jan", value: 30831 },
]

const representativeCoffeeMix = [
  { label: "Robusta dry output", value: 43345, percent: 86.3, accentClassName: "bg-emerald-300" },
  { label: "Arabica dry output", value: 6884, percent: 13.7, accentClassName: "bg-amber-300" },
]

const representativeOpsSignals = [
  { label: "Locations", value: "3", icon: MapPin },
  { label: "Labor logs", value: "429", icon: Users },
  { label: "Expense entries", value: "258", icon: Wallet },
]

const estateOutcomeCards = [
  {
    eyebrow: "Traceability",
    title: "See the coffee chain clearly",
    detail: "Track intake, conversion, dispatch, receipt, and saleable stock without losing the operational chain.",
  },
  {
    eyebrow: "Finance discipline",
    title: "Keep the books tied to the work",
    detail: "Sales, accounts, and journals stay anchored to what actually happened on the estate that day.",
  },
  {
    eyebrow: "Team adoption",
    title: "Get staff live faster",
    detail: "Guided setup, safer permissions, and in-product manuals help new teams go live with fewer mistakes.",
  },
]

const estateInsightCards = [
  {
    eyebrow: "Season visibility",
    title: "Monthly dry output — visible without a pivot table",
    detail: "Output trends build automatically from processing entries. No spreadsheet assembly at the end of the month.",
    icon: BarChart3,
    accentClassName: "bg-emerald-400/15 text-emerald-200 border-emerald-300/20",
  },
  {
    eyebrow: "Labor accountability",
    title: "Every day's work tied to a date, location, and cost code",
    detail: "Labor entries stay linked to where and when they happened — so wages reconcile to the plot, not the season.",
    icon: Users,
    accentClassName: "bg-amber-400/15 text-amber-200 border-amber-300/20",
  },
  {
    eyebrow: "Financial close",
    title: "Sales anchored to the batch that produced them",
    detail: "Revenue records connect back through dispatch to the processing entry — traceability your auditor can follow.",
    icon: Wallet,
    accentClassName: "bg-violet-400/15 text-violet-200 border-violet-300/20",
  },
  {
    eyebrow: "Exception awareness",
    title: "Conversion drops and spend spikes surface the same day",
    detail: "Anomalies in yield, drying time, or input usage appear while you can still act — not at season close.",
    icon: ShieldCheck,
    accentClassName: "bg-sky-400/15 text-sky-200 border-sky-300/20",
  },
]

const trustSignals = [
  { label: "5-min guided setup", icon: Zap },
  { label: "Your data is private and yours alone", icon: Lock },
  { label: "Works offline on mobile", icon: Smartphone },
  { label: "No per-seat pricing", icon: CheckCircle2 },
]

const howItWorks = [
  {
    step: "01",
    title: "Create your workspace in 5 minutes",
    detail:
      "Guided setup walks you through locations, crop types, and team access. No training needed — new staff can record live entries the same day.",
  },
  {
    step: "02",
    title: "Teams record what happened, every day",
    detail:
      "Intake, processing, labor, dispatch — each entry is date-stamped, location-tagged, and automatically linked to the next step in the chain.",
  },
  {
    step: "03",
    title: "Numbers stay connected all season",
    detail:
      "Conversion ratios, labor costs, and revenue trace back to the exact day they were recorded. No spreadsheet assembly. No end-of-season guesswork.",
  },
]

const statStrip = [
  { value: "183,766 KG", label: "Cherry intake tracked" },
  { value: "50,229 KG", label: "Dry output recorded" },
  { value: "429", label: "Labor entries logged" },
  { value: "₹55.6L", label: "Revenue connected" },
]

const coreSurfacePills = ["Inventory", "Accounts", "Processing", "Dispatch", "Sales", "Rainfall", "Journal"]

const planBadges: Record<string, string> = {
  basic: "Foundation",
  core: "Recommended",
  enterprise: "Full estate stack",
}

const moduleLabelById = new Map(MODULES.map((module) => [module.id, module.label]))

export default function LandingPage() {
  const { t } = useLocale()
  const prefersReducedMotion = useReducedMotion()
  const MotionDiv = motion.div as any
  const MotionSection = motion.section as any
  const maxMonthlyDryOutput = Math.max(...representativeMonthlyDryOutput.map((item) => item.value))
  const heroBullets = [
    t("public.landing.bullet1"),
    t("public.landing.bullet2"),
    t("public.landing.bullet3"),
    t("public.landing.bullet4"),
  ]

  const revealProps = (delay = 0) =>
    prefersReducedMotion
      ? { initial: { opacity: 1, y: 0 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true } }
      : {
          initial: { opacity: 0, y: 28 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, amount: 0.2 },
          transition: { duration: 0.65, delay, ease: "easeOut" as const },
        }

  const hoverLift = prefersReducedMotion ? {} : { whileHover: { y: -6, transition: { duration: 0.22, ease: "easeOut" } } }

  return (
    <PublicSiteShell theme="dark">
      <div className="mx-auto w-full max-w-6xl space-y-12 sm:space-y-16">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(8,22,19,0.96),rgba(7,16,14,0.88)_42%,rgba(20,17,10,0.92)_100%)] p-5 shadow-[0_42px_120px_-52px_rgba(0,0,0,0.95)] sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-32 bg-[linear-gradient(180deg,rgba(110,231,183,0.08),transparent)]" />
            <div className="absolute -right-20 top-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.18),transparent_70%)] blur-3xl" />
            <div className="absolute left-[-8%] top-[28%] h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.12),transparent_72%)] blur-3xl" />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          </div>

          <div className="relative z-10 grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-stretch">
            <MotionDiv {...revealProps(0)} className="flex flex-col justify-between gap-7">
              <div className="space-y-5">
                <Badge className="w-fit border-emerald-300/20 bg-emerald-300/10 text-emerald-100 backdrop-blur">
                  {t("public.landing.badge")}
                </Badge>
                <div className="space-y-4">
                  <p className="text-xs uppercase tracking-[0.34em] text-amber-100/70">Estate operating system</p>
                  <h1 className="max-w-3xl font-display text-4xl font-semibold leading-[1.02] text-stone-50 sm:text-5xl lg:text-6xl">
                    {t("public.landing.title")}
                  </h1>
                  <p className="max-w-2xl text-base leading-7 text-stone-300">{t("public.landing.description")}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    size="lg"
                    className="border-emerald-300/40 bg-emerald-300 text-[#06110f] shadow-[0_18px_36px_-18px_rgba(110,231,183,0.6)] hover:bg-emerald-200"
                    asChild
                  >
                    <Link href="/signup">
                      {t("public.landing.ctaPrimary")}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="ghost"
                    className="border-white/12 bg-white/[0.04] text-stone-100 hover:bg-white/[0.08] hover:text-white"
                    asChild
                  >
                    <Link href="/plans">See plans</Link>
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {heroBullets.map((bullet, index) => (
                  <MotionDiv
                    key={bullet}
                    {...revealProps(0.08 + index * 0.04)}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-stone-200 backdrop-blur"
                  >
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-200" />
                      <span>{bullet}</span>
                    </div>
                  </MotionDiv>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {representativeOpsSignals.map((signal, index) => {
                  const Icon = signal.icon
                  return (
                    <MotionDiv
                      key={signal.label}
                      {...revealProps(0.14 + index * 0.05)}
                      className="rounded-[1.4rem] border border-white/10 bg-[#0c1b17]/80 px-4 py-4 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.8)]"
                    >
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-stone-400">
                        <Icon className="h-3.5 w-3.5 text-emerald-200" />
                        <span>{signal.label}</span>
                      </div>
                      <p className="mt-3 text-2xl font-semibold text-stone-50">{signal.value}</p>
                    </MotionDiv>
                  )
                })}
              </div>
            </MotionDiv>

            <MotionDiv {...revealProps(0.1)} className="relative">
              <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#081613]/92 shadow-[0_28px_96px_-42px_rgba(0,0,0,0.9)]">
                <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[1.06fr_0.94fr]">
                  <div className="space-y-4">
                    <div className="relative h-64 overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0a1b17]">
                      <Image
                        src="/images/estate-journey-processing.jpg"
                        alt="Coffee processing workflow"
                        fill
                        sizes="(min-width: 1280px) 34vw, (min-width: 1024px) 46vw, 100vw"
                        className="object-cover"
                        priority
                      />
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,12,10,0.18),rgba(5,12,10,0.72)_60%,rgba(5,12,10,0.96)_100%)]" />
                      <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-3">
                        <Badge className="border-emerald-300/20 bg-black/25 text-emerald-100 backdrop-blur">Estate operations view</Badge>
                        <div className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-stone-300">
                          Estate workflow snapshot
                        </div>
                      </div>
                      <div className="absolute inset-x-4 bottom-4 grid gap-3 sm:grid-cols-3">
                        {representativeOpsSignals.map((signal) => {
                          const Icon = signal.icon
                          return (
                            <div key={signal.label} className="rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-stone-100 backdrop-blur-md">
                              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-stone-300">
                                <Icon className="h-3.5 w-3.5 text-emerald-200" />
                                <span>{signal.label}</span>
                              </div>
                              <p className="mt-2 text-xl font-semibold">{signal.value}</p>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.28em] text-stone-400">Coffee chain control loop</p>
                          <h2 className="mt-2 text-2xl font-semibold text-stone-50">{t("public.landing.visualFlowTitle")}</h2>
                        </div>
                        <Badge className="border-white/10 bg-white/[0.06] text-stone-200">Actual estate pattern</Badge>
                      </div>
                      <div className="mt-4 grid gap-3">
                        {representativeEstateFlow.map((step, index) => {
                          const Icon = step.icon
                          return (
                            <div key={step.label} className="rounded-2xl border border-white/8 bg-[#0b1815] px-4 py-4">
                              <div className="flex items-start gap-3">
                                <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${step.accentClassName}`}>
                                  <Icon className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm text-stone-300">{step.label}</p>
                                    <p className="text-lg font-semibold text-stone-50">{step.value}</p>
                                  </div>
                                  <p className="mt-1 text-xs text-stone-500">{step.detail}</p>
                                </div>
                              </div>
                              {index < representativeEstateFlow.length - 1 ? (
                                <div className="ml-5 mt-3 h-5 w-px border-l border-dashed border-white/10" />
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex h-full flex-col gap-4">
                    <div className="rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,#0b1a17,#08110f)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.28em] text-stone-400">Monthly dry output</p>
                          <p className="mt-1 text-sm text-stone-300">A seasonal output pattern that managers can review at a glance.</p>
                        </div>
                        <BarChart3 className="h-5 w-5 text-emerald-200" />
                      </div>
                      <div className="mt-6 grid h-40 grid-cols-4 items-end gap-3">
                        {representativeMonthlyDryOutput.map((item) => {
                          const barHeight = Math.max((item.value / maxMonthlyDryOutput) * 100, 7)
                          return (
                            <div key={item.month} className="flex h-full flex-col justify-end gap-2">
                              <div className="relative flex-1 rounded-t-2xl bg-white/[0.05]">
                                <div
                                  className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-[linear-gradient(180deg,rgba(253,224,71,0.95),rgba(52,211,153,0.85))]"
                                  style={{ height: `${barHeight}%` }}
                                />
                              </div>
                              <div className="text-center">
                                <p className="text-[11px] font-semibold text-stone-200">{item.month}</p>
                                <p className="text-[11px] text-stone-500">{item.value.toLocaleString("en-IN")}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.28em] text-stone-400">Coffee mix and sellable stock</p>
                          <p className="mt-1 text-sm text-stone-300">Dispatch only becomes saleable after confirmed receipt.</p>
                        </div>
                        <Coffee className="h-5 w-5 text-amber-200" />
                      </div>
                      <div className="mt-5 space-y-4">
                        {representativeCoffeeMix.map((item) => (
                          <div key={item.label}>
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="text-stone-300">{item.label}</span>
                              <span className="font-semibold text-stone-50">{item.value.toLocaleString("en-IN")} KG</span>
                            </div>
                            <div className="mt-2 h-2.5 rounded-full bg-white/[0.06]">
                              <div className={`h-2.5 rounded-full ${item.accentClassName}`} style={{ width: `${item.percent}%` }} />
                            </div>
                          </div>
                        ))}
                        <div className="rounded-2xl border border-sky-300/15 bg-sky-400/10 px-3 py-3">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-sky-100">Dispatch receipts confirmed</span>
                            <span className="font-semibold text-white">19,347 / 21,884 KG</span>
                          </div>
                          <div className="mt-2 h-2.5 rounded-full bg-sky-100/10">
                            <div className="h-2.5 w-[88.4%] rounded-full bg-sky-300" />
                          </div>
                          <p className="mt-2 text-xs text-sky-100">The app uses this same confirmation step before stock becomes sellable.</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[1.6rem] border border-amber-200/10 bg-amber-300/10 p-4">
                      <p className="text-xs uppercase tracking-[0.28em] text-amber-100/70">Management clarity</p>
                      <p className="mt-2 text-lg font-semibold text-stone-50">
                        Give managers one place to trust the numbers coming from the estate.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </MotionDiv>
          </div>
        </section>

        {/* ── Stats strip ── */}
        <MotionDiv
          {...revealProps(0.04)}
          className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#080f0d]"
        >
          <div className="flex flex-col divide-y divide-white/[0.06] sm:flex-row sm:divide-x sm:divide-y-0">
            <div className="shrink-0 px-6 py-5 sm:px-8">
              <p className="text-xs uppercase tracking-[0.28em] text-stone-400">One estate. One season.</p>
              <p className="mt-1 text-sm text-stone-300">What FarmFlow tracks automatically.</p>
            </div>
            {statStrip.map((stat) => (
              <div key={stat.label} className="flex-1 px-6 py-5">
                <p className="text-2xl font-semibold text-stone-50 sm:text-3xl">{stat.value}</p>
                <p className="mt-0.5 text-xs text-stone-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </MotionDiv>

        {/* ── Why FarmFlow ── */}
        <MotionSection {...revealProps(0)} className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-200">Why estates choose FarmFlow</p>
              <h2 className="mt-1 font-display text-3xl font-semibold text-stone-50 sm:text-4xl">
                Built for day-to-day estate control, not just static reporting
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-300 sm:text-base">
                FarmFlow helps estates keep stock, processing, dispatch, rainfall, and finance connected so the team can act on clear numbers every day.
              </p>
            </div>
            <Badge className="w-fit border-white/10 bg-white/[0.04] text-stone-200">Built for estate teams</Badge>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {proofCards.map((card, index) => {
              const Icon = card.icon
              return (
                <MotionDiv key={card.title} {...revealProps(index * 0.06)} {...hoverLift}>
                  <Card className="h-full rounded-[1.7rem] border-white/10 bg-white/[0.04] shadow-[0_18px_60px_-34px_rgba(0,0,0,0.9)]">
                    <CardHeader>
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/15 bg-emerald-300/10 text-emerald-100">
                        <Icon className="h-5 w-5" />
                      </div>
                      <CardTitle className="text-stone-50">{card.title}</CardTitle>
                      <CardDescription className="text-stone-300">{card.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </MotionDiv>
              )
            })}
          </div>
        </MotionSection>

        {/* ── How it works ── */}
        <MotionSection
          {...revealProps(0.04)}
          className="rounded-[2rem] border border-white/10 bg-[#080f0d] p-6 sm:p-10"
        >
          <div className="text-center">
            <p className="text-sm font-medium text-emerald-200">Simple by design</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-stone-50 sm:text-4xl">
              Up and running in one morning
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-stone-300 sm:text-base">
              No consultants. No import scripts. No waiting. Estate teams go live the same day they sign up.
            </p>
          </div>
          <div className="relative mt-10 grid gap-6 sm:grid-cols-3">
            {howItWorks.map((item, index) => (
              <MotionDiv key={item.step} {...revealProps(0.06 + index * 0.07)}>
                <div className="relative h-full rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-6">
                  <p className="font-display text-6xl font-bold leading-none text-white/[0.07]">{item.step}</p>
                  <p className="mt-4 text-lg font-semibold text-stone-50">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-stone-400">{item.detail}</p>
                  {index < howItWorks.length - 1 && (
                    <div className="absolute -right-3 top-8 hidden sm:block">
                      <ArrowRight className="h-5 w-5 text-white/15" />
                    </div>
                  )}
                </div>
              </MotionDiv>
            ))}
          </div>
        </MotionSection>

        {/* ── Operating surface + Estate insights ── */}
        <MotionSection {...revealProps(0.05)} className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="rounded-[1.8rem] border border-white/10 bg-[#0a1714]/90 p-6 shadow-[0_18px_54px_-34px_rgba(0,0,0,0.95)] sm:p-7">
            <p className="text-xs uppercase tracking-[0.28em] text-emerald-200">What estate teams actually get</p>
            <h2 className="mt-3 font-display text-3xl font-semibold text-stone-50 sm:text-4xl">
              One operating surface for stock, money, and day-to-day estate control
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-300 sm:text-base">
              Estate teams need one place to understand what moved, what was sold, what is still pending, and where the numbers can be trusted.
            </p>

            <div className="mt-6 space-y-4">
              {estateOutcomeCards.map((item) => (
                <div key={item.title} className="rounded-[1.35rem] border border-white/10 bg-[#111d1a] px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-200">{item.eyebrow}</p>
                  <p className="mt-2 text-lg font-semibold text-stone-50">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-stone-300">{item.detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {coreSurfacePills.map((item) => (
                <span key={item} className="rounded-full border border-white/10 bg-[#15231f] px-3 py-1 text-xs font-medium text-stone-200">
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-stone-400">The signals that matter</p>
                <p className="mt-1 text-sm text-stone-300">Visible every day, while there is still time to act on them.</p>
              </div>
              <Badge className="w-fit border-white/10 bg-white/[0.04] text-stone-200">Live estate pattern</Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {estateInsightCards.map((item, index) => {
                const Icon = item.icon
                return (
                  <MotionDiv key={item.eyebrow} {...revealProps(index * 0.05)} {...hoverLift}>
                    <div className="h-full rounded-[1.6rem] border border-white/10 bg-[#0b1715] p-6 shadow-[0_18px_48px_-34px_rgba(0,0,0,0.95)]">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${item.accentClassName}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <p className="mt-4 text-[11px] uppercase tracking-[0.24em] text-stone-500">{item.eyebrow}</p>
                      <p className="mt-2 text-lg font-semibold leading-snug text-stone-50">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-stone-400">{item.detail}</p>
                    </div>
                  </MotionDiv>
                )
              })}
            </div>
          </div>
        </MotionSection>

        {/* ── Trust bar ── */}
        <MotionDiv
          {...revealProps(0.04)}
          className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-[1.4rem] border border-white/10 bg-white/[0.025] px-6 py-4"
        >
          {[
            t("public.landing.trust1"),
            "Your data is private and never shared",
            t("public.landing.trust3"),
            "Works offline on mobile",
          ].map((item) => (
            <span key={item} className="flex items-center gap-2 text-sm text-stone-400">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              {item}
            </span>
          ))}
        </MotionDiv>

        {/* ── Plans ── */}
        <MotionSection
          {...revealProps(0.08)}
          className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-6 shadow-[0_22px_70px_-38px_rgba(0,0,0,0.95)] sm:p-8"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-200">Plans, still visible</p>
              <h2 className="mt-1 font-display text-3xl font-semibold text-stone-50 sm:text-4xl">
                Choose the plan that fits the estate today
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-300 sm:text-base">
                Start with the bundle that matches current operations, then enable more as the estate grows.
              </p>
            </div>
            <Button
              variant="ghost"
              className="w-fit border-white/10 bg-white/[0.04] text-stone-100 hover:bg-white/[0.08] hover:text-white"
              asChild
            >
              <Link href="/plans">Open full plan comparison</Link>
            </Button>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            {MODULE_BUNDLES.map((bundle, index) => {
              const isCore = bundle.id === "core"
              return (
                <MotionDiv key={bundle.id} {...revealProps(index * 0.06)} {...hoverLift}>
                  <div
                    className={`h-full rounded-[1.6rem] border p-6 ${
                      isCore
                        ? "border-emerald-300/30 bg-[#10201c] shadow-[0_22px_60px_-34px_rgba(16,185,129,0.4)]"
                        : "border-white/10 bg-[#0a1714]"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <Badge
                          className={
                            isCore
                              ? "border-emerald-300/25 bg-emerald-300/14 text-emerald-100"
                              : "border-white/10 bg-white/[0.05] text-stone-200"
                          }
                        >
                          {planBadges[bundle.id] || "Plan"}
                        </Badge>
                        {isCore ? <span className="text-[11px] uppercase tracking-[0.24em] text-emerald-100">Best fit</span> : null}
                      </div>
                      <p className="mt-5 text-4xl font-semibold text-stone-50">{bundle.label}</p>
                      <p className="mt-3 text-sm leading-7 text-stone-300">{bundle.description}</p>
                    </div>
                    <div className="mt-6 space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {bundle.modules.slice(0, 7).map((moduleId) => (
                          <span key={moduleId} className="rounded-full border border-white/10 bg-[#15231f] px-2.5 py-1 text-xs text-stone-200">
                            {moduleLabelById.get(moduleId) || moduleId}
                          </span>
                        ))}
                        {bundle.modules.length > 7 ? (
                          <span className="rounded-full border border-white/10 bg-[#101a18] px-2.5 py-1 text-xs text-stone-400">
                            +{bundle.modules.length - 7} more
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </MotionDiv>
              )
            })}
          </div>
        </MotionSection>

        {/* ── Final CTA ── */}
        <MotionSection
          {...revealProps(0.12)}
          className="relative overflow-hidden rounded-[2rem] border border-emerald-300/15 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(8,17,15,0.94)_44%,rgba(10,8,4,0.96))] p-6 shadow-[0_28px_80px_-36px_rgba(0,0,0,0.95)] sm:p-8"
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-[-8%] top-[-20%] h-60 w-60 rounded-full bg-[radial-gradient(circle,rgba(110,231,183,0.18),transparent_70%)] blur-3xl" />
            <div className="absolute right-[-5%] bottom-[-22%] h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(253,224,71,0.12),transparent_72%)] blur-3xl" />
          </div>
          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-emerald-200">Self-serve onboarding</p>
              <h2 className="mt-2 font-display text-3xl font-semibold text-stone-50 sm:text-4xl">
                Create the workspace, verify email, set bag weight, add locations, and go live without waiting on a deck.
              </h2>
              <p className="mt-3 text-sm leading-7 text-stone-300 sm:text-base">
                Start with the core setup, invite the team, and begin recording live estate activity with a guided setup flow that is easy to follow.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                variant="ghost"
                className="border-white/12 bg-white/[0.04] text-stone-100 hover:bg-white/[0.08] hover:text-white"
                asChild
              >
                <Link href="/login">{t("common.login")}</Link>
              </Button>
              <Button
                size="lg"
                className="border-emerald-300/40 bg-emerald-300 text-[#06110f] shadow-[0_18px_36px_-18px_rgba(110,231,183,0.6)] hover:bg-emerald-200"
                asChild
              >
                <Link href="/signup">{t("public.landing.ctaPrimary")}</Link>
              </Button>
            </div>
          </div>
        </MotionSection>
      </div>
    </PublicSiteShell>
  )
}
