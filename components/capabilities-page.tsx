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
    description: "Quality, dispatch, and sales records stay closer together so reviews are faster and cleaner.",
    image: "/images/estate-journey-dispatch.jpg",
    alt: "Coffee prepared for dispatch",
  },
]

export default function CapabilitiesPage() {
  return (
    <PublicSiteShell>
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <section className="rounded-[2rem] border border-emerald-200/60 bg-white/92 p-6 shadow-[0_34px_85px_-52px_rgba(15,111,102,0.55)] sm:p-10">
          <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200">Capabilities</Badge>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold text-slate-900 sm:text-5xl">What FarmFlow actually helps an estate do each day</h1>
          <p className="mt-4 max-w-3xl text-sm text-slate-600 sm:text-base">
            The product is strongest when it keeps operations, finance, and accountability in one place. These are the capabilities that matter most in the real workflow.
          </p>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          {capabilitySections.map((section) => {
            const Icon = section.icon
            return (
              <Card key={section.title} className="border-white/70 bg-white/90">
                <CardHeader>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle>{section.title}</CardTitle>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {section.bullets.map((bullet) => (
                    <div key={bullet} className="flex items-start gap-2 text-sm text-slate-700">
                      <BarChart3 className="mt-0.5 h-4 w-4 text-emerald-600" />
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
            <Card key={item.title} className="overflow-hidden border-white/70 bg-white/90">
              <div className="relative h-56 w-full border-b border-slate-200/70 bg-slate-100">
                <Image src={item.image} alt={item.alt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
              </div>
              <CardHeader>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>

        <section className="rounded-[2rem] border border-slate-200/70 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 text-white shadow-[0_32px_80px_-52px_rgba(15,23,42,0.85)] sm:p-8">
          <p className="text-sm font-medium text-emerald-300">The practical rollout path</p>
          <h2 className="mt-2 text-2xl font-semibold">Start where the estate is weakest, not where the software is fanciest</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-medium">1. Fix stock truth</p>
              <p className="mt-2 text-sm text-white/75">Inventory, transactions, and accounts first if spreadsheets are drifting.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-medium">2. Tighten the coffee chain</p>
              <p className="mt-2 text-sm text-white/75">Add processing, dispatch, and sales once the estate is ready for daily operational control.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="font-medium">3. Add specialist modules</p>
              <p className="mt-2 text-sm text-white/75">Bring in climate, quality, documents, and AI when the team can actually use the signal.</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="secondary" asChild>
              <Link href="/plans">Compare plans</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Create your workspace</Link>
            </Button>
          </div>
        </section>
      </div>
    </PublicSiteShell>
  )
}
