"use client"

import type { CSSProperties } from "react"
import { useEffect, useState, useCallback } from "react"
import { ArrowRight, Droplets, IndianRupee, Users, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency, formatNumber } from "@/lib/format"
import { getSeasonBadge, getSeasonContextLine, isBatchLoggingWindow } from "@/lib/season-utils"
import { format, startOfWeek, endOfWeek } from "date-fns"

type WeekSummary = {
  laborCost: number
  laborEntries: number
  expenseCost: number
  expenseEntries: number
  rainfallInches: number
  rainfallDays: number
  loading: boolean
}

type DailyPulseCardProps = {
  onNavigate: (tab: string) => void
  className?: string
}

const grainStyle: CSSProperties = {
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")",
  opacity: 0.08,
  mixBlendMode: "overlay" as const,
}

function getWeekBounds() {
  const now = new Date()
  const start = startOfWeek(now, { weekStartsOn: 1 }) // Monday
  const end = endOfWeek(now, { weekStartsOn: 1 })     // Sunday
  return {
    startDate: format(start, "yyyy-MM-dd"),
    endDate: format(end, "yyyy-MM-dd"),
    label: `${format(start, "d MMM")} – ${format(end, "d MMM")}`,
  }
}

export default function DailyPulseCard({ onNavigate, className }: DailyPulseCardProps) {
  const [summary, setSummary] = useState<WeekSummary>({
    laborCost: 0, laborEntries: 0,
    expenseCost: 0, expenseEntries: 0,
    rainfallInches: 0, rainfallDays: 0,
    loading: true,
  })

  // Computed client-side only to avoid SSR/client timezone mismatch (server=UTC, client=IST)
  const [week, setWeek] = useState<ReturnType<typeof getWeekBounds> | null>(null)
  const [seasonBadge, setSeasonBadge] = useState<ReturnType<typeof getSeasonBadge> | null>(null)
  const [contextLine, setContextLine] = useState("")
  const [isBatchWindow, setIsBatchWindow] = useState(false)

  useEffect(() => {
    setWeek(getWeekBounds())
    setSeasonBadge(getSeasonBadge())
    setContextLine(getSeasonContextLine())
    setIsBatchWindow(isBatchLoggingWindow())
  }, [])

  const fetchWeekSummary = useCallback(async () => {
    if (!week) return
    try {
      const [laborRes, expenseRes, rainRes] = await Promise.all([
        fetch(`/api/labor-neon?startDate=${week.startDate}&endDate=${week.endDate}&limit=200`),
        fetch(`/api/expenses-neon?startDate=${week.startDate}&endDate=${week.endDate}&limit=200`),
        fetch("/api/rainfall"),
      ])

      const [laborData, expenseData, rainData] = await Promise.all([
        laborRes.json(),
        expenseRes.json(),
        rainRes.json(),
      ])

      let laborCost = 0, laborEntries = 0
      if (laborData.success && Array.isArray(laborData.deployments)) {
        laborEntries = laborData.deployments.length
        laborCost = laborData.deployments.reduce((s: number, d: any) => s + (Number(d.totalCost) || 0), 0)
      }

      let expenseCost = 0, expenseEntries = 0
      if (expenseData.success && Array.isArray(expenseData.deployments)) {
        expenseEntries = expenseData.deployments.length
        expenseCost = expenseData.deployments.reduce((s: number, d: any) => s + (Number(d.amount) || 0), 0)
      }

      let rainfallInches = 0, rainfallDays = 0
      if (rainData.success && Array.isArray(rainData.records)) {
        const weekRecords = rainData.records.filter((r: any) => {
          const d = String(r.record_date || "").slice(0, 10)
          return d >= week.startDate && d <= week.endDate
        })
        rainfallDays = weekRecords.length
        rainfallInches = weekRecords.reduce((s: number, r: any) => {
          return s + (Number(r.inches) || 0) + (Number(r.cents) || 0) / 100
        }, 0)
      }

      setSummary({ laborCost, laborEntries, expenseCost, expenseEntries, rainfallInches, rainfallDays, loading: false })
    } catch {
      setSummary(prev => ({ ...prev, loading: false }))
    }
  }, [week])

  useEffect(() => {
    fetchWeekSummary()
  }, [fetchWeekSummary])

  const badgeColors = {
    amber:   "bg-amber-50 text-amber-700 border-amber-200/80",
    green:   "bg-green-50 text-green-700 border-green-200/80",
    blue:    "bg-blue-50 text-blue-700 border-blue-200/80",
    pink:    "bg-pink-50 text-pink-700 border-pink-200/80",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
  }

  return (
    <div className={cn(
      "relative overflow-hidden rounded-[24px] border border-stone-200/60",
      "bg-white/80 backdrop-blur-2xl backdrop-saturate-200",
      "shadow-[0_8px_32px_-8px_rgba(120,80,30,0.14),0_2px_8px_-4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(200,160,80,0.05),inset_0_1px_0_rgba(255,255,255,0.70)]",
      className,
    )}>
      {/* Grain texture */}
      <div className="pointer-events-none absolute inset-0" style={grainStyle} />
      {/* Top shimmer */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent pointer-events-none" />
      {/* Gradient overlay */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(16,185,129,0.07),_transparent_60%),radial-gradient(ellipse_at_bottom_left,_rgba(14,165,233,0.05),_transparent_55%)] rounded-[24px]" />

      <div className="relative px-4 pt-4 pb-3">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              {seasonBadge && (
                <span className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                  badgeColors[seasonBadge.color],
                )}>
                  {seasonBadge.label}
                </span>
              )}
              {isBatchWindow && (
                <span className="inline-flex items-center gap-1 rounded-full border border-violet-200/80 bg-violet-50 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700">
                  <Zap className="h-2.5 w-2.5" />
                  Log time
                </span>
              )}
            </div>
            {contextLine && <p className="mt-1.5 text-[11px] text-stone-500 leading-relaxed max-w-[240px]">{contextLine}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400 font-semibold">This week</p>
            {week && <p className="text-xs text-stone-500">{week.label}</p>}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mt-2">
          {/* Labour */}
          <button
            type="button"
            onClick={() => onNavigate("accounts")}
            className={cn(
              "group flex flex-col rounded-2xl border border-black/[0.05] p-3 text-left",
              "bg-white/70 backdrop-blur-sm",
              "transition-all duration-200",
              "hover:border-emerald-200/80 hover:bg-emerald-50/60",
              "hover:shadow-[0_4px_16px_-4px_rgba(16,185,129,0.18)]",
              "active:scale-[0.97]",
            )}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <div className={cn(
                "flex h-6 w-6 items-center justify-center rounded-xl transition-all duration-200",
                "bg-emerald-100 group-hover:bg-emerald-200",
                "group-hover:shadow-[0_0_10px_-2px_rgba(16,185,129,0.35)]",
              )}>
                <Users className="h-3 w-3 text-emerald-700" />
              </div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-stone-400 font-semibold">Labour</span>
            </div>
            {summary.loading ? (
              <div className="h-4 w-16 rounded bg-stone-100 animate-pulse" />
            ) : (
              <>
                <p className="text-sm font-bold text-stone-900 tabular-nums leading-tight">
                  {formatCurrency(summary.laborCost)}
                </p>
                <p className="text-[10px] text-stone-400 mt-0.5">{summary.laborEntries} {summary.laborEntries === 1 ? "entry" : "entries"}</p>
              </>
            )}
          </button>

          {/* Expenses */}
          <button
            type="button"
            onClick={() => onNavigate("accounts")}
            className={cn(
              "group flex flex-col rounded-2xl border border-black/[0.05] p-3 text-left",
              "bg-white/70 backdrop-blur-sm",
              "transition-all duration-200",
              "hover:border-amber-200/80 hover:bg-amber-50/60",
              "hover:shadow-[0_4px_16px_-4px_rgba(245,158,11,0.18)]",
              "active:scale-[0.97]",
            )}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <div className={cn(
                "flex h-6 w-6 items-center justify-center rounded-xl transition-all duration-200",
                "bg-amber-100 group-hover:bg-amber-200",
                "group-hover:shadow-[0_0_10px_-2px_rgba(245,158,11,0.35)]",
              )}>
                <IndianRupee className="h-3 w-3 text-amber-700" />
              </div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-stone-400 font-semibold">Expenses</span>
            </div>
            {summary.loading ? (
              <div className="h-4 w-16 rounded bg-stone-100 animate-pulse" />
            ) : (
              <>
                <p className="text-sm font-bold text-stone-900 tabular-nums leading-tight">
                  {formatCurrency(summary.expenseCost)}
                </p>
                <p className="text-[10px] text-stone-400 mt-0.5">{summary.expenseEntries} {summary.expenseEntries === 1 ? "entry" : "entries"}</p>
              </>
            )}
          </button>

          {/* Rainfall */}
          <button
            type="button"
            onClick={() => onNavigate("rainfall")}
            className={cn(
              "group flex flex-col rounded-2xl border border-black/[0.05] p-3 text-left",
              "bg-white/70 backdrop-blur-sm",
              "transition-all duration-200",
              "hover:border-sky-200/80 hover:bg-sky-50/60",
              "hover:shadow-[0_4px_16px_-4px_rgba(14,165,233,0.18)]",
              "active:scale-[0.97]",
            )}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <div className={cn(
                "flex h-6 w-6 items-center justify-center rounded-xl transition-all duration-200",
                "bg-sky-100 group-hover:bg-sky-200",
                "group-hover:shadow-[0_0_10px_-2px_rgba(14,165,233,0.35)]",
              )}>
                <Droplets className="h-3 w-3 text-sky-700" />
              </div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-stone-400 font-semibold">Rain</span>
            </div>
            {summary.loading ? (
              <div className="h-4 w-16 rounded bg-stone-100 animate-pulse" />
            ) : (
              <>
                <p className="text-sm font-bold text-stone-900 tabular-nums leading-tight">
                  {formatNumber(summary.rainfallInches, 2)}&quot;
                </p>
                <p className="text-[10px] text-stone-400 mt-0.5">{summary.rainfallDays} day{summary.rainfallDays === 1 ? "" : "s"} logged</p>
              </>
            )}
          </button>
        </div>

        {/* CTA row */}
        {isBatchWindow && summary.laborEntries === 0 && !summary.loading && (
          <button
            type="button"
            onClick={() => onNavigate("accounts")}
            className={cn(
              "mt-3 w-full flex items-center justify-between rounded-2xl px-4 py-2.5 text-white",
              "bg-gradient-to-br from-emerald-600 to-emerald-700",
              "shadow-[0_4px_16px_-4px_rgba(16,185,129,0.45),inset_0_1px_0_rgba(255,255,255,0.15)]",
              "transition-all hover:from-emerald-500 hover:to-emerald-600 active:scale-[0.98]",
            )}
          >
            <span className="text-sm font-semibold">Log this week&apos;s labour</span>
            <ArrowRight className="h-4 w-4 opacity-80" />
          </button>
        )}
      </div>
    </div>
  )
}
