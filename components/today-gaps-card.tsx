"use client"

/**
 * TodayGapsCard — mobile home screen primary widget.
 *
 * Design principles:
 *  - Phone-first, 360px+. Nothing that requires a desktop.
 *  - Immediate signal: color and icon tell the story before the user reads anything.
 *  - Two clear states: "something needs logging" (amber) vs "all caught up" (green).
 *  - Every tap target is at least 56px tall — works with dirty hands, bright sunlight.
 *  - Labels are 1–3 words max. Numbers are large.
 */

import { useCallback, useEffect, useState } from "react"
import { addDays, format, isToday, startOfWeek } from "date-fns"
import { reportActionError } from "@/lib/track-action"
import { AlertTriangle, ArrowRight, Check, CloudRain, Droplets, Loader2, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency, formatNumber } from "@/lib/format"
import { getSeasonBadge } from "@/lib/season-utils"

type GapDay = { date: string; label: string; isToday: boolean }

type WeekStats = {
  laborCost: number
  expenseCost: number
  rainfallInches: number
  rainfallDays: number
}

type Props = { onNavigate: (tab: string) => void; className?: string }

function getWeekRange() {
  const start = startOfWeek(new Date(), { weekStartsOn: 1 })
  return {
    startDate: format(start, "yyyy-MM-dd"),
    endDate: format(addDays(start, 6), "yyyy-MM-dd"),
    days: Array.from({ length: 7 }, (_, i) => addDays(start, i)),
  }
}

export default function TodayGapsCard({ onNavigate, className }: Props) {
  const [gaps, setGaps] = useState<GapDay[]>([])
  const [stats, setStats] = useState<WeekStats | null>(null)
  const [loading, setLoading] = useState(true)
  const seasonBadge = getSeasonBadge()

  const fetchData = useCallback(async () => {
    const { startDate, endDate, days } = getWeekRange()
    try {
      const [laborRes, expenseRes, rainRes] = await Promise.all([
        fetch(`/api/labor-neon?startDate=${startDate}&endDate=${endDate}&limit=200`),
        fetch(`/api/expenses-neon?startDate=${startDate}&endDate=${endDate}&limit=200`),
        fetch("/api/rainfall"),
      ])
      const [laborData, expenseData, rainData] = await Promise.all([
        laborRes.json(), expenseRes.json(), rainRes.json(),
      ])

      const datesWithLabor = new Set<string>()
      let laborCost = 0
      if (laborData.success && Array.isArray(laborData.deployments)) {
        for (const dep of laborData.deployments) {
          datesWithLabor.add(String(dep.date || "").slice(0, 10))
          laborCost += Number(dep.totalCost) || 0
        }
      }

      let expenseCost = 0
      if (expenseData.success && Array.isArray(expenseData.deployments)) {
        for (const dep of expenseData.deployments) expenseCost += Number(dep.amount) || 0
      }

      let rainfallInches = 0, rainfallDays = 0
      if (rainData.success && Array.isArray(rainData.records)) {
        const weekRain = rainData.records.filter((r: { record_date?: string }) =>
          String(r.record_date || "").slice(0, 10) >= startDate &&
          String(r.record_date || "").slice(0, 10) <= endDate,
        )
        rainfallDays = weekRain.length
        rainfallInches = weekRain.reduce(
          (s: number, r: { inches?: number; cents?: number }) =>
            s + (Number(r.inches) || 0) + (Number(r.cents) || 0) / 100,
          0,
        )
      }

      setStats({ laborCost, expenseCost, rainfallInches, rainfallDays })

      const todayStr = format(new Date(), "yyyy-MM-dd")
      // Only flag today — past days without a labour entry are not necessarily "missing"
      // (rest days, off-season lulls, and days with no work are all normal on a farm).
      const gapDays: GapDay[] = !datesWithLabor.has(todayStr)
        ? [{ date: todayStr, label: "Today", isToday: true }]
        : []

      setGaps(gapDays)
    } catch (err) {
      reportActionError("today_gaps_load", err)
      setGaps([])
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const handler = () => fetchData()
    window.addEventListener("farmflow:record-saved", handler)
    return () => window.removeEventListener("farmflow:record-saved", handler)
  }, [fetchData])

  const badgeColors: Record<string, string> = {
    amber: "bg-amber-100 text-amber-800",
    green: "bg-emerald-100 text-emerald-800",
    blue: "bg-sky-100 text-sky-800",
    pink: "bg-pink-100 text-pink-800",
    emerald: "bg-emerald-100 text-emerald-800",
  }

  if (loading) {
    return (
      <div className={cn("rounded-3xl border border-stone-100 bg-stone-50 overflow-hidden", className)}>
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-stone-300" />
        </div>
      </div>
    )
  }

  const hasGaps = gaps.length > 0
  const allCaughtUp = !hasGaps && stats && stats.laborCost > 0

  return (
    <div className={cn("space-y-3", className)}>
      {/* Season label */}
      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-black text-stone-700">This week</p>
        <span className={cn(
          "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold",
          badgeColors[seasonBadge.color] || badgeColors.green,
        )}>
          {seasonBadge.label}
        </span>
      </div>

      {/* Alert card — gaps or all-clear */}
      {hasGaps ? (
        <div className="rounded-3xl bg-amber-400 overflow-hidden shadow-md shadow-amber-100">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 pt-5 pb-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/30">
              <AlertTriangle className="h-6 w-6 text-amber-900 stroke-[2.5]" />
            </div>
            <div>
              <p className="text-xl font-black text-amber-950 leading-tight">
                Log today&apos;s work
              </p>
              <p className="text-sm font-semibold text-amber-800 mt-0.5">
                No labour entry for today yet
              </p>
            </div>
          </div>

          {/* Gap day rows */}
          <div className="mx-3 mb-3 rounded-2xl bg-white/95 overflow-hidden divide-y divide-amber-50/50">
            <button
              type="button"
              onClick={() => onNavigate("accounts")}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left active:bg-amber-50 transition-colors touch-manipulation"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center rounded-xl bg-amber-400 px-2.5 py-1.5 min-w-[52px]">
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wide leading-none text-amber-950">TODAY</p>
                    <p className="text-base font-black leading-tight text-amber-950">{format(new Date(), "d")}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-amber-900">Log today&apos;s labour</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5">
                <span className="text-sm font-black text-white">Log</span>
                <ArrowRight className="h-3.5 w-3.5 text-white stroke-[2.5]" />
              </div>
            </button>
          </div>
        </div>
      ) : allCaughtUp ? (
        <div className="rounded-3xl bg-emerald-500 px-5 py-5 shadow-md shadow-emerald-100">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/30">
              <Check className="h-6 w-6 text-white stroke-[3]" />
            </div>
            <div>
              <p className="text-xl font-black text-white leading-tight">All logged ✓</p>
              <p className="text-sm font-semibold text-emerald-100 mt-0.5">Every work day this week has labour entered</p>
            </div>
          </div>
        </div>
      ) : (
        /* No data yet this week */
        <button
          type="button"
          onClick={() => onNavigate("accounts")}
          className="w-full rounded-3xl bg-stone-900 px-5 py-5 shadow-sm flex items-center justify-between touch-manipulation active:scale-[0.98] transition-transform"
        >
          <div>
            <p className="text-lg font-black text-white">Start logging labour</p>
            <p className="text-sm text-stone-400 mt-0.5">No entries this week yet</p>
          </div>
          <ArrowRight className="h-5 w-5 text-stone-400 stroke-[2.5]" />
        </button>
      )}

      {/* Stats row — tap each to navigate */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onNavigate("accounts")}
            className="flex flex-col rounded-2xl bg-emerald-50 border border-emerald-100 p-3.5 text-left active:scale-[0.97] touch-manipulation"
          >
            <div className="flex items-center gap-1.5 mb-2">
              <Users className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Labour</p>
            </div>
            <p className="text-base font-black text-stone-900 tabular-nums leading-none">
              {formatCurrency(stats.laborCost)}
            </p>
            <p className="text-[10px] text-stone-400 mt-1">this week</p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate("accounts")}
            className="flex flex-col rounded-2xl bg-stone-50 border border-stone-100 p-3.5 text-left active:scale-[0.97] touch-manipulation"
          >
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-sm leading-none">💸</span>
              <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Expenses</p>
            </div>
            <p className="text-base font-black text-stone-900 tabular-nums leading-none">
              {formatCurrency(stats.expenseCost)}
            </p>
            <p className="text-[10px] text-stone-400 mt-1">this week</p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate("rainfall")}
            className="flex flex-col rounded-2xl bg-sky-50 border border-sky-100 p-3.5 text-left active:scale-[0.97] touch-manipulation"
          >
            <div className="flex items-center gap-1.5 mb-2">
              <CloudRain className="h-4 w-4 text-sky-500 shrink-0" />
              <p className="text-[10px] font-bold uppercase tracking-wide text-sky-600">Rain</p>
            </div>
            <p className="text-base font-black text-stone-900 tabular-nums leading-none">
              {stats.rainfallDays > 0 ? `${formatNumber(stats.rainfallInches, 1)}"` : "—"}
            </p>
            <p className="text-[10px] text-stone-400 mt-1">{stats.rainfallDays > 0 ? `${stats.rainfallDays} days` : "no rain"}</p>
          </button>
        </div>
      )}
    </div>
  )
}

