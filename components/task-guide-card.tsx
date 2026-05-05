"use client"

import { useState, useEffect, type ReactNode } from "react"
import { CheckCircle2, ChevronDown, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type TaskGuideTone = "operations" | "finance" | "settings" | "onboarding"

type TaskGuideCardProps = {
  eyebrow: string
  title: string
  description: string
  bullets: string[]
  tip?: string
  tone?: TaskGuideTone
  className?: string
  actions?: ReactNode
}

const toneStyles: Record<
  TaskGuideTone,
  {
    card: string
    badge: string
    tip: string
    icon: string
    accent: string
    chevron: string
  }
> = {
  operations: {
    card: "border-emerald-200/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.95)_0%,rgba(255,255,255,0.98)_100%)]",
    badge: "border-emerald-200 bg-white text-emerald-700",
    tip: "border-emerald-100 bg-white/85 text-emerald-900",
    icon: "border border-emerald-100 bg-emerald-50 text-emerald-600",
    accent: "bg-emerald-500",
    chevron: "text-emerald-600 hover:bg-emerald-50",
  },
  finance: {
    card: "border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.95)_0%,rgba(255,255,255,0.98)_100%)]",
    badge: "border-amber-200 bg-white text-amber-700",
    tip: "border-amber-100 bg-white/85 text-amber-950",
    icon: "border border-amber-100 bg-amber-50 text-amber-600",
    accent: "bg-amber-500",
    chevron: "text-amber-600 hover:bg-amber-50",
  },
  settings: {
    card: "border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(255,255,255,0.98)_100%)]",
    badge: "border-slate-200 bg-white text-slate-700",
    tip: "border-slate-200 bg-white/85 text-slate-900",
    icon: "border border-slate-200 bg-slate-50 text-slate-600",
    accent: "bg-slate-500",
    chevron: "text-slate-600 hover:bg-slate-50",
  },
  onboarding: {
    card: "border-cyan-200/80 bg-[linear-gradient(180deg,rgba(236,254,255,0.96)_0%,rgba(255,255,255,0.98)_100%)]",
    badge: "border-cyan-200 bg-white text-cyan-700",
    tip: "border-cyan-100 bg-white/85 text-cyan-950",
    icon: "border border-cyan-100 bg-cyan-50 text-cyan-600",
    accent: "bg-cyan-500",
    chevron: "text-cyan-600 hover:bg-cyan-50",
  },
}

const storageKey = (eyebrow: string) =>
  `farmflow_guide_collapsed:${eyebrow.toLowerCase().replace(/\s+/g, "-")}`

export default function TaskGuideCard({
  eyebrow,
  title,
  description,
  bullets,
  tip,
  tone = "operations",
  className,
  actions,
}: TaskGuideCardProps) {
  const toneStyle = toneStyles[tone]
  const key = storageKey(eyebrow)

  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      setCollapsed(localStorage.getItem(key) === "1")
    } catch {
      // localStorage unavailable
    }
  }, [key])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      if (next) {
        localStorage.setItem(key, "1")
      } else {
        localStorage.removeItem(key)
      }
    } catch {
      // localStorage unavailable
    }
  }

  // Avoid layout shift on SSR — render expanded until client hydrates
  const isCollapsed = mounted && collapsed

  return (
    <Card className={cn("relative overflow-hidden shadow-[0_18px_48px_-36px_rgba(15,23,42,0.32)]", toneStyle.card, className)}>
      <div className={cn("absolute inset-x-0 top-0 h-1", toneStyle.accent)} />
      {!isCollapsed && (
        <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.8),_transparent_60%)] opacity-70" />
      )}
      <CardHeader className="relative space-y-3 pb-4 pt-5 sm:pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Badge variant="outline" className={toneStyle.badge}>
            {eyebrow}
          </Badge>
          <div className="flex items-center gap-2">
            {actions && !isCollapsed ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
            <button
              type="button"
              onClick={toggle}
              aria-label={isCollapsed ? "Show guide" : "Hide guide"}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                toneStyle.chevron,
              )}
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform duration-200", isCollapsed && "-rotate-180")}
              />
              {isCollapsed ? "Show guide" : "Hide"}
            </button>
          </div>
        </div>
        {!isCollapsed && (
          <div className="space-y-2">
            <CardTitle className="text-lg leading-tight">{title}</CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-relaxed text-slate-700">{description}</CardDescription>
          </div>
        )}
        {isCollapsed && (
          <p className="text-sm text-slate-500">{title}</p>
        )}
      </CardHeader>
      {!isCollapsed && (
        <CardContent className="space-y-4 pt-0">
          <ul className="space-y-2 text-sm text-slate-700">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex gap-3 rounded-2xl border border-white/80 bg-white/80 px-3.5 py-3 shadow-sm">
                <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", toneStyle.icon)}>
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <span className="leading-relaxed text-slate-700">{bullet}</span>
              </li>
            ))}
          </ul>
          {tip ? (
            <div className={cn("rounded-2xl border p-4 text-xs leading-relaxed shadow-sm", toneStyle.tip)}>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-current/65">
                <Sparkles className="h-3.5 w-3.5" />
                Tip
              </div>
              <p>{tip}</p>
            </div>
          ) : null}
        </CardContent>
      )}
    </Card>
  )
}
