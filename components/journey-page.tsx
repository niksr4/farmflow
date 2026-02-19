"use client"

import { useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { Fraunces, Manrope } from "next/font/google"
import { ArrowLeft, CheckCircle2, Leaf } from "lucide-react"
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const display = Fraunces({ subsets: ["latin"], weight: ["600", "700", "800"] })
const body = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"] })

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
    description: "Best for simple rollout focused on stock control and finance discipline.",
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
      className={`${body.className} relative min-h-[100svh] overflow-x-hidden text-slate-900`}
      style={{
        ["--copper" as any]: "#0f6f66",
        ["--sage" as any]: "#1f6b5d",
        ["--sand" as any]: "#e8f6f3",
        ["--ink" as any]: "#1b1a17",
      }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 right-[-6%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_center,rgba(15,111,102,0.45),transparent_70%)] blur-[120px]" />
        <div className="absolute top-[18%] left-[-8%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle_at_center,rgba(31,107,93,0.35),transparent_70%)] blur-[140px]" />
      </div>

      <div className="relative z-10">
        <header className="px-6 pt-4 sm:pt-6">
          <nav className="mx-auto flex w-full max-w-6xl flex-col gap-3 rounded-2xl border border-white/60 bg-white/75 px-3 py-3 backdrop-blur-md shadow-[0_24px_50px_-32px_rgba(15,23,42,0.6)] sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-[color:var(--sand)] text-[color:var(--copper)] flex items-center justify-center shadow-[0_0_25px_rgba(15,111,102,0.35)]">
                <Leaf className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">FarmFlow</p>
                <p className="text-xs text-muted-foreground">Estate Workflow Journey</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" asChild>
                <Link href="/">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Landing
                </Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/login">Login</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">Sign Up</Link>
              </Button>
            </div>
          </nav>
        </header>

        <main className="px-6 pb-20">
          <section className="mx-auto mt-10 w-full max-w-6xl rounded-3xl border border-white/40 bg-gradient-to-br from-[#0f6f66] via-[#0b4f49] to-[#083730] p-8 shadow-[0_40px_100px_-40px_rgba(15,111,102,0.7)] sm:mt-16 sm:p-12">
            <Badge className="border-white/30 bg-white/20 text-white backdrop-blur-md">From cherry to buyer</Badge>
            <h1 className={`${display.className} mt-4 text-4xl font-bold leading-tight text-white md:text-5xl`}>
              The coffee workflow, mapped end to end
            </h1>
            <p className="mt-4 max-w-3xl text-white/90">
              Use this journey to align teams, train operators, and show buyers how your estate runs with discipline.
            </p>
          </section>

          <section className="mx-auto mt-16 w-full max-w-6xl space-y-6">
            <div className="text-center space-y-3">
              <h2 className={`${display.className} text-3xl font-semibold`}>Estate journey, from cherry to buyer</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Document each stage so quality and accountability stay visible to managers, farmers, and buyers.
              </p>
            </div>

            <div ref={journeyRef} className="relative mt-10 space-y-12">
              <div className="pointer-events-none absolute left-4 top-0 h-full w-[2px] bg-emerald-100/80 md:left-1/2 md:-translate-x-1/2" />
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
                        <Card className="border border-white/70 bg-white/85 backdrop-blur-md shadow-[0_20px_45px_-35px_rgba(16,185,129,0.35)]">
                          <div className="relative h-36 w-full overflow-hidden rounded-t-xl border-b border-emerald-100/60 bg-emerald-50/40">
                            <Image
                              src={step.image}
                              alt={step.alt}
                              fill
                              sizes="(min-width: 768px) 480px, 100vw"
                              className="object-cover"
                            />
                          </div>
                          <CardHeader className="space-y-2">
                            <p className="text-xs uppercase tracking-[0.35em] text-emerald-700/70">Step {index + 1}</p>
                            <CardTitle className={`${display.className} text-xl`}>{step.title}</CardTitle>
                            <CardDescription>{step.description}</CardDescription>
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
            <Card className="border border-emerald-200/70 bg-emerald-50/70">
              <CardHeader>
                <CardTitle className={`${display.className} text-xl`}>Buyer trust pack</CardTitle>
                <CardDescription>Export-ready evidence for audits, buyers, and internal reviews.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-emerald-800">
                {BUYER_TRUST_PACK.map((item) => (
                  <div key={item.title} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-xs text-emerald-700/80">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border border-white/70 bg-white/85 backdrop-blur-md">
              <CardHeader>
                <CardTitle className={`${display.className} text-xl`}>Who should run which modules?</CardTitle>
                <CardDescription>Select the stack that matches your estate operating model.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {MODULE_PATHWAYS.map((pathway) => (
                  <div key={pathway.title} className="rounded-xl border border-slate-200/70 bg-white/90 p-3">
                    <p className="font-semibold text-slate-900">{pathway.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{pathway.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {pathway.modules.map((moduleName) => (
                        <Badge key={moduleName} variant="secondary" className="bg-emerald-50 text-emerald-800 border-emerald-200">
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
            <Card className="border border-white/60 bg-white/80 backdrop-blur-md">
              <CardHeader>
                <CardTitle className={`${display.className} text-2xl`}>Choose your rollout path</CardTitle>
                <CardDescription>
                  Start with essentials and expand into curing, quality, and full sales traceability as your team grows.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/signup">Create Your Workspace</Link>
                </Button>
                <Button variant="outline" asChild>
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
