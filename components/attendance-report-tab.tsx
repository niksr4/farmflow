"use client"

import { useCallback, useState } from "react"
import { CalendarDays, Clock, Download, Loader2, TriangleAlert, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import { cn } from "@/lib/utils"
import { formatWorkedHours, shiftStatusLabel, type ShiftStatus } from "@/lib/attendance-hours"
import AttendanceMonthlyGrid from "@/components/attendance-monthly-grid"
import { workerTypeLabel, isPaidDaily } from "@/lib/worker-types"

/**
 * Attendance over a period — the counterpart to the payroll summary, and the thing an estate
 * reaches for at month end or when someone queries a wage.
 *
 * The daily report (/attendance-report) answers "what happened today" and prints. This answers
 * "what happened this month", per person, which previously meant opening thirty daily reports.
 *
 * HOURS AND ALLOCATED DAYS ARE SHOWN SIDE BY SIDE, and that is the point of the screen. The
 * terminal knows how long someone was on the estate; the manager decides what the day was worth.
 * Those two numbers disagreeing is not an error to reconcile away -- it is the conversation the
 * report exists to start. Someone clocked at 2h with a full day allocated may have gone home sick
 * and been paid anyway, which is the estate's call and none of ours.
 */

type DayRow = {
  date: string
  checkIn: string | null
  checkOut: string | null
  hours: number | null
  status: ShiftStatus
  rescanIgnored: boolean
  allocatedFraction: number
}

type WorkerRow = {
  workerId: string
  name: string
  workerType: string | null
  estate: string | null
  dailyRate: number | null
  daysPresent: number
  fullDays: number
  halfDays: number
  shortDays: number
  openDays: number
  totalHours: number
  allocatedDays: number
  allocatedCost: number
  unallocatedDays: number
  days: DayRow[]
}

type Totals = {
  workers: number
  daysPresent: number
  totalHours: number
  allocatedDays: number
  allocatedCost: number
  unallocatedDays: number
  openDays: number
}

const firstOfMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}
const today = () => new Date().toISOString().slice(0, 10)

type ReportView = "grid" | "hours"

/**
 * Two questions, one tab.
 *
 * The grid is the sheet the estate office already reads and checks wages against, so it is what
 * you land on. The hours view is the one FarmFlow can answer and SmartOffice cannot -- what the
 * terminal clocked against what the manager allocated -- and it stays one tap away rather than
 * being replaced by the format request.
 */
function ViewToggle({ view, onChange }: { view: ReportView; onChange: (next: ReportView) => void }) {
  const options: Array<{ value: ReportView; label: string }> = [
    { value: "grid", label: "Monthly grid" },
    { value: "hours", label: "Hours & allocation" },
  ]
  return (
    <div className="flex gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "min-h-11 rounded-lg border px-3 text-xs font-semibold transition-colors",
            view === option.value
              ? "border-slate-700 bg-slate-700 text-white"
              : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

const STATUS_TONE: Record<ShiftStatus, string> = {
  full: "text-emerald-700 dark:text-emerald-400",
  half: "text-amber-700 dark:text-amber-500",
  short: "text-red-600 dark:text-red-400",
  open: "text-sky-700 dark:text-sky-400",
  absent: "text-stone-400",
}

export default function AttendanceReportTab() {
  const [startDate, setStartDate] = useState(firstOfMonth())
  const [endDate, setEndDate] = useState(today())
  const [workers, setWorkers] = useState<WorkerRow[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [ran, setRan] = useState(false)
  // The grid is the default: it is the layout the estate office already checks wages against.
  const [view, setView] = useState<ReportView>("grid")

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/attendance/summary?startDate=${startDate}&endDate=${endDate}`, {
        cache: "no-store",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load the report")
      setWorkers(data.workers || [])
      setTotals(data.totals || null)
      setRan(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load the report")
      setWorkers([])
      setTotals(null)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  const exportCsv = useCallback(() => {
    const header = ["Worker", "Type", "Estate", "Days present", "Full", "Half", "Short", "Still in", "Hours", "Days allocated", "Cost"]
    const lines = workers.map((w) => [
      w.name, workerTypeLabel(w.workerType), w.estate ?? "", w.daysPresent, w.fullDays, w.halfDays,
      w.shortDays, w.openDays, w.totalHours.toFixed(2), w.allocatedDays, Math.round(w.allocatedCost),
    ])
    const csv = [header, ...lines]
      // Quote everything: worker names contain commas often enough, and a report that opens
      // misaligned in Excel is a report nobody trusts again.
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `attendance-${startDate}-to-${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [workers, startDate, endDate])

  if (view === "grid") {
    return (
      <div className="space-y-4">
        <ViewToggle view={view} onChange={setView} />
        <AttendanceMonthlyGrid />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ViewToggle view={view} onChange={setView} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[8.5rem] flex-1">
          <label htmlFor="att-from" className="mb-1 block text-[10px] font-black uppercase tracking-wider text-stone-400">From</label>
          <Input id="att-from" type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} className="h-11" />
        </div>
        <div className="min-w-[8.5rem] flex-1">
          <label htmlFor="att-to" className="mb-1 block text-[10px] font-black uppercase tracking-wider text-stone-400">To</label>
          <Input id="att-to" type="date" value={endDate} min={startDate} max={today()} onChange={(e) => setEndDate(e.target.value)} className="h-11" />
        </div>
        <Button onClick={run} disabled={loading} className="h-11 min-w-[7rem]">
          {loading ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Loading</> : <><CalendarDays className="mr-1 h-4 w-4" /> Show</>}
        </Button>
        {workers.length > 0 && (
          <Button variant="outline" onClick={exportCsv} className="h-11">
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
        )}
      </div>

      {error && <p className="px-1 text-sm text-red-600">{error}</p>}

      {totals && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 sm:grid-cols-4 dark:border-white/[0.08] dark:bg-white/[0.08]">
          {[
            { label: "Workers", value: String(totals.workers), icon: Users },
            { label: "Days present", value: String(totals.daysPresent), icon: CalendarDays },
            { label: "Hours clocked", value: formatWorkedHours(totals.totalHours), icon: Clock },
            {
              label: "Days not allocated",
              value: String(totals.unallocatedDays),
              icon: TriangleAlert,
              amber: totals.unallocatedDays > 0,
            },
          ].map((tile) => (
            <div key={tile.label} className="bg-white px-3 py-2.5 dark:bg-card">
              <p className="text-[9px] font-black uppercase tracking-wider text-stone-400">{tile.label}</p>
              <p className={cn("mt-0.5 text-lg font-black tabular-nums", tile.amber ? "text-amber-600" : "text-stone-700 dark:text-stone-200")}>
                {tile.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {ran && workers.length === 0 && !loading && (
        <EmptyState title="Nobody was marked present" description="No attendance was recorded in this period for the selected estate." size="sm" />
      )}

      {workers.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-white/[0.08]">
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-[10px] font-black uppercase tracking-wider text-stone-400 dark:border-white/[0.08] dark:bg-white/[0.03]">
                <th className="px-3 py-2 text-left">Worker</th>
                <th className="px-2 py-2 text-right">Present</th>
                <th className="px-2 py-2 text-right">Full</th>
                <th className="px-2 py-2 text-right">Half</th>
                <th className="px-2 py-2 text-right">Short</th>
                <th className="px-2 py-2 text-right">Hours</th>
                <th className="px-2 py-2 text-right">Allocated</th>
                <th className="px-3 py-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => {
                const open = expanded === w.workerId
                return (
                  <>
                    <tr
                      key={w.workerId}
                      onClick={() => setExpanded(open ? null : w.workerId)}
                      className="cursor-pointer border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-white/[0.05] dark:hover:bg-white/[0.03]"
                    >
                      <td className="px-3 py-2">
                        <p className="font-bold text-stone-800 dark:text-stone-100">{w.name}</p>
                        <p className="text-[11px] text-stone-400">
                          {workerTypeLabel(w.workerType)}{w.estate ? ` · ${w.estate}` : ""}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-right font-bold tabular-nums">{w.daysPresent}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{w.fullDays || "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-amber-700 dark:text-amber-500">{w.halfDays || "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-red-600 dark:text-red-400">{w.shortDays || "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-stone-600 dark:text-stone-300">
                        {formatWorkedHours(w.totalHours || null)}
                      </td>
                      <td className={cn("px-2 py-2 text-right font-bold tabular-nums",
                        // Only chase people a day's work is expected from. Monthly staff are paid
                        // regardless, so an unallocated day of theirs is not an omission.
                        w.unallocatedDays > 0 && isPaidDaily(w.workerType) ? "text-amber-600" : "text-stone-600 dark:text-stone-300")}>
                        {w.allocatedDays}
                      </td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-stone-700 dark:text-stone-200">
                        ₹{Math.round(w.allocatedCost).toLocaleString("en-IN")}
                      </td>
                    </tr>
                    {open && (
                      <tr key={`${w.workerId}-days`} className="border-b border-stone-100 bg-stone-50/60 dark:border-white/[0.05] dark:bg-white/[0.02]">
                        <td colSpan={8} className="px-3 py-2">
                          <div className="space-y-1">
                            {w.days.map((d) => (
                              <div key={d.date} className="grid grid-cols-[6rem_5rem_5rem_5rem_1fr] items-center gap-2 text-[11px] tabular-nums">
                                <span className="font-semibold text-stone-600 dark:text-stone-300">{d.date}</span>
                                <span className="text-stone-500">{d.checkIn ? new Date(d.checkIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}</span>
                                <span className="text-stone-500">{d.checkOut ? new Date(d.checkOut).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}</span>
                                <span className="text-stone-600 dark:text-stone-300">{formatWorkedHours(d.hours)}</span>
                                <span className={cn("font-semibold", STATUS_TONE[d.status])}>
                                  {shiftStatusLabel(d.status)}
                                  {d.rescanIgnored && <span className="ml-1 font-normal text-stone-400">· second scan too soon to be a punch-out</span>}
                                  {d.allocatedFraction > 0 && <span className="ml-1 font-normal text-stone-400">· {d.allocatedFraction}d allocated</span>}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
