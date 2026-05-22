"use client"

import { useCallback, useEffect, useState } from "react"
import {
  addDays,
  format,
  isToday,
  isWeekend,
  startOfWeek,
} from "date-fns"
import { AlertCircle, ArrowRight, Check, ChevronRight, Droplets, Loader2, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency, formatNumber } from "@/lib/format"
import { getSeasonBadge } from "@/lib/season-utils"

type GapDay = {
  date: string      // yyyy-MM-dd
  label: string     // "Mon 19", "Today", etc.
  isToday: boolean
}

type WeekStats = {
  laborCost: number
  laborEntries: number
  expenseCost: number
  rainfallInches: number
  rainfallDays: number
}

type Props = {
  onNavigate: (tab: string) => void
  className?: string
}

function getWeekRange() {
  const start = startOfWeek(new Date(), { weekStartsOn: 1 })
  const end = addDays(start, 6)
  return {
    startDate: format(start, "yyyy-MM-dd"),
    endDate: format(end, "yyyy-MM-dd"),
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
        laborRes.json(),
        expenseRes.json(),
        rainRes.json(),
      ])

      // Build set of dates that have at least one labor entry
      const datesWithLabor = new Set<string>()
      let laborCost = 0
      if (laborData.success && Array.isArray(laborData.deployments)) {
        for (const dep of laborData.deployments) {
          const d = String(dep.date || "").slice(0, 10)
          datesWithLabor.add(d)
          laborCost += Number(dep.totalCost) || 0
        }
      }

      let expenseCost = 0
      if (expenseData.success && Array.isArray(expenseData.deployments)) {
        for (const dep of expenseData.deployments) {
          expenseCost += Number(dep.amount) || 0
        }
      }

      let rainfallInches = 0
      let rainfallDays = 0
      if (rainData.success && Array.isArray(rainData.records)) {
        const weekRecords = rainData.records.filter((r: { record_date?: string }) => {
          const d = String(r.record_date || "").slice(0, 10)
          return d >= startDate && d <= endDate
        })
        rainfallDays = weekRecords.length
        rainfallInches = weekRecords.reduce((s: number, r: { inches?: number; cents?: number }) => {
          return s + (Number(r.inches) || 0) + (Number(r.cents) || 0) / 100
        }, 0)
      }

      setStats({
        laborCost,
        laborEntries: datesWithLabor.size,
        expenseCost,
        rainfallInches,
        rainfallDays,
      })

      // Find work days (Mon–Sat up to today) with no labor entries
      const today = format(new Date(), "yyyy-MM-dd")
      const gapDays: GapDay[] = days
        .filter((day) => {
          const str = format(day, "yyyy-MM-dd")
          const isSunday = day.getDay() === 0
          const isFutureDay = str > today
          return !isSunday && !isFutureDay && !datesWithLabor.has(str)
        })
        .map((day) => {
          const str = format(day, "yyyy-MM-dd")
          const todayFlag = isToday(day)
          return {
            date: str,
            label: todayFlag ? "Today" : format(day, "EEE d"),
            isToday: todayFlag,
          }
        })

      setGaps(gapDays)
    } catch {
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
    amber: "bg-amber-100 text-amber-800 border-amber-200",
    green: "bg-green-100 text-green-800 border-green-200",
    blue: "bg-blue-100 text-blue-800 border-blue-200",
    pink: "bg-pink-100 text-pink-800 border-pink-200",
    emerald: "bg-emerald-100 text-emerald-800 border-emerald-200",
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-black/[0.06] bg-white overflow-hidden",
        "shadow-[0_2px_16px_rgba(0,0,0,0.06)]",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.05]">
        <div>
          <p className="text-sm font-semibold text-neutral-900">This week</p>
          <p className="text-[10px] text-neutral-400">{format(new Date(), "d MMMM yyyy")}</p>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
            badgeColors[seasonBadge.color] || badgeColors.green,
          )}
        >
          {seasonBadge.label}
        </span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-neutral-300" />
          </div>
        ) : (
          <>
            {/* Gap alerts — top priority */}
            {gaps.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-amber-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Labor not logged
                </p>
                {gaps.map((gap) => (
                  <button
                    key={gap.date}
                    type="button"
                    onClick={() => onNavigate("accounts")}
                    className={cn(
                      "w-full flex items-center justify-between rounded-xl border px-3 py-2.5",
                      "transition-all active:scale-[0.98] touch-manipulation",
                      gap.isToday
                        ? "border-amber-200 bg-amber-50 hover:bg-amber-100"
                        : "border-black/[0.06] bg-neutral-50 hover:bg-neutral-100",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        gap.isToday ? "bg-amber-500" : "bg-neutral-300",
                      )} />
                      <span className={cn(
                        "text-sm font-medium",
                        gap.isToday ? "text-amber-800" : "text-neutral-600",
                      )}>
                        {gap.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-neutral-400">
                      <span>Log labor</span>
                      <ChevronRight className="h-3 w-3" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* All caught up */}
            {gaps.length === 0 && stats && stats.laborEntries > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                <p className="text-sm font-medium text-emerald-800">Labor logged for all work days this week</p>
              </div>
            )}

            {/* Week stats */}
            {stats && (
              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onNavigate("accounts")}
                  className="flex flex-col rounded-xl border border-black/[0.05] bg-neutral-50 p-3 text-left hover:bg-emerald-50 hover:border-emerald-100 transition-colors active:scale-[0.97] touch-manipulation"
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-100 mb-1.5">
                    <Users className="h-3 w-3 text-emerald-700" />
                  </div>
                  <p className="text-xs font-bold text-neutral-900 tabular-nums leading-tight">
                    {formatCurrency(stats.laborCost)}
                  </p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">Labor</p>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate("accounts")}
                  className="flex flex-col rounded-xl border border-black/[0.05] bg-neutral-50 p-3 text-left hover:bg-amber-50 hover:border-amber-100 transition-colors active:scale-[0.97] touch-manipulation"
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-100 mb-1.5">
                    <ArrowRight className="h-3 w-3 text-amber-700" />
                  </div>
                  <p className="text-xs font-bold text-neutral-900 tabular-nums leading-tight">
                    {formatCurrency(stats.expenseCost)}
                  </p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">Expenses</p>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate("rainfall")}
                  className="flex flex-col rounded-xl border border-black/[0.05] bg-neutral-50 p-3 text-left hover:bg-sky-50 hover:border-sky-100 transition-colors active:scale-[0.97] touch-manipulation"
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-sky-100 mb-1.5">
                    <Droplets className="h-3 w-3 text-sky-700" />
                  </div>
                  <p className="text-xs font-bold text-neutral-900 tabular-nums leading-tight">
                    {formatNumber(stats.rainfallInches, 2)}&quot;
                  </p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">Rain</p>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
