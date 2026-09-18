"use client"

/**
 * The public landing page.
 *
 * Two things shape it. First, this is coffee software sold to Coorg and Chikmagalur planters,
 * so the page leads with photographs of the actual work and with the estate's own season
 * figures, rather than with the gradient-and-glass abstraction every SaaS homepage wears.
 * Second, the copy lives in `components/landing/content.ts` and contains no em dashes by
 * house rule. Keep new copy there and keep it plain.
 */

import { useEffect, useRef } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import posthog from "posthog-js"
import { ArrowRight, Check, CloudOff, Lock, Mail, Quote } from "lucide-react"
import { PublicSiteShell } from "@/components/public-site-shell"
import { useLocale } from "@/components/locale-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MODULE_BUNDLES, MODULES } from "@/lib/modules"
import {
  CountUpNumber,
  FaqItem,
  PhotoFrame,
  SectionHeading,
  StickyMobileCta,
  useReveal,
} from "@/components/landing/primitives"
import {
  advisorCards,
  closingProof,
  coreSurfacePills,
  estateVocabulary,
  faqs,
  heroAssurances,
  heroSampleEntry,
  planBadges,
  planPrices,
  sampleDigest,
  seasonChain,
  seasonChainCaption,
  setupSteps,
  workingDay,
} from "@/components/landing/content"

const moduleLabelById = new Map(MODULES.map((m) => [m.id, m.label]))

const digestToneClass = {
  warn: "text-amber-300",
  good: "text-emerald-300",
  ok: "text-stone-300",
} as const

function capture(event: string, props?: Record<string, unknown>) {
  try {
    posthog.capture(event, props)
  } catch {
    /* posthog not ready */
  }
}

export default function LandingPage() {
  const { t } = useLocale()
  const MotionDiv = motion.div as any
  const MotionSection = motion.section as any
  const reveal = useReveal()
  const heroSentinelRef = useRef<HTMLDivElement | null>(null)
  const closingSentinelRef = useRef<HTMLDivElement | null>(null)
  const scrollMilestonesRef = useRef(new Set<number>())

  useEffect(() => {
    const milestones = [25, 50, 75]
    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight
      if (total <= 0) return
      const pct = Math.round((window.scrollY / total) * 100)
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

  return (
    <PublicSiteShell theme="dark">
      {/* Reading progress. Pure CSS scroll timeline, so it costs no scroll handler, and it
          simply stays at zero width on browsers that do not support one. */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px]">
        <div className="scroll-progress h-full origin-left scale-x-0 bg-gradient-to-r from-emerald-400 via-emerald-300 to-amber-300" />
      </div>

      <div className="mx-auto w-full max-w-6xl">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative pt-6 sm:pt-10">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="orb-a absolute left-[6%] top-[4%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(52,211,153,0.07)_0%,transparent_65%)] blur-[90px]" />
            <div className="orb-b absolute right-[4%] top-[30%] h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,rgba(251,146,60,0.05)_0%,transparent_65%)] blur-[90px]" />
          </div>

          <div className="relative grid items-center gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14">
            <MotionDiv {...reveal(0)}>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/[0.08] px-3.5 py-1.5 text-[13px] font-medium text-emerald-200">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                {t("public.landing.badge")}
              </span>

              <h1 className="mt-6 font-display text-[2.8rem] font-black leading-[1.02] tracking-[-0.035em] text-stone-50 sm:text-6xl lg:text-[4.1rem]">
                {t("public.landing.title")}
              </h1>

              <p className="mt-6 max-w-xl text-[17px] leading-8 text-stone-400">
                {t("public.landing.description")}
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Button
                  size="lg"
                  className="bg-emerald-300 font-bold text-[#06110f] shadow-[0_18px_40px_-16px_rgba(110,231,183,0.55)] hover:bg-emerald-200"
                  asChild
                  onClick={() => capture("cta_clicked", { cta_location: "homepage_hero", cta_text: "signup" })}
                >
                  <Link href="/signup">
                    {t("public.landing.ctaPrimary")}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  className="border border-white/10 text-stone-300 hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
                  asChild
                  onClick={() => capture("cta_clicked", { cta_location: "homepage_hero", cta_text: "see_plans" })}
                >
                  <Link href="#plans">See what it costs</Link>
                </Button>
              </div>

              <ul className="mt-9 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {heroAssurances.map((item) => {
                  const Icon = item.icon
                  return (
                    <li key={item.label} className="flex items-center gap-2.5 text-[13px] text-stone-500">
                      <Icon className="h-4 w-4 shrink-0 text-emerald-500" />
                      {item.label}
                    </li>
                  )
                })}
              </ul>
            </MotionDiv>

            {/* The photograph, with a field entry sitting on it. The product and the work it
                describes belong in the same frame, so the visitor never has to imagine one
                from the other. */}
            <MotionDiv {...reveal(0.12)} className="group relative">
              <PhotoFrame
                src={seasonChain[0].image}
                alt={seasonChain[0].alt}
                sizes="(min-width: 1024px) 560px, 100vw"
                priority
                objectPosition="object-[42%_30%]"
                scrim="from-[#07110f] via-[#07110f]/45 to-[#07110f]/10"
                className="h-[380px] rounded-[26px] border border-white/10 shadow-[0_50px_120px_-50px_rgba(0,0,0,0.9)] sm:h-[460px] lg:h-[560px]"
              />

              <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/[0.12] bg-[#081512]/85 p-5 backdrop-blur-xl sm:left-6 sm:right-auto sm:w-[19rem]">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/90">
                    {heroSampleEntry.block} · {heroSampleEntry.variety}
                  </p>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-stone-500">
                    {heroSampleEntry.tag}
                  </span>
                </div>
                <dl className="mt-3.5 space-y-2">
                  {heroSampleEntry.rows.map((row) => (
                    <div key={row.label} className="flex items-baseline justify-between gap-4">
                      <dt className="text-[13px] text-stone-400">{row.label}</dt>
                      <dd className="font-display text-[15px] font-bold tabular-nums text-stone-50">
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3.5 border-t border-white/[0.07] pt-3 text-[11px] leading-5 text-stone-500">
                  {heroSampleEntry.timestamp}. {heroSampleEntry.footnote}
                </p>
              </div>
            </MotionDiv>
          </div>
        </section>

        <div ref={heroSentinelRef} aria-hidden className="h-px" />

        {/* ── One season, end to end ───────────────────────────────────────── */}
        <MotionSection {...reveal(0)} className="mt-24 sm:mt-32">
          <SectionHeading
            eyebrow="One estate, one season"
            title="Follow a kilo of cherry the whole way"
            lede={seasonChainCaption}
          />

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {seasonChain.map((stage, index) => {
              const Icon = stage.icon
              return (
                <MotionDiv key={stage.stage} {...reveal(index * 0.08)} className="group relative">
                  <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0a1411] transition-colors duration-300 hover:border-white/[0.18]">
                    <PhotoFrame
                      src={stage.image}
                      alt={stage.alt}
                      sizes="(min-width: 1024px) 300px, (min-width: 640px) 45vw, 92vw"
                      className="h-36 w-full"
                      scrim="from-[#0a1411] via-[#0a1411]/20 to-transparent"
                    >
                      <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-200 backdrop-blur-sm">
                        <Icon className={`h-3 w-3 ${stage.tint}`} />
                        {stage.stage}
                      </span>
                    </PhotoFrame>

                    <div className="flex flex-1 flex-col p-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                        {stage.metricLabel}
                      </p>
                      <p className="mt-1.5 font-display text-[1.6rem] font-black tabular-nums leading-none text-stone-50">
                        <CountUpNumber
                          target={stage.value}
                          prefix={stage.prefix}
                          suffix={stage.suffix}
                          decimals={stage.decimals ?? 0}
                        />
                      </p>
                      <p className="mt-2.5 text-[12.5px] leading-6 text-stone-500">{stage.note}</p>
                    </div>
                  </article>

                  {index < seasonChain.length - 1 && (
                    <span
                      aria-hidden
                      className="absolute -right-3 top-[4.2rem] z-10 hidden h-6 w-6 place-items-center rounded-full border border-white/10 bg-[#0c1714] lg:grid"
                    >
                      <ArrowRight className="h-3 w-3 text-stone-500" />
                    </span>
                  )}
                </MotionDiv>
              )
            })}
          </div>
        </MotionSection>

        {/* ── The vocabulary ───────────────────────────────────────────────── */}
        <MotionSection {...reveal(0)} className="mt-24 sm:mt-32">
          <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <SectionHeading
                align="left"
                eyebrow="Coffee, and only coffee"
                title="Your own words, already in the software"
                lede="Every field and every column is named the way your estate already names it. Nothing to map, nothing to explain to the writer on his first morning."
              />
              <p className="mt-8 flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 text-[13px] leading-6 text-stone-400">
                <Quote aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/70" />
                Built in Karnataka on working estates in Coorg and Chikmagalur, by people who have
                had to reconcile a weighbridge slip at nine in the evening.
              </p>
            </div>

            <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2">
              {estateVocabulary.map((item) => {
                const Icon = item.icon
                return (
                  <div
                    key={item.term}
                    className="bg-[#0a1210] p-6 transition-colors duration-300 hover:bg-[#0d1815]"
                  >
                    <Icon aria-hidden className="h-4 w-4 text-emerald-400/80" />
                    <p className="mt-3 text-[14px] font-semibold text-stone-100">{item.term}</p>
                    <p className="mt-2 text-[13px] leading-6 text-stone-500">{item.detail}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </MotionSection>

        {/* ── A working day ────────────────────────────────────────────────── */}
        <MotionSection {...reveal(0)} className="mt-24 sm:mt-32">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <SectionHeading
                align="left"
                eyebrow="A working day"
                title="Four minutes of typing, spread across the day"
                lede="Nobody sits down to do data entry. It gets marked as it happens, on a phone, wherever there is a bar of signal to be had."
              />
              <div className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
                <p className="flex items-center gap-2.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-emerald-400/90">
                  <CloudOff aria-hidden className="h-4 w-4" />
                  Dead patches are fine
                </p>
                <p className="mt-2.5 text-[13px] leading-6 text-stone-400">
                  Anything marked without signal sits on the phone and uploads itself the moment a
                  bar comes back. Your writer never has to remember to retry it, and nothing is lost
                  on the walk down to the office.
                </p>
              </div>
            </div>

            <ol className="relative space-y-1">
              <span
                aria-hidden
                className="absolute bottom-8 left-[5.5rem] top-8 w-px bg-gradient-to-b from-emerald-400/50 via-emerald-400/20 to-white/[0.06] sm:left-[6.5rem]"
              />
              {workingDay.map((entry, index) => (
                <MotionDiv key={entry.time} {...reveal(index * 0.05)}>
                  <li className="group relative grid grid-cols-[4.5rem_auto_1fr] items-start gap-x-4 rounded-xl py-4 pr-2 transition-colors sm:grid-cols-[5.5rem_auto_1fr] sm:gap-x-5">
                    <span className="pt-0.5 text-right text-[12px] font-semibold tabular-nums text-stone-500">
                      {entry.time}
                    </span>
                    <span
                      aria-hidden
                      className="relative z-10 mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-[#07110f] bg-emerald-400/70 ring-4 ring-emerald-400/10 transition-all duration-300 group-hover:bg-emerald-300 group-hover:ring-emerald-400/20"
                    />
                    <div>
                      <p className="text-[15px] font-semibold text-stone-100">{entry.title}</p>
                      <p className="mt-1 text-[13px] leading-6 text-stone-500">{entry.detail}</p>
                    </div>
                  </li>
                </MotionDiv>
              ))}
            </ol>
          </div>
        </MotionSection>

        {/* ── The Monday brief ─────────────────────────────────────────────── */}
        <MotionSection {...reveal(0)} className="mt-24 sm:mt-32">
          <SectionHeading
            eyebrow="Monday morning"
            title="The week, read back to you"
            lede="FarmFlow does the reading. What arrives is short: the numbers that moved, the ones that do not look right, and what is worth doing about them."
          />

          <div className="mt-12 grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
            {/* Sample brief, dressed as the email it actually arrives in. */}
            <div className="grain-dark overflow-hidden rounded-2xl border border-white/[0.10] bg-gradient-to-b from-white/[0.05] to-transparent">
              <div className="flex items-center gap-3 border-b border-white/[0.07] bg-white/[0.02] px-5 py-3.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg border border-emerald-300/20 bg-emerald-300/[0.10]">
                  <Mail className="h-3.5 w-3.5 text-emerald-200" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-stone-100">{sampleDigest.subject}</p>
                  <p className="text-[11px] text-stone-500">FarmFlow, every Monday at 6 AM</p>
                </div>
                <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-stone-500">
                  {sampleDigest.tag}
                </span>
              </div>

              {/* Fixed label and value tracks so the figures stack into a readable column.
                  A flex row let each value start wherever its label ended, which is how a
                  table of numbers stops looking like a table of numbers. */}
              <ul className="divide-y divide-white/[0.05]">
                {sampleDigest.lines.map((line) => (
                  <li
                    key={line.label}
                    className="grid items-baseline gap-x-4 gap-y-1 px-5 py-4 sm:grid-cols-[9.5rem_7rem_1fr]"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-600">
                      {line.label}
                    </span>
                    <span className={`font-display text-[17px] font-bold tabular-nums ${digestToneClass[line.tone]}`}>
                      {line.value}
                    </span>
                    <span className="text-[13px] leading-6 text-stone-500">{line.detail}</span>
                  </li>
                ))}
              </ul>

              <p className="border-t border-white/[0.07] px-5 py-4 text-[12px] leading-6 text-stone-500">
                {sampleDigest.signoff}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              {advisorCards.map((card, index) => {
                const Icon = card.icon
                return (
                  <MotionDiv key={card.title} {...reveal(0.06 + index * 0.06)}>
                    <div className={`flex h-full gap-4 rounded-2xl border p-5 transition-colors duration-300 ${card.accent}`}>
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${card.iconAccent}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="text-[15px] font-bold text-stone-50">{card.title}</h3>
                        <p className="mt-1.5 text-[13px] leading-6 text-stone-400">{card.detail}</p>
                      </div>
                    </div>
                  </MotionDiv>
                )
              })}
            </div>
          </div>
        </MotionSection>

        {/* ── Getting started ──────────────────────────────────────────────── */}
        <MotionSection {...reveal(0)} className="mt-24 sm:mt-32">
          <SectionHeading
            eyebrow="Getting started"
            title="Set up in a morning, marking by the afternoon"
            lede="No consultant, no data migration, no waiting on us. Your writer can mark tomorrow's muster."
          />

          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {setupSteps.map((item, index) => (
              <MotionDiv key={item.step} {...reveal(index * 0.07)}>
                <div className="relative flex h-full flex-col gap-4 overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.05] to-transparent p-7 transition-colors duration-300 hover:border-emerald-400/25">
                  <span className="font-display text-[3.4rem] font-black leading-none text-gradient-light opacity-50 select-none">
                    {item.step}
                  </span>
                  <div>
                    <h3 className="text-[17px] font-bold text-stone-50">{item.title}</h3>
                    <p className="mt-2 text-[13.5px] leading-7 text-stone-400">{item.detail}</p>
                  </div>
                </div>
              </MotionDiv>
            ))}
          </div>
        </MotionSection>

        {/* ── Plans ────────────────────────────────────────────────────────── */}
        <MotionSection {...reveal(0)} id="plans" className="mt-24 scroll-mt-24 sm:mt-32">
          <SectionHeading
            eyebrow="What it costs"
            title="Start with what you need this season"
            lede="Take the bundle that fits the estate today and switch more on as it grows. Every plan opens with the same 30 free days."
          />

          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {coreSurfacePills.map((pill) => (
              <span
                key={pill}
                className="rounded-full border border-white/[0.09] bg-white/[0.03] px-3.5 py-1.5 text-[12px] text-stone-400 transition-colors duration-200 hover:border-white/[0.18] hover:text-stone-200"
              >
                {pill}
              </span>
            ))}
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {MODULE_BUNDLES.map((bundle, i) => {
              const isCore = bundle.id === "core"
              const prevBundle = MODULE_BUNDLES[i - 1]
              const prevModuleSet = new Set(prevBundle?.modules || [])
              const displayModules = prevBundle
                ? bundle.modules.filter((id) => !prevModuleSet.has(id))
                : bundle.modules
              const shown = displayModules.slice(0, 7)
              const overflow = displayModules.length - shown.length

              return (
                <MotionDiv key={bundle.id} {...reveal(i * 0.07)}>
                  <div
                    className={`grain-dark relative flex h-full flex-col rounded-2xl border p-7 transition-colors duration-300 ${
                      isCore
                        ? "border-emerald-400/35 bg-gradient-to-b from-[#0d2018] to-[#091510] shadow-[inset_0_1px_0_rgba(52,211,153,0.10)]"
                        : "border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent hover:border-white/[0.14]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-display text-2xl font-semibold text-stone-50">{bundle.label}</p>
                      <Badge
                        className={
                          isCore
                            ? "shrink-0 border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                            : "shrink-0 border-white/10 bg-white/[0.04] text-stone-400"
                        }
                      >
                        {planBadges[bundle.id] || "Plan"}
                      </Badge>
                    </div>

                    {planPrices[bundle.id] && (
                      <div className="mt-3 flex items-baseline gap-1">
                        <span className="font-display text-[1.9rem] font-black tabular-nums text-stone-50">
                          {planPrices[bundle.id].price}
                        </span>
                        {planPrices[bundle.id].note && (
                          <span className="text-[13px] text-stone-500">{planPrices[bundle.id].note}</span>
                        )}
                      </div>
                    )}

                    <p className="mt-3 text-[13.5px] leading-7 text-stone-400">{bundle.description}</p>

                    <div className="mt-6 space-y-2.5">
                      {prevBundle && (
                        <p className="flex items-center gap-1.5 text-[12px] text-stone-500">
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                          Everything in {prevBundle.label}, plus
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {shown.map((moduleId) => (
                          <span
                            key={moduleId}
                            className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11.5px] text-stone-400"
                          >
                            {moduleLabelById.get(moduleId) || moduleId}
                          </span>
                        ))}
                        {overflow > 0 && (
                          <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[11.5px] text-stone-600">
                            +{overflow} more
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-auto space-y-2 pt-8">
                      <Button
                        asChild
                        className={
                          isCore
                            ? "w-full bg-emerald-300 font-semibold text-[#06110f] hover:bg-emerald-200"
                            : "w-full border-white/10 bg-white/[0.04] text-stone-200 hover:bg-white/[0.08]"
                        }
                        variant={isCore ? "default" : "ghost"}
                        onClick={() =>
                          capture("cta_clicked", {
                            cta_location: "homepage_plan_card",
                            plan_id: bundle.id,
                            cta_text: "try_free",
                          })
                        }
                      >
                        <Link href="/signup">Try free for 30 days</Link>
                      </Button>
                      <p className="text-center text-[11px] text-stone-600">No card, no commitment</p>
                    </div>
                  </div>
                </MotionDiv>
              )
            })}
          </div>

          <div className="mt-8 text-center">
            <Button
              variant="ghost"
              size="sm"
              className="text-stone-400 hover:text-stone-200"
              asChild
              onClick={() =>
                capture("cta_clicked", {
                  cta_location: "homepage_plans_section",
                  cta_text: "view_full_comparison",
                })
              }
            >
              <Link href="/plans">
                Compare every module side by side
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </MotionSection>

        {/* ── Questions ────────────────────────────────────────────────────── */}
        <MotionSection {...reveal(0)} className="mt-24 sm:mt-32">
          <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <SectionHeading
                align="left"
                eyebrow="Before you sign up"
                title="The questions planters actually ask"
              />
              <p className="mt-6 flex items-start gap-2.5 text-[13px] leading-6 text-stone-500">
                <Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>
                  Anything not answered here goes to a person, usually the same day.{" "}
                  <Link href="/contact" className="text-emerald-300 underline-offset-4 hover:underline">
                    Write to us.
                  </Link>
                </span>
              </p>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6">
              {faqs.map((item) => (
                <FaqItem key={item.question} question={item.question} answer={item.answer} />
              ))}
            </div>
          </div>
        </MotionSection>

        {/* ── Closing ──────────────────────────────────────────────────────── */}
        <div ref={closingSentinelRef} aria-hidden className="h-px" />
        <MotionSection {...reveal(0)} className="mt-24 pb-16 sm:mt-32 sm:pb-24">
          <div className="group relative overflow-hidden rounded-3xl border border-white/10">
            {/* Wrapped rather than given `absolute` directly: PhotoFrame is itself `relative`,
                and Tailwind emits `relative` after `absolute`, so the override would lose. */}
            <div aria-hidden className="absolute inset-0">
              <PhotoFrame
                src={seasonChain[1].image}
                alt=""
                sizes="(min-width: 1024px) 1150px, 100vw"
                className="h-full w-full"
                scrim="from-[#07110f] via-[#07110f]/88 to-[#07110f]/75"
              />
            </div>
            <div className="relative px-6 py-16 text-center sm:px-14 sm:py-20">
              <h2 className="mx-auto max-w-2xl text-balance font-display text-[2.1rem] font-semibold leading-[1.1] tracking-[-0.02em] text-stone-50 sm:text-[2.75rem]">
                Live today. First brief on Monday.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-[15px] leading-8 text-stone-300/90">
                Spend a morning naming your blocks, your store and your people. Your writer can mark
                tomorrow&apos;s muster, and the first weekly brief lands the Monday after that.
              </p>

              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <Button
                  size="lg"
                  className="bg-emerald-300 font-bold text-[#06110f] shadow-[0_0_44px_-10px_rgba(110,231,183,0.5)] hover:bg-emerald-200"
                  asChild
                  onClick={() => capture("cta_clicked", { cta_location: "homepage_final_cta", cta_text: "signup" })}
                >
                  <Link href="/signup">
                    {t("public.landing.ctaPrimary")}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  className="border border-white/10 text-stone-300 hover:bg-white/[0.07] hover:text-white"
                  asChild
                  onClick={() => capture("cta_clicked", { cta_location: "homepage_final_cta", cta_text: "contact" })}
                >
                  <Link href="/contact">Talk to a person first</Link>
                </Button>
              </div>

              <ul className="mt-9 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
                {closingProof.map((item) => {
                  const Icon = item.icon
                  return (
                    <li key={item.label} className="flex items-center gap-2 text-[13px] text-stone-400">
                      <Icon className="h-3.5 w-3.5 text-emerald-400" />
                      {item.label}
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </MotionSection>
      </div>

      <StickyMobileCta startRef={heroSentinelRef} endRef={closingSentinelRef}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-stone-100">30 days free</p>
            <p className="truncate text-[11px] text-stone-500">No card, set up in a morning</p>
          </div>
          <Button
            className="shrink-0 bg-emerald-300 font-bold text-[#06110f] hover:bg-emerald-200"
            asChild
            onClick={() => capture("cta_clicked", { cta_location: "homepage_sticky_mobile", cta_text: "signup" })}
          >
            <Link href="/signup">
              {t("public.landing.ctaPrimary")}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </StickyMobileCta>
    </PublicSiteShell>
  )
}
