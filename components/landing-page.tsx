"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Fraunces, Manrope } from "next/font/google"
import { ArrowRight, CheckCircle2, Leaf, Shield, Sparkles, Truck, MessageCircle, Send, X, Package, Factory, Send as SendIcon, DollarSign } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const display = Fraunces({ subsets: ["latin"], weight: ["600", "700", "800"] })
const body = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"] })

const JOURNEY_STEPS = [
  {
    step: "01",
    title: "Picking & Intake",
    description: "Record harvest by lot, location, and variety. Track cherry and parchment inputs with automatic weight and bag conversions.",
    icon: Leaf,
    color: "from-emerald-50 to-emerald-100/50",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-700",
    metrics: ["KG tracked", "Lots created", "Quality grade"],
  },
  {
    step: "02",
    title: "Processing & Quality",
    description: "Monitor hulling, washing, drying, and grading stages. Capture yield rates, conversion ratios, and quality scores for every batch.",
    icon: Factory,
    color: "from-amber-50 to-amber-100/50",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-700",
    metrics: ["Yield %", "Loss tracking", "Processing stage"],
  },
  {
    step: "03",
    title: "Dispatch & Logistics",
    description: "Generate dispatch notes with bag counts, weights, and buyer details. Track shipments until delivery confirmation.",
    icon: Truck,
    color: "from-blue-50 to-blue-100/50",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-700",
    metrics: ["Bags dispatched", "Transit status", "Delivery confirmed"],
  },
  {
    step: "04",
    title: "Sales & Settlement",
    description: "Record sales with pricing, payment terms, and buyer reconciliation. Link every transaction back to original lots for full traceability.",
    icon: DollarSign,
    color: "from-violet-50 to-violet-100/50",
    iconBg: "bg-violet-100",
    iconColor: "text-violet-700",
    metrics: ["Revenue tracked", "Payment status", "Lot-to-buyer link"],
  },
]

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
      className={`${body.className} relative min-h-[100svh] overflow-x-hidden bg-gradient-to-b from-background via-secondary/30 to-background`}
      style={{
        ["--copper" as any]: "#a45a2a",
        ["--sage" as any]: "#3f6b5d",
        ["--sand" as any]: "#f7efe3",
        ["--ink" as any]: "#1b1a17",
      }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 right-[-6%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_center,rgba(45,112,89,0.15),transparent_70%)] blur-[120px] glow-pulse" />
        <div className="absolute top-[18%] left-[-8%] h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle_at_center,rgba(188,143,97,0.12),transparent_70%)] blur-[140px] soft-shift" />
        <div className="absolute bottom-[-18%] right-[8%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(45,112,89,0.08),transparent_70%)] blur-[140px]" />
      </div>
      <div ref={beanLayerRef} className="pointer-events-none absolute inset-0 z-30 overflow-hidden" />
      <div className="relative z-10">
        <header className="px-6 pt-4 sm:pt-6">
          <nav className="mx-auto flex w-full max-w-7xl flex-col gap-3 rounded-2xl border bg-card/80 px-4 py-3 backdrop-blur-xl shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
                <Leaf className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-bold">FarmFlow</p>
                <p className="text-xs text-muted-foreground">Operations Platform</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
              <a href="#journey" className="hover:text-foreground transition-colors">
                Journey
              </a>
              <a href="#features" className="hover:text-foreground transition-colors">
                Features
              </a>
              <a href="#pricing" className="hover:text-foreground transition-colors">
                Pricing
              </a>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Login</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/signup">Get Started</Link>
              </Button>
            </div>
          </nav>
        </header>

        <main className="px-6 pb-20">
          <section className="mx-auto mt-16 w-full max-w-7xl grid gap-16 lg:grid-cols-[1.15fr_0.85fr] items-center sm:mt-24">
            <div className="space-y-8 rise-in">
              <Badge variant="secondary" className="text-sm px-4 py-1.5 font-medium">
                Farm Operations Platform
              </Badge>
              <h1 className={`${display.className} text-5xl md:text-7xl font-bold leading-[1.1] text-balance`}>
                Track every kilogram from field to buyer
              </h1>
              <p className="text-xl leading-relaxed text-muted-foreground">
                Complete traceability for specialty crops. From harvest intake through processing, dispatch, and final sale—all in one unified platform.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Button size="lg" asChild className="h-12 px-6 text-base">
                  <Link href="/signup">
                    Get Started <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="h-12 px-6 text-base">
                  <Link href="/login">View Dashboard</Link>
                </Button>
              </div>
              <div className="grid gap-4 text-sm sm:grid-cols-2 pt-4">
                {BULLETS.map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative rise-in-delayed">
              <Card className="relative border bg-card/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className={`${display.className} text-2xl`}>Live Dashboard</CardTitle>
                  <CardDescription>Real-time visibility across operations</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-xl border bg-primary/5 p-5">
                    <p className="text-xs uppercase tracking-wider text-primary font-semibold">Active Lots</p>
                    <p className={`${display.className} text-4xl font-bold mt-2`}>152</p>
                    <p className="text-xs text-muted-foreground mt-1">Fully traceable batches</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border bg-card p-4">
                      <p className="text-xs text-muted-foreground">Yield Rate</p>
                      <p className={`${display.className} text-2xl font-bold text-accent mt-1`}>46.4%</p>
                    </div>
                    <div className="rounded-xl border bg-card p-4">
                      <p className="text-xs text-muted-foreground">Revenue</p>
                      <p className={`${display.className} text-2xl font-bold text-accent mt-1`}>₹24.8L</p>
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                    Sample data for demonstration
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          <section id="journey" className="mx-auto mt-32 w-full max-w-7xl space-y-16 scroll-mt-24">
            <div className="text-center space-y-4">
              <Badge variant="secondary" className="text-sm px-4 py-1.5">
                Complete Traceability
              </Badge>
              <h2 className={`${display.className} text-4xl md:text-5xl font-bold text-balance`}>
                From harvest to sale, tracked at every step
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Follow your crops through the complete journey with full visibility, data capture, and compliance at each stage.
              </p>
            </div>

            <div className="grid gap-8 lg:gap-12">
              {JOURNEY_STEPS.map((step, index) => (
                <div key={step.step} className="relative">
                  {index < JOURNEY_STEPS.length - 1 && (
                    <div className="hidden lg:block absolute left-10 top-24 w-0.5 h-[calc(100%+2rem)] bg-gradient-to-b from-border via-border to-transparent" />
                  )}
                  <div className="grid lg:grid-cols-[auto_1fr] gap-6 lg:gap-10">
                    <div className="flex items-start gap-4 lg:gap-6">
                      <div className="relative">
                        <div className={`h-20 w-20 rounded-2xl ${step.iconBg} ${step.iconColor} flex items-center justify-center shadow-sm`}>
                          <step.icon className="h-9 w-9" />
                        </div>
                        <div className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                          {step.step}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <h3 className={`${display.className} text-3xl font-bold`}>{step.title}</h3>
                        <p className="text-lg text-muted-foreground leading-relaxed">{step.description}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        {step.metrics.map((metric) => (
                          <div key={metric} className={`rounded-xl bg-gradient-to-br ${step.color} border p-4`}>
                            <p className="text-sm font-semibold">{metric}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-primary/5 border-2 border-primary/20 p-8 md:p-12 text-center space-y-4">
              <Shield className="h-12 w-12 text-primary mx-auto" />
              <h3 className={`${display.className} text-2xl md:text-3xl font-bold`}>
                Complete Audit Trail
              </h3>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Every transaction is linked from intake to sale. Generate buyer-ready compliance reports with full lot traceability in seconds.
              </p>
              <Button size="lg" asChild className="mt-4">
                <Link href="/signup">
                  Start Tracking Your Journey <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </section>

          <section className="mx-auto mt-32 w-full max-w-7xl grid gap-6 md:grid-cols-3">
            {CONTROL_SIGNALS.map((signal) => (
              <Card
                key={signal.label}
                className="border bg-card/50 backdrop-blur-sm hover:shadow-lg transition-shadow"
              >
                <CardContent className="p-6 space-y-3">
                  <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{signal.label}</p>
                  <p className={`${display.className} text-4xl font-bold text-accent`}>{signal.value}</p>
                  <p className="text-sm text-muted-foreground">{signal.description}</p>
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="mx-auto mt-20 w-full max-w-7xl grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className="border bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className={`${display.className} text-2xl`}>Operations Dashboard</CardTitle>
                <CardDescription>Real-time metrics across your estate</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                {LIVE_METRICS.map((metric, index) => (
                  <div key={metric.label} className="rounded-xl border bg-background p-5 space-y-2">
                    <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{metric.label}</p>
                    <p className={`${display.className} text-4xl font-bold`}>
                      {metricValues[index]}
                      {metric.suffix}
                    </p>
                    <p className="text-xs text-muted-foreground">Current season</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border border-emerald-200 bg-emerald-50/50">
              <CardHeader>
                <div className="flex items-center gap-2 text-emerald-700 text-xs uppercase tracking-wider font-semibold">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live Updates
                </div>
                <CardTitle className={`${display.className} text-xl`}>{LIVE_UPDATES[activeUpdateIndex].title}</CardTitle>
                <CardDescription className="text-emerald-700/80">{LIVE_UPDATES[activeUpdateIndex].detail}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-emerald-200 bg-white p-3 text-xs text-emerald-700 font-medium">
                  Updated moments ago
                </div>
              </CardContent>
            </Card>
          </section>

        <section id="features" className="mx-auto mt-32 w-full max-w-7xl space-y-12 scroll-mt-24">
          <div className="text-center space-y-4">
            <h2 className={`${display.className} text-4xl md:text-5xl font-bold`}>Powerful features for modern estates</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Built for operations, compliance, and complete buyer transparency
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {HIGHLIGHTS.map((item) => (
              <Card
                key={item.title}
                className="group border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
              >
                <CardHeader className="space-y-4">
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <item.icon className="h-7 w-7" />
                  </div>
                  <div className="space-y-2">
                    <CardTitle className="text-xl">{item.title}</CardTitle>
                    <CardDescription className="text-base">{item.description}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section
          id="traceability"
          className="mx-auto mt-32 w-full max-w-7xl grid gap-10 lg:grid-cols-2 items-center scroll-mt-24"
        >
          <Card className="border bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className={`${display.className} text-3xl`}>Built-in traceability</CardTitle>
              <CardDescription className="text-base">
                Every batch has a complete, verifiable history from harvest to buyer
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-base text-muted-foreground">
              <p>
                Record harvest intake, processing outputs, dispatch notes, and sales receipts in a unified workflow.
              </p>
              <p>
                Generate standardized reports with timestamps, user logs, and quality data that buyers and auditors trust.
              </p>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-8">
              <p className="text-sm font-semibold text-emerald-700 uppercase tracking-wider">Audit Score</p>
              <p className={`${display.className} text-5xl font-bold text-emerald-700 mt-2`}>A+</p>
              <p className="text-sm text-emerald-600 mt-2">Complete batch-level compliance</p>
            </div>
            <Card className="border bg-card">
              <CardContent className="p-6 text-base text-muted-foreground">
                Export compliance reports instantly and share with buyers in one click
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="pricing" className="mx-auto mt-32 w-full max-w-7xl space-y-12 scroll-mt-24">
          <div className="text-center space-y-4">
            <h2 className={`${display.className} text-4xl md:text-5xl font-bold`}>Simple, modular pricing</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Start with essentials and scale as your operations grow
            </p>
          </div>
          <div className="grid gap-8 lg:grid-cols-3">
            {PRICING_TIERS.map((tier) => (
              <Card
                key={tier.name}
                className="border bg-card/50 backdrop-blur-sm hover:shadow-lg transition-shadow"
              >
                <CardHeader className="space-y-4">
                  <div className="flex items-start justify-between">
                    <CardTitle className={`${display.className} text-2xl`}>{tier.name}</CardTitle>
                    <Badge variant="secondary" className="text-xs">
                      {tier.highlight}
                    </Badge>
                  </div>
                  <p className={`${display.className} text-4xl font-bold`}>{tier.price}</p>
                  <CardDescription className="text-base">{tier.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    {tier.modules.map((module) => (
                      <div key={module} className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                        <span className="text-sm">{module}</span>
                      </div>
                    ))}
                  </div>
                  <Button className="w-full" size="lg" asChild>
                    <Link href="/signup">Get Started</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section id="results" className="mx-auto mt-32 w-full max-w-7xl scroll-mt-24">
          <Card className="border-2 bg-primary/5 backdrop-blur-sm">
            <CardHeader className="text-center space-y-4 pb-6">
              <CardTitle className={`${display.className} text-3xl md:text-4xl font-bold`}>
                Ready to transform your operations?
              </CardTitle>
              <CardDescription className="text-lg max-w-2xl mx-auto">
                Start with one estate, scale to multiple locations, and maintain complete accountability
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col md:flex-row gap-6 items-center justify-center">
              <div className="text-center md:text-left">
                <p className="text-base text-muted-foreground">
                  Guided onboarding and dedicated support included
                </p>
              </div>
              <div className="flex gap-4">
                <Button size="lg" asChild>
                  <Link href="/signup">Get Started</Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/login">Sign In</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mx-auto mt-32 w-full max-w-7xl space-y-12">
          <div className="text-center space-y-4">
            <h2 className={`${display.className} text-4xl font-bold`}>Our Mission & Vision</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Focused on delivering real outcomes for agricultural operations
            </p>
          </div>
          <div className="grid gap-8 lg:grid-cols-2">
            <Card id="mission" className="scroll-mt-24 border bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className={`${display.className} text-2xl`}>Mission</CardTitle>
                <CardDescription className="text-base">Complete control of stock, yield, and revenue for every estate</CardDescription>
              </CardHeader>
              <CardContent className="text-base text-muted-foreground space-y-3">
                <p>
                  Replace spreadsheets with a live operating system that reconciles every bag, lot, and cost across the season.
                </p>
                <p>
                  Make faster decisions with fewer surprises and build stronger trust with buyers.
                </p>
              </CardContent>
            </Card>
            <Card id="vision" className="scroll-mt-24 border bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className={`${display.className} text-2xl`}>Vision</CardTitle>
                <CardDescription className="text-base">Transparent supply chains for specialty crops worldwide</CardDescription>
              </CardHeader>
              <CardContent className="text-base text-muted-foreground space-y-3">
                <p>
                  Enable every estate to operate with factory-level clarity and precision.
                </p>
                <p>
                  Real-time tracking, verified quality, and instant visibility for managers, buyers, and auditors.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mx-auto mt-32 w-full max-w-7xl space-y-12 pb-20">
          <div className="text-center space-y-4">
            <h2 className={`${display.className} text-4xl font-bold`}>Privacy & Terms</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Clear commitments for data security and accountability
            </p>
          </div>
          <div className="grid gap-8 lg:grid-cols-2">
            <Card id="privacy" className="scroll-mt-24 border bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className={`${display.className} text-2xl`}>Privacy</CardTitle>
                <CardDescription className="text-base">Your data stays private and fully isolated</CardDescription>
              </CardHeader>
              <CardContent className="text-base text-muted-foreground space-y-4">
                <p>We never sell operational data. Each estate operates in a separate tenant space.</p>
                <p>Role-based access with complete audit logs showing who changed what and when.</p>
                <p>Full control over exports and backups with instant user access revocation.</p>
              </CardContent>
            </Card>
            <Card id="terms" className="scroll-mt-24 border bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className={`${display.className} text-2xl`}>Terms</CardTitle>
                <CardDescription className="text-base">Clear usage terms and responsibilities</CardDescription>
              </CardHeader>
              <CardContent className="text-base text-muted-foreground space-y-4">
                <p>Operational tooling and reporting—not financial advice or guarantees.</p>
                <p>Estate admins maintain responsibility for data accuracy and user access.</p>
                <p>Updates communicated in advance with data protection as priority.</p>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

        <footer className="border-t bg-card/50 backdrop-blur-sm">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-12 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                  <Leaf className="h-4 w-4" />
                </div>
                <p className="text-base font-bold">FarmFlow</p>
              </div>
              <p className="text-sm text-muted-foreground max-w-sm">
                Modern operations platform for specialty crop estates
              </p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <a href="#journey" className="text-muted-foreground hover:text-foreground transition-colors">
                Journey
              </a>
              <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
                Features
              </a>
              <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">
                Pricing
              </a>
              <a href="#mission" className="text-muted-foreground hover:text-foreground transition-colors">
                Mission
              </a>
              <a href="#privacy" className="text-muted-foreground hover:text-foreground transition-colors">
                Privacy
              </a>
              <a href="#terms" className="text-muted-foreground hover:text-foreground transition-colors">
                Terms
              </a>
            </div>
          </div>
        </footer>
      </div>

      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {isChatOpen && (
          <div className="w-[340px] sm:w-[380px] rounded-2xl border bg-card shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <p className="text-base font-bold">FarmFlow Assistant</p>
                <p className="text-xs text-muted-foreground">Ask about features or pricing</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsChatOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="max-h-[340px] overflow-y-auto px-5 py-4 text-sm">
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-xl px-4 py-3 ${message.role === "user" ? "ml-auto bg-primary text-primary-foreground max-w-[85%]" : "bg-muted max-w-[90%]"}`}
                  >
                    {message.text}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            </div>
            <div className="border-t px-5 py-4">
              <div className="flex flex-wrap gap-2 pb-3">
                {CHATBOT_FAQS.slice(0, 3).map((faq) => (
                  <button
                    key={faq.id}
                    onClick={() => sendMessage(faq.question)}
                    className="rounded-full border bg-background px-3 py-1.5 text-xs hover:bg-muted transition-colors"
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
                  placeholder="Ask a question..."
                  className="flex-1 rounded-full border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <Button size="icon" type="submit" className="rounded-full h-10 w-10">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        )}
        {!isChatOpen && (
          <Button
            size="lg"
            className="rounded-full shadow-lg h-14 px-6"
            onClick={() => setIsChatOpen(true)}
          >
            <MessageCircle className="mr-2 h-5 w-5" />
            Questions?
          </Button>
        )}
      </div>
    </div>
  )
}
