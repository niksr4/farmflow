"use client"

import { useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, CheckCircle2 } from "lucide-react"
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"


const JOURNEY_STEPS = [
  {
    title: "Harvest intake",
    description: "Capture cherry intake and sorting splits (ripe, green, float).",
    image: "/images/estate-journey-harvest.jpg",
    alt: "Coffee harvest scene at an estate",
  },
  {
    title: "Washed or natural processing",
    description: "Track wet parchment or dry cherry output with moisture observations.",
    image: "/images/estate-journey-processing.jpg",
    alt: "Coffee processing scene with beans and equipment",
  },
  {
    title: "Curing + quality",
    description: "Record drying time, grade outcomes, defects, and quality evidence.",
    image: "/images/estate-journey-curing.jpg",
    alt: "Coffee beans drying during curing",
  },
  {
    title: "Dispatch + sales",
    description: "Dispatch confidently, reconcile receipts, and close the revenue loop.",
    image: "/images/estate-journey-dispatch.jpg",
    alt: "Coffee delivery transport ready for dispatch",
  },
]

const MODULE_PATHWAYS = [
  {
    title: "Estate Owner Command",
    description: "Best for estates running end-to-end operations with complete lot and cash visibility.",
    modules: ["Inventory", "Processing", "Dispatch", "Sales", "Season View", "Accounts", "Activity Log"],
  },
  {
    title: "Estate + Curing Works",
    description: "Ideal for owners running drying and quality checkpoints with stronger buyer evidence.",
    modules: ["Processing", "Curing", "Quality", "Rainfall", "Weather", "Dispatch", "Sales"],
  },
  {
    title: "Inventory + Accounts Essentials",
    description: "Best for estates starting with stock control and finance discipline.",
    modules: ["Inventory", "Accounts", "Transaction History"],
  },
]

const BUYER_TRUST_PACK = [
  {
    title: "Lot ID + processing timeline",
    detail: "From intake through processing, curing, and dispatch.",
  },
  {
    title: "Moisture, grade, and defect notes",
    detail: "Quality evidence linked directly to each lot.",
  },
  {
    title: "Dispatch + sales reconciliation",
    detail: "Every bag has a clear operational and financial trail.",
  },
]

export default function JourneyPage() {
  const journeyRef = useRef<HTMLDivElement | null>(null)
  const MotionDiv = motion.div as any
  const prefersReducedMotion = useReducedMotion()

  const { scrollYProgress: journeyProgress } = useScroll({
    target: journeyRef as any,
    offset: ["start 0.2", "end 0.8"],
  })
  const timelineScale = useTransform(journeyProgress, [0, 1], [0, 1])
  const timelineGlow = useTransform(journeyProgress, [0, 0.4, 1], [0.1, 0.7, 1])

  return (
    <div
      className="relative min-h-[100svh] overflow-x-hidden bg-[#07110f] text-stone-100"
      style={{
        ["--copper" as any]: "#0f6f66",
        ["--sage" as any]: "#1f6b5d",
        ["--sand" as any]: "#10211d",
        ["--ink" as any]: "#f5f5f4",
      }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_26%),radial-gradient(circle_at_82%_12%,rgba(245,158,11,0.1),transparent_18%),linear-gradient(180deg,#07110f_0%,#091916_42%,#081310_100%)]" />
        <div className="absolute -top-28 right-[-6%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.2),transparent_70%)] blur-[120px]" />
        <div className="absolute top-[18%] left-[-8%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.12),transparent_70%)] blur-[140px]" />
      </div>

      <div className="relative z-10">
        <header className="px-4 pt-4 sm:px-6 sm:pt-6">
          <nav className="mx-auto flex w-full max-w-6xl flex-col gap-3 rounded-2xl border border-white/10 bg-[#081613]/70 px-3 py-3 backdrop-blur-md shadow-[0_24px_50px_-32px_rgba(0,0,0,0.75)] sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div className="flex items-center gap-3">
              <Image src="/brand-logo.svg" alt="FarmFlow" width={210} height={82} className="h-11 w-auto" priority />
              <p className="hidden text-xs text-stone-300 sm:block">Estate Workflow Journey</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" className="border-white/10 text-stone-200 hover:bg-white/10 hover:text-white" asChild>
                <Link href="/">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Link>
              </Button>
              <Button variant="ghost" className="border-white/10 text-stone-200 hover:bg-white/10 hover:text-white" asChild>
                <Link href="/login">Login</Link>
              </Button>
              <Button className="border-emerald-300/40 bg-emerald-300 text-[#06110f] shadow-[0_18px_36px_-18px_rgba(110,231,183,0.6)] hover:bg-emerald-200" asChild>
                <Link href="/signup">Start free trial</Link>
              </Button>
            </div>
          </nav>
        </header>

        <main className="px-4 pb-16 sm:px-6 sm:pb-20">
          <section className="mx-auto mt-8 w-full max-w-6xl rounded-3xl border border-white/10 bg-gradient-to-br from-[#11433b] via-[#0d2a24] to-[#081613] p-5 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.72)] sm:mt-16 sm:p-12">
            <Badge className="border-white/30 bg-white/20 text-white backdrop-blur-md">From cherry to buyer</Badge>
            <h1 className={`font-display mt-4 text-3xl font-bold leading-tight text-white md:text-5xl`}>
              The coffee workflow, mapped end to end
            </h1>
            <p className="mt-4 max-w-3xl text-stone-200">
              Use this journey to align teams, train operators, and show buyers how your estate runs with discipline.
            </p>
          </section>

          <section className="mx-auto mt-16 w-full max-w-6xl space-y-6">
            <div className="text-center space-y-3">
              <h2 className={`font-display text-3xl font-semibold text-stone-50`}>Estate journey, from cherry to buyer</h2>
              <p className="mx-auto max-w-2xl text-stone-300">
                Document each stage so quality and accountability stay visible to managers, farmers, and buyers.
              </p>
            </div>

            <div ref={journeyRef} className="relative mt-10 space-y-12">
              <div className="pointer-events-none absolute left-4 top-0 h-full w-[2px] bg-white/10 md:left-1/2 md:-translate-x-1/2" />
              <MotionDiv
                className="pointer-events-none absolute left-4 top-0 h-full w-[3px] origin-top bg-gradient-to-b from-emerald-500 via-emerald-400 to-transparent md:left-1/2 md:-translate-x-1/2"
                style={{
                  scaleY: prefersReducedMotion ? 1 : timelineScale,
                  opacity: prefersReducedMotion ? 1 : timelineGlow,
                }}
              />
              <div className="space-y-10 md:space-y-14">
                {JOURNEY_STEPS.map((step, index) => {
                  const isLeft = index % 2 === 0
                  return (
                    <MotionDiv
                      key={step.title}
                      initial={
                        prefersReducedMotion
                          ? { opacity: 1, y: 0, x: 0 }
                          : { opacity: 0, y: 32, x: isLeft ? -24 : 24 }
                      }
                      whileInView={{ opacity: 1, y: 0, x: 0 }}
                      viewport={{ once: true, amount: 0.35 }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className={`relative flex ${isLeft ? "md:justify-start" : "md:justify-end"}`}
                    >
                      <div
                        className={`relative w-full md:w-[calc(50%-3rem)] ${isLeft ? "md:pr-10" : "md:pl-10"} pl-10 md:pl-0`}
                      >
                        <span
                          className={`absolute top-7 left-[10px] h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.55)] md:left-auto ${
                            isLeft ? "md:right-[-3rem]" : "md:left-[-3rem]"
                          }`}
                        />
                        <Card className="border border-white/10 bg-[#0a1714]/90 backdrop-blur-md shadow-[0_20px_45px_-35px_rgba(0,0,0,0.75)]">
                          <div className="relative h-36 w-full overflow-hidden rounded-t-xl border-b border-white/10 bg-[#091613]">
                            <Image
                              src={step.image}
                              alt={step.alt}
                              fill
                              sizes="(min-width: 768px) 480px, 100vw"
                              className="object-cover"
                              priority={index === 0}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#091613] via-[#091613]/15 to-transparent" />
                          </div>
                          <CardHeader className="space-y-2">
                            <p className="text-xs uppercase tracking-[0.35em] text-emerald-200">Step {index + 1}</p>
                            <CardTitle className={`font-display text-xl text-stone-50`}>{step.title}</CardTitle>
                            <CardDescription className="text-stone-300">{step.description}</CardDescription>
                          </CardHeader>
                        </Card>
                      </div>
                    </MotionDiv>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="mx-auto mt-16 w-full max-w-6xl grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className="border border-emerald-300/15 bg-emerald-300/10">
              <CardHeader>
                <CardTitle className={`font-display text-xl text-stone-50`}>Buyer trust pack</CardTitle>
                <CardDescription className="text-stone-300">Export-ready evidence for audits, buyers, and internal reviews.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-stone-200">
                {BUYER_TRUST_PACK.map((item) => (
                  <div key={item.title} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-xs text-stone-300">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-[#0a1714]/90 backdrop-blur-md">
              <CardHeader>
                <CardTitle className={`font-display text-xl text-stone-50`}>Who should run which modules?</CardTitle>
                <CardDescription className="text-stone-300">Select the stack that matches your estate operating model.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {MODULE_PATHWAYS.map((pathway) => (
                  <div key={pathway.title} className="rounded-xl border border-white/10 bg-[#111d1a] p-3">
                    <p className="font-semibold text-stone-100">{pathway.title}</p>
                    <p className="mt-1 text-xs text-stone-300">{pathway.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {pathway.modules.map((moduleName) => (
                        <Badge key={moduleName} className="border-white/10 bg-[#15231f] text-stone-200">
                          {moduleName}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="mx-auto mt-16 w-full max-w-6xl">
            <Card className="border border-white/10 bg-[#0a1714]/92 backdrop-blur-md">
              <CardHeader>
                <CardTitle className={`font-display text-2xl text-stone-50`}>Choose your starting path</CardTitle>
                <CardDescription className="text-stone-300">
                  Start with essentials and expand into curing, quality, and full sales traceability as your team grows.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button className="border-emerald-300/40 bg-emerald-300 text-[#06110f] shadow-[0_18px_36px_-18px_rgba(110,231,183,0.6)] hover:bg-emerald-200" asChild>
                  <Link href="/signup">Start free trial</Link>
                </Button>
                <Button variant="ghost" className="border-white/10 bg-white/[0.04] text-stone-100 hover:bg-white/[0.08] hover:text-white" asChild>
                  <Link href="/">Back to Landing</Link>
                </Button>
              </CardContent>
            </Card>
          </section>
        </main>
      </div>
    </div>
  )
}
