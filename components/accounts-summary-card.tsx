"use client"

import { useEffect, useState, useCallback } from "react"
import { Download, FileSpreadsheet, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency } from "@/lib/format"
import { getCurrentFiscalYear, getAvailableFiscalYears, type FiscalYear } from "@/lib/fiscal-year-utils"
import { useTenantSettings } from "@/hooks/use-tenant-settings"
import { buildXlsxArrayBufferFromCsv, XLSX_MIME_TYPE } from "@/lib/spreadsheet"

type SummaryRow = { code: string; reference: string; total: number }

export default function AccountsSummaryCard() {
  const { settings: tenantSettings } = useTenantSettings()
  const [selectedFY, setSelectedFY] = useState<FiscalYear>(getCurrentFiscalYear)
  const [rows, setRows] = useState<SummaryRow[]>([])
  const [grandTotal, setGrandTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const availableFYs = getAvailableFiscalYears()

  const fetchSummary = useCallback(async (fy: FiscalYear) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/accounts-summary?grouped=true&startDate=${fy.startDate}&endDate=${fy.endDate}`,
        { cache: "no-store" },
      )
      const data = await res.json()
      if (!data.success) throw new Error(data.error || "Failed to load")
      setRows(data.rows || [])
      setGrandTotal(data.grandTotal || 0)
    } catch (e: any) {
      setError(e.message || "Failed to load summary")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSummary(selectedFY) }, [selectedFY, fetchSummary])

  const buildSummaryExportCsv = () => {
    const header = "Code,Reference,Total Expenditure (₹)"
    const dataRows = rows.map((r) => `${r.code},"${r.reference.replace(/"/g, '""')}",${r.total.toFixed(2)}`)
    const totalsRow = `,GRAND TOTAL,${grandTotal.toFixed(2)}`
    return [header, ...dataRows, totalsRow].join("\n")
  }

  const handleExportCsv = () => {
    const blob = new Blob([buildSummaryExportCsv()], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `accounts_summary_${selectedFY.startDate}_to_${selectedFY.endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportXlsx = async () => {
    const workbookBytes = await buildXlsxArrayBufferFromCsv(buildSummaryExportCsv(), "Expenditure Summary", {
      title: tenantSettings.estateName ? `${tenantSettings.estateName} — Expenditure Summary` : "Expenditure Summary",
      subtitle: `${selectedFY.startDate} to ${selectedFY.endDate}`,
    })
    const blob = new Blob([workbookBytes], { type: XLSX_MIME_TYPE })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `accounts_summary_${selectedFY.startDate}_to_${selectedFY.endDate}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-stone-100 px-5 py-4 dark:border-white/[0.05] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-500">
            Accounts
          </p>
          <p className="mt-1 text-lg font-black text-stone-900 dark:text-white">Expenditure Summary</p>
          <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
            Labour and expenses grouped by activity code
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Select
            value={selectedFY.label}
            onValueChange={(label) => {
              const fy = availableFYs.find((f) => f.label === label)
              if (fy) setSelectedFY(fy)
            }}
          >
            <SelectTrigger className="h-9 w-32 bg-white text-sm dark:bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableFYs.map((fy) => (
                <SelectItem key={fy.label} value={fy.label}>
                  {fy.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="bg-white dark:bg-transparent"
            onClick={handleExportCsv}
            disabled={loading || rows.length === 0}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="bg-white dark:bg-transparent"
            onClick={handleExportXlsx}
            disabled={loading || rows.length === 0}
          >
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
            XLSX
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
          </div>
        ) : error ? (
          <p className="px-5 py-8 text-sm text-rose-600">{error}</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-stone-400">No transactions for {selectedFY.label}.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-emerald-900 text-left">
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300 w-20">Code</th>
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">Reference</th>
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300 text-right">Total Expenditure (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-white/[0.04]">
              {rows.map((row) => (
                <tr
                  key={row.code}
                  className="hover:bg-stone-50 transition-colors dark:hover:bg-white/[0.02]"
                >
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-stone-500 dark:text-stone-400">
                    {row.code}
                  </td>
                  <td className="px-5 py-3 font-medium text-stone-800 dark:text-stone-200">
                    {row.reference}
                  </td>
                  <td className="px-5 py-3 text-right font-black tabular-nums text-stone-900 dark:text-white">
                    {formatCurrency(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-stone-200 bg-stone-50 dark:border-white/[0.08] dark:bg-white/[0.02]">
                <td className="px-5 py-3" />
                <td className="px-5 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500">
                  Total
                </td>
                <td className="px-5 py-3 text-right text-base font-black tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
