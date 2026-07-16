import type React from "react"
import { cn } from "@/lib/utils"

export type StatTileTone = "default" | "emerald" | "sky" | "amber" | "rose"

const TILE_TONES: Record<StatTileTone, string> = {
  default: "bg-stone-50 border-stone-100 dark:bg-white/[0.02] dark:border-white/[0.05]",
  emerald: "bg-emerald-50 border-emerald-100 dark:bg-emerald-500/[0.06] dark:border-emerald-500/[0.15]",
  sky: "bg-sky-50 border-sky-100 dark:bg-sky-500/[0.06] dark:border-sky-500/[0.15]",
  amber: "bg-amber-50 border-amber-100 dark:bg-amber-500/[0.06] dark:border-amber-500/[0.15]",
  rose: "bg-rose-50 border-rose-100 dark:bg-rose-500/[0.06] dark:border-rose-500/[0.15]",
}

const LABEL_TONES: Record<StatTileTone, string> = {
  default: "text-stone-500 dark:text-stone-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  sky: "text-sky-600 dark:text-sky-400",
  amber: "text-amber-600 dark:text-amber-400",
  rose: "text-rose-600 dark:text-rose-400",
}

/**
 * Single source of truth for the small stat cards used across tabs:
 * uppercase label, big tabular value, optional hint line and leading icon.
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "default",
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  tone?: StatTileTone
  className?: string
}) {
  return (
    <div className={cn("rounded-2xl border p-3.5", TILE_TONES[tone], className)}>
      <div className="mb-2 flex items-center gap-1.5">
        {icon}
        <p className={cn("text-[10px] font-bold uppercase tracking-wide", LABEL_TONES[tone])}>{label}</p>
      </div>
      <p className="text-xl font-black tabular-nums text-stone-900 dark:text-white">{value}</p>
      {hint != null && <p className="mt-1 text-[10px] text-stone-400 dark:text-stone-500">{hint}</p>}
    </div>
  )
}
