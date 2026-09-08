"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Plus, ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/format"
import { todayIso } from "@/lib/date-utils"
import { outstandingAdvance, retentionHeld, type LedgerEntry, type PayRule } from "@/lib/pay-rules"

/**
 * Everything about one worker's money, in the one place that already holds every other fact about
 * them.
 *
 * THIS IS THE SCREEN worker_ledger LOST. The Ledger subtab was deleted on 2026-09-08 because it
 * bundled a rule, a history and an entry form that each belong somewhere else -- but payroll never
 * stopped deducting from the table, so until this existed there was a term in payroll's arithmetic
 * fed by something nobody could write to. tests/payroll-sources-are-reachable.test.ts has been
 * failing on purpose to say so.
 *
 * Its own file rather than more lines in worker-profiles-tab.tsx, which is already 1,249 against a
 * 1,000-line target.
 *
 * TWO BALANCES, NEVER NETTED. A worker can have Rs 14,400 of their own money held by the estate and
 * separately owe Rs 2,000. One figure of Rs 12,400 hides both and settles wrong when they leave.
 */

type Props = {
  workerId: string
  workerName: string
  dailyRate: number | null
  /** Advances and repayments are money changing hands, so they are the estate admin's to record. */
  canAdmin: boolean
}

type EntryRow = LedgerEntry & { description: string | null }

const ENTRY_LABELS: Record<string, string> = {
  advance: "Advance",
  repayment: "Repayment",
  deduction: "Deduction",
  adjustment: "Adjustment",
  retention_accrual: "Retention",
  retention_payout: "Retention paid out",
}

/** Entries that increase what the estate holds, for colouring only. */
const CREDITS = new Set(["retention_accrual", "repayment"])

export default function WorkerMoneyPanel({ workerId, workerName, dailyRate, canAdmin }: Props) {
  const [entries, setEntries] = useState<EntryRow[]>([])
  const [rule, setRule] = useState<PayRule | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)

  const [form, setForm] = useState({
    entryType: "advance",
    entryDate: todayIso(),
    amount: "",
    recoverOverPeriods: "1",
    description: "",
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ledgerRes, rulesRes] = await Promise.all([
        fetch(`/api/worker-ledger?workerId=${workerId}`),
        fetch(`/api/worker-pay-rules?workerId=${workerId}`),
      ])
      const ledger = await ledgerRes.json()
      const rules = await rulesRes.json()
      if (ledger?.success) setEntries(ledger.entries || [])
      if (rules?.success) setRule(rules.effectiveRule ?? null)
    } catch {
      // A panel that cannot load must say so. Rendering empty reads as "this worker has no
      // advances", which is the same shape as the bug that hid worker_ledger for six weeks.
      toast.error("Could not load this worker's money history")
    } finally {
      setLoading(false)
    }
  }, [workerId])

  useEffect(() => {
    load()
  }, [load])

  const held = useMemo(() => retentionHeld(entries), [entries])
  /**
   * Recovered-to-date is 0 until payroll writes its accruals, so this is what has been ADVANCED
   * less what has been repaid in cash — deliberately the larger, more cautious figure. It cannot
   * silently under-report a debt; it can only over-report one until the payroll side lands.
   */
  const owed = useMemo(() => outstandingAdvance(entries, 0), [entries])

  const retentionPerDay = useMemo(() => {
    if (!rule?.retentionMode || rule.retentionValue == null) return null
    if (rule.retentionMode === "flat_per_day") return rule.retentionValue
    if (!dailyRate) return null
    return (dailyRate * rule.retentionValue) / 100
  }, [rule, dailyRate])

  const submit = async () => {
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter an amount greater than zero")
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        workerId,
        entryDate: form.entryDate,
        entryType: form.entryType,
        amount,
        description: form.description.trim() || null,
      }
      // Only an advance carries a schedule; the route refuses one on anything else rather than
      // ignoring it, so do not send it.
      if (form.entryType === "advance") {
        body.recoverOverPeriods = Math.max(1, Number(form.recoverOverPeriods) || 1)
      }
      const res = await fetch("/api/worker-ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Could not save")
      toast.success("Recorded")
      setForm({ entryType: "advance", entryDate: todayIso(), amount: "", recoverOverPeriods: "1", description: "" })
      setAdding(false)
      load()
    } catch (error: any) {
      toast.error(error?.message || "Could not save")
    } finally {
      setSaving(false)
    }
  }

  const instalment =
    form.entryType === "advance" && Number(form.amount) > 0
      ? Number(form.amount) / Math.max(1, Number(form.recoverOverPeriods) || 1)
      : null

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading {workerName}&apos;s history…
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Held for them</div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{formatCurrency(held)}</div>
          <p className="mt-1 text-xs text-muted-foreground">Retention. Paid out when they leave.</p>
        </div>

        <div className="rounded-lg border p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">They owe</div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-rose-700 dark:text-rose-400">
            {formatCurrency(owed)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Advances not yet recovered.</p>
        </div>

        <div className="rounded-lg border p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pay rule</div>
          {rule?.retentionMode ? (
            <>
              <div className="mt-1 text-sm font-semibold">
                {rule.retentionMode === "percent_of_day"
                  ? `${rule.retentionValue}% of the day`
                  : `${formatCurrency(rule.retentionValue ?? 0)} per day`}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {retentionPerDay != null ? `${formatCurrency(retentionPerDay)} on a full day · ` : ""}
                in force since {rule.effectiveFrom}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">No retention set.</p>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold">History</h4>
          {canAdmin ? (
            <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Record
            </Button>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5" /> Only an admin can record advances
            </span>
          )}
        </div>

        {adding && canAdmin && (
          <div className="mb-3 space-y-3 rounded-lg border bg-muted/30 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={form.entryType} onValueChange={(v) => setForm((p) => ({ ...p, entryType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="advance">Advance</SelectItem>
                    <SelectItem value="repayment">Repayment</SelectItem>
                    <SelectItem value="deduction">Deduction</SelectItem>
                    <SelectItem value="retention_payout">Retention paid out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={form.entryDate} onChange={(e) => setForm((p) => ({ ...p, entryDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount</Label>
                <Input inputMode="decimal" placeholder="0" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
              </div>
              {form.entryType === "advance" && (
                <div className="space-y-1">
                  <Label className="text-xs">Recover over (payroll runs)</Label>
                  <Input
                    inputMode="numeric"
                    value={form.recoverOverPeriods}
                    onChange={(e) => setForm((p) => ({ ...p, recoverOverPeriods: e.target.value }))}
                  />
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Note (optional)</Label>
              <Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </div>

            {instalment != null && (
              <p className="rounded border-l-2 border-emerald-600 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                {Number(form.recoverOverPeriods) > 1
                  ? `${formatCurrency(instalment)} from each of the next ${Number(form.recoverOverPeriods)} payroll runs, then it stops on its own.`
                  : `${formatCurrency(instalment)} comes off the next payroll run, and nothing after it.`}
              </p>
            )}

            <div className="flex gap-2">
              <Button size="sm" onClick={submit} disabled={saving}>
                {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {entries.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            Nothing recorded for {workerName} yet.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="w-20 shrink-0 text-xs text-muted-foreground">{String(e.entryDate).slice(0, 10)}</span>
                <span className="flex-1 truncate text-muted-foreground">
                  {ENTRY_LABELS[e.entryType] || e.entryType}
                  {e.description ? ` · ${e.description}` : ""}
                  {e.entryType === "advance" && (e.recoverOverPeriods ?? 1) > 1
                    ? ` · over ${e.recoverOverPeriods} runs`
                    : ""}
                </span>
                <span
                  className={`font-mono font-semibold tabular-nums ${
                    CREDITS.has(e.entryType) ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
                  }`}
                >
                  {CREDITS.has(e.entryType) ? "+" : "−"}
                  {formatCurrency(e.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
