"use client"

import { useCallback, useEffect, useState } from "react"
import { Download, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import { cn } from "@/lib/utils"
import type { YearlyAttendanceRow } from "@/lib/attendance-yearly"
import { formatHoursHm } from "@/lib/attendance-hours"

/**
 * The yearly summary — a month per line per worker, laid out like the sheet the office files.
 *
 * Grouped BY WORKER rather than by month, matching the printed report: a block per person with
 * their months under it. That is how an attendance query actually arrives ("what did Bopaiah do
 * this year"), and it is the shape the estate can already read without being taught.
 *
 * No leave columns. The original has PL, CL, SL, RHO and COFF and every one is zero in every row,
 * because FarmFlow does not record leave types. Printing them would fill a page with zeroes that
 * mean "not tracked" and read as "never happened". See lib/attendance-yearly.ts.
 */

type Summary = {
  workers: number
  totalPresent: number
  payDays: number
  absent: number
  averageHours: number | null
  clockedDays: number
}

/**
 * Both defaults from the ESTATE'S calendar, which is IST — the same clock the API uses.
 *
 * ⚠ THESE USED TO DISAGREE WITH EACH OTHER. The start month took the browser's local year and the
 * end month took the UTC month, so between 00:00 and 05:29 IST on 1 January the start is the new
 * year and the end is the previous December: an inverted range, which the API correctly rejects,
 * so the screen opens on an error. At other month boundaries the same mismatch silently drops the
 * current month from the default view. Raised by Greptile, 2026-09-12.
 *
 * Two derivations of "now" in one file is the bug; using one is the fix.
 */
const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const thisYearStart = () => `${istToday().slice(0, 4)}-01`
const thisMonth = () => istToday().slice(0, 7)

/** Whole where it is whole, one decimal where a half day made it not. */
const days = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

export default function AttendanceYearlySummary() {
  const [from, setFrom] = useState(thisYearStart())
  const [to, setTo] = useState(thisMonth())
  const [rows, setRows] = useState<YearlyAttendanceRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ran, setRan] = useState(false)

  const run = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/attendance/yearly?from=${from}&to=${to}`, { cache: "no-store", signal })
        const data = await res.json().catch(() => ({}))
        if (signal?.aborted) return
        if (!res.ok || !data?.success) throw new Error(data?.error || "Could not build the report")
        setRows(data.workers || [])
        setSummary(data.summary || null)
        setRan(true)
      } catch (e: unknown) {
        if (signal?.aborted || (e instanceof DOMException && e.name === "AbortError")) return
        setError(e instanceof Error ? e.message : "Could not build the report")
        setRows([])
        setSummary(null)
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [from, to],
  )

  // Runs on open so the year is already on screen. A read, so it is abortable — changing the
  // months twice quickly must not leave the first response to land last and win.
  useEffect(() => {
    const controller = new AbortController()
    void run(controller.signal)
    return () => controller.abort()
  }, [run])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[8.5rem] flex-1">
          <label htmlFor="yearly-from" className="mb-1 block text-[10px] font-black uppercase tracking-wider text-stone-400">
            From month
          </label>
          <Input id="yearly-from" type="month" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-11" />
        </div>
        <div className="min-w-[8.5rem] flex-1">
          <label htmlFor="yearly-to" className="mb-1 block text-[10px] font-black uppercase tracking-wider text-stone-400">
            To month
          </label>
          <Input id="yearly-to" type="month" value={to} min={from} max={thisMonth()} onChange={(e) => setTo(e.target.value)} className="h-11" />
        </div>
        <Button onClick={() => void run()} disabled={loading} className="h-11 min-w-[7rem]">
          {loading ? (
            <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Loading</>
          ) : (
            "Show"
          )}
        </Button>
        {rows.length > 0 && (
          <Button variant="outline" asChild className="h-11">
            <a href={`/api/attendance/yearly?from=${from}&to=${to}&format=csv`}>
              <Download className="mr-1 h-4 w-4" /> CSV
            </a>
          </Button>
        )}
      </div>

      {error && <p className="px-1 text-sm text-red-600">{error}</p>}

      {summary && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 sm:grid-cols-5 dark:border-white/[0.08] dark:bg-white/[0.08]">
          {[
            { label: "Workers", value: String(summary.workers) },
            { label: "Days present", value: days(summary.totalPresent) },
            { label: "Pay days", value: days(summary.payDays) },
            { label: "Absences", value: String(summary.absent) },
            {
              // "—" when the terminal timed nothing, never 0:00. Three of the four live estates
              // mark attendance by hand, and a zero here would read as "nobody worked".
              label: summary.clockedDays ? `Avg day (${summary.clockedDays} timed)` : "Avg day",
              value: formatHoursHm(summary.averageHours),
            },
          ].map((tile) => (
            <div key={tile.label} className="bg-white px-3 py-2.5 dark:bg-card">
              <p className="text-[9px] font-black uppercase tracking-wider text-stone-400">{tile.label}</p>
              <p className="mt-0.5 text-lg font-black tabular-nums text-stone-700 dark:text-stone-200">{tile.value}</p>
            </div>
          ))}
        </div>
      )}

      {ran && rows.length === 0 && !loading && (
        <EmptyState
          title="Nothing recorded in these months"
          description="No attendance or muster was recorded in this range for the selected estate."
          size="sm"
        />
      )}

      {rows.length > 0 && (
        <div className="space-y-4">
          {rows.map((worker) => (
            <div key={`${worker.employeeCode}-${worker.employeeName}`} className="overflow-hidden rounded-xl border border-stone-200 dark:border-white/[0.08]">
              <div className="flex items-baseline gap-2 border-b border-stone-200 bg-stone-50 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.03]">
                <span className="text-[10px] font-black uppercase tracking-wider text-stone-400">
                  {worker.employeeCode}
                </span>
                <span className="text-sm font-bold text-stone-700 dark:text-stone-200">{worker.employeeName}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-[10px] font-black uppercase tracking-wider text-stone-400 dark:border-white/[0.08]">
                      <th className="px-3 py-1.5 text-left">Month</th>
                      <th className="px-2 py-1.5 text-right" title="Full days worked">P</th>
                      <th className="px-2 py-1.5 text-right" title="Half days worked">HP</th>
                      <th className="px-2 py-1.5 text-right" title="On the roster, a working day, not marked">A</th>
                      <th className="px-2 py-1.5 text-right" title="Sundays not worked">WO</th>
                      <th className="px-2 py-1.5 text-right" title="Sundays worked anyway">WOP</th>
                      <th className="px-3 py-1.5 text-right">Total present</th>
                      <th className="px-3 py-1.5 text-right">Pay days</th>
                      <th className="px-3 py-1.5 text-right" title="Average length of the days the terminal timed (h:mm)">
                        Avg day
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {worker.months.map((m) => (
                      <tr key={m.month} className="border-b border-stone-100 last:border-0 dark:border-white/[0.05]">
                        <td className="px-3 py-1.5 text-stone-600 dark:text-stone-300">{m.label}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{m.present}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-stone-400">{m.halfDays || ""}</td>
                        <td className={cn("px-2 py-1.5 text-right tabular-nums", m.absent > 0 ? "text-amber-600" : "text-stone-400")}>
                          {m.absent || ""}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-stone-400">{m.weeklyOff}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-stone-400">{m.weeklyOffWorked || ""}</td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{days(m.totalPresent)}</td>
                        <td className="px-3 py-1.5 text-right font-black tabular-nums">{days(m.payDays)}</td>
                        <td
                          className="px-3 py-1.5 text-right tabular-nums text-stone-500 dark:text-stone-400"
                          title={m.clockedDays ? `${m.clockedDays} day(s) timed by the terminal` : "No clocked times this month"}
                        >
                          {formatHoursHm(m.averageHours)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-stone-50 font-black dark:bg-white/[0.03]">
                      <td className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-stone-400">Year</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{worker.year.present}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{worker.year.halfDays || ""}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{worker.year.absent || ""}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{worker.year.weeklyOff}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{worker.year.weeklyOffWorked || ""}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{days(worker.year.totalPresent)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{days(worker.year.payDays)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatHoursHm(worker.year.averageHours)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="px-1 text-xs text-muted-foreground">
        {/* Said once, plainly, rather than shown as a column of zeroes. */}
        Leave types (casual, sick, privilege) are not recorded in FarmFlow, so they are not shown —
        an unmarked working day counts as A. <strong>Avg day</strong> is the mean length of the days
        the fingerprint terminal timed, over those days only; it shows “—” where attendance was
        marked by hand, because a day without both punches has no length rather than a length of zero.
      </p>
    </div>
  )
}
