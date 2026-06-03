"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { TrendingUp, TrendingDown, IndianRupee, ChevronDown, Package, Users, BarChart2, Printer, CheckCircle2, AlertTriangle, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SeasonPLResponse } from "@/app/api/season-pl/route"

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n)

const fmtKg = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(n) + " kg"

const fmtPct = (n: number) => `${n.toFixed(1)}%`

function KpiCard({
  label,
  value,
  sub,
  positive,
  icon: Icon,
}: {
  label: string
  value: string
  sub?: string
  positive?: boolean
  icon?: React.ElementType
}) {
  return (
    <Card className="border-border/60 bg-white/80">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p
              className={cn(
                "text-2xl font-bold",
                positive === true && "text-emerald-700",
                positive === false && "text-red-600",
              )}
            >
              {value}
            </p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          {Icon && (
            <div className="rounded-lg bg-emerald-50 p-2">
              <Icon className="h-4 w-4 text-emerald-600" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function CostBar({ label, amount, pct }: { label: string; amount: number; pct: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground truncate max-w-[60%]">{label}</span>
        <span className="text-muted-foreground">{fmt(amount)} · {fmtPct(pct)}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-amber-400"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  )
}

type DateRange = { start: string; end: string }

function getCurrentSeasonRange(): DateRange {
  const now = new Date()
  const year = now.getFullYear()
  // Coffee season in India: roughly Oct → Mar
  const seasonStart = now.getMonth() >= 9
    ? new Date(year, 9, 1)     // Oct this year
    : new Date(year - 1, 9, 1) // Oct last year
  const seasonEnd = new Date(seasonStart)
  seasonEnd.setMonth(seasonEnd.getMonth() + 6)
  return {
    start: seasonStart.toISOString().slice(0, 10),
    end: seasonEnd.toISOString().slice(0, 10),
  }
}

export default function SeasonPlTab() {
  const [range, setRange] = useState<DateRange>(getCurrentSeasonRange)
  const [data, setData] = useState<SeasonPLResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showProduction, setShowProduction] = useState(false)
  const [showBuyers, setShowBuyers] = useState(false)

  const fetchPl = useCallback(async (r: DateRange) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/season-pl?start=${r.start}&end=${r.end}`)
      const json: SeasonPLResponse = await res.json()
      if (!json.success) throw new Error(json.error ?? "Failed to load P&L")
      setData(json)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPl(range) }, [range, fetchPl])

  const handlePrint = () => window.print()

  const presets: Array<{ label: string; range: DateRange }> = [
    { label: "Current season", range: getCurrentSeasonRange() },
    {
      label: "Last 12 months",
      range: {
        start: new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10),
        end: new Date().toISOString().slice(0, 10),
      },
    },
    {
      label: "Calendar year",
      range: {
        start: `${new Date().getFullYear()}-01-01`,
        end: `${new Date().getFullYear()}-12-31`,
      },
    },
  ]

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Season Profit & Loss</h2>
          <p className="text-sm text-muted-foreground">
            Revenue, cost breakdown, and profitability for your selected period.
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <div className="flex gap-1">
            {presets.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant={range.start === p.range.start && range.end === p.range.end ? "default" : "outline"}
                onClick={() => setRange(p.range)}
                className={cn(
                  "text-xs",
                  range.start === p.range.start && "bg-emerald-600 hover:bg-emerald-700",
                )}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground print:block">
        Period: {range.start} → {range.end}
      </p>

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <p className="text-sm text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {data && !loading && (
        <>
          {/* Top KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Total Revenue"
              value={fmt(data.revenue.totalSalesInr)}
              sub={`${fmtKg(data.revenue.totalKgSold)} sold`}
              positive={data.revenue.totalSalesInr > 0}
              icon={IndianRupee}
            />
            <KpiCard
              label="Total Costs"
              value={fmt(data.costs.totalCostsInr)}
              sub={`Labour + expenses`}
              positive={false}
              icon={BarChart2}
            />
            <KpiCard
              label="Gross Profit"
              value={fmt(data.profitability.grossProfitInr)}
              sub={`${fmtPct(data.profitability.grossMarginPct)} margin`}
              positive={data.profitability.grossProfitInr >= 0}
              icon={data.profitability.grossProfitInr >= 0 ? TrendingUp : TrendingDown}
            />
            <KpiCard
              label="Avg Realization"
              value={`₹${data.profitability.revenuePerKgSold.toFixed(0)}/kg`}
              sub={`Cost: ₹${data.profitability.costPerKgProduced.toFixed(0)}/kg`}
              icon={Package}
            />
          </div>

          {/* Production + Cost Breakdown — collapsed by default */}
          <Card className="border-border/60 bg-white/80">
            <button
              type="button"
              className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-stone-50/60 transition-colors"
              onClick={() => setShowProduction(v => !v)}
            >
              <div>
                <p className="text-base font-semibold text-stone-900">Production &amp; Cost Breakdown</p>
                <p className="text-xs text-muted-foreground">
                  {data.production.processingDays} processing days · {fmt(data.costs.totalCostsInr)} total costs
                </p>
              </div>
              <ChevronDown className={cn("h-4 w-4 text-stone-400 shrink-0 ml-3 transition-transform", showProduction && "rotate-180")} />
            </button>
            {showProduction && (
              <div className="grid gap-4 border-t border-stone-100 p-5 lg:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Production</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><p className="text-muted-foreground">Cherry received</p><p className="font-semibold">{fmtKg(data.production.totalCherryKg)}</p></div>
                    <div><p className="text-muted-foreground">Dry parchment</p><p className="font-semibold">{fmtKg(data.production.totalDryParchKg)}</p></div>
                    <div><p className="text-muted-foreground">Dry cherry</p><p className="font-semibold">{fmtKg(data.production.totalDryCherryKg)}</p></div>
                    <div><p className="text-muted-foreground">Cherry → Dry Parch</p><p className="font-semibold">{fmtPct(data.production.cherryToDryParchPct)}</p></div>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Cost Breakdown</p>
                  {data.costs.byCategory.slice(0, 8).map((c) => (
                    <CostBar key={c.category} label={c.category} amount={c.amountInr} pct={c.pct} />
                  ))}
                  {data.costs.byCategory.length === 0 && <p className="text-sm text-muted-foreground">No cost records.</p>}
                </div>
              </div>
            )}
          </Card>

          {/* Revenue by Buyer — collapsed by default */}
          {data.revenue.byBuyer.length > 0 && (
            <Card className="border-border/60 bg-white/80">
              <button
                type="button"
                className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-stone-50/60 transition-colors"
                onClick={() => setShowBuyers(v => !v)}
              >
                <div>
                  <p className="text-base font-semibold text-stone-900">Revenue by Buyer</p>
                  <p className="text-xs text-muted-foreground">{data.revenue.byBuyer.length} buyer{data.revenue.byBuyer.length > 1 ? "s" : ""} · {fmt(data.revenue.totalSalesInr)} total</p>
                </div>
                <ChevronDown className={cn("h-4 w-4 text-stone-400 shrink-0 ml-3 transition-transform", showBuyers && "rotate-180")} />
              </button>
              {showBuyers && (
                <div className="border-t border-stone-100 p-5">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 font-medium">Buyer</th>
                          <th className="pb-2 font-medium text-right">Kg Sold</th>
                          <th className="pb-2 font-medium text-right">Avg ₹/kg</th>
                          <th className="pb-2 font-medium text-right">Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {data.revenue.byBuyer.map((b) => (
                          <tr key={b.buyer}>
                            <td className="py-2 font-medium">{b.buyer}</td>
                            <td className="py-2 text-right text-muted-foreground">{fmtKg(b.kgSold)}</td>
                            <td className="py-2 text-right"><Badge variant="outline" className="font-mono">₹{b.avgPricePerKg.toFixed(0)}</Badge></td>
                            <td className="py-2 text-right font-semibold">{fmt(b.amountInr)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t font-semibold">
                          <td className="pt-2">Total</td>
                          <td className="pt-2 text-right text-muted-foreground">{fmtKg(data.revenue.totalKgSold)}</td>
                          <td className="pt-2 text-right"><Badge variant="outline" className="font-mono">₹{data.revenue.avgPricePerKg.toFixed(0)}</Badge></td>
                          <td className="pt-2 text-right text-emerald-700">{fmt(data.revenue.totalSalesInr)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Reconciliation panel */}
          {data.reconciliation && (
            <Card className="border-stone-200 bg-white">
              <CardHeader className="border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  {!data.reconciliation.balanceOk ? (
                    <XCircle className="h-4 w-4 text-rose-500" />
                  ) : data.reconciliation.unsoldKg > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  )}
                  <CardTitle className="text-base">Reconciliation</CardTitle>
                </div>
                <CardDescription>Dispatch ↔ Sales balance and closing inventory position</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-stone-100 bg-stone-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">Dispatched & received</p>
                    <p className="mt-1 text-xl font-black tabular-nums text-stone-900">{fmtKg(data.reconciliation.dispatchKgReceived)}</p>
                    <p className="mt-0.5 text-xs text-stone-400">from curing works</p>
                  </div>
                  <div className="rounded-lg border border-stone-100 bg-stone-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">Sold this period</p>
                    <p className="mt-1 text-xl font-black tabular-nums text-stone-900">{fmtKg(data.reconciliation.salesKgSold)}</p>
                    <p className="mt-0.5 text-xs text-stone-400">recorded in sales</p>
                  </div>
                  <div className={cn("rounded-lg border p-3", data.reconciliation.balanceOk ? "border-emerald-100 bg-emerald-50" : "border-rose-200 bg-rose-50")}>
                    <p className={cn("text-[10px] font-bold uppercase tracking-[0.18em]", data.reconciliation.balanceOk ? "text-emerald-600" : "text-rose-600")}>
                      {data.reconciliation.balanceOk ? "Unsold balance" : "Balance error"}
                    </p>
                    <p className={cn("mt-1 text-xl font-black tabular-nums", data.reconciliation.balanceOk ? "text-emerald-800" : "text-rose-700")}>
                      {data.reconciliation.balanceOk
                        ? fmtKg(data.reconciliation.unsoldKg)
                        : `−${fmtKg(Math.abs(data.reconciliation.unsoldKg))}`}
                    </p>
                    <p className={cn("mt-0.5 text-xs", data.reconciliation.balanceOk ? "text-emerald-600" : "text-rose-600")}>
                      {data.reconciliation.balanceOk
                        ? `${fmtPct(data.reconciliation.unsoldPct)} unsold`
                        : "Sold more than dispatched — check records"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-sky-100 bg-sky-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-600">Closing inventory value</p>
                    <p className="mt-1 text-xl font-black tabular-nums text-sky-900">{fmt(data.reconciliation.closingInventoryValue)}</p>
                    <p className="mt-0.5 text-xs text-sky-600">inputs on hand (cost basis)</p>
                  </div>
                </div>
                {!data.reconciliation.balanceOk && (
                  <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    <span className="font-bold">Data integrity issue:</span> Sales kg exceed dispatch kgs received by {fmtKg(Math.abs(data.reconciliation.unsoldKg))}. This means either dispatch records are incomplete or sales entries have incorrect kg figures. Review both tabs to reconcile.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* No data state */}
          {data.revenue.totalSalesInr === 0 && data.costs.totalCostsInr === 0 && (
            <Card className="border-dashed border-border/60">
              <CardContent className="py-10 text-center">
                <BarChart2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No sales or cost records for this period.</p>
                <p className="mt-1 text-xs text-muted-foreground">Try selecting a different date range.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
