"use client"

/**
 * Where the labour money went: by block, by work, and estate versus contract.
 *
 * Reads /api/labour-summary, which reads the labour_cost view -- so it answers correctly whether
 * a tenant is still typing aggregate entries into Accounts or has moved to allocating from the
 * muster roll, and keeps answering correctly through the switch.
 *
 * Works on data estates already have: a legacy labour entry carries a block and an activity code,
 * so cost-per-block is answerable today, before any of the new entry flow is adopted.
 */

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

type Row = { label: string; estate: string | null; areaAcres: number | null; cost: number; costPerAcre: number | null }
type WorkRow = { code: string; name: string | null; cost: number }
type Summary = {
  total: number
  entries: number
  source: { fromMuster: number; fromAccounts: number }
  byBlock: Row[]
  byWork: WorkRow[]
  byKind: { estateLabourers: number; contractLabourers: number; estateCost: number; contractCost: number }
}

const money = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN")

function Bars({ rows, tone }: { rows: Array<{ key: string; label: string; sub?: string | null; cost: number }>; tone: "clay" | "green" }) {
  const max = Math.max(1, ...rows.map((r) => r.cost))
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-stone-700 dark:text-stone-300">
              {r.label}
              {r.sub && <span className="ml-1.5 text-xs text-muted-foreground">{r.sub}</span>}
            </span>
            <span className="shrink-0 font-bold tabular-nums">{money(r.cost)}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-white/[0.06]">
            <div
              className={cn("h-full rounded-full", tone === "clay" ? "bg-amber-700/80" : "bg-emerald-600/80")}
              style={{ width: `${Math.max(2, (r.cost / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function LabourCostSummary({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const res = await fetch(`/api/labour-summary?startDate=${startDate}&endDate=${endDate}`)
        const body = await res.json()
        if (!cancelled && body?.success) setData(body)
      } catch {
        // Non-fatal: the labour list below still renders, this panel just stays empty.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [startDate, endDate])

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white p-6 text-sm text-muted-foreground dark:border-white/[0.06] dark:bg-card">
        <Loader2 className="h-4 w-4 animate-spin" /> Working out where the labour went…
      </div>
    )
  }
  if (!data || data.entries === 0) return null

  const { byKind } = data
  const kindTotal = byKind.estateCost + byKind.contractCost

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-white/[0.06] dark:bg-card">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">By block</p>
          <p className="mb-3 text-xs text-muted-foreground">Where the work happened</p>
          <Bars
            tone="clay"
            rows={data.byBlock.slice(0, 8).map((b) => ({
              key: b.label,
              label: b.label,
              // Cost per acre is what growers actually compare blocks on. Shown only where the
              // block has an area recorded -- see scripts/114.
              sub: b.costPerAcre != null ? `${money(b.costPerAcre)}/acre` : null,
              cost: b.cost,
            }))}
          />
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-white/[0.06] dark:bg-card">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">By work</p>
          <p className="mb-3 text-xs text-muted-foreground">What the money was spent doing</p>
          <Bars
            tone="green"
            rows={data.byWork.slice(0, 8).map((w) => ({
              key: w.code,
              label: w.name || w.code,
              sub: w.name ? w.code : null,
              cost: w.cost,
            }))}
          />
          {data.byWork.length === 1 && (
            // A single bucket means every entry carries the same code, so this breakdown cannot
            // tell the estate anything. Worth saying plainly rather than showing one full-width bar
            // and letting it read as a finding.
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              Every entry uses the same activity code, so this cannot show what the money was spent
              doing. Allocating work per worker on the muster roll is what separates it out.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-white/[0.06] dark:bg-card">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">Estate vs contract</p>
          <p className="mb-3 text-xs text-muted-foreground">Own staff against hired crews</p>
          {kindTotal > 0 ? (
            <Bars
              tone="clay"
              rows={[
                { key: "estate", label: "Estate workers", sub: `${Math.round(byKind.estateLabourers)} labourer-days`, cost: byKind.estateCost },
                { key: "contract", label: "Contract crews", sub: `${Math.round(byKind.contractLabourers)} labourer-days`, cost: byKind.contractCost },
              ]}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No split recorded for this period.</p>
          )}
          <p className="mt-3 text-lg font-black tabular-nums">{money(data.total)}<span className="ml-1.5 text-xs font-medium text-muted-foreground">total</span></p>
        </section>
      </div>

      {/* Only meaningful mid-changeover, when one fiscal year legitimately holds both kinds of row. */}
      {data.source.fromMuster > 0 && data.source.fromAccounts > 0 && (
        <p className="text-xs text-muted-foreground">
          {data.source.fromAccounts} {data.source.fromAccounts === 1 ? "entry" : "entries"} typed into Accounts,{" "}
          {data.source.fromMuster} allocated from the muster roll.
        </p>
      )}
    </div>
  )
}
