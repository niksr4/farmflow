"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Coffee,
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
import { MODULE_BUNDLES, MODULES } from "@/lib/modules"

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
    detail: "27.3% cherry-to-dry ratio",
    icon: PackageCheck,
    accentClassName: "bg-emerald-400/15 text-emerald-200 border-emerald-300/20",
  },
  {
    label: "Confirmed receipts",
    value: "19,347 KG",
    detail: "Verified before saleable stock",
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

const benefits = [
  {
    title: "One source of truth",
    description:
      "Stock, processing, dispatch, and money movement stay connected instead of drifting across separate spreadsheets.",
    icon: Wallet,
  },
  {
    title: "Live chain visibility",
    description:
      "Follow coffee from intake to dry output, confirmed receipt, and saleable stock without losing the thread.",
    icon: PackageCheck,
  },
  {
    title: "Control that scales",
    description:
      "Roles, module access, and a full audit trail stay reviewable as the estate team grows.",
    icon: ShieldCheck,
  },
]

const howItWorks = [
  {
    step: "01",
    title: "Create your workspace in 5 minutes",
    detail:
      "Guided setup walks through locations, crop types, and team access. New staff can record live entries the same day.",
  },
  {
    step: "02",
    title: "Teams record what happened, every day",
    detail:
      "Intake, processing, labor, dispatch — each entry is date-stamped, location-tagged, and linked to the next step in the chain.",
  },
  {
    step: "03",
    title: "Numbers stay connected all season",
    detail:
      "Conversion ratios, labor costs, and revenue trace back to the exact day they were recorded. No spreadsheet assembly.",
  },
]

const outcomeCards = [
  {
    eyebrow: "Traceability",
    title: "See the full coffee chain",
    detail:
      "Intake, conversion, dispatch, receipt, and saleable stock — each step linked to the one before it.",
    icon: BarChart3,
  },
  {
    eyebrow: "Finance discipline",
    title: "Books tied to the work",
    detail:
      "Sales, accounts, and journals stay anchored to what actually happened on the estate that day.",
    icon: Wallet,
  },
  {
    eyebrow: "Team adoption",
    title: "Get staff live faster",
    detail:
      "Guided setup, role-based access, and in-product manuals help new teams go live without hand-holding.",
    icon: Users,
  },
]

const trustItems = [
  { label: "5-min guided setup", icon: Zap },
  { label: "Your data stays private", icon: Lock },
  { label: "Works offline on mobile", icon: Smartphone },
  { label: "No per-seat pricing", icon: CheckCircle2 },
]

const coreSurfacePills = [
  "Processing",
  "Dispatch",
  "Sales",
  "Accounts",
  "Inventory",
  "Rainfall",
  "Journal",
]

const planBadges: Record<string, string> = {
  basic: "Foundation",
  core: "Recommended",
  enterprise: "Full stack",
}

const moduleLabelById = new Map(MODULES.map((m) => [m.id, m.label]))

export default function LandingPage() {
  const { t } = useLocale()
  const prefersReducedMotion = useReducedMotion()
  const MotionDiv = motion.div as any
  const MotionSection = motion.section as any

  const reveal = (delay = 0) =>
    prefersReducedMotion
      ? { initial: { opacity: 1, y: 0 }, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 24 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, amount: 0.15 },
          transition: { duration: 0.6, delay, ease: "easeOut" as const },
        }

  const lift = prefersReducedMotion
    ? {}
    : { whileHover: { y: -4, transition: { duration: 0.2, ease: "easeOut" } } }

  return (
    <PublicSiteShell theme="dark">
      <div className="mx-auto w-full max-w-6xl space-y-24 sm:space-y-32">

        {/* ── Hero ── */}
        <MotionDiv {...reveal(0)} className="pt-12 text-center sm:pt-20">
          <Badge className="mb-6 border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200">
            {t("public.landing.badge")}
          </Badge>
          <h1 className="mx-auto max-w-4xl font-display text-5xl font-semibold leading-[1.05] tracking-tight text-stone-50 sm:text-6xl lg:text-[5rem]">
            {t("public.landing.title")}
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-stone-400">
            {t("public.landing.description")}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              size="lg"
              className="bg-emerald-300 text-[#06110f] shadow-[0_0_40px_-8px_rgba(110,231,183,0.5)] hover:bg-emerald-200"
              asChild
            >
              <Link href="/signup">
                {t("public.landing.ctaPrimary")}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="text-stone-300 hover:bg-white/[0.06] hover:text-white"
              asChild
            >
              <Link href="/plans">See plans</Link>
            </Button>
          </div>
        </MotionDiv>

        {/* ── Coffee chain flow ── */}
        <MotionDiv {...reveal(0.05)}>
          <p className="mb-6 text-center text-xs uppercase tracking-[0.3em] text-stone-600">
            One estate · One season · End to end
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {representativeEstateFlow.map((step, index) => {
              const Icon = step.icon
              return (
                <div key={step.label} className="relative">
                  <div className="flex h-full flex-col rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 text-center">
                    <div
                      className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border ${step.accentClassName} mb-4`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500">
                      {step.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-stone-50">{step.value}</p>
                    <p className="mt-1 text-xs text-stone-600">{step.detail}</p>
                  </div>
                  {index < representativeEstateFlow.length - 1 && (
                    <div className="absolute -right-1.5 top-1/2 z-10 hidden -translate-y-1/2 lg:block">
                      <ArrowRight className="h-3 w-3 text-white/10" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </MotionDiv>

        {/* ── Trust signals ── */}
        <MotionDiv
          {...reveal(0.04)}
          className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3"
        >
          {trustItems.map((item) => {
            const Icon = item.icon
            return (
              <span key={item.label} className="flex items-center gap-2 text-sm text-stone-500">
                <Icon className="h-4 w-4 text-emerald-500" />
                {item.label}
              </span>
            )
          })}
        </MotionDiv>

        {/* ── Benefits ── */}
        <MotionSection {...reveal(0)} className="space-y-4">
          <div className="mb-14 text-center">
            <p className="text-sm font-medium text-emerald-400">Why estates choose FarmFlow</p>
            <h2 className="mt-3 font-display text-4xl font-semibold text-stone-50 sm:text-5xl">
              Built for control, not just reporting
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-stone-400">
              FarmFlow keeps stock, processing, dispatch, and finance connected so the team acts on clean numbers every day — not once a season.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {benefits.map((card, i) => {
              const Icon = card.icon
              return (
                <MotionDiv key={card.title} {...reveal(i * 0.07)} {...lift}>
                  <div className="flex h-full flex-col gap-5 rounded-3xl border border-white/[0.08] bg-white/[0.03] p-8">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.08]">
                      <Icon className="h-5 w-5 text-emerald-200" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-stone-50">{card.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-stone-400">{card.description}</p>
                    </div>
                  </div>
                </MotionDiv>
              )
            })}
          </div>
        </MotionSection>

        {/* ── How it works ── */}
        <MotionSection {...reveal(0.04)}>
          <div className="mb-14 text-center">
            <p className="text-sm font-medium text-emerald-400">Simple by design</p>
            <h2 className="mt-3 font-display text-4xl font-semibold text-stone-50 sm:text-5xl">
              Up and running in one morning
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-stone-400">
              No consultants. No import scripts. No waiting. Estate teams go live the same day they sign up.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {howItWorks.map((item, i) => (
              <MotionDiv key={item.step} {...reveal(0.06 + i * 0.07)}>
                <div className="relative flex h-full flex-col gap-5 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-8">
                  <span className="font-display text-7xl font-bold leading-none text-white/[0.05]">
                    {item.step}
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-stone-50">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-stone-400">{item.detail}</p>
                  </div>
                  {i < howItWorks.length - 1 && (
                    <ArrowRight className="absolute -right-2 top-10 hidden h-4 w-4 text-white/10 lg:block" />
                  )}
                </div>
              </MotionDiv>
            ))}
          </div>
        </MotionSection>

        {/* ── What you get ── */}
        <MotionSection {...reveal(0.04)}>
          <div className="mb-14 text-center">
            <p className="text-sm font-medium text-emerald-400">What estate teams actually get</p>
            <h2 className="mt-3 font-display text-4xl font-semibold text-stone-50 sm:text-5xl">
              One operating surface for the whole estate
            </h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {outcomeCards.map((item, i) => {
              const Icon = item.icon
              return (
                <MotionDiv key={item.eyebrow} {...reveal(i * 0.07)} {...lift}>
                  <div className="flex h-full flex-col gap-4 rounded-3xl border border-white/[0.08] bg-white/[0.03] p-8">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/15 bg-emerald-300/[0.08]">
                      <Icon className="h-4 w-4 text-emerald-200" />
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-emerald-500">
                        {item.eyebrow}
                      </p>
                      <h3 className="mt-2 text-xl font-semibold text-stone-50">{item.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-stone-400">{item.detail}</p>
                    </div>
                  </div>
                </MotionDiv>
              )
            })}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {coreSurfacePills.map((pill) => (
              <span
                key={pill}
                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-xs font-medium text-stone-400"
              >
                {pill}
              </span>
            ))}
          </div>
        </MotionSection>

        {/* ── Plans ── */}
        <MotionSection {...reveal(0.06)}>
          <div className="mb-14 flex flex-col items-center gap-4 text-center">
            <p className="text-sm font-medium text-emerald-400">Pricing</p>
            <h2 className="font-display text-4xl font-semibold text-stone-50 sm:text-5xl">
              Start with what you need
            </h2>
            <p className="max-w-xl text-base leading-7 text-stone-400">
              Choose the bundle that fits today. Enable more as the estate grows.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-stone-400 hover:text-stone-200"
              asChild
            >
              <Link href="/plans">
                View full comparison
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {MODULE_BUNDLES.map((bundle, i) => {
              const isCore = bundle.id === "core"
              return (
                <MotionDiv key={bundle.id} {...reveal(i * 0.07)} {...lift}>
                  <div
                    className={`relative flex h-full flex-col rounded-3xl border p-8 ${
                      isCore
                        ? "border-emerald-400/30 bg-[#0d1f1a] shadow-[0_0_60px_-20px_rgba(52,211,153,0.25)]"
                        : "border-white/[0.08] bg-white/[0.02]"
                    }`}
                  >
                    {isCore && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-emerald-300">
                          Most popular
                        </span>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-3xl font-semibold text-stone-50">{bundle.label}</p>
                      <Badge
                        className={
                          isCore
                            ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                            : "border-white/10 bg-white/[0.04] text-stone-400"
                        }
                      >
                        {planBadges[bundle.id] || "Plan"}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-stone-400">{bundle.description}</p>
                    {(() => {
                      const prevBundle = MODULE_BUNDLES[i - 1]
                      const prevModuleSet = new Set(prevBundle?.modules || [])
                      const displayModules = prevBundle
                        ? bundle.modules.filter((id) => !prevModuleSet.has(id))
                        : bundle.modules
                      const shown = displayModules.slice(0, 7)
                      const overflow = displayModules.length - shown.length
                      return (
                        <div className="mt-6 space-y-2">
                          {prevBundle && (
                            <p className="text-xs text-stone-500">
                              Everything in {prevBundle.label}, plus:
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {shown.map((moduleId) => (
                              <span
                                key={moduleId}
                                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs text-stone-400"
                              >
                                {moduleLabelById.get(moduleId) || moduleId}
                              </span>
                            ))}
                            {overflow > 0 && (
                              <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-xs text-stone-600">
                                +{overflow} more
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                    <div className="mt-auto pt-8">
                      <Button
                        asChild
                        size="sm"
                        className={
                          isCore
                            ? "w-full bg-emerald-300 text-[#06110f] hover:bg-emerald-200"
                            : "w-full border-white/10 bg-white/[0.04] text-stone-200 hover:bg-white/[0.08]"
                        }
                        variant={isCore ? "default" : "ghost"}
                      >
                        <Link href="/signup">Get started</Link>
                      </Button>
                    </div>
                  </div>
                </MotionDiv>
              )
            })}
          </div>
        </MotionSection>

        {/* ── Crop roadmap ── */}
        <MotionSection {...reveal(0.04)}>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-8 text-center sm:px-10">
            <p className="text-xs uppercase tracking-[0.25em] text-stone-600">Built for estates, not just coffee</p>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-stone-400">
              FarmFlow starts with coffee — the crop with the most operational complexity. The same foundation is expanding to tea, cocoa, spices, and beyond as those communities come on board.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {[
                { emoji: "☕", label: "Coffee", active: true },
                { emoji: "🍵", label: "Tea" },
                { emoji: "🍫", label: "Cocoa" },
                { emoji: "🌿", label: "Spices" },
                { emoji: "🌰", label: "Tree nuts" },
                { emoji: "🌾", label: "Grains" },
                { emoji: "🥦", label: "Horticulture" },
              ].map((crop) => (
                <span
                  key={crop.label}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                    crop.active
                      ? "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300"
                      : "border-white/[0.06] bg-white/[0.02] text-stone-600"
                  }`}
                >
                  <span>{crop.emoji}</span>
                  {crop.label}
                  {!crop.active && <span className="ml-0.5 text-[10px] text-stone-700">Soon</span>}
                </span>
              ))}
            </div>
          </div>
        </MotionSection>

        {/* ── Final CTA ── */}
        <MotionSection {...reveal(0.08)} className="pb-12 text-center sm:pb-20">
          <div className="relative overflow-hidden rounded-3xl border border-emerald-400/15 bg-[linear-gradient(135deg,rgba(16,185,129,0.1),rgba(8,17,15,0.95)_50%)] px-8 py-20 sm:px-16">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-1/4 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(52,211,153,0.15),transparent_65%)] blur-3xl" />
              <div className="absolute bottom-0 right-1/4 h-48 w-48 translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(253,224,71,0.08),transparent_65%)] blur-3xl" />
            </div>
            <div className="relative z-10 space-y-6">
              <p className="text-sm font-medium text-emerald-400">Self-serve. No sales call needed.</p>
              <h2 className="mx-auto max-w-3xl font-display text-4xl font-semibold text-stone-50 sm:text-5xl">
                Your estate can be live today.
              </h2>
              <p className="mx-auto max-w-xl text-base leading-7 text-stone-400">
                Create a workspace, verify your email, add your locations, and start recording. The whole setup takes less than ten minutes.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Button
                  size="lg"
                  className="bg-emerald-300 text-[#06110f] shadow-[0_0_40px_-8px_rgba(110,231,183,0.4)] hover:bg-emerald-200"
                  asChild
                >
                  <Link href="/signup">
                    {t("public.landing.ctaPrimary")}
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  className="text-stone-400 hover:bg-white/[0.06] hover:text-stone-200"
                  asChild
                >
                  <Link href="/login">{t("common.login")}</Link>
                </Button>
              </div>
            </div>
          </div>
        </MotionSection>

      </div>
    </PublicSiteShell>
  )
}
