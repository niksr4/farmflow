"use client"

import type { FiscalYear } from "@/lib/fiscal-year-utils"

type SeasonProgress = {
  pct: number
  daysRemaining: number
}

type SeasonProgressStripProps = {
  fiscalYear: FiscalYear
  progress: SeasonProgress
  activityStreak: number
}

export default function SeasonProgressStrip({ fiscalYear, progress, activityStreak }: SeasonProgressStripProps) {
  const pct = Math.min(100, Math.max(0, progress.pct))

  return (
    <div className="mb-1 flex flex-col gap-3 overflow-hidden rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06] dark:bg-card">
      {/* Season label */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-800 dark:bg-emerald-900/40">
          <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">Harvest Season</p>
          <p className="text-sm font-black text-stone-900 dark:text-white">{fiscalYear.label}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex flex-1 items-center gap-4 sm:max-w-sm">
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-white/[0.07]">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-emerald-700 transition-all dark:bg-emerald-600"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="shrink-0 text-right">
          <span className="text-sm font-black tabular-nums text-stone-900 dark:text-white">{pct}%</span>
          <span className="ml-1.5 text-xs font-medium tabular-nums text-stone-500">{progress.daysRemaining}d left</span>
        </div>
      </div>

      {/* Streak badge */}
      {activityStreak >= 2 && (
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-amber-200/80 bg-amber-50 px-3.5 py-2 dark:border-amber-700/40 dark:bg-amber-900/20">
          <span className="text-lg leading-none">🔥</span>
          <div>
            <p className="text-xs font-black text-amber-800 dark:text-amber-300">{activityStreak}-day streak</p>
            <p className="text-[10px] text-amber-600 dark:text-amber-400">Keep logging daily</p>
          </div>
        </div>
      )}
    </div>
  )
}
