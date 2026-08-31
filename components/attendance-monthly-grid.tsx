"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Download, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import { StatTile } from "@/components/ui/stat-tile"
import { cn } from "@/lib/utils"
import type { MonthlyDay, MonthlyMark, MonthlyAttendanceRow } from "@/lib/attendance-monthly"

/**
 * The monthly attendance grid, in the layout HoneyFarm's office already reads.
 *
 * Modelled on their SmartOffice365 "Monthly Basic Attendance Report": one row per worker, one
 * narrow column per day, P/A/WO in the cells, counts down the right. A payroll clerk checks this
 * against a wage sheet line by line, so familiarity beats improvement -- the grid is scannable
 * because they already know where to look.
 *
 * The whole table scrolls sideways inside its own box rather than the page: 31 day columns will
 * never fit a phone, and a page that scrolls horizontally loses the row you were reading.
 */

type ApiResponse = {
  success: boolean
  month: string
  estate: string | null
  days: MonthlyDay[]
  rows: MonthlyAttendanceRow[]
  summary: { workers: number; daysInMonth: number; totalPayableDays: number; neverPresent: number }
  error?: string
}

const MARK_STYLE: Record<MonthlyMark, string> = {
  P: "text-emerald-700 dark:text-emerald-400",
  HP: "text-amber-600 dark:text-amber-500 font-bold",
  A: "text-red-600 dark:text-red-400 font-bold",
  WO: "text-stone-300 dark:text-stone-600",
  // A Sunday somebody worked. Deliberately loud -- it is usually a payroll question.
  WOP: "text-sky-700 dark:text-sky-400 font-bold",
  "-": "text-stone-200 dark:text-stone-700",
}

const currentMonth = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

const formatDays = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

export default function AttendanceMonthlyGrid() {
  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (targetMonth: string, signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/attendance/monthly?month=${targetMonth}`, { cache: "no-store", signal })
      const payload = (await res.json()) as ApiResponse
      if (!res.ok || !payload?.success) throw new Error(payload?.error || "Could not load the report")
      setData(payload)
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return
      setError(err instanceof Error ? err.message : "Could not load the report")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(month, controller.signal)
    return () => controller.abort()
  }, [load, month])

  const days = data?.days ?? []
  const rows = data?.rows ?? []

  // Which columns are Sundays, so the header can shade them the way the printed sheet does.
  const weeklyOffColumns = useMemo(() => new Set(days.filter((d) => d.isWeeklyOff).map((d) => d.iso)), [days])

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-stone-700 dark:text-stone-200">Monthly attendance</h2>
          <p className="text-xs text-stone-400">
            {data?.estate ? `${data.estate} · ` : ""}Every worker, every day. P present, A absent, WO Sunday.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value || currentMonth())}
            className="h-10 w-[10.5rem] text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 rounded-xl"
            disabled={rows.length === 0}
            // A plain link, not a fetch: the browser handles Content-Disposition and the file
            // lands in Downloads without any of it passing through React.
            onClick={() => {
              window.location.href = `/api/attendance/monthly?month=${month}&format=csv`
            }}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            CSV
          </Button>
        </div>
      </header>

      {data && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Workers" value={data.summary.workers} />
          <StatTile label="Payable days" value={formatDays(data.summary.totalPayableDays)} tone="emerald" />
          <StatTile
            label="Never present"
            value={data.summary.neverPresent}
            tone={data.summary.neverPresent > 0 ? "amber" : undefined}
          />
        </div>
      )}

      {loading && <div className="h-64 animate-pulse rounded-2xl bg-stone-100 dark:bg-stone-800" />}

      {!loading && error && <EmptyState title="Could not load the report" description={error} size="sm" />}

      {!loading && !error && rows.length === 0 && (
        <EmptyState
          title="Nothing recorded this month"
          description="Mark the muster and the grid fills in as the month goes."
          size="sm"
        />
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
          <table className="w-max min-w-full border-collapse text-xs tabular-nums">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-700">
                {/* Sticky so the name stays put while the month scrolls past it. */}
                <th className="sticky left-0 z-10 bg-white px-2 py-1.5 text-left font-bold text-stone-400 dark:bg-stone-900">
                  No
                </th>
                <th className="px-2 py-1.5 text-left font-bold text-stone-400">Code</th>
                <th className="px-2 py-1.5 text-left font-bold text-stone-400">Emp Name</th>
                {days.map((day) => (
                  <th
                    key={day.iso}
                    className={cn(
                      "min-w-[2.1rem] px-1 py-1.5 text-center font-semibold",
                      weeklyOffColumns.has(day.iso) ? "bg-stone-50 text-stone-400 dark:bg-stone-800" : "text-stone-500",
                    )}
                  >
                    <div>{day.dayOfMonth}</div>
                    <div className="text-[9px] font-normal text-stone-400">{day.weekday}</div>
                  </th>
                ))}
                {["P", "HP", "A", "WO", "WOP"].map((label) => (
                  <th key={label} className="min-w-[2.1rem] px-1 py-1.5 text-center font-bold text-stone-400">
                    {label}
                  </th>
                ))}
                <th className="min-w-[3.5rem] px-2 py-1.5 text-center font-bold text-stone-400">Payable</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.employeeCode}-${row.employeeName}`} className="border-b border-stone-100 last:border-0 dark:border-stone-800">
                  <td className="sticky left-0 z-10 bg-white px-2 py-1 text-stone-400 dark:bg-stone-900">{row.serial}</td>
                  <td className="px-2 py-1 font-mono text-stone-500">{row.employeeCode}</td>
                  <td className="whitespace-nowrap px-2 py-1 font-medium text-stone-700 dark:text-stone-200">
                    {row.employeeName}
                  </td>
                  {row.marks.map((mark, index) => (
                    <td
                      key={days[index]?.iso ?? index}
                      className={cn(
                        "px-1 py-1 text-center",
                        MARK_STYLE[mark],
                        days[index]?.isWeeklyOff && "bg-stone-50/60 dark:bg-stone-800/50",
                      )}
                    >
                      {mark}
                    </td>
                  ))}
                  <td className="px-1 py-1 text-center font-bold text-emerald-700 dark:text-emerald-400">
                    {row.totals.present}
                  </td>
                  <td className="px-1 py-1 text-center text-amber-600">{row.totals.halfDays || ""}</td>
                  <td className="px-1 py-1 text-center font-bold text-red-600">{row.totals.absent || ""}</td>
                  <td className="px-1 py-1 text-center text-stone-400">{row.totals.weeklyOff}</td>
                  <td className="px-1 py-1 text-center font-bold text-sky-700">{row.totals.weeklyOffWorked || ""}</td>
                  <td className="px-2 py-1 text-center font-bold text-stone-700 dark:text-stone-200">
                    {formatDays(row.totals.daysPayable)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="space-y-1 rounded-2xl bg-stone-50 px-4 py-3 text-[11px] leading-relaxed text-stone-500 dark:bg-stone-800/60 dark:text-stone-400">
          <p>
            <span className="font-bold text-emerald-700">P</span> full day ·{" "}
            <span className="font-bold text-amber-600">HP</span> half day ·{" "}
            <span className="font-bold text-red-600">A</span> absent ·{" "}
            <span className="font-bold text-stone-400">WO</span> Sunday ·{" "}
            <span className="font-bold text-sky-700">WOP</span> Sunday worked ·{" "}
            <span className="font-bold text-stone-300">-</span> not on the roster yet
          </p>
          <p>
            A dash is not an absence. Nobody can fail to turn up before they were added to the roster, so days
            before that are left blank rather than counted against them.
          </p>
          <p>
            Leave columns (LOP, CL, PL, SL, COFF, H) are not shown because FarmFlow does not record leave — a
            zero there would claim none was taken.
          </p>
        </div>
      )}
    </div>
  )
}
