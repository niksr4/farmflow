import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  }
> = {
  operations: {
    card: "border-emerald-200 bg-emerald-50/60",
    badge: "border-emerald-200 bg-white text-emerald-700",
    tip: "border-emerald-100 bg-white/80 text-emerald-900",
  },
  finance: {
    card: "border-amber-200 bg-amber-50/60",
    badge: "border-amber-200 bg-white text-amber-700",
    tip: "border-amber-100 bg-white/80 text-amber-950",
  },
  settings: {
    card: "border-slate-200 bg-slate-50/80",
    badge: "border-slate-200 bg-white text-slate-700",
    tip: "border-slate-200 bg-white/80 text-slate-900",
  },
  onboarding: {
    card: "border-cyan-200 bg-cyan-50/60",
    badge: "border-cyan-200 bg-white text-cyan-700",
    tip: "border-cyan-100 bg-white/80 text-cyan-950",
  },
}

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

  return (
    <Card className={cn("shadow-sm", toneStyle.card, className)}>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="outline" className={toneStyle.badge}>
            {eyebrow}
          </Badge>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        <div className="space-y-2">
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription className="text-sm text-slate-700">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="ml-4 list-disc space-y-1 text-sm text-slate-700">
          {bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
        {tip ? <div className={cn("rounded-xl border p-3 text-xs", toneStyle.tip)}>{tip}</div> : null}
      </CardContent>
    </Card>
  )
}
