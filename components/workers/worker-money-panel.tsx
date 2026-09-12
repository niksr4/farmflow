"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, Loader2, Pencil, Plus, ShieldAlert, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/format"
import { todayIso } from "@/lib/date-utils"
import { outstandingAdvance, type LedgerEntry, type PayRule } from "@/lib/pay-rules"
import PayRuleForm from "@/components/workers/pay-rule-form"
import { useSingleFlight } from "@/hooks/use-single-flight"

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
  /** What applies to this worker — which may be the estate default they are inheriting. */
  const [rule, setRule] = useState<(PayRule & { id?: string }) | null>(null)
  /**
   * This worker's OWN rule row, null while they inherit the estate default.
   *
   * Kept apart from `rule` because only this one may be corrected or removed from here. Passing the
   * effective rule's id to those controls meant a worker's card could delete the estate-wide rule
   * for everybody, under a heading naming one person. See workerRule in the route.
   */
  const [ownRule, setOwnRule] = useState<(PayRule & { id?: string }) | null>(null)
  /**
   * Retention held, DERIVED SERVER-SIDE from days worked x the rule in force on each of them.
   *
   * This used to be retentionHeld(entries) — the sum of `retention_accrual` rows — and nothing in
   * the product writes one. The route refuses to create them (they are derived, and a typed one
   * would be counted twice), payroll derives rather than writes, and the only inserter anywhere is
   * the dev seeder. So this card read Rs 0 on every real estate, forever, while payroll took 20%
   * of every day. Deriving it in the client instead would need every assignment the worker has
   * ever had, which is a query, which belongs on the server.
   */
  const [held, setHeld] = useState(0)
  /** Outstanding advance over the whole ledger, derived server-side. Null until it arrives. */
  const [serverOwed, setServerOwed] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  /**
   * Every record here is editable and removable, like everything else in this product. An advance
   * mistyped as Rs 20,000 instead of Rs 2,000 is a thing that happens on a phone, and the fix must
   * not be a database query. The route gates both on the same admin check as creating one -- a
   * permission that stops at creation is not a permission.
   */
  const [editingRule, setEditingRule] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ amount: "", entryDate: "", description: "", recoverOverPeriods: "1" })

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
      if (ledger?.success) {
        setEntries(ledger.entries || [])
        setHeld(Number(ledger.retentionHeldToDate) || 0)
        setServerOwed(
          typeof ledger.outstandingAdvanceToDate === "number" ? ledger.outstandingAdvanceToDate : null,
        )
      }
      if (rules?.success) {
        setRule(rules.effectiveRule ?? null)
        setOwnRule(rules.workerRule ?? null)
      }
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

  /**
   * Everything advanced, less cash repaid — deliberately WITHOUT netting off instalments recovered
   * so far, because this panel does not know which payroll runs have happened.
   *
   * The cautious direction on purpose: it can over-report a debt, never under-report one. Payroll
   * shows the figure net of recovery for the run it is computing; this shows the ceiling.
   *
   * ⚠ TAKEN FROM THE SERVER, NOT FROM `entries`. This used to be outstandingAdvance(entries), and
   * `entries` is a PAGE — the route returns the 200 newest rows by default. Past that an older
   * unpaid advance silently drops out of the sum and the debt is understated; an older repayment
   * dropping out overstates it. Either way the screen shows a confident figure computed from a
   * truncated history, with nothing to say it was truncated. Raised by Greptile 2026-09-12.
   *
   * The fallback keeps the old behaviour for the brief moment before the first response lands,
   * and for a server too old to send the field.
   */
  const owed = useMemo(
    () => (serverOwed != null ? serverOwed : outstandingAdvance(entries)),
    [serverOwed, entries],
  )

  const retentionPerDay = useMemo(() => {
    if (!rule?.retentionMode || rule.retentionValue == null) return null
    if (rule.retentionMode === "flat_per_day") return rule.retentionValue
    if (!dailyRate) return null
    return (dailyRate * rule.retentionValue) / 100
  }, [rule, dailyRate])

  const submitUnguarded = async () => {
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

  const startEdit = (e: EntryRow) => {
    setEditingId(e.id)
    setEditForm({
      amount: String(e.amount),
      entryDate: String(e.entryDate).slice(0, 10),
      description: e.description || "",
      recoverOverPeriods: String(e.recoverOverPeriods ?? 1),
    })
  }

  const saveEditUnguarded = async (entry: EntryRow) => {
    const amount = Number(editForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter an amount greater than zero")
      return
    }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        amount,
        entryDate: editForm.entryDate,
        description: editForm.description.trim() || null,
      }
      if (entry.entryType === "advance") {
        body.recoverOverPeriods = Math.max(1, Number(editForm.recoverOverPeriods) || 1)
      }
      const res = await fetch(`/api/worker-ledger/${entry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Could not update")
      toast.success("Updated")
      setEditingId(null)
      load()
    } catch (error: any) {
      toast.error(error?.message || "Could not update")
    } finally {
      setSaving(false)
    }
  }

  const removeUnguarded = async (entry: EntryRow) => {
    // Says what disappears and what it was, because the balances above move as a result and a
    // half-remembered "delete entry?" is how the wrong row goes.
    const label = `${ENTRY_LABELS[entry.entryType] || entry.entryType} of ${formatCurrency(entry.amount)} on ${String(entry.entryDate).slice(0, 10)}`
    if (!window.confirm(`Remove this ${label}? The balances above will change to match.`)) return
    setSaving(true)
    try {
      const res = await fetch(`/api/worker-ledger/${entry.id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Could not remove")
      toast.success("Removed")
      load()
    } catch (error: any) {
      toast.error(error?.message || "Could not remove")
    } finally {
      setSaving(false)
    }
  }

  /**
   * A double-tap must not hand out the advance twice.
   *
   * `disabled={saving}` only takes effect on the NEXT render; a ref inside the runner is set in the
   * same tick. lib/single-flight.ts exists for exactly this and fourteen other components already
   * use it — the two handling money did not, and an advance is the most expensive row in the
   * product to duplicate. On a phone, on a slow connection, two taps is not an unusual thing to do.
   */
  const submit = useSingleFlight(submitUnguarded)
  const saveEdit = useSingleFlight(saveEditUnguarded)
  const remove = useSingleFlight(removeUnguarded)

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
          <p className="mt-1 text-xs text-muted-foreground">
            {rule?.retentionMode
              ? "Retention on every day worked. Paid out when they leave."
              : "Retention. Paid out when they leave."}
          </p>
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
              {/* Which rule this is, said plainly. "20% since 1 June" on somebody's card reads as
                  a decision made about them, and acting on it as though it were is how the estate
                  rule got changed from a single worker's screen. */}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {ownRule ? "Set for this worker." : "Inherited from the estate rule — the same for everyone."}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">No retention set.</p>
          )}
          {canAdmin && (
            <button
              type="button"
              className="mt-2 self-start text-xs font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
              onClick={() => setEditingRule((v) => !v)}
            >
              {ownRule ? "Change this worker's rule" : "Set a rule for this worker"}
            </button>
          )}
        </div>
      </div>

      {editingRule && canAdmin && (
        <PayRuleForm
          workerId={workerId}
          dailyRate={dailyRate}
          // The effective rule seeds the fields, so an override starts from what the worker is on
          // today rather than from blank -- but only their OWN row may be corrected or removed.
          current={rule}
          currentRuleId={ownRule?.id ?? null}
          onSaved={() => { setEditingRule(false); load() }}
          onCancel={() => setEditingRule(false)}
        />
      )}

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
            {entries.map((e) =>
              editingId === e.id ? (
                <div key={e.id} className="space-y-2 bg-muted/40 px-3 py-2">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input type="date" value={editForm.entryDate} onChange={(ev) => setEditForm((p) => ({ ...p, entryDate: ev.target.value }))} />
                    <Input inputMode="decimal" value={editForm.amount} onChange={(ev) => setEditForm((p) => ({ ...p, amount: ev.target.value }))} />
                    {e.entryType === "advance" ? (
                      <Input
                        inputMode="numeric"
                        value={editForm.recoverOverPeriods}
                        onChange={(ev) => setEditForm((p) => ({ ...p, recoverOverPeriods: ev.target.value }))}
                        aria-label="Recover over how many payroll runs"
                      />
                    ) : null}
                  </div>
                  <Input
                    value={editForm.description}
                    placeholder="Note"
                    onChange={(ev) => setEditForm((p) => ({ ...p, description: ev.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(e)} disabled={saving}>
                      <Check className="mr-1 h-3.5 w-3.5" /> Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      <X className="mr-1 h-3.5 w-3.5" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
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
                  {/* A retention accrual is derived from days worked and the rule in force, so it is
                      not a row anybody typed and not one to hand-edit -- correct the rule or the
                      muster instead. Everything a person entered is editable and removable. */}
                  {canAdmin && e.entryType !== "retention_accrual" ? (
                    <span className="flex shrink-0 gap-0.5">
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEdit(e)} aria-label={`Edit this ${ENTRY_LABELS[e.entryType] || e.entryType}`}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => remove(e)} aria-label={`Remove this ${ENTRY_LABELS[e.entryType] || e.entryType}`}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </span>
                  ) : null}
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  )
}
