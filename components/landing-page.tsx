"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Fraunces, Manrope } from "next/font/google"
import { ArrowRight, CheckCircle2, Leaf, Shield, Sparkles, Truck, MessageCircle, Send, X, Droplets, Sprout, Coffee, TrendingUp, Package, Cloudy } from "lucide-react"
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const display = Fraunces({ subsets: ["latin"], weight: ["600", "700", "800"] })
const body = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"] })

const HIGHLIGHTS = [
  {
    title: "Lot-to-Buyer Traceability",
    description: "Link every lot from intake to buyer shipment with a verified trail that protects farmer value.",
    icon: Shield,
  },
  {
    title: "Inventory & Loss Control",
    description: "Spot shrinkage early and protect lot value with live stock signals.",
    icon: Leaf,
  },
  {
    title: "Processing Yield Clarity",
    description: "Track moisture, conversion, and quality notes by lot before it hits the P&L.",
    icon: Sparkles,
  },
  {
    title: "Dispatch + Sales Reconciliation",
    description: "Reconcile gate-out, receipts, and cash so every bag is accounted for.",
    icon: Truck,
  },
  {
    title: "Rainfall + Weather Context",
    description: "Log rainfall and view weather signals alongside drying and harvest data.",
    icon: Droplets,
  },
  {
    title: "Quality + Curing Records",
    description: "Capture grading, drying, and defect notes across the season.",
    icon: Sprout,
  },
]

const BULLETS = [
  "Daily intake → processing → dispatch reconciliation",
  "Moisture, defect, and quality notes by lot",
  "Rainfall + weather context for drying",
  "Buyer-ready traceability exports",
]

const CONTROL_SIGNALS = [
  {
    label: "Processing loss (sample)",
    value: "2.9%",
    description: "Shrinkage flagged by stage and lot.",
  },
  {
    label: "Yield conversion (sample)",
    value: "46.4%",
    description: "Ripe to dry output, tracked weekly.",
  },
  {
    label: "Receivables aging (sample)",
    value: "₹16.2L",
    description: "Cash at risk across buyers.",
  },
]

const LIVE_METRICS = [
  { label: "Lots tracked", value: 152, suffix: "" },
  { label: "Avg yield", value: 46.4, suffix: "%", decimals: 1 },
  { label: "Alerts resolved", value: 18, suffix: "" },
  { label: "Cash protected", value: 24.8, suffix: "L", decimals: 1 },
]

const LIVE_UPDATES = [
  {
    title: "Wet parchment moisture trending higher",
    detail: "Drying schedule adjusted and lot flagged for follow-up.",
  },
  {
    title: "Dispatch unconfirmed for 3 days",
    detail: "Reminder sent to logistics team and buyer.",
  },
  {
    title: "Arabica yield down vs last week",
    detail: "Conversion review triggered for wet parchment output.",
  },
  {
    title: "Rainfall spike logged",
    detail: "Drying plans updated for the week ahead.",
  },
]

const ESTATE_JOURNEY = [
  {
    title: "Harvest intake",
    description: "Record crop intake and sorting splits (ripe, green, float).",
    image: "/images/estate-journey-harvest.jpg",
    alt: "Coffee harvest scene at an estate",
  },
  {
    title: "Washed or natural processing",
    description: "Track wet parchment or dry cherry outputs with moisture notes.",
    image: "/images/estate-journey-processing.jpg",
    alt: "Coffee processing scene with beans and equipment",
  },
  {
    title: "Curing + quality",
    description: "Log drying days, grades, defects, and quality evidence.",
    image: "/images/estate-journey-curing.jpg",
    alt: "Coffee beans drying during curing",
  },
  {
    title: "Dispatch + sales",
    description: "Ship bags, reconcile receipts, and close the revenue loop.",
    image: "/images/estate-journey-dispatch.jpg",
    alt: "Coffee delivery transport ready for dispatch",
  },
]

const IMPACT_PILLARS = [
  {
    title: "Waste & loss visibility",
    description: "Spot shrinkage early and protect farmer value before it leaks.",
    icon: TrendingUp,
  },
  {
    title: "Climate-aware decisions",
    description: "Rainfall logs and forecasts help plan drying and harvest activity.",
    icon: Droplets,
  },
  {
    title: "Evidence for buyers",
    description: "Moisture, defect, and quality notes strengthen buyer trust.",
    icon: Shield,
  },
]

const PRICING_TIERS = [
  {
    name: "Core",
    price: "₹9,900",
    description: "For a single coffee estate that needs daily control and traceable, farmer-first reporting.",
    modules: ["Inventory", "Transactions", "Accounts", "Processing"],
    highlight: "Best for first estate",
  },
  {
    name: "Operations",
    price: "₹18,900",
    description: "Add dispatch + sales reconciliation for multi-location operations.",
    modules: ["Core +", "Dispatch", "Sales", "Rainfall", "Pepper", "Quality & Curing"],
    highlight: "Most chosen",
  },
  {
    name: "Enterprise",
    price: "Custom",
    description: "Multi-estate governance with custom workflows and analytics.",
    modules: ["Operations +", "Analytics", "Weather", "News", "Custom Modules"],
    highlight: "Estate network",
  },
]

const CHATBOT_FAQS = [
  {
    id: "capabilities",
    question: "What can FarmFlow track?",
    answer:
      "Inventory, processing, dispatch, sales, labor, rainfall, and audits across locations. It supports Arabica/Robusta and parchment/cherry outputs with quality notes.",
  },
  {
    id: "pricing",
    question: "How does pricing work?",
    answer:
      "Pricing is modular: start with Core, add Dispatch/Sales, then scale to Enterprise for multi-estate governance.",
  },
  {
    id: "onboarding",
    question: "How fast can we get started?",
    answer:
      "Most coffee estates go live in a day: add locations, load inventory, record processing, then start dispatch/sales. We include guided onboarding.",
  },
  {
    id: "sustainability",
    question: "Does FarmFlow track sustainability?",
    answer:
      "FarmFlow documents operational evidence like rainfall, moisture, and quality notes with full traceability. Carbon or water accounting is not built-in yet.",
  },
  {
    id: "security",
    question: "Is coffee estate data isolated?",
    answer:
      "Yes. Every coffee estate is tenant-isolated with role-based access and audit logs to show who changed what and when.",
  },
  {
    id: "exports",
    question: "Can we export reports?",
    answer:
      "Yes. Export processing, dispatch, and sales records for buyer-ready compliance and reconciliation.",
  },
  {
    id: "mobile",
    question: "Does it work on mobile?",
    answer: "Yes. The dashboard is responsive for phone and tablet field entries.",
  },
]

const getChatbotReply = (input: string) => {
  const text = input.toLowerCase()
  const lookup = [
    { keys: ["price", "pricing", "plan", "cost"], id: "pricing" },
    { keys: ["start", "onboard", "setup", "begin"], id: "onboarding" },
    { keys: ["sustain", "sustainability", "climate", "rainfall", "quality notes", "water"], id: "sustainability" },
    { keys: ["security", "privacy", "tenant", "isolate", "audit"], id: "security" },
    { keys: ["export", "csv", "report"], id: "exports" },
    { keys: ["mobile", "phone", "tablet"], id: "mobile" },
    { keys: ["track", "feature", "capability", "inventory", "processing"], id: "capabilities" },
  ]

  const match = lookup.find((entry) => entry.keys.some((key) => text.includes(key)))
  const faq = CHATBOT_FAQS.find((item) => item.id === match?.id)
  if (faq) return faq.answer

  return "I can help with features, pricing, onboarding, sustainability evidence, data isolation, exports, and mobile access. Ask me anything about FarmFlow."
}

export default function LandingPage() {
  const beanLayerRef = useRef<HTMLDivElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const journeyRef = useRef<HTMLDivElement | null>(null)
  const messageIdRef = useRef(0)
  const prefersReducedMotion = useReducedMotion()
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [draftMessage, setDraftMessage] = useState("")
  const [activeUpdateIndex, setActiveUpdateIndex] = useState(0)
  const [metricValues, setMetricValues] = useState<number[]>(() => LIVE_METRICS.map(() => 0))
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "bot" as const,
      text: "Hi! Ask me about FarmFlow features, pricing, onboarding, and data security.",
    },
  ])

  const { scrollYProgress: journeyProgress } = useScroll({
    target: journeyRef,
    offset: ["start 0.2", "end 0.8"],
  })
  const timelineScale = useTransform(journeyProgress, [0, 1], [0, 1])
  const timelineGlow = useTransform(journeyProgress, [0, 0.4, 1], [0.1, 0.7, 1])

  useEffect(() => {
    if (typeof window === "undefined") return

    const layer = beanLayerRef.current
    if (!layer) return
    layer.innerHTML = ""

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const styleBean = (bean: HTMLSpanElement, top?: string) => {
      bean.className = "coffee-bean"
      bean.style.left = `${Math.random() * 92 + 4}%`
      bean.style.opacity = `${Math.random() * 0.4 + 0.45}`
      bean.style.transform = `rotate(${Math.random() * 180}deg)`
      bean.style.width = `${Math.random() * 8 + 16}px`
      bean.style.height = `${Math.random() * 10 + 22}px`
      bean.style.filter = "drop-shadow(0 10px 16px rgba(35, 20, 10, 0.35))"
      if (top) {
        bean.style.top = top
      }
    }

    if (reducedMotion) {
      for (let i = 0; i < 8; i += 1) {
        const bean = document.createElement("span")
        styleBean(bean, `${Math.random() * 70 + 10}%`)
        bean.style.animation = "none"
        layer.appendChild(bean)
      }
      return
    }

    let lastSpawn = 0
    const spawnBeans = () => {
      const now = Date.now()
      if (now - lastSpawn < 160) return
      lastSpawn = now

      const beanCount = Math.floor(Math.random() * 2) + 1
      for (let i = 0; i < beanCount; i += 1) {
        const bean = document.createElement("span")
        styleBean(bean)
        bean.style.animationDuration = `${Math.random() * 2.2 + 3.4}s`
        layer.appendChild(bean)

        window.setTimeout(() => {
          bean.remove()
        }, 5600)
      }
    }

    window.addEventListener("scroll", spawnBeans, { passive: true })
    window.addEventListener("touchmove", spawnBeans, { passive: true })
    spawnBeans()

    return () => {
      window.removeEventListener("scroll", spawnBeans)
      window.removeEventListener("touchmove", spawnBeans)
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveUpdateIndex((prev) => (prev + 1) % LIVE_UPDATES.length)
    }, 4200)

    return () => {
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reducedMotion) {
      setMetricValues(LIVE_METRICS.map((metric) => metric.value))
      return
    }

    let start: number | null = null
    const duration = 1200
    const step = (timestamp: number) => {
      if (!start) start = timestamp
      const progress = Math.min((timestamp - start) / duration, 1)
      setMetricValues(
        LIVE_METRICS.map((metric) => {
          const value = metric.value * progress
          if (metric.decimals) return Number(value.toFixed(metric.decimals))
          return Math.round(value)
        }),
      )
      if (progress < 1) {
        window.requestAnimationFrame(step)
      }
    }

    window.requestAnimationFrame(step)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const targets = Array.from(document.querySelectorAll("[data-reveal]")) as HTMLElement[]
    if (targets.length === 0) return

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reducedMotion) {
      targets.forEach((el) => el.classList.add("reveal-visible"))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-visible")
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.18 },
    )

    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isChatOpen || !chatEndRef.current) return
    chatEndRef.current.scrollIntoView({ behavior: "smooth" })
  }, [messages, isChatOpen])

  const sendMessage = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const userId = `u-${++messageIdRef.current}`
    const botId = `b-${++messageIdRef.current}`
    const userMessage = { id: userId, role: "user" as const, text: trimmed }
    const botMessage = { id: botId, role: "bot" as const, text: getChatbotReply(trimmed) }
    setMessages((prev) => [...prev, userMessage, botMessage])
    setDraftMessage("")
  }

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
        <div className="absolute -top-28 right-[-6%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_center,rgba(15,111,102,0.45),transparent_70%)] blur-[120px] glow-pulse" />
        <div className="absolute top-[18%] left-[-8%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle_at_center,rgba(31,107,93,0.35),transparent_70%)] blur-[140px] soft-shift" />
        <div className="absolute bottom-[-18%] right-[8%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(232,246,243,0.8),transparent_70%)] blur-[140px]" />
      </div>
      <div ref={beanLayerRef} className="pointer-events-none absolute inset-0 z-30 overflow-hidden" />
      <div className="relative z-10">
        <header className="px-6 pt-4 sm:pt-6">
          <nav className="mx-auto flex w-full max-w-6xl flex-col gap-3 rounded-2xl border border-white/60 bg-white/75 px-3 py-3 backdrop-blur-md shadow-[0_24px_50px_-32px_rgba(15,23,42,0.6)] dark:border-white/10 dark:bg-slate-900/70 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-[color:var(--sand)] text-[color:var(--copper)] flex items-center justify-center shadow-[0_0_25px_rgba(15,111,102,0.35)]">
                <Leaf className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">FarmFlow</p>
                <p className="text-xs text-muted-foreground">Operations OS</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#field-signals" className="hover:text-foreground">
                Field Signals
              </a>
              <a href="#features" className="hover:text-foreground">
                Features
              </a>
              <a href="#journey" className="hover:text-foreground">
                Journey
              </a>
              <a href="#traceability" className="hover:text-foreground">
                Traceability
              </a>
              <a href="#impact" className="hover:text-foreground">
                Impact
              </a>
              <a href="#pricing" className="hover:text-foreground">
                Pricing
              </a>
            </div>
            <div className="flex items-center gap-2">
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
          <section className="mx-auto mt-10 w-full max-w-7xl sm:mt-16">
            <div className="relative overflow-hidden rounded-3xl border border-white/40 bg-gradient-to-br from-[#0f6f66] via-[#0b4f49] to-[#083730] p-8 md:p-12 lg:p-16 shadow-[0_40px_100px_-40px_rgba(15,111,102,0.7)] grain">
              {/* Coffee bean background pattern */}
              <div className="pointer-events-none absolute inset-0 opacity-10">
                <div className="absolute top-10 left-10 h-20 w-20 rounded-full bg-[color:var(--sand)]" />
                <div className="absolute top-32 right-20 h-12 w-12 rounded-full bg-[color:var(--sand)]" />
                <div className="absolute bottom-20 left-32 h-16 w-16 rounded-full bg-[color:var(--sand)]" />
                <div className="absolute bottom-32 right-16 h-24 w-24 rounded-full bg-[color:var(--sand)]" />
              </div>

              <div className="relative z-10 grid gap-12 lg:grid-cols-2 items-center">
                <div className="space-y-6 rise-in">
                  <Badge className="border-white/30 bg-white/20 text-white backdrop-blur-md">
                    <Coffee className="mr-2 h-3.5 w-3.5" />
                    Built for coffee estates, grower collectives, and mill teams
                  </Badge>
                  
                  <h1 className={`${display.className} text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-white text-balance`}>
                    Run a farmer-first coffee estate with complete lot traceability
                  </h1>
                  
                  <p className="text-lg text-white/90 leading-relaxed">
                    FarmFlow is the operations OS for coffee estates. Track Arabica and Robusta from cherry intake to buyer
                    shipment with clean traceability, yield insights, and documented quality decisions that protect farmer value.
                  </p>

                  <div className="flex flex-wrap items-center gap-4">
                    <Button size="lg" className="bg-white text-[#0f6f66] hover:bg-white/90 font-semibold group shadow-[0_20px_40px_-20px_rgba(255,255,255,0.5)]">
                      <Link href="/signup" className="flex items-center">
                        Launch your estate workspace <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </Link>
                    </Button>
                    <Button size="lg" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm">
                      <Link href="/login">View live demo</Link>
                    </Button>
                  </div>

                  {/* Quick stats */}
                  <div className="grid grid-cols-3 gap-4 pt-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Coffee className="h-4 w-4 text-white/70" />
                        <p className={`${display.className} text-2xl font-bold text-white`}>152</p>
                      </div>
                      <p className="text-xs text-white/70">Lots tracked</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="h-4 w-4 text-white/70" />
                        <p className={`${display.className} text-2xl font-bold text-white`}>46.4%</p>
                      </div>
                      <p className="text-xs text-white/70">Avg yield</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Package className="h-4 w-4 text-white/70" />
                        <p className={`${display.className} text-2xl font-bold text-white`}>100%</p>
                      </div>
                      <p className="text-xs text-white/70">Traceable</p>
                    </div>
                  </div>
                  <p className="text-xs text-white/60">Illustrative metrics for demo purposes.</p>
                </div>

                {/* Right side - Enhanced coffee estate visual */}
                <div className="relative rise-in-delayed">
                  <div className="relative">
                    {/* Main card with coffee estate data */}
                    <Card className="relative border-white/30 bg-white/95 backdrop-blur-xl shadow-[0_40px_90px_-50px_rgba(0,0,0,0.9)] sheen">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#0f6f66] to-[#0b4f49] flex items-center justify-center">
                              <Coffee className="h-6 w-6 text-white" />
                            </div>
                            <div>
                              <CardTitle className={`${display.className} text-xl`}>Estate Dashboard</CardTitle>
                              <CardDescription>Demo estate · Western Ghats</CardDescription>
                            </div>
                          </div>
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                            Sample data
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Current processing */}
                        <div className="rounded-xl border border-amber-200/70 bg-gradient-to-br from-amber-50/80 to-orange-50/50 p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-medium text-amber-900">Current Processing</p>
                            <Sparkles className="h-4 w-4 text-amber-600" />
                          </div>
                          <p className={`${display.className} text-3xl font-bold text-amber-900`}>2,840 kg</p>
                          <p className="text-xs text-amber-700 mt-1">Arabica cherry → parchment</p>
                          <div className="mt-3 h-2 rounded-full bg-amber-200/50 overflow-hidden">
                            <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-amber-400 to-orange-500 animate-pulse" />
                          </div>
                        </div>

                        {/* Grid metrics */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/80 to-green-50/50 p-3">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Droplets className="h-3.5 w-3.5 text-emerald-600" />
                              <p className="text-[10px] font-medium text-emerald-900">Rainfall Logs</p>
                            </div>
                            <p className={`${display.className} text-xl font-bold text-emerald-900`}>12</p>
                            <p className="text-[10px] text-emerald-700">entries this month</p>
                          </div>
                          <div className="rounded-xl border border-blue-200/70 bg-gradient-to-br from-blue-50/80 to-sky-50/50 p-3">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Shield className="h-3.5 w-3.5 text-blue-600" />
                              <p className="text-[10px] font-medium text-blue-900">Quality Checks</p>
                            </div>
                            <p className={`${display.className} text-xl font-bold text-blue-900`}>38</p>
                            <p className="text-[10px] text-blue-700">grading entries logged</p>
                          </div>
                        </div>

                        {/* Revenue protected */}
                        <div className="rounded-xl border border-slate-200/70 bg-gradient-to-br from-slate-50/80 to-slate-100/50 p-4">
                          <p className="text-xs font-medium text-slate-700 mb-1">Season Revenue</p>
                          <p className={`${display.className} text-2xl font-bold text-slate-900`}>₹24.8 Lakh</p>
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 text-xs text-slate-600">Protected & traceable</div>
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Floating alert card */}
                    <div className="absolute -bottom-6 -left-6 hidden lg:block w-56 rounded-xl border border-orange-200/70 bg-white shadow-[0_20px_50px_-20px_rgba(234,88,12,0.4)] p-3">
                      <div className="flex items-start gap-2">
                        <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-orange-600 text-sm font-bold">!</span>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-900">Yield alert</p>
                          <p className="text-[10px] text-slate-600 mt-0.5">Lot MV-847 below target by 3.2%</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mx-auto mt-12 w-full max-w-6xl grid gap-4 md:grid-cols-3">
            {CONTROL_SIGNALS.map((signal) => (
              <div
                key={signal.label}
                className="rounded-2xl border border-white/70 bg-white/75 p-5 shadow-[0_20px_45px_-32px_rgba(15,111,102,0.4)] backdrop-blur-md"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--copper)]">{signal.label}</p>
                <p className={`${display.className} text-3xl font-semibold text-[color:var(--ink)]`}>{signal.value}</p>
                <p className="text-xs text-muted-foreground">{signal.description}</p>
              </div>
            ))}
          </section>

          <section className="mx-auto mt-12 w-full max-w-6xl grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className="border border-white/70 bg-white/80 backdrop-blur-md signal-scan">
              <CardHeader>
                <CardTitle className={`${display.className} text-2xl`}>Live Operations Pulse</CardTitle>
                <CardDescription>What estate leads see before it impacts quality or revenue.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {LIVE_METRICS.map((metric, index) => (
                  <div key={metric.label} className="rounded-2xl border border-slate-200/60 bg-white/70 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{metric.label}</p>
                    <p className={`${display.className} text-3xl font-semibold text-[color:var(--ink)]`}>
                      {metricValues[index]}
                      {metric.suffix}
                    </p>
                    <p className="text-xs text-muted-foreground">This season snapshot</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border border-emerald-200/70 bg-emerald-50/70">
              <CardHeader>
                <div className="flex items-center gap-2 text-emerald-700 text-xs uppercase tracking-[0.3em]">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live feed
                </div>
                <CardTitle className={`${display.className} text-xl`}>{LIVE_UPDATES[activeUpdateIndex].title}</CardTitle>
                <CardDescription>{LIVE_UPDATES[activeUpdateIndex].detail}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-emerald-200 bg-white/80 p-3 text-xs text-emerald-700">
                  Updated a few seconds ago · Rolling 7-day baseline
                </div>
              </CardContent>
            </Card>
          </section>

        <section id="field-signals" className="mx-auto mt-16 w-full max-w-6xl space-y-6 scroll-mt-24 sm:mt-20">
          <div className="text-center space-y-3">
            <h2 className={`${display.className} text-3xl font-semibold`}>Field Signals & Climate Context</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Log rainfall, monitor weather, and track quality checkpoints alongside daily operations.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="border border-emerald-200/70 bg-gradient-to-br from-emerald-50/80 to-white/80 backdrop-blur-md">
              <CardHeader>
                <div className="h-12 w-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2">
                  <Droplets className="h-6 w-6" />
                </div>
                <CardTitle className={`${display.className} text-xl`}>Rainfall Logs</CardTitle>
                <CardDescription>Daily rainfall entries tied to each estate location</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-emerald-200 bg-white/70 p-4">
                  <p className="text-2xl font-semibold text-emerald-700">Tracked</p>
                  <p className="text-xs text-muted-foreground mt-1">Per day with notes and observations</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-blue-200/70 bg-gradient-to-br from-blue-50/80 to-white/80 backdrop-blur-md">
              <CardHeader>
                <div className="h-12 w-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mb-2">
                  <Cloudy className="h-6 w-6" />
                </div>
                <CardTitle className={`${display.className} text-xl`}>Weather Signals</CardTitle>
                <CardDescription>Local forecasts for planning harvest, processing, and drying</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-blue-200 bg-white/70 p-4">
                  <p className="text-2xl font-semibold text-blue-700">Live</p>
                  <p className="text-xs text-muted-foreground mt-1">Pulled from trusted weather data</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-amber-200/70 bg-gradient-to-br from-amber-50/80 to-white/80 backdrop-blur-md">
              <CardHeader>
                <div className="h-12 w-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mb-2">
                  <Sparkles className="h-6 w-6" />
                </div>
                <CardTitle className={`${display.className} text-xl`}>Quality Checkpoints</CardTitle>
                <CardDescription>Grading, curing, and defect notes captured per lot</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-amber-200 bg-white/70 p-4">
                  <p className="text-2xl font-semibold text-amber-700">Logged</p>
                  <p className="text-xs text-muted-foreground mt-1">With moisture and defect tracking</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="features" className="mx-auto mt-16 w-full max-w-6xl space-y-6 scroll-mt-24 sm:mt-20">
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`${display.className} text-3xl font-semibold`}>Everything your coffee estate needs, in one system</h2>
              <p className="text-muted-foreground mt-2">
                Built for day-to-day operations, compliance, and buyer transparency.
              </p>
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {HIGHLIGHTS.map((item) => (
              <Card
                key={item.title}
                className="group border border-white/60 bg-white/75 backdrop-blur-md shadow-[0_16px_40px_-32px_rgba(15,23,42,0.6)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_-32px_rgba(15,23,42,0.75)]"
              >
                <CardHeader className="flex flex-row items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[color:var(--sand)] text-[color:var(--copper)] flex items-center justify-center shadow-[0_0_20px_rgba(15,111,102,0.2)]">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{item.title}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section
          id="journey"
          data-reveal
          className="mx-auto mt-16 w-full max-w-6xl space-y-6 scroll-mt-24 sm:mt-20"
        >
          <div className="text-center space-y-3">
            <h2 className={`${display.className} text-3xl font-semibold`}>Estate journey, from cherry to buyer</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Document every step so quality decisions are visible to managers, buyers, and farmers.
            </p>
          </div>
          <div ref={journeyRef} className="relative mt-10 space-y-12">
            <div className="pointer-events-none absolute left-4 top-0 h-full w-[2px] bg-emerald-100/80 md:left-1/2 md:-translate-x-1/2" />
            <motion.div
              className="pointer-events-none absolute left-4 top-0 h-full w-[3px] origin-top bg-gradient-to-b from-emerald-500 via-emerald-400 to-transparent md:left-1/2 md:-translate-x-1/2"
              style={{
                scaleY: prefersReducedMotion ? 1 : timelineScale,
                opacity: prefersReducedMotion ? 1 : timelineGlow,
              }}
            />
            <div className="space-y-10 md:space-y-14">
              {ESTATE_JOURNEY.map((step, index) => {
                const isLeft = index % 2 === 0
                return (
                  <motion.div
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
                    <div className={`relative w-full md:w-[calc(50%-3rem)] ${isLeft ? "md:pr-10" : "md:pl-10"} pl-10 md:pl-0`}>
                      <span
                        className={`absolute top-7 left-[10px] h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.55)] md:left-auto ${
                          isLeft ? "md:right-[-3rem]" : "md:left-[-3rem]"
                        }`}
                      />
                      <Card className="border border-white/70 bg-white/85 backdrop-blur-md shadow-[0_20px_45px_-35px_rgba(16,185,129,0.35)]">
                        <div className="h-36 w-full overflow-hidden rounded-t-xl border-b border-emerald-100/60 bg-emerald-50/40">
                          <img
                            src={step.image}
                            alt={step.alt}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                        <CardHeader className="space-y-2">
                          <p className="text-xs uppercase tracking-[0.35em] text-emerald-700/70">Step {index + 1}</p>
                          <CardTitle className={`${display.className} text-xl`}>{step.title}</CardTitle>
                          <CardDescription>{step.description}</CardDescription>
                        </CardHeader>
                      </Card>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>

          <Card className="border border-emerald-200/70 bg-emerald-50/70">
            <CardHeader>
              <CardTitle className={`${display.className} text-xl`}>Buyer trust pack</CardTitle>
              <CardDescription>Evidence you can export when audits or buyers ask.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-emerald-800">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                <div>
                  <p className="font-medium">Lot ID + processing timeline</p>
                  <p className="text-xs text-emerald-700/80">From intake through curing and dispatch.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                <div>
                  <p className="font-medium">Moisture, grade, and defect notes</p>
                  <p className="text-xs text-emerald-700/80">Quality evidence tied to each lot.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                <div>
                  <p className="font-medium">Dispatch + sales reconciliation</p>
                  <p className="text-xs text-emerald-700/80">Every bag is accounted for and auditable.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section
          id="traceability"
          className="mx-auto mt-16 w-full max-w-6xl grid gap-10 lg:grid-cols-2 items-start scroll-mt-24 sm:mt-20"
        >
          <Card className="border border-white/50 bg-white/75 backdrop-blur-md">
            <CardHeader>
              <CardTitle className={`${display.className} text-2xl`}>Traceability that earns trust</CardTitle>
              <CardDescription>
                Provide buyers and auditors a clean, searchable history for every lot and movement.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Record harvest intake, processing outputs, moisture readings, dispatch notes, and sales receipts in one workflow.
              </p>
              <p>
                Create a verifiable chain from estate to buyer with timestamps, user logs, and audit-ready evidence for farmer-first pricing.
              </p>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/70 p-5">
              <p className="text-xs text-emerald-700">Traceability Score</p>
              <p className="text-3xl font-semibold text-emerald-700">A+</p>
              <p className="text-xs text-emerald-600">Batch-level audit readiness</p>
            </div>
            <div className="rounded-2xl border border-white/50 bg-white/70 p-5 text-sm text-muted-foreground">
              Export compliance-ready reports in one click and share with buyers instantly.
            </div>
          </div>
        </section>

        <section
          id="impact"
          data-reveal
          className="mx-auto mt-16 w-full max-w-6xl space-y-6 scroll-mt-24 sm:mt-20"
        >
          <div className="text-center space-y-3">
            <h2 className={`${display.className} text-3xl font-semibold`}>Sustainability that is actually measurable</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              FarmFlow focuses on the operational evidence you already collect so farmer-first practices are visible
              without greenwashing.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {IMPACT_PILLARS.map((pillar) => (
              <Card
                key={pillar.title}
                className="border border-white/60 bg-white/80 backdrop-blur-md shadow-[0_20px_45px_-32px_rgba(15,23,42,0.6)]"
              >
                <CardHeader className="space-y-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <pillar.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg">{pillar.title}</CardTitle>
                  <CardDescription>{pillar.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section id="pricing" className="mx-auto mt-16 w-full max-w-6xl space-y-6 scroll-mt-24 sm:mt-20">
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`${display.className} text-3xl font-semibold`}>Pricing by modules</h2>
              <p className="text-muted-foreground mt-2">
                Start lean, add modules as your estate scales.
              </p>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {PRICING_TIERS.map((tier) => (
              <Card
                key={tier.name}
                className="border border-white/50 bg-white/80 backdrop-blur-md shadow-[0_24px_50px_-40px_rgba(15,23,42,0.8)]"
              >
                <CardHeader className="space-y-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className={`${display.className} text-xl`}>{tier.name}</CardTitle>
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                      {tier.highlight}
                    </Badge>
                  </div>
                  <p className="text-3xl font-semibold">{tier.price}</p>
                  <CardDescription>{tier.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm">
                    {tier.modules.map((module) => (
                      <div key={module} className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span>{module}</span>
                      </div>
                    ))}
                  </div>
                  <Button className="w-full" asChild>
                    <Link href="/signup">Choose {tier.name}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section id="results" className="mx-auto mt-16 w-full max-w-6xl scroll-mt-24 sm:mt-20">
          <Card className="border border-white/50 bg-white/80 backdrop-blur-md">
            <CardHeader>
              <CardTitle className={`${display.className} text-2xl`}>Ready to run a farmer-first coffee estate?</CardTitle>
              <CardDescription>
                Start with one estate, expand to every location, and keep every KG traceable.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4 items-center justify-between">
              <div className="text-sm text-muted-foreground">
                You will get guided onboarding, module setup, and a dedicated tenant in minutes.
              </div>
              <div className="flex gap-3">
                <Button asChild>
                  <Link href="/signup">Create your coffee estate</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/login">Sign in</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mx-auto mt-16 w-full max-w-6xl space-y-6 sm:mt-20">
          <div>
            <h2 className={`${display.className} text-3xl font-semibold`}>Mission & Vision</h2>
            <p className="text-muted-foreground mt-2">
              The operating principles that keep FarmFlow focused on farmers, quality, and resilience.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card id="mission" className="scroll-mt-24 border border-white/50 bg-white/80 backdrop-blur-md">
              <CardHeader>
                <CardTitle className={`${display.className} text-xl`}>Mission</CardTitle>
              <CardDescription>
                  Help coffee estates protect quality and build trust with farmers and buyers through traceability.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
                FarmFlow replaces spreadsheets with a live operating system that reconciles every bag, lot, and cost
                across the season. Estates make faster decisions, protect lot value, and document the practices that
                reward farmers.
            </CardContent>
            </Card>
            <Card id="vision" className="scroll-mt-24 border border-white/50 bg-white/80 backdrop-blur-md">
              <CardHeader>
              <CardTitle className={`${display.className} text-xl`}>Vision</CardTitle>
              <CardDescription>Transparent supply chains that reward quality for farmers and buyers.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
                We want every coffee estate to run with real-time tracking, verified quality, and instant visibility for
                managers, buyers, and auditors—so good practices are visible and rewarded.
            </CardContent>
            </Card>
          </div>
        </section>

        <section className="mx-auto mt-16 w-full max-w-6xl space-y-6 sm:mt-20">
          <div>
            <h2 className={`${display.className} text-3xl font-semibold`}>Privacy & Terms</h2>
            <p className="text-muted-foreground mt-2">Clear commitments for data, access, and accountability.</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card id="privacy" className="scroll-mt-24 border border-white/50 bg-white/80 backdrop-blur-md">
              <CardHeader>
                <CardTitle className={`${display.className} text-xl`}>Privacy</CardTitle>
                <CardDescription>Coffee estate data stays private and tenant-isolated.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-3">
                <p>We never sell your operational data. Each coffee estate runs in a separated tenant space.</p>
                <p>Access is role-based, with audit logs to show who changed what and when.</p>
                <p>Exports and backups stay under your control, and you can revoke users any time.</p>
              </CardContent>
            </Card>
            <Card id="terms" className="scroll-mt-24 border border-white/50 bg-white/80 backdrop-blur-md">
              <CardHeader>
                <CardTitle className={`${display.className} text-xl`}>Terms</CardTitle>
                <CardDescription>Transparent usage with clear responsibility.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-3">
                <p>FarmFlow provides operational tooling and reporting, not financial advice or guarantees.</p>
                <p>Admins are responsible for data accuracy and user access within their coffee estate.</p>
                <p>Service updates are communicated in advance and designed to protect existing data.</p>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

        <footer className="border-t border-white/40 bg-white/70 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold">FarmFlow</p>
              <p className="text-xs text-muted-foreground">
                Built for coffee estates today, adaptable to tea, cocoa, and specialty crops tomorrow.
              </p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <a href="#field-signals" className="hover:text-foreground">
                Field Signals
              </a>
              <a href="#features" className="hover:text-foreground">
                Features
              </a>
              <a href="#journey" className="hover:text-foreground">
                Journey
              </a>
              <a href="#impact" className="hover:text-foreground">
                Impact
              </a>
              <a href="#pricing" className="hover:text-foreground">
                Pricing
              </a>
              <a href="#mission" className="hover:text-foreground">
                Mission
              </a>
              <a href="#vision" className="hover:text-foreground">
                Vision
              </a>
              <a href="#privacy" className="hover:text-foreground">
                Privacy
              </a>
              <Link href="/privacy" className="hover:text-foreground">
                Privacy Notice
              </Link>
              <a href="#terms" className="hover:text-foreground">
                Terms
              </a>
              <Link href="/legal/terms" className="hover:text-foreground">
                MSA / ToS
              </Link>
              <Link href="/legal/privacy" className="hover:text-foreground">
                Privacy Policy
              </Link>
              <Link href="/legal/dpa" className="hover:text-foreground">
                DPA
              </Link>
              <Link href="/legal/subprocessors" className="hover:text-foreground">
                Subprocessors
              </Link>
            </div>
          </div>
        </footer>
      </div>

      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {isChatOpen && (
          <div className="w-[320px] sm:w-[360px] rounded-2xl border border-white/60 bg-white/90 shadow-[0_30px_60px_-40px_rgba(15,23,42,0.7)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-slate-200/60 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">FarmFlow Concierge</p>
                <p className="text-xs text-muted-foreground">Ask about features, pricing, or onboarding.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsChatOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="max-h-[320px] overflow-y-auto px-4 py-3 text-sm">
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-2xl px-3 py-2 ${message.role === "user" ? "ml-auto bg-[color:var(--sand)] text-[color:var(--ink)]" : "bg-white border border-slate-200/70 text-slate-700"}`}
                  >
                    {message.text}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            </div>
            <div className="border-t border-slate-200/60 px-4 py-3">
              <div className="flex flex-wrap gap-2 pb-3">
                {CHATBOT_FAQS.slice(0, 3).map((faq) => (
                  <button
                    key={faq.id}
                    onClick={() => sendMessage(faq.question)}
                    className="rounded-full border border-slate-200/70 bg-white px-3 py-1 text-xs text-slate-600 hover:border-slate-300"
                  >
                    {faq.question}
                  </button>
                ))}
              </div>
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  sendMessage(draftMessage)
                }}
              >
                <input
                  value={draftMessage}
                  onChange={(event) => setDraftMessage(event.target.value)}
                  placeholder="Ask about pricing, onboarding, exports..."
                  className="flex-1 rounded-full border border-slate-200/70 bg-white px-4 py-2 text-sm outline-none focus:border-[color:var(--copper)]"
                />
                <Button size="icon" type="submit">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        )}
        {!isChatOpen && (
          <Button
            size="lg"
            className="rounded-full shadow-[0_22px_50px_-30px_rgba(15,111,102,0.6)]"
            onClick={() => setIsChatOpen(true)}
          >
            <MessageCircle className="mr-2 h-5 w-5" />
            Chat with FarmFlow
          </Button>
        )}
      </div>
    </div>
  )
}
