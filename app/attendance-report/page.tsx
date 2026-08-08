"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StatTile } from "@/components/ui/stat-tile"
import type { AttendanceReportRow, AttendanceReportSummary } from "@/lib/attendance-report"

/**
 * Daily attendance report — the FarmFlow replacement for the SmartOffice365 daily report.
 *
 * Under /attendance-report rather than /settings/... because it is an operational screen the
 * estate office reads daily, not a configuration page. It sits outside proxy.ts's matcher list
 * for /dashboard, /settings and /admin, so it is reachable by every role that has the labor
 * module — the API is what enforces that.
 */
export default function AttendanceReportPage() {
  const [date, setDate] = useState("")
  const [rows, setRows] = useState<AttendanceReportRow[]>([])
  const [summary, setSummary] = useState<AttendanceReportSummary | null>(null)
  const [reportDate, setReportDate] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async (targetDate: string, signal?: AbortSignal) => {
    setLoading(true)
    setError("")
    try {
      const qs = targetDate ? `?date=${encodeURIComponent(targetDate)}` : ""
      const response = await fetch(`/api/attendance/report${qs}`, { signal })
      const payload = await response.json().catch(() => ({}))
      if (signal?.aborted) return

      if (!response.ok || !payload?.success) {
        setError(String(payload?.error || "Could not load the report"))
        setRows([])
        setSummary(null)
        return
      }
      setRows(payload.rows ?? [])
      setSummary(payload.summary ?? null)
      setReportDate(payload.reportDate ?? targetDate)
      if (!targetDate) setDate(payload.reportDate ?? "")
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return
      setError("Network error loading the report")
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    // A read, so it is safe to abort a superseded request (see lib/abortable.ts).
    const controller = new AbortController()
    void load(date, controller.signal)
    return () => controller.abort()
  }, [date, load])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Daily Attendance Report</CardTitle>
          <CardDescription>
            Every active worker for the day, present or not. Times are estate-local (IST), taken from
            the fingerprint terminal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
            </div>
            <Button variant="outline" onClick={() => void load(date)} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = `/api/attendance/report?date=${encodeURIComponent(reportDate || date)}&format=csv`
              }}
              disabled={!rows.length}
            >
              Download CSV
            </Button>
          </div>

          {summary && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatTile label="Workers" value={summary.total} />
              <StatTile label="Present" value={summary.present} tone="emerald" />
              <StatTile label="Absent" value={summary.absent} tone="rose" />
              <StatTile label="No punch-out" value={summary.missingCheckOut} />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {!error && !loading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No active workers yet. Workers appear here once they are added and their device code is
              mapped — punches from unmapped codes are still recorded and can be assigned later.
            </p>
          )}

          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">S.No</th>
                    <th className="py-2 pr-3">Code</th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">In</th>
                    <th className="py-2 pr-3">Out</th>
                    <th className="py-2 pr-3">Duration</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.employeeCode}-${row.serial}`} className="border-b last:border-0">
                      <td className="py-2 pr-3 tabular-nums text-muted-foreground">{row.serial}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.employeeCode}</td>
                      <td className="py-2 pr-3">{row.employeeName}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.inTime}</td>
                      <td className="py-2 pr-3 tabular-nums">
                        {row.outTime}
                        {row.missingCheckOut && (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                            no punch-out
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{row.workDuration}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            row.status === "P"
                              ? "font-semibold text-emerald-700"
                              : "font-semibold text-rose-600"
                          }
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
