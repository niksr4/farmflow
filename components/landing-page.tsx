"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { motion, useMotionValue, useSpring, useInView, useTransform } from "framer-motion"
import posthog from "posthog-js"
import {
  ArrowRight,
  CheckCircle2,
  Coffee,
  PackageCheck,
  Truck,
  Users,
  Wallet,
  Zap,
  Lock,
  Smartphone,
  Brain,
  TrendingUp,
  Mail,
  AlertCircle,
} from "lucide-react"
import { PublicSiteShell } from "@/components/public-site-shell"
import { useLocale } from "@/components/locale-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MODULE_BUNDLES, MODULES } from "@/lib/modules"

/* ── Animated count-up number ── */
function CountUpNumber({
  target,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 1.8,
}: {
  target: number
  prefix?: string
  suffix?: string
  decimals?: number
  duration?: number
}) {
  const ref = useRef<HTMLSpanElement>(null) as React.RefObject<Element>
  const isInView = useInView(ref, { once: true, margin: "-60px" })
  const motionVal = useMotionValue(0)
  const spring = useSpring(motionVal, { duration: duration * 1000, bounce: 0 })
  const display = useTransform(spring, (v) => {
    const formatted = decimals > 0
      ? v.toFixed(decimals)
      : Math.round(v).toLocaleString("en-IN")
    return `${prefix}${formatted}${suffix}`
  })

  useEffect(() => {
    if (isInView) motionVal.set(target)
  }, [isInView, motionVal, target])

  return <motion.span ref={ref}>{display}</motion.span>
}

/* ── Infinite marquee strip ── */
// The words a planter already uses. Nothing here needs translating into farm-software.
const marqueeItems = [
  "Cherry intake", "Pulping", "Wet parchment", "Drying yard", "Outturn",
  "Arabica", "Robusta", "The muster", "Shade lopping", "Cost per kilo",
  "Dispatch to curing", "Buyer weighment", "Season P&L", "Rainfall",
  "Pepper", "Arecanut", "Weekly digest",
]

function MarqueeStrip() {
  const doubled = [...marqueeItems, ...marqueeItems]
  return (
    <div className="relative overflow-hidden py-3" aria-hidden>
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-[#080f0d] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-[#080f0d] to-transparent" />
      <div className="marquee-track gap-3 flex">
        {doubled.map((item, i) => (
          <span
            key={i}
            className="shrink-0 rounded-full border border-white/[0.09] bg-white/[0.03] px-4 py-1.5 text-xs font-medium text-stone-500 whitespace-nowrap"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

const representativeEstateFlow = [
  {
    label: "Cherry intake",
    countTarget: 183766, countSuffix: " KG",
    detail: "88 pulping entries across the season",
    icon: Coffee,
    accentClassName: "bg-amber-400/15 text-amber-200 border-amber-300/20",
  },
  {
    label: "Parchment out",
    countTarget: 50229, countSuffix: " KG",
    detail: "27.3% cherry-to-parchment ratio",
    icon: PackageCheck,
    accentClassName: "bg-emerald-400/15 text-emerald-200 border-emerald-300/20",
  },
  {
    label: "Dispatched & received",
    countTarget: 19347, countSuffix: " KG",
    detail: "Buyer-confirmed before it counts as sold",
    icon: Truck,
    accentClassName: "bg-sky-400/15 text-sky-200 border-sky-300/20",
  },
  {
    label: "Revenue booked",
    countTarget: 55.6, countPrefix: "₹", countSuffix: "L", countDecimals: 1,
    detail: "11,910 KG at final sale",
    icon: Wallet,
    accentClassName: "bg-violet-400/15 text-violet-200 border-violet-300/20",
  },
]

const benefits = [
  {
    title: "Outturn you can see coming",
    description:
      "Cherry in, wet parchment out, dry weight off the yard — entered the day it happens. A bad conversion shows up in that week, not in March when the year is already spent.",
    icon: Coffee,
  },
  {
    title: "The muster, and what it cost",
    description:
      "Mark who came in, set what each person worked on and where. Contract gangs go on as one crew with a headcount. The wage bill and the cost of a block build themselves out of the roll.",
    icon: Users,
  },
  {
    title: "What a kilo of parchment actually cost",
    description:
      "Labour, fertiliser, spray and fuel, each against the block it was spent on. Not the estate average — the number for that block, this season.",
    icon: Wallet,
  },
]

const advisorCards = [
  {
    eyebrow: "Every Monday morning",
    title: "Your weekly digest, written by AI",
    detail:
      "Last week's cherry yield, labour efficiency, field conditions, and three specific actions for this week — grounded in your actual estate data, not generic advice.",
    icon: Mail,
    accent: "border-violet-400/20 bg-violet-400/[0.06]",
    iconAccent: "border-violet-300/15 bg-violet-300/[0.08] text-violet-200",
  },
  {
    eyebrow: "Coffee market intelligence",
    title: "Know when to sell, not just what you have",
    detail:
      "ICO benchmark prices tracked against your unsold parchment stock. When coffee is at a 3-month high, you hear about it before your buyer calls.",
    icon: TrendingUp,
    accent: "border-emerald-400/20 bg-emerald-400/[0.06]",
    iconAccent: "border-emerald-300/15 bg-emerald-300/[0.08] text-emerald-200",
  },
  {
    eyebrow: "Always-on assistant",
    title: "Ask about your own numbers",
    detail:
      "\"Why did my cost per kg jump last month?\" \"How does this week's yield compare to last season?\" Direct answers from your own data — not a dashboard you have to interpret.",
    icon: Brain,
    accent: "border-sky-400/20 bg-sky-400/[0.06]",
    iconAccent: "border-sky-300/15 bg-sky-300/[0.08] text-sky-200",
  },
  {
    eyebrow: "Automatic exception detection",
    title: "Catches what you'd miss",
    detail:
      "Labour costs running 40% above last season? Processing yield below your historical average? Flagged in your weekly brief before it becomes a costly pattern.",
    icon: AlertCircle,
    accent: "border-amber-400/20 bg-amber-400/[0.06]",
    iconAccent: "border-amber-300/15 bg-amber-300/[0.08] text-amber-200",
  },
]

const howItWorks = [
  {
    step: "01",
    title: "Set up your estate in one morning",
    detail:
      "Name your blocks, your store, and your workers. Eighty activity codes are already there — shade lopping, manuring, picking, spraying — so nothing has to be invented first.",
  },
  {
    step: "02",
    title: "Your writer marks the day, same as always",
    detail:
      "The muster in the morning, cherry and pulping as it comes in, dispatch when the lorry leaves. On a phone, in the field, on whatever signal there is.",
  },
  {
    step: "03",
    title: "The season adds itself up",
    detail:
      "Outturn, wage bill, cost per kilo, what each block returned. Ready the day you want it — not reconstructed from notebooks in May.",
  },
]

const outcomeCards = [
  {
    eyebrow: "Pulping & drying",
    title: "Outturn, batch by batch",
    detail:
      "Cherry into the pulper, wet parchment out, dry weight off the yard. Arabica and Robusta kept apart, so a weak batch shows as itself and not as an average.",
    icon: Coffee,
  },
  {
    eyebrow: "Labour & costs",
    title: "Every rupee against a block",
    detail:
      "Wages off the muster, fertiliser and spray out of the store — each landing on the block it was spent on. Cost per kilo stops being an estimate.",
    icon: Wallet,
  },
  {
    eyebrow: "Dispatch & sales",
    title: "What you sent, what they weighed",
    detail:
      "Bags out to the curing works, against what the buyer's weighbridge confirmed. Stock only counts as sold once that weight comes back.",
    icon: Truck,
  },
]

const trustItems = [
  { label: "30-day free trial — no credit card", icon: CheckCircle2 },
  { label: "Live in under 10 minutes", icon: Zap },
  { label: "Your data stays private", icon: Lock },
  { label: "Works on mobile, even offline", icon: Smartphone },
]

const coreSurfacePills = [
  "Cherry intake",
  "Pulping records",
  "Drying & parchment",
  "Dispatch",
  "Sales",
  "The muster",
  "Costs",
  "Season P&L",
  "Pepper & arecanut",
  "Weekly digest",
  "Market timing",
  "Rainfall",
]

const planBadges: Record<string, string> = {
  basic: "Digital field book",
  core: "Most popular",
  enterprise: "Full stack",
}

const planPrices: Record<string, { price: string; note: string }> = {
  basic: { price: "₹1,299", note: "/month" },
  core: { price: "₹3,499", note: "/month" },
  enterprise: { price: "Custom", note: "" },
}

const moduleLabelById = new Map(MODULES.map((m) => [m.id, m.label]))

const heroBeanSpecs = [
  { left: "6%", top: "10%", size: 16, duration: "9.2s", delay: "-1.4s", opacity: 0.24 },
  { left: "14%", top: "3%", size: 12, duration: "8.4s", delay: "-5.1s", opacity: 0.18 },
  { left: "78%", top: "8%", size: 18, duration: "10.6s", delay: "-3.6s", opacity: 0.22 },
  { left: "88%", top: "18%", size: 13, duration: "7.8s", delay: "-6.2s", opacity: 0.2 },
]

function capture(event: string, props?: Record<string, unknown>) {
  try { posthog.capture(event, props) } catch { /* posthog not ready */ }
}

export default function LandingPage() {
  const { t } = useLocale()
  const MotionDiv = motion.div as any
  const MotionSection = motion.section as any
  const scrollMilestonesRef = useRef(new Set<number>())

  useEffect(() => {
    const milestones = [25, 50, 75]
    const onScroll = () => {
      const scrolled = window.scrollY
      const total = document.documentElement.scrollHeight - window.innerHeight
      if (total <= 0) return
      const pct = Math.round((scrolled / total) * 100)
      for (const m of milestones) {
        if (pct >= m && !scrollMilestonesRef.current.has(m)) {
          scrollMilestonesRef.current.add(m)
          capture("homepage_scrolled", { depth_pct: m })
        }
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const reveal = (delay = 0) => ({
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.15 },
    transition: { duration: 0.6, delay, ease: "easeOut" as const },
  })

  const lift = { whileHover: { y: -4, transition: { duration: 0.2, ease: "easeOut" } } }

  return (
    <PublicSiteShell theme="dark">
      <div className="mx-auto w-full max-w-6xl space-y-24 sm:space-y-32">

        {/* ── Hero ── */}
        <MotionDiv {...reveal(0)} className="relative overflow-hidden pt-12 text-center sm:pt-20">
          {/* Subtle ambient glow */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-[15%] top-[10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(52,211,153,0.06)_0%,transparent_65%)] blur-[80px]" />
            <div className="absolute bottom-0 left-1/2 h-[200px] w-[600px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(52,211,153,0.04)_0%,transparent_70%)] blur-[60px]" />
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
            {heroBeanSpecs.map((bean, index) => (
              <span
                key={`${bean.left}-${bean.top}-${index}`}
                className="coffee-bean"
                style={{
                  left: bean.left,
                  top: bean.top,
                  width: `${bean.size}px`,
                  height: `${Math.round(bean.size * 1.45)}px`,
                  opacity: bean.opacity,
                  animationDuration: bean.duration,
                  animationDelay: bean.delay,
                  animationIterationCount: "infinite",
                }}
              />
            ))}
          </div>
          <div className="relative z-10">
            <div className="mb-6 inline-flex items-center justify-center">
              <span className="relative rounded-full border border-emerald-400/25 bg-emerald-400/[0.09] px-4 py-1.5 text-sm font-medium text-emerald-200 backdrop-blur-sm">
                {t("public.landing.badge")}
              </span>
            </div>
            <h1 className="mx-auto max-w-4xl font-display text-5xl font-black leading-[1.02] tracking-[-0.03em] text-stone-50 sm:text-6xl lg:text-[5.25rem]">
              {t("public.landing.title")}
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-stone-400/90">
              {t("public.landing.description")}
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <div className="relative">
                <Button
                  size="lg"
                  className="relative bg-emerald-300 text-[#06110f] font-bold hover:bg-emerald-200"
                  asChild
                  onClick={() => capture("cta_clicked", { cta_location: "homepage_hero", cta_text: "signup" })}
                >
                  <Link href="/signup">
                    {t("public.landing.ctaPrimary")}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <Button
                size="lg"
                variant="ghost"
                className="border border-white/10 text-stone-300 backdrop-blur-sm hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
                asChild
                onClick={() => capture("cta_clicked", { cta_location: "homepage_hero", cta_text: "see_plans" })}
              >
                <Link href="/plans">See plans</Link>
              </Button>
            </div>
            <p className="mt-5 text-sm text-stone-600">
              30-day free trial · No credit card required · Cancel any time
            </p>
          </div>
        </MotionDiv>

        <MotionDiv {...reveal(0.04)} aria-hidden className="flex justify-center">
          <div className="flex items-center gap-3 text-stone-500/25">
            <span className="h-px w-12 bg-gradient-to-r from-transparent via-stone-400/25 to-transparent" />
            <span
              className="coffee-bean"
              style={{
                position: "relative",
                top: 0,
                display: "inline-block",
                width: "10px",
                height: "14px",
                opacity: 0.32,
                animation: "none",
              }}
            />
            <span
              className="coffee-bean"
              style={{
                position: "relative",
                top: 0,
                display: "inline-block",
                width: "14px",
                height: "20px",
                opacity: 0.48,
                animation: "none",
              }}
            />
            <span
              className="coffee-bean"
              style={{
                position: "relative",
                top: 0,
                display: "inline-block",
                width: "10px",
                height: "14px",
                opacity: 0.32,
                animation: "none",
              }}
            />
            <span className="h-px w-12 bg-gradient-to-r from-transparent via-stone-400/25 to-transparent" />
          </div>
        </MotionDiv>

        {/* ── Coffee chain flow ── */}
        <MotionDiv {...reveal(0.05)}>
          <p className="mb-2 text-center text-xs uppercase tracking-[0.3em] text-stone-600">
            One estate · One season · End to end
          </p>
          <p className="mb-6 text-center text-xs text-stone-500">
            Actual records from the working Coorg coffee estate FarmFlow was built on — logged daily in the app.
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {representativeEstateFlow.map((step, index) => {
              const Icon = step.icon
              return (
                <div key={step.label} className="relative">
                  <div className="grain-dark shimmer-hover flex h-full flex-col rounded-2xl border border-white/[0.10] bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-5 text-center transition-all duration-300 hover:border-white/[0.16] hover:from-white/[0.10] hover:to-white/[0.04] hover:shadow-[0_8px_32px_-8px_rgba(255,255,255,0.06)]">
                    <div
                      className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border ${step.accentClassName} mb-4`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-stone-500">
                      {step.label}
                    </p>
                    <p className="mt-2 font-display text-2xl font-black text-stone-50 tabular-nums">
                      <CountUpNumber
                        target={step.countTarget}
                        prefix={step.countPrefix}
                        suffix={step.countSuffix}
                        decimals={step.countDecimals ?? 0}
                      />
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-stone-600">{step.detail}</p>
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

        {/* ── Marquee ── */}
        <MarqueeStrip />

        {/* ── Benefits ── */}
        <MotionSection {...reveal(0)} className="space-y-4">
          <div className="mb-14 text-center">
            <p className="text-sm font-medium text-emerald-400">Why planters choose FarmFlow</p>
            <h2 className="mt-3 font-display text-4xl font-semibold text-stone-50 sm:text-5xl">
              {"The numbers you need, before you think to ask"}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-stone-400">
              Most estates run on registers and spreadsheets assembled at the end of the season. FarmFlow keeps everything connected — and tells you what it means every week.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {benefits.map((card, i) => {
              const Icon = card.icon
              return (
                <MotionDiv key={card.title} {...reveal(i * 0.07)} {...lift}>
                  <div className="grain-dark shimmer-hover flex h-full flex-col gap-5 rounded-3xl border border-white/[0.09] bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-transparent p-8 transition-all duration-300 hover:border-white/[0.15] hover:shadow-[0_12px_48px_-12px_rgba(52,211,153,0.12)]">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-emerald-300/[0.14] to-emerald-400/[0.06]">
                      <Icon className="h-5 w-5 text-emerald-200" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-stone-50">{card.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-stone-400">{card.description}</p>
                    </div>
                  </div>
                </MotionDiv>
              )
            })}
          </div>
        </MotionSection>

        {/* ── Why coffee-only ──
            This section used to promise six more crops. It was replaced deliberately: breadth was
            the wrong pitch. A planter choosing estate software is not asking whether it will one day
            handle cocoa -- they are asking whether it knows what outturn means. Depth in one crop is
            the argument, so the section now proves the coffee-specific vocabulary instead of listing
            crops we do not serve. Pepper and arecanut stay, framed as what they actually are on a
            Coorg estate: intercrops on the same land, not a separate market. */}
        <MotionSection {...reveal(0.04)}>
          <div>
            <div className="mb-14 text-center">
              <p className="text-sm font-medium text-emerald-400">Coffee, and nothing else</p>
              <h2 className="mx-auto mt-3 max-w-3xl text-balance font-display text-4xl font-semibold text-stone-50 sm:text-5xl">
                Generic farm software makes you translate
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-stone-400">
                Every field, every report, every number is built around how a coffee estate actually runs —
                not a crop-agnostic template with your own words pasted over it.
              </p>
            </div>

            <div className="mt-0 grid gap-px overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  term: "Arabica and Robusta, apart",
                  detail: "Different blocks, different pulping, different prices. Kept separate the whole way through, because averaging them tells you nothing.",
                },
                {
                  term: "Outturn",
                  detail: "Cherry in, wet parchment out, dry weight off the yard. The ratio you are actually judged on, calculated the day you log it.",
                },
                {
                  term: "The muster",
                  detail: "The daily roll, marked the way your writer already marks it. Contract gangs go on as a crew with a headcount, not twenty invented names.",
                },
                {
                  term: "Dispatch to the curing works",
                  detail: "What left the estate, and what the curer's weighbridge said when it arrived. The gap between the two is your first real number.",
                },
                {
                  term: "Cost per kilo, per block",
                  detail: "Shade lopping, spray rounds, manuring, picking — each against the block it was spent on. Blocks are not all the same and the costing should not pretend they are.",
                },
                {
                  term: "Pepper and arecanut",
                  detail: "Up the shade trees and in the wet patches. Tracked and sold alongside the coffee, because on a Coorg estate they are the same piece of land.",
                },
              ].map((item) => (
                <div key={item.term} className="bg-[#0a1210] px-5 py-6">
                  <p className="text-sm font-semibold text-emerald-300">{item.term}</p>
                  <p className="mt-2 text-[13px] leading-6 text-stone-400">{item.detail}</p>
                </div>
              ))}
            </div>

            <p className="mt-8 text-center text-xs leading-6 text-stone-500">
              Built in Karnataka, on working estates in Coorg and Chikmagalur.
            </p>
          </div>
        </MotionSection>

        {/* ── Advisor section ── */}
        <MotionSection {...reveal(0.04)}>
          <div className="mb-14 text-center">
            <p className="text-sm font-medium text-emerald-400">Proactive intelligence</p>
            <h2 className="mt-3 font-display text-4xl font-semibold text-stone-50 sm:text-5xl">
              An advisor, not just a ledger
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-stone-400">
              Most farm software records what happened. FarmFlow tells you what it means — and what to do. It watches your numbers so you don&apos;t have to.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {advisorCards.map((card, i) => {
              const Icon = card.icon
              return (
                <MotionDiv key={card.eyebrow} {...reveal(0.05 + i * 0.07)} {...lift}>
                  <div className={`grain-dark shimmer-hover flex h-full flex-col gap-5 rounded-3xl border p-8 transition-all duration-300 hover:brightness-110 ${card.accent}`}>
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border shadow-[0_0_16px_-3px_currentColor/25] ${card.iconAccent}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500">
                        {card.eyebrow}
                      </p>
                      <h3 className="mt-2 text-xl font-bold text-stone-50">{card.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-stone-400">{card.detail}</p>
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
              Up and running before the next pulping batch
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-stone-400">
              No consultants, no data migration, no waiting. Your team can start logging cherry intake the same day you sign up.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {howItWorks.map((item, i) => (
              <MotionDiv key={item.step} {...reveal(0.06 + i * 0.07)}>
                <div className="grain-dark shimmer-hover relative flex h-full flex-col gap-4 rounded-3xl border border-white/[0.09] bg-gradient-to-b from-white/[0.05] to-transparent p-8 transition-all duration-300 hover:border-white/[0.14] hover:from-white/[0.08]">
                  <span className="font-display text-6xl font-black leading-none text-gradient-light opacity-60 select-none">
                    {item.step}
                  </span>
                  <div>
                    <h3 className="text-lg font-bold text-stone-50">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-stone-400">{item.detail}</p>
                  </div>
                  {i < howItWorks.length - 1 && (
                    <ArrowRight className="absolute -right-2 top-10 hidden h-4 w-4 text-white/20 lg:block" />
                  )}
                </div>
              </MotionDiv>
            ))}
          </div>
        </MotionSection>

        {/* ── What you get ── */}
        <MotionSection {...reveal(0.04)}>
          <div className="mb-14 text-center">
            <p className="text-sm font-medium text-emerald-400">What planters actually get</p>
            <h2 className="mt-3 font-display text-4xl font-semibold text-stone-50 sm:text-5xl">
              From first cherry to final sale — in one place
            </h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {outcomeCards.map((item, i) => {
              const Icon = item.icon
              return (
                <MotionDiv key={item.eyebrow} {...reveal(i * 0.07)} {...lift}>
                  <div className="grain-dark shimmer-hover flex h-full flex-col gap-4 rounded-3xl border border-white/[0.09] bg-gradient-to-br from-white/[0.06] via-white/[0.03] to-transparent p-8 transition-all duration-300 hover:border-emerald-400/20 hover:shadow-[0_12px_40px_-12px_rgba(52,211,153,0.14)]">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/20 bg-gradient-to-br from-emerald-300/[0.14] to-emerald-400/[0.06] shadow-[0_0_16px_-3px_rgba(52,211,153,0.3)]">
                      <Icon className="h-4 w-4 text-emerald-200" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-500">
                        {item.eyebrow}
                      </p>
                      <h3 className="mt-2 text-xl font-bold text-stone-50">{item.title}</h3>
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
                className="rounded-full border border-white/[0.10] bg-gradient-to-br from-white/[0.06] to-white/[0.02] px-4 py-1.5 text-xs font-medium text-stone-400 transition-all duration-200 hover:border-white/[0.18] hover:text-stone-200"
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
              onClick={() => capture("cta_clicked", { cta_location: "homepage_plans_section", cta_text: "view_full_comparison" })}
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
                <MotionDiv key={bundle.id} {...reveal(i * 0.07)} {...lift} className="reveal-scroll">
                  <div
                    className={`grain-dark relative flex h-full flex-col rounded-3xl border p-8 transition-all duration-300 ${
                      isCore
                        ? "border-emerald-400/35 bg-gradient-to-br from-[#0d2018] to-[#091510] shadow-[inset_0_1px_0_rgba(52,211,153,0.08)]"
                        : "border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-transparent hover:border-white/[0.13]"
                    }`}
                  >
                    {isCore && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                        <span className="rounded-full border border-emerald-400/35 bg-emerald-400/[0.12] px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-300 backdrop-blur-sm">
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
                    {planPrices[bundle.id] && (
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-2xl font-black tabular-nums text-stone-50">{planPrices[bundle.id].price}</span>
                        {planPrices[bundle.id].note && <span className="text-sm text-stone-500">{planPrices[bundle.id].note}</span>}
                      </div>
                    )}
                    <p className="mt-2 text-sm leading-7 text-stone-400">{bundle.description}</p>
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
                    <div className="mt-auto space-y-2 pt-8">
                      <Button
                        asChild
                        size="sm"
                        className={
                          isCore
                            ? "w-full bg-emerald-300 text-[#06110f] hover:bg-emerald-200"
                            : "w-full border-white/10 bg-white/[0.04] text-stone-200 hover:bg-white/[0.08]"
                        }
                        variant={isCore ? "default" : "ghost"}
                        onClick={() => capture("cta_clicked", { cta_location: "homepage_plan_card", plan_id: bundle.id, cta_text: "try_free" })}
                      >
                        <Link href="/signup">Try free for 30 days</Link>
                      </Button>
                      <p className="text-center text-[11px] text-stone-600">No credit card required</p>
                    </div>
                  </div>
                </MotionDiv>
              )
            })}
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
              <p className="text-sm font-medium text-emerald-400">No credit card. No sales call. No waiting.</p>
              <h2 className="mx-auto max-w-3xl font-display text-4xl font-semibold text-stone-50 sm:text-5xl">
                Your estate live today. Your first digest next Monday.
              </h2>
              <p className="mx-auto max-w-xl text-base leading-7 text-stone-400">
                Sign up, complete a 5-minute setup, and start logging. You can be recording live entries within the hour — and get your first AI-written weekly brief the following Monday morning.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Button
                  size="lg"
                  className="bg-emerald-300 text-[#06110f] shadow-[0_0_40px_-8px_rgba(110,231,183,0.4)] hover:bg-emerald-200"
                  asChild
                  onClick={() => capture("cta_clicked", { cta_location: "homepage_final_cta", cta_text: "signup" })}
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
                  onClick={() => capture("cta_clicked", { cta_location: "homepage_final_cta", cta_text: "see_plans" })}
                >
                  <Link href="/plans">See plans</Link>
                </Button>
              </div>
              <p className="text-sm text-stone-600">30-day free trial · No credit card required</p>
            </div>
          </div>
        </MotionSection>

      </div>
    </PublicSiteShell>
  )
}
