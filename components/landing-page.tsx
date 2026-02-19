"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import Image from "next/image"
import { Fraunces, Manrope } from "next/font/google"
import { ArrowRight, CheckCircle2, Leaf, Shield, Sparkles, Truck, MessageCircle, Send, X, Droplets, Sprout, Coffee, TrendingUp, Package, Cloudy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const display = Fraunces({ subsets: ["latin"], weight: ["600", "700", "800"] })
const body = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"] })

const HIGHLIGHTS = [
  {
    title: "End-to-End Lot Traceability",
    description: "Track every lot from field intake to buyer shipment with a complete, auditable chain.",
    icon: Shield,
  },
  {
    title: "Inventory & Loss Control",
    description: "Detect shrinkage and stock drift early before margin leaks.",
    icon: Leaf,
  },
  {
    title: "Processing Yield Clarity",
    description: "Monitor processing throughput, moisture, and conversion lot by lot in real time.",
    icon: Sparkles,
  },
  {
    title: "Dispatch + Sales Reconciliation",
    description: "Reconcile dispatch, received weight, and invoicing so every bag has a financial trail.",
    icon: Truck,
  },
  {
    title: "Rainfall + Weather Intelligence",
    description: "Combine rainfall logs and live forecasts to plan harvest and drying with confidence.",
    icon: Droplets,
  },
  {
    title: "Labor + Consumables Tracking",
    description: "Track worker output, wages, fuel, fertilizer, and processing consumables across locations.",
    icon: Package,
  },
]

const BULLETS = [
  "Capture intake, processing, labor, consumables, dispatch, and sales in one live ledger",
  "Track labor productivity, wages, and input usage by location",
  "Plan field and drying decisions with rainfall + weather context",
  "Add curing and grading notes when your workflow needs them",
]

const CONTROL_SIGNALS = [
  {
    label: "Processing loss trend",
    value: "2.9%",
    description: "Shrinkage detected by stage and lot.",
  },
  {
    label: "Yield conversion rate",
    value: "46.4%",
    description: "Ripe-to-dry output monitored weekly.",
  },
  {
    label: "Receivables exposure",
    value: "₹16.2L",
    description: "Outstanding buyer cash currently at risk.",
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
    title: "Moisture variance detected in wet parchment",
    detail: "Drying plan adjusted automatically and lot flagged for supervisor follow-up.",
  },
  {
    title: "Dispatch confirmation pending for 3 days",
    detail: "Escalation reminder sent to logistics and buyer contacts.",
  },
  {
    title: "Labor allocation shifted for processing peak",
    detail: "Supervisor reassigned workers to high-throughput lots for faster turn-around.",
  },
  {
    title: "Consumables threshold reached at primary location",
    detail: "Fuel and processing input replenishment request generated.",
  },
]

const ROLE_VALUE_CARDS = [
  {
    title: "Estate Owner",
    icon: TrendingUp,
    outcome: "Run the estate from one command view for processing output, labor cost, consumables burn, and cash flow.",
    points: ["Season KPI command center", "Labor + consumable cost signals", "Cross-module reconciliation"],
  },
  {
    title: "Operations Lead",
    icon: Truck,
    outcome: "Execute daily processing, labor rosters, dispatch, and stock movement without spreadsheet drift.",
    points: ["Lot-level processing records", "Labor shifts + output tracking", "Consumables issue vs stock"],
  },
  {
    title: "Admin & Finance",
    icon: Shield,
    outcome: "Manage access, accountability, and governance with clear controls and audit evidence.",
    points: ["Role and module permissions", "User-level overrides", "Full activity log history"],
  },
]

const MODULE_PATHWAYS = [
  {
    title: "Estate Owner Command",
    description: "Best for estates running full operations with processing, labor, consumables, and revenue in one system.",
    modules: ["Inventory", "Processing", "Dispatch", "Sales", "Season View", "Accounts", "Activity Log"],
  },
  {
    title: "Estate + Curing Extension",
    description: "Add curing and grading as secondary modules when your estate also runs post-processing workflows.",
    modules: ["Processing", "Curing", "Quality", "Rainfall", "Weather", "Dispatch", "Sales"],
  },
  {
    title: "Inventory + Accounts Essentials",
    description: "Start simple with stock and finance control, then expand modules as operations mature.",
    modules: ["Inventory", "Accounts", "Transaction History"],
  },
]

const WEEK_ONE_PLAN = [
  {
    day: "Day 1",
    title: "Set up your workspace",
    detail: "Configure locations, user roles, and module access for your estate team.",
  },
  {
    day: "Day 2-3",
    title: "Import baseline data",
    detail: "Load inventory, consumables, processing, dispatch, and sales opening balances.",
  },
  {
    day: "Day 4-5",
    title: "Run daily operations",
    detail: "Start recording intake, processing outputs, labor logs, consumable issues, dispatches, and sales.",
  },
  {
    day: "Day 6-7",
    title: "Close your first review",
    detail: "Use Season View and exceptions to reconcile yield, stock movement, and cash.",
  },
]

const ASSURANCE_POINTS = [
  "Tenant-isolated architecture with role-based access control",
  "Audit logs for every create, update, and delete action",
  "Phased module rollout so teams adopt with minimal disruption",
]

const ESTATE_JOURNEY = [
  {
    title: "Harvest intake",
    description: "Capture cherry intake and sort split by ripe, green, and float.",
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

const IMPACT_PILLARS = [
  {
    title: "Loss visibility that protects margin",
    description: "Catch shrinkage and variance early before value is lost.",
    icon: TrendingUp,
  },
  {
    title: "Climate-aware operating decisions",
    description: "Use rainfall logs and forecasts to plan drying, harvest, and processing windows.",
    icon: Droplets,
  },
  {
    title: "Buyer confidence through evidence",
    description: "Moisture, defect, and quality records strengthen pricing conversations.",
    icon: Shield,
  },
]

const CHATBOT_FAQS = [
  {
    id: "capabilities",
    question: "What can FarmFlow track?",
    answer:
      "FarmFlow tracks inventory, processing, dispatch, sales, labor, rainfall, and audit events across locations. It supports Arabica/Robusta and parchment/cherry outputs with quality notes.",
  },
  {
    id: "pricing",
    question: "How does pricing work?",
    answer:
      "Commercial plans are being finalized. Share your details in Register Interest and our team will contact you with rollout options.",
  },
  {
    id: "onboarding",
    question: "How fast can we get started?",
    answer:
      "Most estates can start in a day: set locations, load opening balances, then begin processing, dispatch, and sales with guided onboarding.",
  },
  {
    id: "sustainability",
    question: "Does FarmFlow track sustainability?",
    answer:
      "FarmFlow captures operational sustainability evidence like rainfall, moisture, and quality notes with lot traceability. Carbon and water accounting are planned.",
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

  return "I can help with capabilities, onboarding, security, exports, and plans. Ask me anything about FarmFlow."
}

export default function LandingPage() {
  const beanLayerRef = useRef<HTMLDivElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const messageIdRef = useRef(0)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [draftMessage, setDraftMessage] = useState("")
  const [activeUpdateIndex, setActiveUpdateIndex] = useState(0)
  const [metricValues, setMetricValues] = useState<number[]>(() => LIVE_METRICS.map(() => 0))
  const [interestForm, setInterestForm] = useState({
    name: "",
    email: "",
    organization: "",
    estateSize: "",
    notes: "",
  })
  const [interestState, setInterestState] = useState<"idle" | "submitting" | "success" | "error">("idle")
  const [interestError, setInterestError] = useState("")
  type ChatMessage = { id: string; role: "bot" | "user"; text: string }
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "bot" as const,
      text: "Welcome to FarmFlow. Ask me about modules, onboarding, plans, and data security.",
    },
  ])

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

  const handleInterestSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setInterestError("")
    setInterestState("submitting")
    try {
      const response = await fetch("/api/register-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(interestForm),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to submit interest")
      }
      setInterestState("success")
      setInterestForm({
        name: "",
        email: "",
        organization: "",
        estateSize: "",
        notes: "",
      })
    } catch (error: any) {
      setInterestState("error")
      setInterestError(error.message || "Failed to submit interest")
    }
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
              <a href="#roles" className="hover:text-foreground">
                Solutions
              </a>
              <a href="#modules" className="hover:text-foreground">
                Module Paths
              </a>
              <a href="#onboarding" className="hover:text-foreground">
                Go Live
              </a>
              <a href="#features" className="hover:text-foreground">
                Capabilities
              </a>
              <Link href="/journey" className="hover:text-foreground">
                Journey
              </Link>
              <a href="#traceability" className="hover:text-foreground">
                Traceability
              </a>
              <a href="#impact" className="hover:text-foreground">
                Impact
              </a>
              <a href="#pricing" className="hover:text-foreground">
                Early Access
              </a>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" asChild>
                <Link href="/login">Login</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">Request Access</Link>
              </Button>
            </div>
          </nav>
          <div className="mx-auto mt-3 flex w-full max-w-6xl gap-2 overflow-x-auto no-scrollbar md:hidden">
            {[
              { href: "#roles", label: "Solutions" },
              { href: "#modules", label: "Module Paths" },
              { href: "#onboarding", label: "Go Live" },
              { href: "#features", label: "Capabilities" },
              { href: "/journey", label: "Journey" },
              { href: "#pricing", label: "Early Access" },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="shrink-0 rounded-full border border-white/60 bg-white/80 px-3 py-1.5 text-xs text-slate-700"
              >
                {item.label}
              </Link>
            ))}
          </div>
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
                    Built for coffee estates managing processing, labor, and inputs daily
                  </Badge>
                  
                  <h1 className={`${display.className} text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-white text-balance`}>
                    The operating system for profitable, traceable coffee estates
                  </h1>
                  
                  <p className="text-lg text-white/90 leading-relaxed">
                    We built FarmFlow for coffee estate operations, not generic ERP screens.
                    Run intake, processing, labor tracking, consumables issuance, dispatch, and sales from one command center.
                  </p>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {BULLETS.map((bullet) => (
                      <div key={bullet} className="flex items-start gap-2 text-sm text-white/85">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-200" />
                        <span>{bullet}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <Button size="lg" className="bg-white text-[#0f6f66] hover:bg-white/90 font-semibold group shadow-[0_20px_40px_-20px_rgba(255,255,255,0.5)]">
                      <Link href="/signup" className="flex items-center">
                        Request Early Access <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </Link>
                    </Button>
                    <Button size="lg" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm">
                      <Link href="/login">Sign in to your workspace</Link>
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
                      <p className="text-xs text-white/70">Fully traceable</p>
                    </div>
                  </div>
                  <p className="text-xs text-white/60">Illustrative metrics shown for product demonstration.</p>
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
                              <CardDescription>Representative estate · Western Ghats</CardDescription>
                            </div>
                          </div>
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                            Live demo snapshot
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
                          <p className="text-[10px] text-amber-700 mt-1">Labor today: 42 workers · Fuel issued: 180 L</p>
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
                              <Package className="h-3.5 w-3.5 text-blue-600" />
                              <p className="text-[10px] font-medium text-blue-900">Labor + Consumables</p>
                            </div>
                            <p className={`${display.className} text-xl font-bold text-blue-900`}>42</p>
                            <p className="text-[10px] text-blue-700">workers today · ₹1.8L issued this month</p>
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

          <section id="roles" className="mx-auto mt-12 w-full max-w-6xl space-y-6 scroll-mt-24">
            <div className="space-y-2">
              <h2 className={`${display.className} text-3xl font-semibold`}>Purpose-built for every estate role</h2>
              <p className="text-muted-foreground">
                Every team works differently. FarmFlow keeps everyone aligned to one live source of truth.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {ROLE_VALUE_CARDS.map((card) => (
                <Card key={card.title} className="border border-white/70 bg-white/85 backdrop-blur-md">
                  <CardHeader className="space-y-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <card.icon className="h-5 w-5" />
                    </div>
                    <CardTitle className={`${display.className} text-xl`}>{card.title}</CardTitle>
                    <CardDescription>{card.outcome}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    {card.points.map((point) => (
                      <div key={point} className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span>{point}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section id="modules" className="mx-auto mt-12 w-full max-w-6xl space-y-6 scroll-mt-24">
            <div className="space-y-2">
              <h2 className={`${display.className} text-3xl font-semibold`}>Choose the module path that fits your business model</h2>
              <p className="text-muted-foreground">
                Start with essentials or run full operations with processing, labor, consumables, dispatch, and sales.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {MODULE_PATHWAYS.map((pathway) => (
                <Card key={pathway.title} className="border border-white/70 bg-white/85 backdrop-blur-md">
                  <CardHeader className="space-y-3">
                    <CardTitle className={`${display.className} text-xl`}>{pathway.title}</CardTitle>
                    <CardDescription>{pathway.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {pathway.modules.map((moduleName) => (
                      <Badge key={moduleName} variant="secondary" className="bg-emerald-50 text-emerald-800 border-emerald-200">
                        {moduleName}
                      </Badge>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section id="onboarding" className="mx-auto mt-12 w-full max-w-6xl space-y-4 scroll-mt-24">
            <Card className="border border-emerald-200/70 bg-gradient-to-br from-emerald-50/70 to-white/90 backdrop-blur-md">
              <CardHeader>
                <CardTitle className={`${display.className} text-2xl`}>Launch in 7 days, not 7 months</CardTitle>
                <CardDescription>
                  A practical rollout for estates moving from spreadsheets and chat threads to one reliable system.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {WEEK_ONE_PLAN.map((step) => (
                  <div key={step.day} className="rounded-xl border border-emerald-200/60 bg-white/85 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">{step.day}</p>
                    <p className="mt-1 font-semibold text-slate-900">{step.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{step.detail}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <div className="grid gap-3 md:grid-cols-3">
              {ASSURANCE_POINTS.map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-white/70 bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-[0_20px_45px_-35px_rgba(15,23,42,0.5)]"
                >
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                    <span>{item}</span>
                  </div>
                </div>
              ))}
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
                <CardDescription>The signals your team sees before issues impact quality, inventory, or cash.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {LIVE_METRICS.map((metric, index) => (
                  <div key={metric.label} className="rounded-2xl border border-slate-200/60 bg-white/70 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{metric.label}</p>
                    <p className={`${display.className} text-3xl font-semibold text-[color:var(--ink)]`}>
                      {metricValues[index]}
                      {metric.suffix}
                    </p>
                    <p className="text-xs text-muted-foreground">Current season snapshot</p>
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
              Connect field conditions to operational decisions with rainfall, weather, labor, and consumable activity.
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
                  <Package className="h-6 w-6" />
                </div>
                <CardTitle className={`${display.className} text-xl`}>Labor & Input Logs</CardTitle>
                <CardDescription>Track labor attendance, fuel, fertilizers, and processing consumables</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-amber-200 bg-white/70 p-4">
                  <p className="text-2xl font-semibold text-amber-700">Logged</p>
                  <p className="text-xs text-muted-foreground mt-1">Curing and grading can be enabled as secondary records</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="features" className="mx-auto mt-16 w-full max-w-6xl space-y-6 scroll-mt-24 sm:mt-20">
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`${display.className} text-3xl font-semibold`}>One platform for processing, labor, stock, and cash</h2>
              <p className="text-muted-foreground mt-2">
                Run daily workflows, control cost leakage, and improve buyer confidence.
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

        <section id="journey-preview" data-reveal className="mx-auto mt-16 w-full max-w-6xl space-y-6 scroll-mt-24 sm:mt-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <h2 className={`${display.className} text-3xl font-semibold`}>Estate journey, from cherry to buyer</h2>
              <p className="text-muted-foreground max-w-2xl">
                Explore the full workflow on a dedicated page with phase-by-phase guidance and module mapping.
              </p>
            </div>
            <Button asChild>
              <Link href="/journey">Explore Full Journey</Link>
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {ESTATE_JOURNEY.map((step, index) => (
              <Card key={step.title} className="border border-white/70 bg-white/85 backdrop-blur-md">
                <div className="relative h-28 w-full overflow-hidden rounded-t-xl border-b border-emerald-100/60 bg-emerald-50/40">
                  <Image src={step.image} alt={step.alt} fill sizes="(min-width: 1280px) 280px, (min-width: 768px) 50vw, 100vw" className="object-cover" />
                </div>
                <CardHeader className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.25em] text-emerald-700/70">Step {index + 1}</p>
                  <CardTitle className={`${display.className} text-lg`}>{step.title}</CardTitle>
                  <CardDescription>{step.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section
          id="traceability"
          className="mx-auto mt-16 w-full max-w-6xl grid gap-10 lg:grid-cols-2 items-start scroll-mt-24 sm:mt-20"
        >
          <Card className="border border-white/50 bg-white/75 backdrop-blur-md">
            <CardHeader>
              <CardTitle className={`${display.className} text-2xl`}>Traceability that wins buyer confidence</CardTitle>
              <CardDescription>
                Give buyers and auditors a clear, searchable record for every lot and stock movement.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Capture harvest intake, processing output, labor logs, consumables usage, dispatch notes, and sales in one workflow.
              </p>
              <p>
                Create a verifiable chain from estate to buyer with timestamps, user logs, and audit-ready evidence.
              </p>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/70 p-5">
              <p className="text-xs text-emerald-700">Traceability Readiness</p>
              <p className="text-3xl font-semibold text-emerald-700">A+</p>
              <p className="text-xs text-emerald-600">Batch-level audit readiness</p>
            </div>
            <div className="rounded-2xl border border-white/50 bg-white/70 p-5 text-sm text-muted-foreground">
              Export compliance-ready reports in one click and share with buyers in seconds.
            </div>
          </div>
        </section>

        <section
          id="impact"
          data-reveal
          className="mx-auto mt-16 w-full max-w-6xl space-y-6 scroll-mt-24 sm:mt-20"
        >
          <div className="text-center space-y-3">
            <h2 className={`${display.className} text-3xl font-semibold`}>Prove impact with operational evidence</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              FarmFlow turns the operational data you already collect into measurable, decision-ready impact signals.
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
          <Card className="border border-emerald-200/70 bg-gradient-to-br from-emerald-50/70 to-white/90 backdrop-blur-md">
            <CardHeader>
              <Badge className="w-fit border-amber-200 bg-amber-100 text-amber-800">Coming soon</Badge>
              <CardTitle className={`${display.className} text-3xl font-semibold`}>Plans are launching soon</CardTitle>
              <CardDescription>
                We are finalizing rollout packages by estate size and module mix. Register interest and our team will
                contact you with early access options.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Deploy FarmFlow with core operations first, then expand modules as your team scales adoption.
                  Early registrants receive priority onboarding and migration planning support.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Priority onboarding call</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Guidance on module mix for your estate</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Data migration readiness checklist</span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleInterestSubmit} className="rounded-2xl border border-white/80 bg-white/90 p-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="interest-name" className="text-xs uppercase tracking-wide text-muted-foreground">
                      Full name
                    </label>
                    <Input
                      id="interest-name"
                      value={interestForm.name}
                      onChange={(event) => setInterestForm((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="Your name"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="interest-email" className="text-xs uppercase tracking-wide text-muted-foreground">
                      Work email
                    </label>
                    <Input
                      id="interest-email"
                      type="email"
                      value={interestForm.email}
                      onChange={(event) => setInterestForm((prev) => ({ ...prev, email: event.target.value }))}
                      placeholder="name@estate.com"
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="interest-org" className="text-xs uppercase tracking-wide text-muted-foreground">
                      Estate / company
                    </label>
                    <Input
                      id="interest-org"
                      value={interestForm.organization}
                      onChange={(event) => setInterestForm((prev) => ({ ...prev, organization: event.target.value }))}
                      placeholder="HoneyFarm Estate"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="interest-size" className="text-xs uppercase tracking-wide text-muted-foreground">
                      Approx. estate size
                    </label>
                    <Input
                      id="interest-size"
                      value={interestForm.estateSize}
                      onChange={(event) => setInterestForm((prev) => ({ ...prev, estateSize: event.target.value }))}
                      placeholder="Single estate / Multi-estate"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="interest-notes" className="text-xs uppercase tracking-wide text-muted-foreground">
                    Notes
                  </label>
                  <Textarea
                    id="interest-notes"
                    value={interestForm.notes}
                    onChange={(event) => setInterestForm((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="What modules do you want first?"
                    className="min-h-[90px]"
                  />
                </div>
                {interestState === "success" && (
                  <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    Thanks, your interest has been registered.
                  </p>
                )}
                {interestState === "error" && (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {interestError || "Failed to submit interest."}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={interestState === "submitting"}>
                  {interestState === "submitting" ? "Submitting..." : "Request Early Access"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>

        <section id="results" className="mx-auto mt-16 w-full max-w-6xl scroll-mt-24 sm:mt-20">
          <Card className="border border-white/50 bg-white/80 backdrop-blur-md">
            <CardHeader>
              <CardTitle className={`${display.className} text-2xl`}>Ready to modernize your estate operations?</CardTitle>
              <CardDescription>
                Start with one estate, scale across locations, and keep every kilogram traceable.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4 items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Get guided onboarding, module setup, and a dedicated workspace in minutes.
              </div>
              <div className="flex gap-3">
                <Button asChild>
                  <Link href="/signup">Request Access</Link>
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
            <h2 className={`${display.className} text-3xl font-semibold`}>What we stand for</h2>
            <p className="text-muted-foreground mt-2">
              The principles guiding how we build FarmFlow for estates, operators, and buyers.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card id="mission" className="scroll-mt-24 border border-white/50 bg-white/80 backdrop-blur-md">
              <CardHeader>
                <CardTitle className={`${display.className} text-xl`}>Mission</CardTitle>
              <CardDescription>
                  Help coffee estates improve margins, protect quality, and build durable buyer trust through traceability.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
                FarmFlow replaces fragmented tools with one operating system that reconciles every bag, lot, and cost.
                Teams move faster, reduce leakage, and document the practices that reward quality.
            </CardContent>
            </Card>
            <Card id="vision" className="scroll-mt-24 border border-white/50 bg-white/80 backdrop-blur-md">
              <CardHeader>
              <CardTitle className={`${display.className} text-xl`}>Vision</CardTitle>
              <CardDescription>Transparent coffee supply chains where quality and discipline are rewarded.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
                We are building a future where every estate runs with real-time tracking, verified quality, and instant
                visibility for managers, buyers, and auditors.
            </CardContent>
            </Card>
          </div>
        </section>

        <section className="mx-auto mt-16 w-full max-w-6xl space-y-6 sm:mt-20">
          <div>
            <h2 className={`${display.className} text-3xl font-semibold`}>Trust, Privacy & Governance</h2>
            <p className="text-muted-foreground mt-2">Clear commitments for data ownership, access control, and accountability.</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card id="privacy" className="scroll-mt-24 border border-white/50 bg-white/80 backdrop-blur-md">
              <CardHeader>
                <CardTitle className={`${display.className} text-xl`}>Privacy</CardTitle>
                <CardDescription>Your estate data stays private, isolated, and under your control.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-3">
                <p>We do not sell operational data. Every estate runs in its own tenant-isolated workspace.</p>
                <p>Access is role-based with audit trails showing who changed what and when.</p>
                <p>Exports and backups remain under your control, and user access can be revoked at any time.</p>
              </CardContent>
            </Card>
            <Card id="terms" className="scroll-mt-24 border border-white/50 bg-white/80 backdrop-blur-md">
              <CardHeader>
                <CardTitle className={`${display.className} text-xl`}>Terms</CardTitle>
                <CardDescription>Transparent usage with clear responsibilities for both sides.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-3">
                <p>FarmFlow provides operational tooling and reporting, not financial or legal advice.</p>
                <p>Tenant admins are responsible for data quality and user access inside their estate workspace.</p>
                <p>Service updates are communicated in advance and designed to preserve data continuity.</p>
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
                Built for coffee estates today, and extensible to other specialty crops tomorrow.
              </p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <a href="#roles" className="hover:text-foreground">
                Solutions
              </a>
              <a href="#onboarding" className="hover:text-foreground">
                Go Live
              </a>
              <a href="#field-signals" className="hover:text-foreground">
                Field Signals
              </a>
              <a href="#features" className="hover:text-foreground">
                Capabilities
              </a>
              <a href="#modules" className="hover:text-foreground">
                Module Paths
              </a>
              <Link href="/journey" className="hover:text-foreground">
                Journey
              </Link>
              <a href="#impact" className="hover:text-foreground">
                Impact
              </a>
              <a href="#pricing" className="hover:text-foreground">
                Early Access
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
                <p className="text-xs text-muted-foreground">Ask about modules, onboarding, plans, or security.</p>
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
                  placeholder="Ask about modules, plans, onboarding..."
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
