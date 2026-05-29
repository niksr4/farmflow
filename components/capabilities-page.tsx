"use client"

import Link from "next/link"
import { BarChart3, CloudRain, PackageCheck, Shield, Wallet } from "lucide-react"
import { PublicSiteShell } from "@/components/public-site-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const capabilitySections = [
  {
    title: "Labour, expenses, and your real cost per kg",
    description: "Log every day's work — pruning crews, fertiliser runs, irrigation — and know exactly what it cost to produce each kilogram before you sell it.",
    icon: Wallet,
    bullets: [
      "Labour entries by activity code, in-house and contract workers",
      "Expenses linked to inventory — fertiliser depletes stock when you log it",
      "Season-to-date cost per kg calculated automatically",
      "Weekly alert if a buyer is quoting below your production cost",
    ],
  },
  {
    title: "Harvest to parchment — the full pulping chain",
    description: "Track every pulping batch from cherry intake to dry output. Conversion ratios, lot traceability, and drying yard stock — without a spreadsheet.",
    icon: PackageCheck,
    bullets: [
      "Daily cherry intake and pulping records by lot",
      "Dry parchment and dry cherry output tracked separately",
      "27% yield benchmark — flag batches that fall short",
      "Processing days, locations, and stock always visible",
    ],
  },
  {
    title: "Dispatch, receipts, and sales — reconciled",
    description: "Nothing counts as sold until the buyer confirms weight. The app catches it if you sell more than you dispatched.",
    icon: Shield,
    bullets: [
      "Dispatch entries with bag count and curing destination",
      "Buyer-confirmed kg before stock is released for sale",
      "Automatic flag if sales kg exceed dispatch kg received",
      "Revenue per kg visible against production cost per kg",
    ],
  },
  {
    title: "Rainfall, weather, and AI-powered weekly digest",
    description: "Every Monday, your estate gets a digest covering last week's operations, field signals, market timing, and three specific actions for the coming week.",
    icon: CloudRain,
    bullets: [
      "Daily rainfall logs and 3-day forecast with irrigation signal",
      "AI digest: labour %, cost per kg, revenue trend — every Monday",
      "Market timing against ICO benchmark and your unsold stock",
      "Year-on-year comparison as data accumulates across seasons",
    ],
  },
]

const starters = [
  {
    step: "Off-season (April – September)",
    title: "Starter plan — digital field book",
    description: "Log daily labour and fertiliser runs. Track inventory. Rainfall. Balance sheet. By October you'll have a clean cost baseline for the season ahead.",
    price: "₹1,299/month",
  },
  {
    step: "Harvest season (October – March)",
    title: "Operations plan — full estate OS",
    description: "Adds processing, dispatch, sales, season P&L, and the AI digest. Every step from cherry intake to bank payment in one place.",
    price: "₹3,499/month",
  },
  {
    step: "Any time",
    title: "Upgrade without migration",
    description: "All your data stays. Switch from Starter to Operations in the admin console — no re-entry, no lost history.",
    price: "No lock-in",
  },
]

export default function CapabilitiesPage() {
  return (
    <PublicSiteShell theme="dark">
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(17,67,59,0.9),rgba(11,28,24,0.96)_48%,rgba(8,18,15,0.98))] p-6 shadow-[0_34px_85px_-52px_rgba(0,0,0,0.65)] sm:p-10">
          <Badge className="border-white/10 bg-white/[0.06] text-emerald-100">Capabilities</Badge>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold text-stone-50 sm:text-5xl">Everything an estate needs — in season and out</h1>
          <p className="mt-4 max-w-3xl text-sm text-stone-300 sm:text-base">
            Labour, inventory, processing, dispatch, sales, rainfall, and AI — all connected. Know your cost per kg before your buyer calls.
          </p>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          {capabilitySections.map((section) => {
            const Icon = section.icon
            return (
              <Card key={section.title} className="border-white/10 bg-[#0a1714]/90">
                <CardHeader>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-300/10 text-emerald-200">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-stone-50">{section.title}</CardTitle>
                  <CardDescription className="text-stone-300">{section.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {section.bullets.map((bullet) => (
                    <div key={bullet} className="flex items-start gap-2 text-sm text-stone-300">
                      <BarChart3 className="mt-0.5 h-4 w-4 text-emerald-300" />
                      <span>{bullet}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </section>

        {/* How estates start */}
        <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#101b18] via-[#0d1715] to-[#081613] p-6 text-white shadow-[0_32px_80px_-52px_rgba(0,0,0,0.85)] sm:p-8">
          <p className="text-sm font-medium text-emerald-300">How estates get started</p>
          <h2 className="mt-2 text-2xl font-semibold">Start lean in the off-season. Go full in harvest.</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {starters.map((s) => (
              <div key={s.step} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400">{s.step}</p>
                <p className="mt-2 font-semibold text-stone-100">{s.title}</p>
                <p className="mt-1.5 text-sm text-stone-300">{s.description}</p>
                <p className="mt-3 text-xs font-bold text-emerald-400">{s.price}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="ghost" className="border-white/10 bg-white/[0.04] text-stone-100 hover:bg-white/[0.08] hover:text-white" asChild>
              <Link href="/plans">See plans</Link>
            </Button>
            <Button className="border-emerald-300/40 bg-emerald-300 text-[#06110f] shadow-[0_18px_36px_-18px_rgba(110,231,183,0.6)] hover:bg-emerald-200" asChild>
              <Link href="/signup">Try free for 30 days</Link>
            </Button>
          </div>
        </section>
      </div>
    </PublicSiteShell>
  )
}
