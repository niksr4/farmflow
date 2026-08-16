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
type PeriodRow = { period: string; cost: number; entries: number }
type Summary = {
  total: number
  entries: number
  bucket: "week" | "month"
  source: { fromMuster: number; fromAccounts: number }
  byBlock: Row[]
  byWork: WorkRow[]
  byPeriod: PeriodRow[]
  filterOptions: { codes: string[]; blocks: Array<{ id: string; name: string }> }
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

/** Weeks read as dates; months read as months. */
const periodLabel = (iso: string, bucket: "week" | "month") => {
  const d = new Date(iso + "T12:00:00")
  if (Number.isNaN(d.getTime())) return iso
  return bucket === "month"
    ? d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

export default function LabourCostSummary({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  // Narrowing to one code or one block is how a grower actually interrogates this: "what did
  // weeding cost me", "what has that block taken". Both answerable across the whole history.
  const [code, setCode] = useState("")
  const [block, setBlock] = useState("")
  const [bucket, setBucket] = useState<"week" | "month">("week")
  // Kept from the unfiltered response so choosing a filter never empties its own picker.
  const [options, setOptions] = useState<Summary["filterOptions"]>({ codes: [], blocks: [] })

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void (async () => {
      try {
        const qs = new URLSearchParams({ startDate, endDate, bucket })
        if (code) qs.set("code", code)
        if (block) qs.set("locationId", block)
        const res = await fetch(`/api/labour-summary?${qs}`, { signal: controller.signal })
        const body = await res.json()
        if (body?.success) {
          setData(body)
          if (!code && !block) setOptions(body.filterOptions)
        }
      } catch {
        // Non-fatal: the labour list below still renders, this panel just stays empty. An abort
        // from a superseded filter change lands here too and is not a failure.
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [startDate, endDate, code, block, bucket])

  const filtered = Boolean(code || block)

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

  const selectCls =
    "h-8 rounded-lg border border-stone-200 bg-white px-2 text-xs font-semibold text-stone-600 " +
    "dark:border-white/[0.1] dark:bg-transparent dark:text-stone-300"

  return (
    <div className="space-y-4">
      {/* Ask it a narrower question. The pickers list what this period actually contains, so an
          option is never a dead end. */}
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Filter by work" className={selectCls} value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">All work</option>
          {options.codes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select aria-label="Filter by block" className={selectCls} value={block} onChange={(e) => setBlock(e.target.value)}>
          <option value="">All blocks</option>
          {options.blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <div className="flex overflow-hidden rounded-lg border border-stone-200 dark:border-white/[0.1]">
          {(["week", "month"] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBucket(b)}
              className={cn(
                "px-2.5 py-1.5 text-xs font-bold capitalize",
                bucket === b ? "bg-emerald-600 text-white" : "text-stone-500",
              )}
            >
              {b}ly
            </button>
          ))}
        </div>

        {filtered && (
          <button
            type="button"
            onClick={() => { setCode(""); setBlock("") }}
            className="text-xs font-bold text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
          >
            Clear
          </button>
        )}

        <span className="ml-auto text-sm font-black tabular-nums">
          {money(data.total)}
          <span className="ml-1.5 text-xs font-medium text-muted-foreground">
            over {data.entries} {data.entries === 1 ? "entry" : "entries"}
          </span>
        </span>
      </div>

      {/* When it was spent. This is the panel that shows a spike, which neither block nor code can. */}
      {data.byPeriod.length > 1 && (
        <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-white/[0.06] dark:bg-card">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">
            By {data.bucket}
          </p>
          <p className="mb-3 text-xs text-muted-foreground">When the money went out</p>
          <div className="flex items-end gap-1 overflow-x-auto pb-1" style={{ height: 96 }}>
            {data.byPeriod.map((row) => {
              const max = Math.max(1, ...data.byPeriod.map((r) => r.cost))
              return (
                <div key={row.period} className="flex min-w-[2.25rem] flex-1 flex-col items-center gap-1">
                  <div
                    title={`${periodLabel(row.period, data.bucket)} — ${money(row.cost)}`}
                    className="w-full rounded-t bg-emerald-600/80"
                    style={{ height: `${Math.max(2, (row.cost / max) * 68)}px` }}
                  />
                  <span className="whitespace-nowrap text-[9px] text-stone-400">
                    {periodLabel(row.period, data.bucket)}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

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
          {data.byWork.length === 1 && !filtered && (
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
