import type { ReactNode } from "react"
import { CheckCircle2 } from "lucide-react"

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
    icon: string
  }
> = {
  operations: {
    card: "border-emerald-200 bg-emerald-50/60 border-t-4 border-t-emerald-500",
    badge: "border-emerald-200 bg-white text-emerald-700",
    tip: "border-emerald-100 bg-white/80 text-emerald-900",
    icon: "text-emerald-600",
  },
  finance: {
    card: "border-amber-200 bg-amber-50/60 border-t-4 border-t-amber-500",
    badge: "border-amber-200 bg-white text-amber-700",
    tip: "border-amber-100 bg-white/80 text-amber-950",
    icon: "text-amber-600",
  },
  settings: {
    card: "border-slate-200 bg-slate-50/80 border-t-4 border-t-slate-500",
    badge: "border-slate-200 bg-white text-slate-700",
    tip: "border-slate-200 bg-white/80 text-slate-900",
    icon: "text-slate-600",
  },
  onboarding: {
    card: "border-cyan-200 bg-cyan-50/60 border-t-4 border-t-cyan-500",
    badge: "border-cyan-200 bg-white text-cyan-700",
    tip: "border-cyan-100 bg-white/80 text-cyan-950",
    icon: "text-cyan-600",
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
    <Card className={cn("overflow-hidden shadow-sm", toneStyle.card, className)}>
      <CardHeader className="space-y-3 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Badge variant="outline" className={toneStyle.badge}>
            {eyebrow}
          </Badge>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        <div className="space-y-2">
          <CardTitle className="text-lg leading-tight">{title}</CardTitle>
          <CardDescription className="max-w-2xl text-sm leading-relaxed text-slate-700">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <ul className="space-y-2 text-sm text-slate-700">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex gap-2.5">
              <CheckCircle2 className={cn("mt-0.5 h-4 w-4 shrink-0", toneStyle.icon)} />
              <span className="leading-relaxed">{bullet}</span>
            </li>
          ))}
        </ul>
        {tip ? <div className={cn("rounded-2xl border p-3.5 text-xs leading-relaxed", toneStyle.tip)}>{tip}</div> : null}
      </CardContent>
    </Card>
  )
}
