"use client"

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
    amber: "bg-amber-100 text-amber-800 border-amber-200",
    green: "bg-green-100 text-green-800 border-green-200",
    blue: "bg-blue-100 text-blue-800 border-blue-200",
    pink: "bg-pink-100 text-pink-800 border-pink-200",
    emerald: "bg-emerald-100 text-emerald-800 border-emerald-200",
  }

  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl border border-black/[0.06]",
      "bg-white/60 backdrop-blur-xl backdrop-saturate-150",
      "shadow-[0_8px_32px_-8px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.04)]",
      className,
    )}>
      {/* Subtle gradient overlay */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-50/40 via-transparent to-sky-50/30 rounded-2xl" />

      <div className="relative px-4 pt-4 pb-3">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              {seasonBadge && (
                <span className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  badgeColors[seasonBadge.color],
                )}>
                  {seasonBadge.label}
                </span>
              )}
              {isBatchWindow && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 border border-violet-200 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                  <Zap className="h-2.5 w-2.5" />
                  Log time
                </span>
              )}
            </div>
            {contextLine && <p className="mt-1.5 text-[11px] text-neutral-500 leading-relaxed max-w-[240px]">{contextLine}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">This week</p>
            {week && <p className="text-xs text-neutral-500">{week.label}</p>}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mt-2">
          {/* Labor */}
          <button
            type="button"
            onClick={() => onNavigate("accounts")}
            className="group flex flex-col rounded-xl border border-black/[0.05] bg-white/70 backdrop-blur-sm p-3 text-left transition-all hover:bg-emerald-50/80 hover:border-emerald-200 hover:shadow-sm active:scale-[0.97]"
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 group-hover:bg-emerald-200 transition-colors">
                <Users className="h-3 w-3 text-emerald-700" />
              </div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-neutral-400">Labor</span>
            </div>
            {summary.loading ? (
              <div className="h-4 w-16 rounded bg-neutral-100 animate-pulse" />
            ) : (
              <>
                <p className="text-sm font-bold text-neutral-900 tabular-nums leading-tight">
                  {formatCurrency(summary.laborCost)}
                </p>
                <p className="text-[10px] text-neutral-400 mt-0.5">{summary.laborEntries} entr{summary.laborEntries === 1 ? "y" : "ies"}</p>
              </>
            )}
          </button>

          {/* Expenses */}
          <button
            type="button"
            onClick={() => onNavigate("accounts")}
            className="group flex flex-col rounded-xl border border-black/[0.05] bg-white/70 backdrop-blur-sm p-3 text-left transition-all hover:bg-amber-50/80 hover:border-amber-200 hover:shadow-sm active:scale-[0.97]"
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 group-hover:bg-amber-200 transition-colors">
                <IndianRupee className="h-3 w-3 text-amber-700" />
              </div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-neutral-400">Expenses</span>
            </div>
            {summary.loading ? (
              <div className="h-4 w-16 rounded bg-neutral-100 animate-pulse" />
            ) : (
              <>
                <p className="text-sm font-bold text-neutral-900 tabular-nums leading-tight">
                  {formatCurrency(summary.expenseCost)}
                </p>
                <p className="text-[10px] text-neutral-400 mt-0.5">{summary.expenseEntries} entr{summary.expenseEntries === 1 ? "y" : "ies"}</p>
              </>
            )}
          </button>

          {/* Rainfall */}
          <button
            type="button"
            onClick={() => onNavigate("rainfall")}
            className="group flex flex-col rounded-xl border border-black/[0.05] bg-white/70 backdrop-blur-sm p-3 text-left transition-all hover:bg-sky-50/80 hover:border-sky-200 hover:shadow-sm active:scale-[0.97]"
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-100 group-hover:bg-sky-200 transition-colors">
                <Droplets className="h-3 w-3 text-sky-700" />
              </div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-neutral-400">Rain</span>
            </div>
            {summary.loading ? (
              <div className="h-4 w-16 rounded bg-neutral-100 animate-pulse" />
            ) : (
              <>
                <p className="text-sm font-bold text-neutral-900 tabular-nums leading-tight">
                  {formatNumber(summary.rainfallInches, 2)}&quot;
                </p>
                <p className="text-[10px] text-neutral-400 mt-0.5">{summary.rainfallDays} day{summary.rainfallDays === 1 ? "" : "s"} logged</p>
              </>
            )}
          </button>
        </div>

        {/* CTA row */}
        {isBatchWindow && summary.laborEntries === 0 && !summary.loading && (
          <button
            type="button"
            onClick={() => onNavigate("accounts")}
            className="mt-3 w-full flex items-center justify-between rounded-xl bg-emerald-700 px-3 py-2.5 text-white transition-all hover:bg-emerald-800 active:scale-[0.98] shadow-sm"
          >
            <span className="text-sm font-medium">Log this week&apos;s labor</span>
            <ArrowRight className="h-4 w-4 opacity-80" />
          </button>
        )}
      </div>
    </div>
  )
}
