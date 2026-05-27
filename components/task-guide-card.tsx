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
    bullet: string
  }
> = {
  operations: {
    card: "border-emerald-200/60 bg-gradient-to-br from-stone-50 via-emerald-50/60 to-stone-50/80",
    badge: "border-emerald-200/80 bg-emerald-100/90 text-emerald-700",
    tip: "border-emerald-200/60 bg-emerald-50/60 text-emerald-900",
    icon: "border border-emerald-200/60 bg-emerald-100/70 text-emerald-700",
    accent: "bg-emerald-500",
    chevron: "text-emerald-600 hover:bg-emerald-50",
    bullet: "border-stone-200/50 bg-stone-50/70",
  },
  finance: {
    card: "border-amber-200/60 bg-gradient-to-br from-amber-50/70 via-stone-50 to-amber-50/40",
    badge: "border-amber-200/80 bg-amber-100/90 text-amber-700",
    tip: "border-amber-200/60 bg-amber-50/60 text-amber-950",
    icon: "border border-amber-200/60 bg-amber-100/70 text-amber-700",
    accent: "bg-amber-500",
    chevron: "text-amber-600 hover:bg-amber-50",
    bullet: "border-stone-200/50 bg-stone-50/70",
  },
  settings: {
    card: "border-stone-200/70 bg-gradient-to-br from-stone-50 via-stone-100/50 to-stone-50/80",
    badge: "border-stone-200/80 bg-stone-100/90 text-stone-700",
    tip: "border-stone-200/60 bg-stone-100/60 text-stone-900",
    icon: "border border-stone-200/60 bg-stone-100/70 text-stone-600",
    accent: "bg-stone-500",
    chevron: "text-stone-600 hover:bg-stone-50",
    bullet: "border-stone-200/50 bg-stone-50/70",
  },
  onboarding: {
    card: "border-sky-200/60 bg-gradient-to-br from-stone-50 via-sky-50/60 to-stone-50/80",
    badge: "border-sky-200/80 bg-sky-100/90 text-sky-700",
    tip: "border-sky-200/60 bg-sky-50/60 text-sky-950",
    icon: "border border-sky-200/60 bg-sky-100/70 text-sky-700",
    accent: "bg-sky-500",
    chevron: "text-sky-600 hover:bg-sky-50",
    bullet: "border-stone-200/50 bg-stone-50/70",
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

  const [collapsed, setCollapsed] = useState(true)
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
            <CardDescription className="max-w-2xl text-sm leading-relaxed text-stone-600">{description}</CardDescription>
          </div>
        )}
        {isCollapsed && (
          <p className="text-sm text-stone-500">{title}</p>
        )}
      </CardHeader>
      {!isCollapsed && (
        <CardContent className="space-y-4 pt-0">
          <ul className="space-y-2 text-sm text-stone-700">
            {bullets.map((bullet) => (
              <li key={bullet} className={cn("flex gap-3 rounded-2xl border px-3.5 py-3 shadow-sm", toneStyle.bullet)}>
                <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", toneStyle.icon)}>
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <span className="leading-relaxed text-stone-700">{bullet}</span>
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
