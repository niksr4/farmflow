"use client"

import Link from "next/link"
import Image from "next/image"
import { BarChart3, CloudRain, PackageCheck, Shield, Wallet } from "lucide-react"
import { PublicSiteShell } from "@/components/public-site-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const capabilitySections = [
  {
    title: "Inventory and accounts baseline",
    description: "Keep stock, transactions, expenses, labor, and live finance views connected instead of spread across separate sheets.",
    icon: Wallet,
    bullets: ["Inventory ledger and movement history", "Accounts, expense, and labor visibility", "Live balance-sheet style overview"],
  },
  {
    title: "Processing to dispatch chain",
    description: "Run the daily coffee operation from intake through processing, dispatch confirmation, and sellable stock.",
    icon: PackageCheck,
    bullets: ["Processing records by coffee and output type", "Dispatch with received KGs confirmation", "Sales validated against confirmed received stock"],
  },
  {
    title: "Governance and admin control",
    description: "Keep access and changes reviewable as teams grow or multiple estates come online.",
    icon: Shield,
    bullets: ["Tenant and role-based access", "Audit logging", "Module-level enablement by workspace"],
  },
  {
    title: "Climate and insight extensions",
    description: "Add rainfall, weather, AI, and exception detection when the estate is ready for deeper decision support.",
    icon: CloudRain,
    bullets: ["Rainfall and weather context", "Exception alerts and intelligence briefs", "Season and performance support tools"],
  },
]

const visualProof = [
  {
    title: "Daily coffee operations",
    description: "Track how coffee moves from field or intake into processing, then on to dispatch and sale.",
    image: "/images/estate-journey-processing.jpg",
    alt: "Coffee processing at an estate",
  },
  {
    title: "Buyer-facing evidence",
    description: "Quality, dispatch, and sales records stay close together so reviews are faster and easier.",
    image: "/images/estate-journey-dispatch.jpg",
    alt: "Coffee prepared for dispatch",
  },
]

export default function CapabilitiesPage() {
  return (
    <PublicSiteShell theme="dark">
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(17,67,59,0.9),rgba(11,28,24,0.96)_48%,rgba(8,18,15,0.98))] p-6 shadow-[0_34px_85px_-52px_rgba(0,0,0,0.65)] sm:p-10">
          <Badge className="border-white/10 bg-white/[0.06] text-emerald-100">Capabilities</Badge>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold text-stone-50 sm:text-5xl">What FarmFlow actually helps an estate do each day</h1>
          <p className="mt-4 max-w-3xl text-sm text-stone-300 sm:text-base">
            FarmFlow keeps operations, finance, and accountability connected in one place. These are the capabilities that matter most in day-to-day estate work.
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

        <section className="grid gap-6 lg:grid-cols-2">
          {visualProof.map((item) => (
            <Card key={item.title} className="overflow-hidden border-white/10 bg-[#0a1714]/90">
              <div className="relative h-56 w-full border-b border-white/10 bg-[#091613]">
                <Image src={item.image} alt={item.alt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#091613] via-[#091613]/25 to-transparent" />
              </div>
              <CardHeader>
                <CardTitle className="text-stone-50">{item.title}</CardTitle>
                <CardDescription className="text-stone-300">{item.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#101b18] via-[#0d1715] to-[#081613] p-6 text-white shadow-[0_32px_80px_-52px_rgba(0,0,0,0.85)] sm:p-8">
          <p className="text-sm font-medium text-emerald-300">A practical way to start</p>
          <h2 className="mt-2 text-2xl font-semibold">Start with the area that needs the most control first</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="font-medium">1. Fix stock truth</p>
              <p className="mt-2 text-sm text-stone-300">Inventory, transactions, and accounts first if spreadsheets are drifting.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="font-medium">2. Tighten the coffee chain</p>
              <p className="mt-2 text-sm text-stone-300">Add processing, dispatch, and sales once the estate is ready for daily operational control.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="font-medium">3. Add specialist modules</p>
              <p className="mt-2 text-sm text-stone-300">Bring in climate, quality, documents, and AI when the team can actually use the signal.</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="ghost" className="border-white/10 bg-white/[0.04] text-stone-100 hover:bg-white/[0.08] hover:text-white" asChild>
              <Link href="/plans">Compare plans</Link>
            </Button>
            <Button className="border-emerald-300/40 bg-emerald-300 text-[#06110f] shadow-[0_18px_36px_-18px_rgba(110,231,183,0.6)] hover:bg-emerald-200" asChild>
              <Link href="/signup">Create your workspace</Link>
            </Button>
          </div>
        </section>
      </div>
    </PublicSiteShell>
  )
}
