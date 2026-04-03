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
    title: "Cherry intake to parchment — the full pulping chain",
    description: "Log every pulping batch, track parchment output by lot, and know your cherry-to-parchment conversion ratio without a spreadsheet.",
    icon: PackageCheck,
    bullets: ["Daily cherry intake by block or procurement source", "Pulping batch records — ripe, green, and float cherry", "Parchment output and drying yard stock", "Conversion ratio visible at any point in the season"],
  },
  {
    title: "Labor, wages, and cost per kg",
    description: "Plucker attendance, daily rates, and consumable issuance tracked by block — so your cost per kg of parchment is always a real number.",
    icon: Wallet,
    bullets: ["Plucker attendance and productivity by section", "Daily wage and plucking rate records", "Fertiliser and input issuance against the block", "Labor cost rolled into overall cost-per-kg view"],
  },
  {
    title: "Dispatch, receipts, and sales",
    description: "Nothing counts as sold until the buyer confirms the weight. Dispatch, receipt, and sale stay linked so saleable stock is always accurate.",
    icon: Shield,
    bullets: ["Dispatch entries with vehicle and destination", "Buyer-confirmed received KG before stock is released", "Sales validated against confirmed received stock", "Revenue and accounts tied to actual dispatch records"],
  },
  {
    title: "Rainfall, climate, and decision support",
    description: "Rainfall logs, weather context, and AI-powered exception alerts — so you can plan drying windows and catch problems early.",
    icon: CloudRain,
    bullets: ["Daily rainfall and weather records", "Exception alerts for processing or yield anomalies", "AI weekly digest and intelligence briefs", "Season performance and year-on-year comparison"],
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
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold text-stone-50 sm:text-5xl">Everything a coffee estate needs to run, in one place</h1>
          <p className="mt-4 max-w-3xl text-sm text-stone-300 sm:text-base">
            Cherry intake, pulping, parchment out, labor, dispatch, and sales — the parts that matter most in day-to-day estate work, connected so nothing falls through the cracks.
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
          <h2 className="mt-2 text-2xl font-semibold">Start where the biggest gap is</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="font-medium">1. Start with pulping and labor</p>
              <p className="mt-2 text-sm text-stone-300">Cherry intake, pulping records, and plucker wages — the core of every harvest season.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="font-medium">2. Add dispatch and sales</p>
              <p className="mt-2 text-sm text-stone-300">Once your parchment stock is accurate, link it to dispatch confirmations and sales.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="font-medium">3. Bring in climate and AI</p>
              <p className="mt-2 text-sm text-stone-300">Rainfall logs, drying window planning, and weekly AI digests once the team is in a daily rhythm.</p>
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
