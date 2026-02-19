"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowDownCircle, ArrowUpCircle, CircleDashed, RefreshCw, TrendingUp, Wallet } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { getAvailableFiscalYears, getCurrentFiscalYear, getFiscalYearDateRange, type FiscalYear } from "@/lib/fiscal-year-utils"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

type ModuleLine = {
  id: string
  label: string
  tab: string
  direction: "inflow" | "outflow" | "memo"
  amount: number
  records: number
  includedInBookedNet: boolean
  status: "available" | "missing"
  note: string
}

type SummaryPayload = {
  totals: {
    inflowBooked: number
    outflowBooked: number
    netBooked: number
    liveNetPosition: number
    receivablesOutstandingLive: number
    receivablesOverdueLive: number
    receivablesInvoicedPeriod: number
    receivablesPaidPeriod: number
    receivablesOutstandingPeriod: number
    inventoryUsageValue: number
  }
  modules: ModuleLine[]
}

const emptySummary: SummaryPayload = {
  totals: {
    inflowBooked: 0,
    outflowBooked: 0,
    netBooked: 0,
    liveNetPosition: 0,
    receivablesOutstandingLive: 0,
    receivablesOverdueLive: 0,
    receivablesInvoicedPeriod: 0,
    receivablesPaidPeriod: 0,
    receivablesOutstandingPeriod: 0,
    inventoryUsageValue: 0,
  },
  modules: [],
}

const getDirectionBadge = (direction: ModuleLine["direction"]) => {
  if (direction === "inflow") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (direction === "outflow") return "bg-rose-50 text-rose-700 border-rose-200"
  return "bg-slate-50 text-slate-700 border-slate-200"
}

export default function BalanceSheetTab() {
  const { toast } = useToast()
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<FiscalYear>(getCurrentFiscalYear())
  const [summary, setSummary] = useState<SummaryPayload>(emptySummary)
  const [isLoading, setIsLoading] = useState(false)
  const availableFiscalYears = useMemo(() => getAvailableFiscalYears(), [])
  const selectedRange = useMemo(() => getFiscalYearDateRange(selectedFiscalYear), [selectedFiscalYear])

  const loadSummary = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        startDate: selectedRange.startDate,
        endDate: selectedRange.endDate,
      })
      const response = await fetch(`/api/finance-balance-sheet?${params.toString()}`, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load balance sheet")
      }
      setSummary({
        totals: {
          inflowBooked: Number(data.totals?.inflowBooked) || 0,
          outflowBooked: Number(data.totals?.outflowBooked) || 0,
          netBooked: Number(data.totals?.netBooked) || 0,
          liveNetPosition: Number(data.totals?.liveNetPosition) || 0,
          receivablesOutstandingLive: Number(data.totals?.receivablesOutstandingLive) || 0,
          receivablesOverdueLive: Number(data.totals?.receivablesOverdueLive) || 0,
          receivablesInvoicedPeriod: Number(data.totals?.receivablesInvoicedPeriod) || 0,
          receivablesPaidPeriod: Number(data.totals?.receivablesPaidPeriod) || 0,
          receivablesOutstandingPeriod: Number(data.totals?.receivablesOutstandingPeriod) || 0,
          inventoryUsageValue: Number(data.totals?.inventoryUsageValue) || 0,
        },
        modules: Array.isArray(data.modules) ? data.modules : [],
      })
    } catch (error: any) {
      toast({
        title: "Balance sheet unavailable",
        description: error?.message || "Failed to load finance summary",
        variant: "destructive",
      })
      setSummary(emptySummary)
    } finally {
      setIsLoading(false)
    }
  }, [selectedRange.endDate, selectedRange.startDate, toast])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  const missingModules = useMemo(
    () => summary.modules.filter((line) => line.status === "missing").map((line) => line.tab),
    [summary.modules],
  )
  const uniqueMissingModules = useMemo(() => Array.from(new Set(missingModules)), [missingModules])
  const netToneClass = summary.totals.netBooked >= 0 ? "text-emerald-700" : "text-rose-700"
  const liveToneClass = summary.totals.liveNetPosition >= 0 ? "text-emerald-700" : "text-rose-700"

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-black/5 bg-white shadow-sm">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-2xl font-semibold text-neutral-900">Live Balance Sheet</CardTitle>
            <CardDescription>
              Consolidates money inflow and outflow from Sales, Accounts, Inventory transactions, Receivables, and Billing.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Fiscal year</span>
              <Select
                value={selectedFiscalYear.label}
                onValueChange={(label) => {
                  const matched = availableFiscalYears.find((fy) => fy.label === label)
                  if (matched) setSelectedFiscalYear(matched)
                }}
              >
                <SelectTrigger className="w-36">
                  <SelectValue placeholder={selectedFiscalYear.label} />
                </SelectTrigger>
                <SelectContent>
                  {availableFiscalYears.map((fy) => (
                    <SelectItem key={fy.label} value={fy.label}>
                      {fy.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={loadSummary} disabled={isLoading}>
              <RefreshCw className={cn("mr-2 h-3.5 w-3.5", isLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Card className="border-emerald-100 bg-emerald-50/60">
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Booked inflow</p>
                  <ArrowUpCircle className="h-4 w-4 text-emerald-700" />
                </div>
                {isLoading ? (
                  <Skeleton className="mt-3 h-8 w-36" />
                ) : (
                  <p className="mt-2 text-2xl font-semibold text-emerald-800">{formatCurrency(summary.totals.inflowBooked, 0)}</p>
                )}
                <p className="mt-1 text-xs text-emerald-700/80">Sales revenue in selected fiscal year.</p>
              </CardContent>
            </Card>
            <Card className="border-rose-100 bg-rose-50/60">
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-rose-700">Booked outflow</p>
                  <ArrowDownCircle className="h-4 w-4 text-rose-700" />
                </div>
                {isLoading ? (
                  <Skeleton className="mt-3 h-8 w-36" />
                ) : (
                  <p className="mt-2 text-2xl font-semibold text-rose-800">{formatCurrency(summary.totals.outflowBooked, 0)}</p>
                )}
                <p className="mt-1 text-xs text-rose-700/80">Labor + expense + inventory restock spend.</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-slate-50/70">
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-700">Booked net</p>
                  <Wallet className="h-4 w-4 text-slate-700" />
                </div>
                {isLoading ? (
                  <Skeleton className="mt-3 h-8 w-36" />
                ) : (
                  <p className={cn("mt-2 text-2xl font-semibold", netToneClass)}>{formatCurrency(summary.totals.netBooked, 0)}</p>
                )}
                <p className="mt-1 text-xs text-slate-600">Booked inflow minus booked outflow.</p>
              </CardContent>
            </Card>
            <Card className="border-amber-100 bg-amber-50/60">
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-700">Receivables live</p>
                  <TrendingUp className="h-4 w-4 text-amber-700" />
                </div>
                {isLoading ? (
                  <Skeleton className="mt-3 h-8 w-36" />
                ) : (
                  <p className="mt-2 text-2xl font-semibold text-amber-800">
                    {formatCurrency(summary.totals.receivablesOutstandingLive, 0)}
                  </p>
                )}
                <p className="mt-1 text-xs text-amber-700/80">
                  Open receivables; overdue: {formatCurrency(summary.totals.receivablesOverdueLive, 0)}.
                </p>
              </CardContent>
            </Card>
            <Card className="border-indigo-100 bg-indigo-50/60">
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-indigo-700">Live net position</p>
                  <CircleDashed className="h-4 w-4 text-indigo-700" />
                </div>
                {isLoading ? (
                  <Skeleton className="mt-3 h-8 w-36" />
                ) : (
                  <p className={cn("mt-2 text-2xl font-semibold", liveToneClass)}>
                    {formatCurrency(summary.totals.liveNetPosition, 0)}
                  </p>
                )}
                <p className="mt-1 text-xs text-indigo-700/80">Booked net plus live receivables outstanding.</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-slate-50/70">
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-700">Inventory usage value</p>
                  <CircleDashed className="h-4 w-4 text-slate-700" />
                </div>
                {isLoading ? (
                  <Skeleton className="mt-3 h-8 w-36" />
                ) : (
                  <p className="mt-2 text-2xl font-semibold text-slate-800">{formatCurrency(summary.totals.inventoryUsageValue, 0)}</p>
                )}
                <p className="mt-1 text-xs text-slate-600">Reference from deplete transactions, excluded from booked net.</p>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-xl border border-black/5 bg-slate-50/70 px-4 py-3 text-xs text-slate-600">
            Formula: <span className="font-medium">Booked Net = Sales Revenue - (Labor + Expense + Restock)</span>. Live net adds
            current receivables outstanding.
          </div>

          {uniqueMissingModules.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              Some sources are not configured in this database: {uniqueMissingModules.join(", ")}. Those lines are shown as 0.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-black/5 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Money Ledger Breakdown</CardTitle>
          <CardDescription>Cross-tab contribution line by line for the selected fiscal year.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Source</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead>Booked net</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={`ledger-skeleton-${index}`}>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-28 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    </TableRow>
                  ))}
                {!isLoading &&
                  summary.modules.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">{line.label}</div>
                        <div className="text-xs text-muted-foreground">{line.tab} · {line.note}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getDirectionBadge(line.direction)}>
                          {line.direction}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(line.amount, 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">{line.records.toLocaleString("en-IN")}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={line.includedInBookedNet ? "border-emerald-200 text-emerald-700" : ""}>
                          {line.includedInBookedNet ? "Included" : "Excluded"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={line.status === "available" ? "" : "border-amber-300 text-amber-800"}>
                          {line.status === "available" ? "Ready" : "Missing"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                {!isLoading && summary.modules.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No ledger data found for this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
