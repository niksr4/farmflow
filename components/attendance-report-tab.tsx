"use client"

import { Fragment, useCallback, useState } from "react"
import { CalendarDays, Clock, Download, Loader2, TriangleAlert, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { FieldLabel } from "@/components/ui/field-label"
import { isAdminRole } from "@/lib/permissions"
import { useSingleFlight } from "@/hooks/use-single-flight"
import { isUsableRemovalReason, MAX_REASON_LENGTH, MIN_REASON_LENGTH } from "@/lib/attendance-record-removal"
import { Trash2 } from "lucide-react"
import { averageWorkedHours, formatHoursHm, formatWorkedHours, shiftStatusLabel, type ShiftStatus } from "@/lib/attendance-hours"
import AttendanceMonthlyGrid from "@/components/attendance-monthly-grid"
import AttendanceYearlySummary from "@/components/attendance-yearly-summary"
import { workerTypeLabel, isPaidDaily } from "@/lib/worker-types"
import { todayIso } from "@/lib/date-utils"
import { neutraliseFormula } from "@/lib/csv-safe"

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
  /** The row's own id, so one day can be named for removal. */
  attendanceRecordId: string
  source: string | null
  /** What PAYROLL stops paying -- not the allocated cost. See lib/attendance-record-removal.ts. */
  payrollEffect: number
  /** Already IST, formatted server-side. Rendered as-is; re-offsetting it is the bug. */
  checkInClock: string | null
  checkOutClock: string | null
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
  clockedDays: number
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
  clockedDays: number
  totalHours: number
  allocatedDays: number
  allocatedCost: number
  unallocatedDays: number
  openDays: number
}

// Derived from the same todayIso() as today(), deliberately. This used to read getFullYear()/
// getMonth() off a local Date while today() read UTC, so the two halves of one date range
// disagreed about which month it was -- for three and a half hours a day, for a viewer abroad.
const firstOfMonth = () => `${todayIso().slice(0, 7)}-01`
// IST, not UTC and not the viewer's zone. toISOString().slice(0,10) returned the UTC date, so
// every caller below read YESTERDAY between 00:00 and 05:30 IST -- which is exactly when an
// estate office is open, because the muster is a dawn job. lib/date-utils.ts has said "never use
// toISOString().slice(0,10) for calendar dates" since it was written; this file was the holdout.
const today = () => todayIso()

type ReportView = "grid" | "yearly" | "hours"

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
    { value: "yearly", label: "Yearly summary" },
    { value: "hours", label: "Hours & allocation" },
  ]

  return (
    <div className="flex flex-wrap items-center gap-1.5">
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
      {/* A LINK, NOT A FOURTH TAB. The daily sheet is a printable page of its own — one date,
          everyone, in and out times — so it opens rather than swapping the panel underneath. Put
          here because "where are the attendance reports" should have one answer, and it was
          previously reachable only from the muster's own date picker. */}
      <a
        href={`/attendance-report?date=${today()}`}
        className="min-h-11 rounded-lg border border-stone-200 bg-white px-3 text-xs font-semibold leading-[2.75rem] text-stone-500 transition-colors hover:bg-stone-50"
      >
        Daily sheet ↗
      </a>
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

export default function AttendanceReportTab({ role }: { role?: string | null }) {
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

  /**
   * REMOVING ONE ATTENDANCE RECORD, on purpose and on the record.
   *
   * This screen is the only place the removal can sensibly live. The muster roll lists ACTIVE
   * workers only, so a punch belonging to somebody since deactivated -- which is what a
   * mis-enrolled finger leaves behind -- is invisible there. The summary route joins workers
   * without an active filter, so this report can see it.
   *
   * This is an AFFORDANCE, not the gate -- the route re-checks and a forged request still gets a
   * 403. It must nonetheless agree with the route: `isAdminRole`, not `canDeleteModule`, which
   * returns true for a writer because `accounts` is in USER_MUTATION_MODULES.
   */
  const mayRemovePunch = isAdminRole(role)
  const [removing, setRemoving] = useState<{ worker: WorkerRow; day: DayRow } | null>(null)
  const [reason, setReason] = useState("")

  const submitRemoval = useSingleFlight(async () => {
    if (!removing || !isUsableRemovalReason(reason)) return
    try {
      const res = await fetch(`/api/attendance/records/${removing.day.attendanceRecordId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || !payload.success) throw new Error(payload?.error || "Could not remove that record")
      setRemoving(null)
      setReason("")
      await run()
    } catch (removalError: any) {
      // Surfaced, not swallowed. A removal that silently did not happen looks identical to one
      // that did until the next payroll run disagrees.
      setError(removalError?.message || "Could not remove that record")
    }
  })

  const exportCsv = useCallback(() => {
    const header = ["Worker", "Type", "Estate", "Days present", "Full", "Half", "Short", "Still in", "Hours", "Avg hrs/day", "Days timed", "Days allocated", "Cost"]
    const lines = workers.map((w) => [
      w.name, workerTypeLabel(w.workerType), w.estate ?? "", w.daysPresent, w.fullDays, w.halfDays,
      w.shortDays, w.openDays, w.totalHours.toFixed(2),
      formatHoursHm(w.clockedDays ? w.totalHours / w.clockedDays : null), w.clockedDays,
      w.allocatedDays, Math.round(w.allocatedCost),
    ])
    const csv = [header, ...lines]
      // Quote everything: worker names contain commas often enough, and a report that opens
      // misaligned in Excel is a report nobody trusts again.
      .map((row) => row.map((cell) => `"${neutraliseFormula(String(cell)).replace(/"/g, '""')}"`).join(","))
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

  if (view === "yearly") {
    return (
      <div className="space-y-4">
        <ViewToggle view={view} onChange={setView} />
        <AttendanceYearlySummary />
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
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 sm:grid-cols-5 dark:border-white/[0.08] dark:bg-white/[0.08]">
          {[
            { label: "Workers", value: String(totals.workers), icon: Users },
            { label: "Days present", value: String(totals.daysPresent), icon: CalendarDays },
            { label: "Hours clocked", value: formatWorkedHours(totals.totalHours), icon: Clock },
            {
              // Over the days the terminal TIMED, never over days present — three of the four live
              // estates mark by hand and would otherwise read 0:00.
              label: totals.clockedDays ? `Avg day (${totals.clockedDays} timed)` : "Avg day",
              value: formatHoursHm(totals.clockedDays ? totals.totalHours / totals.clockedDays : null),
              icon: Clock,
            },
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
                <th className="px-2 py-2 text-right" title="Average length of the days the terminal timed (h:mm)">Avg day</th>
                <th className="px-2 py-2 text-right">Allocated</th>
                <th className="px-3 py-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => {
                const open = expanded === w.workerId
                return (
                  <Fragment key={w.workerId}>
                    <tr
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
                      <td
                        className="px-2 py-2 text-right tabular-nums text-stone-600 dark:text-stone-300"
                        title={w.clockedDays ? `${w.clockedDays} day(s) timed` : "No clocked times — attendance marked by hand"}
                      >
                        {formatHoursHm(averageWorkedHours(w.days.map((d) => d.hours)).averageHours)}
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
                        <td colSpan={9} className="px-3 py-2">
                          <div className="space-y-1">
                            {w.days.map((d) => (
                              <div key={d.date} className="grid grid-cols-[6rem_5rem_5rem_5rem_1fr] items-center gap-2 text-[11px] tabular-nums">
                                <span className="font-semibold text-stone-600 dark:text-stone-300">{d.date}</span>
                                <span className="text-stone-500">{d.checkInClock || "—"}</span>
                                <span className="text-stone-500">{d.checkOutClock || "—"}</span>
                                <span className="text-stone-600 dark:text-stone-300">{formatWorkedHours(d.hours)}</span>
                                <span className={cn("font-semibold", STATUS_TONE[d.status])}>
                                  {shiftStatusLabel(d.status)}
                                  {d.rescanIgnored && <span className="ml-1 font-normal text-stone-400">· second scan too soon to be a punch-out</span>}
                                  {d.allocatedFraction > 0 && <span className="ml-1 font-normal text-stone-400">· {d.allocatedFraction}d allocated</span>}
                                  {d.source === "biometric" && d.allocatedFraction === 0 && (
                                    // The shape of a mis-enrolled finger: a terminal punch nobody
                                    // allocated. Payroll still pays the day rate for it.
                                    <span className="ml-1 font-normal text-amber-700 dark:text-amber-500">· punched but never allocated</span>
                                  )}
                                  {mayRemovePunch && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRemoving({ worker: w, day: d })
                                        setReason("")
                                      }}
                                      className="ml-2 inline-flex h-7 items-center gap-1 rounded-md px-2 align-middle text-[11px] font-semibold text-stone-500 hover:bg-rose-50 hover:text-rose-700 dark:text-stone-400 dark:hover:bg-rose-950/40"
                                      aria-label={`Remove the attendance record for ${w.name} on ${d.date}`}
                                    >
                                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                                      Remove
                                    </button>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/*
        THE REMOVAL DIALOG.

        It states the cost BEFORE asking for a reason, and the cost it states is what PAYROLL stops
        paying -- `payrollEffect`, not the allocated cost. For a mis-enrolled biometric day those
        two differ completely: Saina at HoneyFarm has two such days whose allocated cost is Rs 0
        while payroll pays 2 x Rs 494. A dialog reporting Rs 0 would be telling the truth about the
        cost reports and lying about the wage.
      */}
      <Dialog open={!!removing} onOpenChange={(open) => { if (!open) { setRemoving(null); setReason("") } }}>
        <DialogContent className="max-w-md">
          <DialogTitle>Remove this attendance record</DialogTitle>
          {removing && (
            <div className="space-y-4">
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm dark:border-white/10 dark:bg-white/[0.03]">
                <p className="font-semibold text-stone-800 dark:text-stone-100">{removing.worker.name}</p>
                <p className="mt-0.5 text-stone-600 dark:text-stone-300">
                  {removing.day.date}
                  {removing.day.checkInClock ? ` · ${removing.day.checkInClock}` : ""}
                  {removing.day.checkOutClock ? ` to ${removing.day.checkOutClock}` : ""}
                  {removing.day.source === "biometric" ? " · from the terminal" : ""}
                </p>
                <p className="mt-2 font-semibold text-rose-700 dark:text-rose-400">
                  Payroll will stop paying ₹{Math.round(removing.day.payrollEffect).toLocaleString("en-IN")} for this day.
                </p>
                {removing.day.allocatedFraction === 0 && removing.day.payrollEffect > 0 && (
                  <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                    Nothing was allocated to this day, so it is paid at the worker&apos;s day rate.
                  </p>
                )}
              </div>

              <div>
                <FieldLabel
                  htmlFor="removal-reason"
                  label="Why is this being removed? *"
                  tooltip="Removing a day changes what the worker is paid, so the next payroll run will differ and somebody will ask why."
                />
                <Textarea
                  id="removal-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value.slice(0, MAX_REASON_LENGTH))}
                  rows={3}
                  placeholder="Mis-enrolled finger, device code 31"
                  className="mt-1"
                />
                <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">
                  The record itself is gone afterwards. This reason is the only trace left, so write
                  what somebody would need in six weeks.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                {/* Explicit type on BOTH: components/ui/button.tsx sets none, and an untyped
                    button inside a form submits. See the forms section of CLAUDE.md. */}
                <Button type="button" variant="outline" onClick={() => { setRemoving(null); setReason("") }}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!isUsableRemovalReason(reason)}
                  onClick={() => void submitRemoval()}
                  title={isUsableRemovalReason(reason) ? undefined : `Give a reason of at least ${MIN_REASON_LENGTH} characters`}
                >
                  Remove the record
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
