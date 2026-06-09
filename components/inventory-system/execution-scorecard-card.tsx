"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Status = "good" | "attention" | "blocked"

type Check = {
  id: string
  title: string
  goal: string
  metric: string
  status: Status
  actionLabel: string
  actionTab: string
}

const TONE: Record<Status, string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-700",
  attention: "border-amber-200 bg-amber-50 text-amber-700",
  blocked: "border-stone-200 bg-stone-100 text-stone-500",
}

const LABEL: Record<Status, string> = {
  good: "On track",
  attention: "Action needed",
  blocked: "Not active",
}

type Props = {
  checks: Check[]
  onAction: (check: Check) => void
}

export default function ExecutionScorecardCard({ checks, onAction }: Props) {
  const needsAttention = checks.filter(c => c.status === "attention").length
  const passing = checks.filter(c => c.status === "good").length
  const total = checks.length
  const [expanded, setExpanded] = useState(false)
  const isOpen = expanded || needsAttention > 0

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card">
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-stone-50/60 transition-colors dark:hover:bg-white/[0.02]"
        onClick={() => setExpanded(v => !v)}
      >
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-500">Performance</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-sm font-bold text-stone-900 dark:text-white">Execution Scorecard</p>
            {needsAttention > 0 ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                {needsAttention} action needed
              </span>
            ) : (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                {passing}/{total} on track
              </span>
            )}
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-stone-400 transition-transform shrink-0 ml-3", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <div className="space-y-3 border-t border-stone-100 p-5 dark:border-white/[0.05]">
          {checks.map((check) => (
            <div key={check.id} className="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.02]">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-neutral-900">{check.title}</p>
                  <p className="text-xs text-muted-foreground">{check.goal}</p>
                </div>
                <Badge variant="outline" className={cn("w-fit", TONE[check.status])}>
                  {LABEL[check.status]}
                </Badge>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-neutral-700">{check.metric}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full bg-white sm:w-auto"
                  onClick={() => onAction(check)}
                >
                  {check.actionLabel}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
