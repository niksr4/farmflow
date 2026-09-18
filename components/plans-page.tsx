"use client"

import Link from "next/link"
import { CheckCircle2, Layers3, ShieldCheck, Sparkles } from "lucide-react"
import { PublicSiteShell } from "@/components/public-site-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MODULES, MODULE_BUNDLES } from "@/lib/modules"

/** No em dashes in anything a visitor reads. Plain sentences, estate nouns, real numbers. */
const planNotes: Record<string, { eyebrow: string; audience: string; highlight: string; price: string; priceNote: string }> = {
  basic: {
    eyebrow: "The field book",
    audience: "For the estate that wants its notebook and its Excel sheet in the same place. Daily labour, expenses, the store and the rain gauge, without the harvest workflow.",
    highlight: "Labour, expenses, stock, a balance sheet that stays current, and the rain gauge. The things you write down every single day.",
    price: "₹1,299",
    priceNote: "per month",
  },
  core: {
    eyebrow: "Most estates start here",
    audience: "For the estate that pulps, dries, dispatches and sells its own coffee. Picking season through to the bank payment, in one book.",
    highlight: "Everything in Starter, plus pulping and drying records, dispatch, sales, the season P&L, and the Monday brief.",
    price: "₹3,499",
    priceNote: "per month",
  },
  enterprise: {
    eyebrow: "Everything",
    audience: "For planters running more than one property, or anyone who has to produce quality records, compliance papers and a receivables ledger.",
    highlight: "Everything in Operations, plus quality grading, curing records, documents, compliance and the finance extensions.",
    price: "Custom",
    priceNote: "talk to us",
  },
}

const sharedIncluded = [
  "Your estate's rows isolated in the database itself",
  "You decide which screens each person gets",
  "Full audit trail, and export of anything, any time",
]

export default function PlansPage() {
  const moduleLabelById = new Map(MODULES.map((module) => [module.id, module.label]))

  return (
    <PublicSiteShell theme="dark">
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#11433b] via-[#0d2a24] to-[#081613] p-6 text-white shadow-[0_36px_90px_-46px_rgba(0,0,0,0.78)] sm:p-10">
          <Badge className="border-white/30 bg-white/15 text-white">Plans</Badge>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-semibold sm:text-5xl">Take the plan that fits the estate today</h1>
          <p className="mt-4 max-w-3xl text-sm text-stone-200 sm:text-base">
            Three bundles. Begin with the store and the day book, move up when you start pulping
            and selling your own coffee, and go further only if you are running several properties.
            Nothing is locked, and moving up costs you no re-entry.
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1.5 text-sm font-medium text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            All plans include a 30-day free trial · No credit card required
          </p>
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          {MODULE_BUNDLES.map((bundle) => {
            const note = planNotes[bundle.id]
            const isRecommended = bundle.id === "core"
            return (
              <Card
                key={bundle.id}
                className={`flex h-full flex-col border-white/10 bg-[#0a1714]/90 ${isRecommended ? "ring-2 ring-emerald-400/70 shadow-[0_28px_80px_-54px_rgba(16,185,129,0.45)]" : ""}`}
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <Badge className={isRecommended ? "border-emerald-300/25 bg-emerald-300/14 text-emerald-100" : "border-white/10 bg-white/[0.05] text-stone-200"}>
                      {note?.eyebrow || "Plan"}
                    </Badge>
                    {isRecommended ? <Sparkles className="h-4 w-4 text-emerald-300" /> : null}
                  </div>
                  <CardTitle className="text-2xl text-stone-50">{bundle.label}</CardTitle>
                  {note?.price && (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-black tabular-nums text-stone-50">{note.price}</span>
                      {note.priceNote && <span className="text-sm text-stone-400">{note.priceNote}</span>}
                    </div>
                  )}
                  <CardDescription className="text-stone-300">{note?.audience || bundle.description}</CardDescription>
                </CardHeader>
                {/* flex column + mt-auto on the CTA so the three buttons sit on one line.
                    Enterprise carries twice as many module pills as Starter, which left the
                    buttons stepping down the page like a staircase in a pricing comparison.
                    Spacing is `gap-4`, not `space-y-4`: the latter emits a
                    `> :not([hidden]) ~ :not([hidden]) { margin-top }` rule that outranks
                    `mt-auto` on specificity, so the button silently refuses to move. */}
                <CardContent className="flex flex-1 flex-col gap-4">
                  <p className="rounded-2xl border border-white/10 bg-[#111d1a] px-4 py-3 text-sm text-stone-300">{note?.highlight || bundle.description}</p>
                  <div className="space-y-2">
                    {sharedIncluded.map((item) => (
                      <div key={item} className="flex items-start gap-2 text-sm text-stone-300">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-[#111d1a] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-stone-400">Included modules</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {bundle.modules.map((moduleId) => (
                        <span key={moduleId} className="rounded-full border border-white/10 bg-[#15231f] px-2.5 py-1 text-xs text-stone-200">
                          {moduleLabelById.get(moduleId) || moduleId}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-auto space-y-2 pt-2">
                    <Button
                      className={isRecommended ? "w-full bg-emerald-300 text-[#06110f] hover:bg-emerald-200" : "w-full border-white/10 bg-white/[0.04] text-stone-200 hover:bg-white/[0.08]"}
                      variant={isRecommended ? "default" : "ghost"}
                      asChild
                    >
                      <Link href="/signup">Try free for 30 days</Link>
                    </Button>
                    <p className="text-center text-[11px] text-stone-600">No credit card required</p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="border-white/10 bg-[#0a1714]/90">
            <CardHeader>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-300/10 text-emerald-200">
                <Layers3 className="h-5 w-5" />
              </div>
              <CardTitle className="text-stone-50">How to choose</CardTitle>
              <CardDescription className="text-stone-300">Take the smallest bundle that still matches how the estate actually runs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-stone-300">
              <p><strong>Starter</strong> suits an estate in its maintenance months, or one that wants something steadier than a spreadsheet in place before the picking begins.</p>
              <p><strong>Operations</strong> suits an estate doing its own pulping, sending parchment to the curing works, and selling direct. That is the whole cycle, so this is where most planters land.</p>
              <p><strong>Enterprise</strong> suits large planters and estate groups who have to produce quality records and compliance papers, chase receivables, and see several properties at once.</p>
              <p className="text-stone-400 text-xs mt-2">Everyone opens on Starter and can move up whenever they like. Your rows stay where they are, so there is nothing to migrate.</p>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0a1714]/90">
            <CardHeader>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-300/10 text-sky-200">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <CardTitle className="text-stone-50">The same on every plan</CardTitle>
              <CardDescription className="text-stone-300">None of this is held back for the expensive tier.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-[#111d1a] p-4">
                <p className="font-medium text-stone-100">Your estate stays your estate</p>
                <p className="mt-2 text-sm text-stone-300">Isolation is enforced in the database, not just by careful queries, so another estate cannot read your rows even by mistake.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#111d1a] p-4">
                <p className="font-medium text-stone-100">Take your data out</p>
                <p className="mt-2 text-sm text-stone-300">Any record, as CSV or PDF, at no charge, for your buyer, your accountant or yourself.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#111d1a] p-4">
                <p className="font-medium text-stone-100">Moving up is a setting</p>
                <p className="mt-2 text-sm text-stone-300">Switch on more modules when the estate needs them. No second implementation, no re-entry.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#111d1a] p-4">
                <p className="font-medium text-stone-100">Set up with you</p>
                <p className="mt-2 text-sm text-stone-300">A new estate is asked for its bag weight, its main location, its language and its plan up front, then walked through the first entry.</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-[#0a1714]/92 p-6 shadow-[0_28px_70px_-48px_rgba(0,0,0,0.55)] sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-200">Thirty days, on us</p>
              <h2 className="mt-1 text-2xl font-semibold text-stone-50">Take the plan that fits now. Change your mind later.</h2>
              <p className="mt-1 text-sm text-stone-400">30 days free · No card · Stop whenever you want</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" className="border-white/10 bg-white/[0.04] text-stone-100 hover:bg-white/[0.08] hover:text-white" asChild>
                <Link href="/capabilities">See capabilities</Link>
              </Button>
              <Button className="border-emerald-300/40 bg-emerald-300 text-[#06110f] shadow-[0_18px_36px_-18px_rgba(110,231,183,0.6)] hover:bg-emerald-200" asChild>
                <Link href="/signup">Try free for 30 days</Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </PublicSiteShell>
  )
}
