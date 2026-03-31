"use client"

import { useState, useCallback } from "react"
import { Download, Loader2, DollarSign, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { EmptyStateTable } from "@/components/ui/empty-state"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/format"

type PayrollWorker = {
  id: string
  name: string
  workerType: string | null
  dailyRate: number | null
  daysPresent: number
  attendanceEarnings: number
  pickingKg: number
  pickingEarnings: number
  deductions: number
  adjustments: number
  netPayable: number
  missingDailyRate: boolean
}

type Totals = {
  daysPresent: number
  attendanceEarnings: number
  pickingEarnings: number
  pickingKg: number
  deductions: number
  adjustments: number
  netPayable: number
}

const today = () => new Date().toISOString().slice(0, 10)
const firstOfMonth = () => new Date().toISOString().slice(0, 7) + "-01"

const escapeCsv = (v: string | number | null | undefined) => {
  const s = String(v ?? "")
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s
}

export default function PayrollSummaryTab() {
  const [startDate, setStartDate] = useState(firstOfMonth())
  const [endDate, setEndDate] = useState(today())
  const [workers, setWorkers] = useState<PayrollWorker[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(false)

  const handleGenerate = useCallback(async () => {
    if (!startDate || !endDate) return
    setLoading(true)
    try {
      const res = await fetch(`/api/payroll-summary?startDate=${startDate}&endDate=${endDate}`)
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to generate payroll")
      setWorkers(data.workers || [])
      setTotals(data.totals || null)
      setHasGenerated(true)
    } catch (err: any) {
      toast.error(err?.message || "Failed to generate payroll summary")
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  const handleExportCsv = () => {
    if (!workers.length) return
    const header = ["Worker", "Type", "Days Present", "Daily Rate", "Attendance Earnings", "Picking Kg", "Picking Earnings", "Adjustments", "Deductions", "Net Payable"]
    const rows = workers.map((w) => [
      w.name,
      w.workerType || "",
      w.daysPresent,
      w.dailyRate ?? "",
      w.attendanceEarnings.toFixed(2),
      w.pickingKg.toFixed(3),
      w.pickingEarnings.toFixed(2),
      w.adjustments.toFixed(2),
      w.deductions.toFixed(2),
      w.netPayable.toFixed(2),
    ])
    if (totals) {
      rows.push(["TOTAL", "", totals.daysPresent, "", totals.attendanceEarnings.toFixed(2), totals.pickingKg.toFixed(3), totals.pickingEarnings.toFixed(2), totals.adjustments.toFixed(2), totals.deductions.toFixed(2), totals.netPayable.toFixed(2)])
    }
    const csv = [header, ...rows].map((r) => r.map(escapeCsv).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `payroll-${startDate}-to-${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const missingRateCount = workers.filter((w) => w.missingDailyRate).length

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-emerald-400" />
            Payroll Summary
          </CardTitle>
          <CardDescription>
            Per-worker net payable for a date range — combining attendance earnings, picking earnings, advances, and deductions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 w-36 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 w-36 text-sm" />
            </div>
            <Button size="sm" onClick={handleGenerate} disabled={loading || !startDate || !endDate}>
              {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Generate
            </Button>
            {hasGenerated && workers.length > 0 && (
              <Button size="sm" variant="outline" onClick={handleExportCsv}>
                <Download className="mr-1.5 h-4 w-4" />
                Export CSV
              </Button>
            )}
          </div>

          {missingRateCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-sm text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {missingRateCount} worker{missingRateCount !== 1 ? "s" : ""} have no daily rate set — their attendance earnings will show as ₹0. Set daily rates in the Workers tab.
            </div>
          )}

          {!hasGenerated ? (
            <EmptyStateTable title="Select a date range and click Generate to compute payroll." />
          ) : workers.length === 0 ? (
            <EmptyStateTable title="No workers with activity in this period." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Worker</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                    <TableHead className="text-right">Attend. Earnings</TableHead>
                    <TableHead className="text-right">Picking Kg</TableHead>
                    <TableHead className="text-right">Picking Earnings</TableHead>
                    <TableHead className="text-right">Adjustments</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right font-semibold">Net Payable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workers.map((w) => (
                    <TableRow key={w.id} className={w.missingDailyRate ? "bg-amber-400/[0.03]" : undefined}>
                      <TableCell className="font-medium text-sm">
                        {w.name}
                        {w.missingDailyRate && (
                          <AlertTriangle className="ml-1.5 inline h-3.5 w-3.5 text-amber-400" aria-label="No daily rate set" />
                        )}
                      </TableCell>
                      <TableCell>
                        {w.workerType ? (
                          <Badge variant="outline" className="text-xs border-white/10 text-muted-foreground">
                            {w.workerType}
                          </Badge>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm">{w.daysPresent}</TableCell>
                      <TableCell className="text-right text-sm">{w.attendanceEarnings > 0 ? formatCurrency(w.attendanceEarnings) : "—"}</TableCell>
                      <TableCell className="text-right text-sm">{w.pickingKg > 0 ? w.pickingKg.toLocaleString("en-IN", { maximumFractionDigits: 1 }) : "—"}</TableCell>
                      <TableCell className="text-right text-sm">{w.pickingEarnings > 0 ? formatCurrency(w.pickingEarnings) : "—"}</TableCell>
                      <TableCell className="text-right text-sm text-sky-400">{w.adjustments > 0 ? `+${formatCurrency(w.adjustments)}` : "—"}</TableCell>
                      <TableCell className="text-right text-sm text-rose-400">{w.deductions > 0 ? `-${formatCurrency(w.deductions)}` : "—"}</TableCell>
                      <TableCell className="text-right font-semibold text-sm text-emerald-400">{formatCurrency(w.netPayable)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {totals && (
                  <TableFooter>
                    <TableRow className="border-t-2 border-border bg-muted/20 font-semibold">
                      <TableCell colSpan={2} className="text-sm">Total ({workers.length} workers)</TableCell>
                      <TableCell className="text-right text-sm">{totals.daysPresent}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(totals.attendanceEarnings)}</TableCell>
                      <TableCell className="text-right text-sm">{totals.pickingKg.toLocaleString("en-IN", { maximumFractionDigits: 1 })}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(totals.pickingEarnings)}</TableCell>
                      <TableCell className="text-right text-sm text-sky-400">+{formatCurrency(totals.adjustments)}</TableCell>
                      <TableCell className="text-right text-sm text-rose-400">-{formatCurrency(totals.deductions)}</TableCell>
                      <TableCell className="text-right text-sm text-emerald-400">{formatCurrency(totals.netPayable)}</TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
