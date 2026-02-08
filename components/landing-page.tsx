"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Fraunces, Manrope } from "next/font/google"
import { ArrowRight, CheckCircle2, Leaf, Shield, Sparkles, Truck, MessageCircle, Send, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const display = Fraunces({ subsets: ["latin"], weight: ["600", "700", "800"] })
const body = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"] })

const HIGHLIGHTS = [
  {
    title: "Lot-to-Buyer Traceability",
    description: "Every KG and bag is linked from intake to dispatch with a clean audit trail.",
    icon: Shield,
  },
  {
    title: "Inventory & Loss Control",
    description: "Live stock, movement history, and loss signals across every location.",
    icon: Leaf,
  },
  {
    title: "Processing Yield Clarity",
    description: "Track parchment vs cherry yields and spot conversion drops early.",
    icon: Sparkles,
  },
  {
    title: "Dispatch + Sales Reconciliation",
    description: "Know what left the gate, what arrived, and what is still available.",
    icon: Truck,
  },
]

const BULLETS = [
  "Daily intake → dry output reconciliation",
  "Yield and loss by location or lot",
  "Role-based access with audit logs",
  "Buyer-ready exports in one click",
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
    label: "Cash exposure (sample)",
    value: "₹16.2L",
    description: "Receivables + inventory at risk.",
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
    title: "MV Robusta float rate above baseline",
    detail: "Washline check scheduled and lot flagged for review.",
  },
  {
    title: "PG dispatch unconfirmed for 3 days",
    detail: "Reminder sent to logistics team and buyer.",
  },
  {
    title: "HF Arabica yield down vs last week",
    detail: "Conversion review triggered for wet-parch output.",
  },
  {
    title: "Receivables aging flagged",
    detail: "Two buyers crossed 30 days outstanding.",
  },
]

const PRICING_TIERS = [
  {
    name: "Core",
    price: "₹9,900",
    description: "For a single estate that needs daily control and clean reporting.",
    modules: ["Inventory", "Transactions", "Accounts", "Processing"],
    highlight: "Best for first estate",
  },
  {
    name: "Operations",
    price: "₹18,900",
    description: "Add dispatch + sales reconciliation for commercial scale.",
    modules: ["Core +", "Dispatch", "Sales", "Rainfall", "Pepper"],
    highlight: "Most popular",
  },
  {
    name: "Enterprise",
    price: "Custom",
    description: "Multi-estate governance and custom workflows across regions.",
    modules: ["Operations +", "Analytics", "Weather", "News", "Custom Modules"],
    highlight: "Full stack",
  },
]

const CHATBOT_FAQS = [
  {
    id: "capabilities",
    question: "What can FarmFlow track?",
    answer:
      "Inventory, processing, dispatch, sales, labor, and audits across locations. It supports Arabica/Robusta, parchment/cherry outputs, and KG ↔ bag conversion.",
  },
  {
    id: "pricing",
    question: "How does pricing work?",
    answer:
      "Pricing is modular: start with Core, add Dispatch/Sales, and scale to Enterprise for multi-estate governance.",
  },
  {
    id: "onboarding",
    question: "How fast can we get started?",
    answer:
      "Most estates go live in a day: add locations, load inventory, record processing, then start dispatch/sales. Guided onboarding is included.",
  },
  {
    id: "security",
    question: "Is estate data isolated?",
    answer:
      "Yes. Every estate is tenant-isolated with role-based access and audit logs to show who changed what and when.",
  },
  {
    id: "exports",
    question: "Can we export reports?",
    answer:
      "Yes. Export processing, dispatch, and sales records for buyer-ready compliance and internal reconciliation.",
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
    { keys: ["security", "privacy", "tenant", "isolate", "audit"], id: "security" },
    { keys: ["export", "csv", "report"], id: "exports" },
    { keys: ["mobile", "phone", "tablet"], id: "mobile" },
    { keys: ["track", "feature", "capability", "inventory", "processing"], id: "capabilities" },
  ]

  const match = lookup.find((entry) => entry.keys.some((key) => text.includes(key)))
  const faq = CHATBOT_FAQS.find((item) => item.id === match?.id)
  if (faq) return faq.answer

  return "I can help with features, pricing, onboarding, data isolation, exports, and mobile access. Ask me anything about FarmFlow."
}

export default function LandingPage() {
  const beanLayerRef = useRef<HTMLDivElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const messageIdRef = useRef(0)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [draftMessage, setDraftMessage] = useState("")
  const [activeUpdateIndex, setActiveUpdateIndex] = useState(0)
  const [metricValues, setMetricValues] = useState<number[]>(() => LIVE_METRICS.map(() => 0))
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "bot" as const,
      text: "Hi! I can answer questions about FarmFlow features, pricing, onboarding, and data security.",
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
        ["--copper" as any]: "#a45a2a",
        ["--sage" as any]: "#3f6b5d",
        ["--sand" as any]: "#f7efe3",
        ["--ink" as any]: "#1b1a17",
      }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 right-[-6%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_center,rgba(164,90,42,0.45),transparent_70%)] blur-[120px] glow-pulse" />
        <div className="absolute top-[18%] left-[-8%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle_at_center,rgba(63,107,93,0.35),transparent_70%)] blur-[140px] soft-shift" />
        <div className="absolute bottom-[-18%] right-[8%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(247,239,227,0.8),transparent_70%)] blur-[140px]" />
      </div>
      <div ref={beanLayerRef} className="pointer-events-none absolute inset-0 z-30 overflow-hidden" />
      <div className="relative z-10">
        <header className="px-6 pt-4 sm:pt-6">
          <nav className="mx-auto flex w-full max-w-6xl flex-col gap-3 rounded-2xl border border-white/60 bg-white/75 px-3 py-3 backdrop-blur-md shadow-[0_24px_50px_-32px_rgba(15,23,42,0.6)] dark:border-white/10 dark:bg-slate-900/70 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-[color:var(--sand)] text-[color:var(--copper)] flex items-center justify-center shadow-[0_0_25px_rgba(164,90,42,0.35)]">
                <Leaf className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">FarmFlow</p>
                <p className="text-xs text-muted-foreground">Operations OS</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#features" className="hover:text-foreground">
                Features
              </a>
              <a href="#traceability" className="hover:text-foreground">
                Traceability
              </a>
              <a href="#pricing" className="hover:text-foreground">
                Pricing
              </a>
              <a href="#results" className="hover:text-foreground">
                Results
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
          <section className="mx-auto mt-10 w-full max-w-6xl grid gap-12 lg:grid-cols-[1.15fr_0.85fr] items-center sm:mt-16">
            <div className="space-y-6 rise-in">
              <Badge className="border border-white/60 bg-white/70 text-[color:var(--copper)] backdrop-blur-md">
                Estate OS for coffee and specialty crops
              </Badge>
              <h1 className={`${display.className} text-4xl md:text-6xl font-semibold leading-tight text-[color:var(--ink)]`}>
                Know every kilogram, bag, and rupee across your estate.
              </h1>
              <p className="text-lg text-slate-700">
                FarmFlow puts inventory, processing, labor, dispatch, and sales in one operating view. Track Arabica and
                Robusta yields, parchment and cherry outputs, and buyer-ready records without spreadsheet drift.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Button size="lg" asChild className="group shadow-[0_22px_50px_-24px_rgba(164,90,42,0.65)]">
                  <Link href="/signup">
                    Start with your estate <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-0.5" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="border-slate-200">
                  <Link href="/login">View dashboard</Link>
                </Button>
              </div>
              <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                {BULLETS.map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[color:var(--sage)]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative rise-in-delayed">
              <div className="pointer-events-none absolute -inset-6 rounded-[36px] bg-[radial-gradient(circle_at_top,rgba(164,90,42,0.25),transparent_55%)] blur-2xl" />
              <Card className="relative border border-white/60 bg-white/80 backdrop-blur-xl shadow-[0_40px_90px_-50px_rgba(15,23,42,0.9)]">
                <CardHeader>
                  <CardTitle className={`${display.className} text-2xl`}>Command Snapshot</CardTitle>
                  <CardDescription>See every KG, lot, and cost signal in one screen.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-[color:var(--sage)]/20 bg-[color:var(--sand)]/70 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--sage)]">Traceable lots</p>
                    <p className="text-2xl font-semibold text-[color:var(--ink)]">152</p>
                    <p className="text-xs text-slate-600">Sample estate snapshot</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-slate-200/60 bg-white/70 p-3">
                      <p className="text-xs text-muted-foreground">Yield swing</p>
                      <p className="text-lg font-semibold text-[color:var(--copper)]">+8.2%</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 bg-white/70 p-3">
                      <p className="text-xs text-muted-foreground">Revenue protected</p>
                      <p className="text-lg font-semibold text-[color:var(--copper)]">₹16.2L</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200/60 bg-white/70 p-3 text-xs text-muted-foreground">
                    Illustrative data for demo purposes only.
                  </div>
                </CardContent>
              </Card>
              <div className="absolute -bottom-8 -left-4 hidden w-48 rounded-2xl border border-white/70 bg-white/90 p-3 text-xs text-slate-600 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.6)] backdrop-blur-md lg:block">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--sage)]">Lot risk</div>
                <div className="mt-2 text-lg font-semibold text-[color:var(--ink)]">3 alerts</div>
                <div className="mt-1">Losses &gt; 3% flagged instantly.</div>
              </div>
              <div className="absolute -top-8 right-0 hidden w-44 rounded-2xl border border-white/70 bg-white/90 p-3 text-xs text-slate-600 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.6)] backdrop-blur-md lg:block">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--copper)]">Season cash</div>
                <div className="mt-2 text-lg font-semibold text-[color:var(--ink)]">₹24.8L</div>
                <div className="mt-1">Net cash in this FY.</div>
              </div>
            </div>
          </section>

          <section className="mx-auto mt-12 w-full max-w-6xl grid gap-4 md:grid-cols-3">
            {CONTROL_SIGNALS.map((signal) => (
              <div
                key={signal.label}
                className="rounded-2xl border border-white/70 bg-white/75 p-5 shadow-[0_20px_45px_-32px_rgba(164,90,42,0.4)] backdrop-blur-md"
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
                <CardDescription>What owners see before it hits the P&L.</CardDescription>
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

        <section id="features" className="mx-auto mt-16 w-full max-w-6xl space-y-6 scroll-mt-24 sm:mt-20">
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`${display.className} text-3xl font-semibold`}>Everything your estate needs, in one system</h2>
              <p className="text-muted-foreground mt-2">
                Built for day-to-day operations, compliance, and buyer transparency.
              </p>
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {HIGHLIGHTS.map((item) => (
              <Card
                key={item.title}
                className="group border border-white/60 bg-white/75 backdrop-blur-md shadow-[0_16px_40px_-32px_rgba(15,23,42,0.6)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_-32px_rgba(15,23,42,0.75)]"
              >
                <CardHeader className="flex flex-row items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[color:var(--sand)] text-[color:var(--copper)] flex items-center justify-center shadow-[0_0_20px_rgba(164,90,42,0.2)]">
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
          id="traceability"
          className="mx-auto mt-16 w-full max-w-6xl grid gap-10 lg:grid-cols-2 items-start scroll-mt-24 sm:mt-20"
        >
          <Card className="border border-white/50 bg-white/75 backdrop-blur-md">
            <CardHeader>
              <CardTitle className={`${display.className} text-2xl`}>Traceability that earns trust</CardTitle>
              <CardDescription>
                Provide buyers and auditors with a clean, searchable history for every batch.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Record harvest intake, processing outputs, dispatch notes, and sales receipts in a single workflow.
              </p>
              <p>
                Create a verifiable chain from estate to buyer with timestamps, user logs, and standardized reports.
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

        <section id="pricing" className="mx-auto mt-16 w-full max-w-6xl space-y-6 scroll-mt-24 sm:mt-20">
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`${display.className} text-3xl font-semibold`}>Pricing by modules</h2>
              <p className="text-muted-foreground mt-2">
                Start lean, add modules as each estate scales.
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
              <CardTitle className={`${display.className} text-2xl`}>Ready to run a modern estate?</CardTitle>
              <CardDescription>
                Start with one estate, expand to every location, and keep every KG accounted for.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4 items-center justify-between">
              <div className="text-sm text-muted-foreground">
                You will get guided onboarding, module setup, and a dedicated tenant in minutes.
              </div>
              <div className="flex gap-3">
                <Button asChild>
                  <Link href="/signup">Create your estate</Link>
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
              The operating principles that keep FarmFlow focused on real outcomes.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card id="mission" className="scroll-mt-24 border border-white/50 bg-white/80 backdrop-blur-md">
              <CardHeader>
                <CardTitle className={`${display.className} text-xl`}>Mission</CardTitle>
                <CardDescription>Give every estate complete control of stock, yield, and revenue.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                FarmFlow replaces spreadsheets with a live operating system that reconciles every bag, lot, and cost
                across the season. Estates make faster decisions with fewer surprises and stronger buyer trust.
              </CardContent>
            </Card>
            <Card id="vision" className="scroll-mt-24 border border-white/50 bg-white/80 backdrop-blur-md">
              <CardHeader>
                <CardTitle className={`${display.className} text-xl`}>Vision</CardTitle>
                <CardDescription>Transparent supply chains for coffee, tea, cocoa, and specialty crops.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                We want every estate to run with the same clarity as a modern factory: real-time tracking, verified
                quality, and instant visibility for managers, buyers, and auditors.
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
                <CardDescription>Estate data stays private and tenant-isolated.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-3">
                <p>We never sell your operational data. Each estate runs in a separated tenant space.</p>
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
                <p>Admins are responsible for data accuracy and user access within their estate.</p>
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
              <a href="#features" className="hover:text-foreground">
                Features
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
              <a href="#terms" className="hover:text-foreground">
                Terms
              </a>
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
            className="rounded-full shadow-[0_22px_50px_-30px_rgba(164,90,42,0.6)]"
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
