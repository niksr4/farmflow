"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, useInView, useScroll, useTransform } from "framer-motion"
import { ArrowRight, CheckCircle2, Leaf, Shield, Sparkles, Truck, MessageCircle, Send, X, Factory, DollarSign, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const JOURNEY_STEPS = [
  {
    step: "01",
    title: "Fair Harvest Tracking",
    description: "Empower farmers with transparent cherry intake records. Every kilogram is logged by variety and location, ensuring fair payment and recognition for their hard work.",
    icon: Leaf,
    color: "from-emerald-50 to-emerald-100/50",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-700",
    metrics: ["Fair pricing", "Digital receipts", "Zero disputes"],
    image: "/images/coffee-cherry-harvest.jpg",
    advantage: {
      title: "Support Farmer Livelihoods",
      stat: "100%",
      description: "Transparent digital records eliminate disputes and ensure every farmer gets paid fairly for their harvest",
    },
  },
  {
    step: "02",
    title: "Sustainable Processing",
    description: "Optimize processing efficiency while minimizing waste. Track yields through each stage—hulling, washing, drying—to reduce losses and maximize value from every cherry.",
    icon: Factory,
    color: "from-amber-50 to-amber-100/50",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-700",
    metrics: ["Less waste", "Better yields", "Quality grades"],
    image: "/images/coffee-processing.jpg",
    advantage: {
      title: "Reduce Processing Waste",
      stat: "15-20%",
      description: "Smart tracking helps identify inefficiencies, reducing waste and increasing income for farming communities",
    },
  },
  {
    step: "03",
    title: "Responsible Distribution",
    description: "Connect your coffee to conscious buyers with complete traceability. Track every bag from farm to export, building trust and commanding premium prices.",
    icon: Truck,
    color: "from-blue-50 to-blue-100/50",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-700",
    metrics: ["Export-ready", "Buyer trust", "Premium pricing"],
    image: "/images/coffee-dispatch.jpg",
    advantage: {
      title: "Access Premium Markets",
      stat: "30-40%",
      description: "Full traceability opens doors to specialty buyers willing to pay more for ethically sourced coffee",
    },
  },
  {
    step: "04",
    title: "Community Impact",
    description: "See the real impact of your operations. Track not just revenue, but the families supported, the sustainable practices maintained, and the community strengthened.",
    icon: DollarSign,
    color: "from-violet-50 to-violet-100/50",
    iconBg: "bg-violet-100",
    iconColor: "text-violet-700",
    metrics: ["Families supported", "Sustainability score", "Fair trade certified"],
    image: "/images/coffee-farmer.jpg",
    advantage: {
      title: "Measure What Matters",
      stat: "Impact",
      description: "Beyond profit—track the positive change your coffee brings to farming families and their environment",
    },
  },
]

const HIGHLIGHTS = [
  {
    title: "Complete Coffee Traceability",
    description: "Track every KG from cherry intake to clean bean dispatch with a verifiable audit trail for buyers.",
    icon: Shield,
  },
  {
    title: "Arabica & Robusta Management",
    description: "Separate tracking for varieties with cherry, parchment, and clean bean stock across locations.",
    icon: Leaf,
  },
  {
    title: "Hulling & Yield Precision",
    description: "Monitor parchment-to-clean bean conversion rates and spot processing losses by lot and stage.",
    icon: Sparkles,
  },
  {
    title: "Dispatch & Export Records",
    description: "Generate buyer-ready dispatch notes with bag counts, weights, and delivery confirmation.",
    icon: Truck,
  },
]

const BULLETS = [
  "Fair payment & transparent records",
  "Sustainable yield optimization",
  "Direct farmer-to-buyer traceability",
  "Impact measurement & reporting",
]

const HIGHLIGHTS = [
  {
    title: "Empower Coffee Farmers",
    description: "Give farmers the tools they deserve. Digital records ensure fair pricing, transparent transactions, and recognition for quality work.",
    icon: Shield,
  },
  {
    title: "Optimize for Sustainability",
    description: "Track and reduce waste at every stage. Better yields mean more income for farmers while minimizing environmental impact.",
    icon: Leaf,
  },
  {
    title: "Tell Your Coffee's Story",
    description: "Buyers crave authenticity. Show them the journey from specific farms to their cup, building trust and commanding premium prices.",
    icon: Sparkles,
  },
  {
    title: "Measure Real Impact",
    description: "Beyond profit margins—track families supported, sustainable practices adopted, and communities strengthened through your coffee.",
    icon: Truck,
  },
]

const CONTROL_SIGNALS = [
  {
    label: "Farmer Families Supported",
    value: "2,400+",
    description: "Direct beneficiaries through fair tracking",
  },
  {
    label: "Waste Reduction",
    value: "15-20%",
    description: "Less loss through optimized processing",
  },
  {
    label: "Premium Coffee Certified",
    value: "85%",
    description: "Meeting sustainable sourcing standards",
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
    description: "Add dispatch + sales reconciliation for commercial coffee estates.",
    modules: ["Core +", "Dispatch", "Sales", "Rainfall", "Labor Tracking"],
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
      "Coffee inventory, hulling/processing, dispatch, sales, labor, and audits across locations. Full support for Arabica/Robusta varieties, cherry/parchment/clean bean stages, and KG ↔ bag conversion.",
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

// Immersive Hero Section with Parallax
function HeroSection() {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"]
  })
  
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "50%"])
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  
  return (
    <section ref={ref} className="relative h-screen flex items-center justify-center overflow-hidden">
      {/* Parallax Background Image */}
      <motion.div 
        style={{ y }}
        className="absolute inset-0 z-0"
      >
        <Image
          src="/images/coffee-farm-aerial.jpg"
          alt="Aerial view of coffee plantation"
          fill
          className="object-cover"
          priority
          quality={90}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/40 to-background" />
      </motion.div>
      
      {/* Hero Content */}
      <motion.div 
        style={{ opacity }}
        className="relative z-10 px-6 text-center max-w-5xl mx-auto"
      >
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <Badge variant="secondary" className="text-sm px-5 py-2 font-medium mb-6 backdrop-blur-sm bg-background/80">
            Empowering Coffee Farmers Through Technology
          </Badge>
        </motion.div>
        
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="font-display text-5xl md:text-7xl lg:text-8xl font-bold leading-[1.05] text-balance mb-8"
        >
          From their hands<br />to the world
        </motion.h1>
        
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="text-xl md:text-2xl leading-relaxed text-muted-foreground max-w-3xl mx-auto mb-10"
        >
          Support sustainable coffee farming with complete traceability. Fair payments for farmers, premium quality for buyers, and transparency at every step.
        </motion.p>
        
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="flex flex-wrap items-center justify-center gap-4"
        >
          <Button size="lg" asChild className="h-14 px-8 text-lg shadow-xl hover:shadow-2xl transition-shadow">
            <Link href="/signup">
              Get Started <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild className="h-14 px-8 text-lg backdrop-blur-sm bg-background/80">
            <Link href="/login">View Dashboard</Link>
          </Button>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.2 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-16 text-sm"
        >
          {BULLETS.map((item, i) => (
            <motion.div 
              key={item}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 1.2 + i * 0.1 }}
              className="flex flex-col items-center gap-2 backdrop-blur-sm bg-background/60 rounded-xl p-4"
            >
              <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0" />
              <span className="text-center">{item}</span>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
      
      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.5 }}
        style={{ opacity }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10"
      >
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <span className="text-xs uppercase tracking-wider">Scroll to explore</span>
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            className="w-6 h-10 rounded-full border-2 border-muted-foreground/40 flex items-start justify-center p-2"
          >
            <div className="w-1 h-2 bg-muted-foreground/60 rounded-full" />
          </motion.div>
        </div>
      </motion.div>
    </section>
  )
}

// Journey Step Component with scroll animation and alternating layout
function JourneyStepItem({ step, index }: { step: typeof JOURNEY_STEPS[0]; index: number }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })
  const isEven = index % 2 === 0
  
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
      transition={{ duration: 0.6, delay: index * 0.1, ease: "easeOut" }}
      className="relative"
    >
      <div className={`grid lg:grid-cols-2 gap-8 lg:gap-12 items-center ${isEven ? '' : 'lg:flex-row-reverse'}`}>
        {/* Image Side */}
        <motion.div
          initial={{ opacity: 0, x: isEven ? -30 : 30 }}
          animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: isEven ? -30 : 30 }}
          transition={{ duration: 0.6, delay: index * 0.1 + 0.2 }}
          className={`relative ${isEven ? 'lg:order-1' : 'lg:order-2'}`}
        >
          <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border shadow-xl">
            <Image
              src={step.image}
              alt={step.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
          
          {/* Step Number Badge */}
          <div className="absolute -top-4 -left-4 h-16 w-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
            <span className="font-display text-2xl font-bold">{step.step}</span>
          </div>
        </motion.div>
        
        {/* Content Side */}
        <motion.div
          initial={{ opacity: 0, x: isEven ? 30 : -30 }}
          animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: isEven ? 30 : -30 }}
          transition={{ duration: 0.6, delay: index * 0.1 + 0.3 }}
          className={`space-y-6 ${isEven ? 'lg:order-2' : 'lg:order-1'}`}
        >
          <div className="flex items-center gap-4">
            <div className={`h-16 w-16 rounded-2xl ${step.iconBg} ${step.iconColor} flex items-center justify-center shadow-sm`}>
              <step.icon className="h-8 w-8" />
            </div>
            <h3 className="font-display text-4xl font-bold">{step.title}</h3>
          </div>
          
          <p className="text-lg text-muted-foreground leading-relaxed">
            {step.description}
          </p>
          
          <div className="grid grid-cols-3 gap-3">
            {step.metrics.map((metric, metricIndex) => (
              <motion.div 
                key={metric}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.3, delay: index * 0.1 + 0.4 + metricIndex * 0.05 }}
                className={`rounded-xl bg-gradient-to-br ${step.color} border p-4 text-center`}
              >
                <p className="text-sm font-semibold">{metric}</p>
              </motion.div>
            ))}
          </div>
          
          {/* FarmFlow Advantage Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.5, delay: index * 0.1 + 0.6 }}
          >
            <Card className="border-2 border-primary/20 bg-primary/5 backdrop-blur-sm">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="h-6 w-6 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-3">
                      <h4 className="font-display text-xl font-bold">{step.advantage.title}</h4>
                      <Badge variant="secondary" className="text-xs font-bold">{step.advantage.stat}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {step.advantage.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  )
}

// Feature Card with scroll animation
function FeatureCard({ feature, index }: { feature: typeof HIGHLIGHTS[0]; index: number }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-50px" })
  
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <Card className="group border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1 h-full">
        <CardHeader className="space-y-4">
          <motion.div 
            initial={{ scale: 0 }}
            animate={isInView ? { scale: 1 } : { scale: 0 }}
            transition={{ duration: 0.4, delay: index * 0.1 + 0.2, type: "spring" }}
            className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"
          >
            <feature.icon className="h-7 w-7" />
          </motion.div>
          <div className="space-y-2">
            <CardTitle className="text-xl">{feature.title}</CardTitle>
            <CardDescription className="text-base">{feature.description}</CardDescription>
          </div>
        </CardHeader>
      </Card>
    </motion.div>
  )
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
      className="relative min-h-[100svh] overflow-x-hidden bg-gradient-to-b from-background via-secondary/30 to-background"
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
        <header className="fixed top-0 left-0 right-0 z-50 px-6 pt-4 sm:pt-6">
          <nav className="mx-auto flex w-full max-w-7xl flex-col gap-3 rounded-2xl border bg-card/90 px-4 py-3 backdrop-blur-xl shadow-lg sm:flex-row sm:items-center sm:justify-between">
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

        <main className="pb-20">
          <HeroSection />
          
          <section className="mx-auto mt-20 w-full max-w-7xl px-6 grid gap-6 md:grid-cols-3">
            {CONTROL_SIGNALS.map((signal, index) => {
              const ref = useRef(null)
              const isInView = useInView(ref, { once: true, margin: "-50px" })
              
              return (
                <motion.div
                  key={signal.label}
                  ref={ref}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <Card className="border bg-card/50 backdrop-blur-sm hover:shadow-lg transition-shadow">
                    <CardContent className="p-6 space-y-3">
                      <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{signal.label}</p>
                      <p className="font-display text-4xl font-bold text-accent">{signal.value}</p>
                      <p className="text-sm text-muted-foreground">{signal.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </section>

          <section id="journey" className="mx-auto mt-32 w-full max-w-7xl px-6 space-y-20 scroll-mt-24">
            <div className="text-center space-y-4">
              <Badge variant="secondary" className="text-sm px-4 py-1.5">
                The Coffee Journey
              </Badge>
              <h2 className="font-display text-4xl md:text-5xl font-bold text-balance">
                Every bean tells a story of sustainability
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Follow the journey from farmer's harvest to buyer's cup. Track not just transactions, but the positive impact on families, communities, and the environment.
              </p>
            </div>

            <div className="grid gap-20 lg:gap-32">
              {JOURNEY_STEPS.map((step, index) => (
                <JourneyStepItem key={step.step} step={step} index={index} />
              ))}
            </div>

            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-2 border-primary/20 p-8 md:p-12">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
              <div className="relative z-10 text-center space-y-6">
                <div className="flex items-center justify-center gap-4">
                  <Leaf className="h-10 w-10 text-primary" />
                  <Shield className="h-12 w-12 text-primary" />
                  <Leaf className="h-10 w-10 text-primary" />
                </div>
                <h3 className="font-display text-3xl md:text-4xl font-bold">
                  Join the sustainable coffee movement
                </h3>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                  Empower farmers, delight buyers, and prove your commitment to sustainable, ethical coffee production. Every cup starts with transparency.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                  <Button size="lg" asChild>
                    <Link href="/signup">
                      Start Your Journey <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <Link href="/login">See the Platform</Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section className="mx-auto mt-32 w-full max-w-7xl px-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className="border bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="font-display text-2xl">Operations Dashboard</CardTitle>
                <CardDescription>Real-time metrics across your estate</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                {LIVE_METRICS.map((metric, index) => (
                  <div key={metric.label} className="rounded-xl border bg-background p-5 space-y-2">
                    <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{metric.label}</p>
                    <p className="font-display text-4xl font-bold">
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
                <CardTitle className="font-display text-xl">{LIVE_UPDATES[activeUpdateIndex].title}</CardTitle>
                <CardDescription className="text-emerald-700/80">{LIVE_UPDATES[activeUpdateIndex].detail}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-emerald-200 bg-white p-3 text-xs text-emerald-700 font-medium">
                  Updated moments ago
                </div>
              </CardContent>
            </Card>
          </section>

        <section id="features" className="mx-auto mt-32 w-full max-w-7xl px-6 space-y-12 scroll-mt-24">
          <div className="text-center space-y-4">
            <h2 className="font-display text-4xl md:text-5xl font-bold">Built for coffee estate operations</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Everything you need for coffee processing, compliance, and buyer transparency
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {HIGHLIGHTS.map((item, index) => (
              <FeatureCard key={item.title} feature={item} index={index} />
            ))}
          </div>
        </section>

          <section
            id="traceability"
            className="mx-auto mt-32 w-full max-w-7xl px-6 grid gap-10 lg:grid-cols-2 items-center scroll-mt-24"
          >
            <Card className="border bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="font-display text-3xl">Built-in traceability</CardTitle>
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
                <p className="font-display text-5xl font-bold text-emerald-700 mt-2">A+</p>
                <p className="text-sm text-emerald-600 mt-2">Complete batch-level compliance</p>
              </div>
              <Card className="border bg-card">
                <CardContent className="p-6 text-base text-muted-foreground">
                  Export compliance reports instantly and share with buyers in one click
                </CardContent>
              </Card>
            </div>
          </section>

        <section id="pricing" className="mx-auto mt-32 w-full max-w-7xl px-6 space-y-12 scroll-mt-24">
          <div className="text-center space-y-4">
            <h2 className="font-display text-4xl md:text-5xl font-bold">Simple, modular pricing</h2>
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
                    <CardTitle className="font-display text-2xl">{tier.name}</CardTitle>
                    <Badge variant="secondary" className="text-xs">
                      {tier.highlight}
                    </Badge>
                  </div>
                  <p className="font-display text-4xl font-bold">{tier.price}</p>
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
              <CardTitle className="font-display text-3xl md:text-4xl font-bold">
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
            <h2 className="font-display text-4xl font-bold">Our Mission & Vision</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Focused on delivering real outcomes for agricultural operations
            </p>
          </div>
          <div className="grid gap-8 lg:grid-cols-2">
            <Card id="mission" className="scroll-mt-24 border bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="font-display text-2xl">Mission</CardTitle>
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
                <CardTitle className="font-display text-2xl">Vision</CardTitle>
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
            <h2 className="font-display text-4xl font-bold">Privacy & Terms</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Clear commitments for data security and accountability
            </p>
          </div>
          <div className="grid gap-8 lg:grid-cols-2">
            <Card id="privacy" className="scroll-mt-24 border bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="font-display text-2xl">Privacy</CardTitle>
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
                <CardTitle className="font-display text-2xl">Terms</CardTitle>
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
                Empowering coffee farmers with transparent, sustainable operations. Supporting communities, one cup at a time.
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

      <style jsx global>{`
        .coffee-bean {
          position: absolute;
          border-radius: 50% 40%;
          background: linear-gradient(135deg, #6b4423 0%, #3e2816 100%);
          will-change: transform;
          animation: bean-fall linear forwards;
        }

        @keyframes bean-fall {
          from {
            top: -40px;
            transform: translateX(0) rotate(0deg);
          }
          to {
            top: 100vh;
            transform: translateX(calc(var(--drift, 0) * 1px)) rotate(720deg);
          }
        }

        .glow-pulse {
          animation: glow-pulse 6s ease-in-out infinite;
        }

        @keyframes glow-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }

        .soft-shift {
          animation: soft-shift 8s ease-in-out infinite;
        }

        @keyframes soft-shift {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(20px, -10px); }
        }

        .rise-in {
          animation: rise-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) backwards;
        }

        .rise-in-delayed {
          animation: rise-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.15s backwards;
        }

        @keyframes rise-in {
          from {
            opacity: 0;
            transform: translateY(24px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .signal-scan {
          animation: signal-scan 3s ease-in-out infinite;
        }

        @keyframes signal-scan {
          0%, 100% { box-shadow: 0 0 0 0 rgba(120, 119, 198, 0); }
          50% { box-shadow: 0 0 0 4px rgba(120, 119, 198, 0.1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .coffee-bean,
          .glow-pulse,
          .soft-shift,
          .rise-in,
          .rise-in-delayed,
          .signal-scan {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}
