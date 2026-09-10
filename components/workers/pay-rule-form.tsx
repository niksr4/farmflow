"use client"

import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/format"
import { todayIso } from "@/lib/date-utils"
import type { PayRule } from "@/lib/pay-rules"
import { useSingleFlight } from "@/hooks/use-single-flight"

/**
 * Setting what an estate holds back, and what it pays for overtime.
 *
 * One form for both subjects: `workerId = null` writes the estate-wide default, a value writes an
 * override for that person. Medappa set 20% once rather than twenty-nine times; "everyone except
 * two" costs two more rows.
 *
 * THE EFFECTIVE-FROM DATE IS SHOWN AND EXPLAINED, NOT HIDDEN. It is the whole reason a payslip
 * printed in June still matches the screen in December: saving ADDS a rule from that date rather
 * than editing the one before it. A form that hid the field would leave somebody expecting an edit
 * and quietly getting a new period instead.
 *
 * "None" is a real choice, not an empty one — it is how an estate stops retaining from a date
 * without erasing what already accrued under the old rule.
 */

type Props = {
  /** null = the estate-wide default. */
  workerId: string | null
  /** For the live preview only; a rule is a percentage, not a rupee figure. */
  dailyRate?: number | null
  current?: PayRule | null
  /**
   * The row id to correct or remove — and it MUST belong to this form's own subject.
   *
   * Present = that rule can be corrected in place or removed; absent = the form only adds. For a
   * per-worker form, pass the worker's OWN rule row, never the estate rule they are inheriting;
   * `editableRow` below refuses the mismatch rather than trusting the caller.
   *
   * Correcting matters because saving normally ADDS a dated rule: somebody who typed 2 instead of
   * 20 a minute ago wants that row fixed, not a second period stacked on the first. PUT and DELETE
   * existed on the route and nothing called them, which is the same failure as the route nothing
   * called at all — one level down.
   */
  currentRuleId?: string | null
  onSaved: () => void
  onCancel: () => void
}

const RETENTION_MODES = [
  { value: "none", label: "No retention" },
  { value: "percent_of_day", label: "% of the day's pay" },
  { value: "flat_per_day", label: "Fixed ₹ per day worked" },
] as const

const OVERTIME_MODES = [
  { value: "none", label: "No overtime rule" },
  { value: "multiplier_of_hourly", label: "× the hourly rate" },
  { value: "multiplier_of_day", label: "× the whole day (holiday pay)" },
  { value: "explicit_hourly", label: "A fixed ₹ per hour" },
] as const

export default function PayRuleForm({ workerId, dailyRate, current, currentRuleId, onSaved, onCancel }: Props) {
  const [saving, setSaving] = useState(false)
  /**
   * Add a new dated rule, or correct the one already in force.
   *
   * Defaults to adding, because that is the safe direction: a new period never rewrites a paid
   * week, whereas correcting one does by design. Somebody who means to correct has to say so.
   */
  const [mode, setMode] = useState<"add" | "correct">("add")
  /**
   * Correcting and removing are offered only when the row in hand is the SAME SUBJECT as this form.
   *
   * The caller decides which id to pass, and one of them passed the wrong one: a worker's panel
   * handed over the ESTATE rule's id whenever that worker had no override, so Remove deleted the
   * rule for all of them and Correct rewrote what all of them were held back. Checking it here as
   * well means the invariant holds whatever the next caller does, rather than resting on the fix
   * one caller received.
   */
  const editableRow = Boolean(currentRuleId) && (current == null || (current.workerId ?? null) === (workerId ?? null))
  const [form, setForm] = useState({
    effectiveFrom: todayIso(),
    retentionMode: current?.retentionMode ?? "none",
    retentionValue: current?.retentionValue != null ? String(current.retentionValue) : "",
    overtimeMode: current?.overtimeMode ?? "none",
    overtimeValue: current?.overtimeValue != null ? String(current.overtimeValue) : "",
    fullDayHours: current?.fullDayHours != null ? String(current.fullDayHours) : "8",
  })

  /** What the rule does to a real day, so nobody has to work it out from a percentage. */
  const preview = useMemo(() => {
    const rate = Number(dailyRate) || 0
    const rv = Number(form.retentionValue)
    const ov = Number(form.overtimeValue)
    const hours = Number(form.fullDayHours) || 8
    const lines: string[] = []

    if (form.retentionMode === "percent_of_day" && rv > 0 && rate > 0) {
      lines.push(`Holds ${formatCurrency((rate * rv) / 100)} on a full day, ${formatCurrency((rate * rv) / 200)} on a half.`)
    } else if (form.retentionMode === "flat_per_day" && rv > 0) {
      lines.push(`Holds ${formatCurrency(rv)} on a full day, ${formatCurrency(rv / 2)} on a half.`)
    }

    if (form.overtimeMode === "multiplier_of_hourly" && ov > 0 && rate > 0 && hours > 0) {
      lines.push(`Overtime at ${formatCurrency((rate / hours) * ov)} an hour — ${formatCurrency(rate)} over ${hours} hours, × ${ov}.`)
    } else if (form.overtimeMode === "explicit_hourly" && ov > 0) {
      lines.push(`Overtime at ${formatCurrency(ov)} an hour, whatever the daily rate.`)
    } else if (form.overtimeMode === "multiplier_of_day" && ov > 1 && rate > 0) {
      lines.push(`A day marked as overtime pays ${formatCurrency(rate * ov)} instead of ${formatCurrency(rate)}. Hours are not counted.`)
    }

    return lines
  }, [form, dailyRate])

  const saveUnguarded = async () => {
    const retentionValue = form.retentionMode === "none" ? null : Number(form.retentionValue)
    const overtimeValue = form.overtimeMode === "none" ? null : Number(form.overtimeValue)

    if (form.retentionMode !== "none" && !(Number.isFinite(retentionValue) && (retentionValue as number) > 0)) {
      toast.error("Enter a retention amount greater than zero, or choose No retention")
      return
    }
    if (form.overtimeMode !== "none" && !(Number.isFinite(overtimeValue) && (overtimeValue as number) > 0)) {
      toast.error("Enter an overtime amount greater than zero, or choose No overtime rule")
      return
    }
    if (form.retentionMode === "percent_of_day" && (retentionValue as number) > 100) {
      toast.error("A percentage of the day's pay cannot be more than 100")
      return
    }

    setSaving(true)
    try {
      const correcting = mode === "correct" && editableRow && currentRuleId
      const res = await fetch(correcting ? `/api/worker-pay-rules/${currentRuleId}` : "/api/worker-pay-rules", {
        method: correcting ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(correcting ? {} : { workerId }),
          effectiveFrom: form.effectiveFrom,
          retentionMode: form.retentionMode === "none" ? null : form.retentionMode,
          retentionValue,
          overtimeMode: form.overtimeMode === "none" ? null : form.overtimeMode,
          overtimeValue,
          // Only meaningful for the hourly-derived mode; sending it otherwise stores a number
          // nothing reads, which is how a field starts lying about what it controls.
          fullDayHours: form.overtimeMode === "multiplier_of_hourly" ? Number(form.fullDayHours) || null : null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Could not save the rule")
      toast.success(correcting ? "Rule corrected" : workerId ? "Rule set for this worker" : "Estate rule set")
      onSaved()
    } catch (error: any) {
      toast.error(error?.message || "Could not save the rule")
    } finally {
      setSaving(false)
    }
  }

  const removeUnguarded = async () => {
    if (!currentRuleId || !editableRow) return
    // Names what disappears and what happens next, because "delete rule?" does not say that the
    // previous rule takes over, nor that money already held stays held.
    if (
      !window.confirm(
        "Remove this rule? Whatever applied before it takes over again, and retention already held stays held.",
      )
    ) {
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/worker-pay-rules/${currentRuleId}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Could not remove the rule")
      toast.success("Rule removed")
      onSaved()
    } catch (error: any) {
      toast.error(error?.message || "Could not remove the rule")
    } finally {
      setSaving(false)
    }
  }

  // Saving twice writes two dated rules, or corrects the same row twice — see the money panel.
  const save = useSingleFlight(saveUnguarded)
  const remove = useSingleFlight(removeUnguarded)

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Retention</Label>
          <Select value={form.retentionMode} onValueChange={(v) => setForm((p) => ({ ...p, retentionMode: v as any }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {RETENTION_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {form.retentionMode !== "none" && (
          <div className="space-y-1">
            <Label className="text-xs">{form.retentionMode === "percent_of_day" ? "Percentage" : "Rupees per day"}</Label>
            <Input
              inputMode="decimal"
              placeholder={form.retentionMode === "percent_of_day" ? "20" : "100"}
              value={form.retentionValue}
              onChange={(e) => setForm((p) => ({ ...p, retentionValue: e.target.value }))}
            />
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs">Overtime</Label>
          <Select value={form.overtimeMode} onValueChange={(v) => setForm((p) => ({ ...p, overtimeMode: v as any }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {OVERTIME_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {form.overtimeMode !== "none" && (
          <div className="space-y-1">
            <Label className="text-xs">
              {form.overtimeMode === "explicit_hourly" ? "Rupees per hour" : "Multiplier"}
            </Label>
            <Input
              inputMode="decimal"
              placeholder={form.overtimeMode === "explicit_hourly" ? "90" : "1.2"}
              value={form.overtimeValue}
              onChange={(e) => setForm((p) => ({ ...p, overtimeValue: e.target.value }))}
            />
          </div>
        )}

        {form.overtimeMode === "multiplier_of_hourly" && (
          <div className="space-y-1">
            <Label className="text-xs">Hours in a normal working day</Label>
            <Input
              inputMode="decimal"
              value={form.fullDayHours}
              onChange={(e) => setForm((p) => ({ ...p, fullDayHours: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground">
              This divides the daily rate to get an hourly one. ₹600 over 8 hours is ₹75; over 6 it is ₹100.
            </p>
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs">In force from</Label>
          <Input
            type="date"
            value={form.effectiveFrom}
            onChange={(e) => setForm((p) => ({ ...p, effectiveFrom: e.target.value }))}
          />
        </div>
      </div>

      {preview.length > 0 && (
        <div className="rounded border-l-2 border-emerald-600 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          {preview.map((line) => <div key={line}>{line}</div>)}
        </div>
      )}

      {/*
        Said plainly, because the alternative is somebody expecting an edit. Saving adds a rule from
        the chosen date; every period before it keeps computing at whatever was in force then, which
        is what makes a printed wage sheet still match the screen months later.
      */}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Saving adds a rule <strong>from that date onwards</strong>. Weeks already paid keep the rule that applied
        then, so old wage sheets do not change. To stop retaining, set it to <strong>No retention</strong> from the
        date it should stop — what has already been held stays held.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          {mode === "correct" && editableRow ? "Correct this rule" : workerId ? "Save rule for this worker" : "Save estate rule"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>

        {editableRow && (
          <>
            <button
              type="button"
              className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setMode((m) => (m === "add" ? "correct" : "add"))}
            >
              {mode === "add" ? "Correct the current rule instead" : "Add a new rule instead"}
            </button>
            <button
              type="button"
              className="text-xs text-destructive underline-offset-2 hover:underline"
              onClick={remove}
              disabled={saving}
            >
              Remove
            </button>
          </>
        )}
      </div>

      {mode === "correct" && editableRow && (
        <p className="rounded border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Correcting changes the rule <strong>for every week it already covers</strong>, so wage sheets already
          printed for those weeks will no longer match. Use it to fix a mistake, not to change policy — for a
          change, add a new rule from the date it starts.
        </p>
      )}
    </div>
  )
}
