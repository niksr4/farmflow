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
  return (
    <div className="rounded-2xl border border-stone-200/60 bg-gradient-to-r from-stone-50 via-amber-50/30 to-stone-50 px-5 py-3.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100/70 border border-emerald-200/60">
          <svg className="h-3.5 w-3.5 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <span className="text-xs font-black text-stone-800">{fiscalYear.label}</span>
          <span className="ml-2 text-xs text-stone-400">Harvest Season</span>
        </div>
      </div>
      <div className="flex flex-1 items-center gap-3 sm:max-w-xs">
        <div className="relative flex-1 h-1.5 rounded-full bg-stone-200/70 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-emerald-600 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, progress.pct))}%` }}
          />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-stone-500 font-medium">
          {progress.pct}% · {progress.daysRemaining}d left
        </span>
      </div>
      {activityStreak >= 2 && (
        <div className="flex items-center gap-1.5 rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-1.5 shrink-0">
          <span className="text-base leading-none">🔥</span>
          <div>
            <p className="text-xs font-bold text-amber-800">{activityStreak}-day streak</p>
            <p className="text-[10px] text-amber-600">Keep logging daily</p>
          </div>
        </div>
      )}
    </div>
  )
}
