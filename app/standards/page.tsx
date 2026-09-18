"use client"

/**
 * Public "what we stand for" page.
 *
 * Two things were wrong with the old version. It was the only public page still rendering in
 * the light theme with its own fonts and gradient, so arriving here from anywhere else felt
 * like leaving the site. And the principles were written as "X over Y" aphorisms
 * ("Traceability over guesswork", "Governance by design") which say nothing a competitor
 * could not also claim. Both fixed: shared shell, and each principle now names a decision
 * that was actually taken and what it cost.
 *
 * House rule: no em dashes in anything a visitor reads.
 */

import Link from "next/link"
import { Compass, Eye, Layers, Target } from "lucide-react"
import { PublicSiteShell } from "@/components/public-site-shell"
import { Button } from "@/components/ui/button"

const PRINCIPLES = [
  {
    title: "A wrong number is worse than no number",
    detail:
      "Software that quietly returns a confident wrong answer is more dangerous than software that refuses. Where a figure cannot be worked out honestly, FarmFlow says so rather than filling the gap with an average.",
  },
  {
    title: "Use the words the estate already uses",
    detail:
      "Outturn, the muster, parchment, the curing works. No planter should have to learn a vocabulary invented by a product team, and nothing here asks them to.",
  },
  {
    title: "The writer's morning matters more than the owner's dashboard",
    detail:
      "Most entries are made by one person on a phone, standing up, often without signal. If that is slow or fragile, nothing downstream is worth building.",
  },
  {
    title: "Depth in coffee before breadth across crops",
    detail:
      "Adding a seventh crop is easier than getting outturn right, and far less useful. Pepper and arecanut are here because they grow on the same land, not because the list looked short.",
  },
]

export default function StandardsPage() {
  return (
    <PublicSiteShell theme="dark">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <section className="pt-4 text-center sm:pt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-400/90">
            What we stand for
          </p>
          <h1 className="mx-auto mt-4 max-w-2xl text-balance font-display text-[2.4rem] font-semibold leading-[1.08] tracking-[-0.025em] text-stone-50 sm:text-5xl">
            Built by people who had to run an estate first
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-8 text-stone-400">
            FarmFlow started because reconciling a weighbridge slip against a picking register at
            nine in the evening is a miserable way to find out how your season went. Everything
            below follows from that.
          </p>
        </section>

        <div className="grid gap-5 pt-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.05] to-transparent p-7 sm:p-8">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200">
              <Target className="h-4 w-4" />
            </span>
            <h2 className="mt-4 font-display text-[1.5rem] font-semibold text-stone-50">What we are for</h2>
            <p className="mt-3 text-[14px] leading-7 text-stone-400">
              Helping a coffee estate know what a kilo cost it before the buyer names a price.
              That one number is the difference between selling well and finding out in May, and
              it cannot be worked out without the muster, the store and the pulping record all
              agreeing with one another.
            </p>
          </section>

          <section className="rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.05] to-transparent p-7 sm:p-8">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-amber-300/20 bg-amber-300/[0.08] text-amber-200">
              <Eye className="h-4 w-4" />
            </span>
            <h2 className="mt-4 font-display text-[1.5rem] font-semibold text-stone-50">Where we are going</h2>
            <p className="mt-3 text-[14px] leading-7 text-stone-400">
              An estate that can answer any question about its own season in a few seconds, in
              its own words, without anyone opening a register. Not a supply chain narrative.
              Just planters who know their numbers as well as their buyers do.
            </p>
          </section>
        </div>

        <section className="rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.05] to-transparent p-7 sm:p-8">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-stone-200">
            <Layers className="h-4 w-4" />
          </span>
          <h2 className="mt-4 font-display text-[1.5rem] font-semibold text-stone-50">
            Four decisions we keep making
          </h2>
          <p className="mt-2 text-[14px] leading-7 text-stone-400">
            These are not slogans. Each one has cost us a feature somebody asked for.
          </p>
          <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2">
            {PRINCIPLES.map((item) => (
              <div key={item.title} className="bg-[#0a1210] p-6">
                <p className="text-[14px] font-semibold text-stone-100">{item.title}</p>
                <p className="mt-2 text-[13px] leading-6 text-stone-500">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-7 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-start gap-3">
            <Compass aria-hidden className="mt-1 h-5 w-5 shrink-0 text-emerald-400" />
            <div>
              <h2 className="font-display text-[1.4rem] font-semibold text-stone-50">
                Disagree with any of it?
              </h2>
              <p className="mt-1.5 text-[14px] text-stone-400">
                Tell us. Most of what is on this list arrived because a planter argued about it.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2.5">
            <Button
              variant="ghost"
              className="border border-white/10 text-stone-200 hover:bg-white/[0.08] hover:text-white"
              asChild
            >
              <Link href="/contact">Write to us</Link>
            </Button>
            <Button
              className="bg-emerald-300 font-semibold text-[#06110f] shadow-[0_18px_36px_-18px_rgba(110,231,183,0.55)] hover:bg-emerald-200"
              asChild
            >
              <Link href="/signup">Try free for 30 days</Link>
            </Button>
          </div>
        </section>
      </div>
    </PublicSiteShell>
  )
}
