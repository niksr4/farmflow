"use client"

import Link from "next/link"
import { CheckCircle2, Layers3, ShieldCheck, Sparkles } from "lucide-react"
import { PublicSiteShell } from "@/components/public-site-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MODULES, MODULE_BUNDLES } from "@/lib/modules"

const planNotes: Record<string, { eyebrow: string; audience: string; highlight: string }> = {
  basic: {
    eyebrow: "Start lean",
    audience: "Best for estates that want stock and finance discipline first.",
    highlight: "Inventory, transactions, accounts, and a live balance sheet.",
  },
  core: {
    eyebrow: "Recommended",
    audience: "Best for coffee estates running daily processing, dispatch, and sales in one flow.",
    highlight: "The full coffee chain without the extra specialized modules.",
  },
  enterprise: {
    eyebrow: "Scale deep",
    audience: "Best for larger estates or groups that need every module and richer oversight.",
    highlight: "All modules, including quality, documents, AI, climate, and finance extensions.",
  },
}

const sharedIncluded = [
  "Tenant-isolated workspace",
  "Role-based access control",
  "Audit trail and exportability",
]

export default function PlansPage() {
  const moduleLabelById = new Map(MODULES.map((module) => [module.id, module.label]))

  return (
    <PublicSiteShell theme="dark">
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#11433b] via-[#0d2a24] to-[#081613] p-6 text-white shadow-[0_36px_90px_-46px_rgba(0,0,0,0.78)] sm:p-10">
          <Badge className="border-white/30 bg-white/15 text-white">Plans</Badge>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold sm:text-5xl">Choose the plan that matches the estate today</h1>
          <p className="mt-4 max-w-3xl text-sm text-stone-200 sm:text-base">
            FarmFlow offers three clear bundles. Start with stock and finance discipline, move into full coffee operations, or unlock the complete estate stack.
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
                className={`border-white/10 bg-[#0a1714]/90 ${isRecommended ? "ring-2 ring-emerald-400/70 shadow-[0_28px_80px_-54px_rgba(16,185,129,0.45)]" : ""}`}
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <Badge className={isRecommended ? "border-emerald-300/25 bg-emerald-300/14 text-emerald-100" : "border-white/10 bg-white/[0.05] text-stone-200"}>
                      {note?.eyebrow || "Plan"}
                    </Badge>
                    {isRecommended ? <Sparkles className="h-4 w-4 text-emerald-300" /> : null}
                  </div>
                  <CardTitle className="text-2xl text-stone-50">{bundle.label}</CardTitle>
                  <CardDescription className="text-stone-300">{note?.audience || bundle.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
                  <div className="space-y-2 pt-2">
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
              <CardDescription className="text-stone-300">Pick the smallest bundle that still matches how the estate actually runs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-stone-300">
              <p><strong>Basic</strong> is for estates that want inventory truth and cost visibility first.</p>
              <p><strong>Core</strong> is for estates that process, dispatch, and sell coffee inside one operating rhythm.</p>
              <p><strong>Enterprise</strong> is for teams that also need quality, documents, climate, analytics, and broader operational coverage.</p>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#0a1714]/90">
            <CardHeader>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-300/10 text-sky-200">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <CardTitle className="text-stone-50">What stays consistent across plans</CardTitle>
              <CardDescription className="text-stone-300">Every plan keeps the operational baseline intact.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-[#111d1a] p-4">
                <p className="font-medium text-stone-100">Secure tenant separation</p>
                <p className="mt-2 text-sm text-stone-300">Each estate runs in its own workspace with explicit roles and audit history.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#111d1a] p-4">
                <p className="font-medium text-stone-100">CSV exportability</p>
                <p className="mt-2 text-sm text-stone-300">Operational records can still be exported for buyer, finance, or compliance workflows.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#111d1a] p-4">
                <p className="font-medium text-stone-100">Upgrade path without reimplementation</p>
                <p className="mt-2 text-sm text-stone-300">Start with the plan that fits now, then enable more modules as the estate matures.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#111d1a] p-4">
                <p className="font-medium text-stone-100">Guided setup included</p>
                <p className="mt-2 text-sm text-stone-300">New self-serve workspaces collect bag weight, primary location, language, and plan up front.</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-[#0a1714]/92 p-6 shadow-[0_28px_70px_-48px_rgba(0,0,0,0.55)] sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-200">Start your free trial today</p>
              <h2 className="mt-1 text-2xl font-semibold text-stone-50">Start with the plan that matches the estate, then refine it after launch.</h2>
              <p className="mt-1 text-sm text-stone-400">30 days free · No credit card · Cancel any time</p>
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
