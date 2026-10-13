"use client"

import { useState, useEffect, useCallback } from "react"
import { useSingleFlight } from "@/hooks/use-single-flight"
import { todayIso } from "@/lib/date-utils"
import { Plus, Pencil, Trash2, Check, X, Loader2, Wheat } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyStateTable } from "@/components/ui/empty-state"
import { FieldLabel } from "@/components/ui/field-label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { FARMFLOW_RECORD_SAVED_EVENT } from "@/components/inventory-system/constants"
import { canWriteModule, canDeleteModule, type UserRole } from "@/lib/permissions"
import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/format"
import {
  pickingModeNeeds,
  pickingMinimumWageShortfall,
  pickingRowCost,
  pickingRowProblem,
} from "@/lib/picking-pay"
import type { LocationOption } from "@/components/inventory-system/types"
import { formatLocationLabel } from "@/lib/location-label"
import FilterBar from "@/components/filter-bar"
import { useListControls } from "@/hooks/use-list-controls"
import { numericInputValue } from "@/lib/number-input"

/**
 * The roster row, not just a label. The day rate and the crew size are what the form prefills and
 * what the cost is computed from -- before this the picker kept only {id, name}, which is why a
 * day-rate mode could not exist in the UI at all.
 */
type Worker = {
  id: string
  name: string
  dailyRate: number | null
  kind: "individual" | "gang"
  headcount: number | null
  workerType: string | null
}

type PickingRecord = {
  id: string
  workerId: string
  workerName: string
  pickDate: string
  kgPicked: number
  /** NULL on a day-rate row. Not 0 -- a day-rate row has no per-kg rate, and 0 is a lie that computes. */
  ratePerKg: number | null
  amount: number
  payMode: PayMode
  dayRate: number | null
  headcount: number
  incentiveThresholdKg: number | null
  incentiveRatePerKg: number | null
  kgRipe: number | null
  kgGreen: number | null
  crop: string
  dayFraction: number
  locationId: string | null
  notes: string | null
}

/**
 * HOW A PICKING ROW IS PAID. All three coexist at one estate in one season (HoneyFarm, 2026-10-11):
 * permanent checkroll and casual workers get a day rate plus an incentive above a threshold,
 * arabica fly picking gets minimum wage irrespective of quantity, and Assam or outside labour is
 * straight per kilo. Everyone is weighed regardless -- the kilos are the crop figure and the block
 * yield, whether or not they are what the person is paid.
 */
type PayMode = "piece" | "daily" | "daily_plus_incentive"

const PAY_MODES: { value: PayMode; label: string; hint: string }[] = [
  { value: "piece", label: "Per kilo", hint: "Paid by weight picked. Assam and outside labour, and contract crews." },
  { value: "daily", label: "Day rate", hint: "Paid the day regardless of weight. Early fly picking on arabica." },
  { value: "daily_plus_incentive", label: "Day rate + incentive", hint: "The day, plus a rate on kilos above a threshold. Checkroll and casual." },
]

const today = () => todayIso()
const firstOfMonth = () => todayIso().slice(0, 7) + "-01"

const EMPTY_FORM = {
  workerId: "",
  pickDate: today(),
  payMode: "piece" as PayMode,
  kgPicked: "",
  ratePerKg: "",
  dayRate: "",
  incentiveThresholdKg: "",
  incentiveRatePerKg: "",
  /** Blank unless the estate separates them. Absent is not zero -- the dry route never measures it. */
  kgRipe: "",
  kgGreen: "",
  crop: "coffee",
  dayFraction: "1",
  locationId: "",
  notes: "",
}

/**
 * The form's fields as the API expects them.
 *
 * ⚠ SHARED BY ADD AND EDIT ON PURPOSE. These were two separate literals, and the edit one sent
 * FIVE of the twelve fields -- day rate, pay mode, the incentive pair and the ripe/green split were
 * all collected by the form, shown to the writer, and then dropped on save. It also used
 * `Number(editForm.ratePerKg)` on a field that is empty for day-rate rows, and Number("") is 0, so
 * an edit wrote a rate of zero; on a piece row whose rate had been cleared that made the day free
 * labour while still showing a weight.
 *
 * null, not 0, on every field the chosen mode does not use -- the "lie that computes" scripts/154
 * made unstorable. headcount is never sent: the route reads it from the roster, because a
 * client-supplied crew size is a cost multiplier the caller would be choosing for themselves.
 */
const toPickingPayload = (f: typeof EMPTY_FORM) => ({
  pickDate: f.pickDate,
  payMode: f.payMode,
  crop: f.crop,
  kgPicked: Number(f.kgPicked),
  ratePerKg: f.payMode === "piece" ? Number(f.ratePerKg) : null,
  dayRate: f.payMode !== "piece" ? Number(f.dayRate) : null,
  incentiveThresholdKg: f.payMode === "daily_plus_incentive" ? Number(f.incentiveThresholdKg) : null,
  incentiveRatePerKg: f.payMode === "daily_plus_incentive" ? Number(f.incentiveRatePerKg) : null,
  kgRipe: f.kgRipe === "" ? null : Number(f.kgRipe),
  kgGreen: f.kgGreen === "" ? null : Number(f.kgGreen),
  dayFraction: Number(f.dayFraction) || 1,
  locationId: f.locationId || null,
  notes: f.notes.trim() || null,
})

export default function PickingLogTab() {
  const { user } = useAuth()
  const canWrite = canWriteModule((user?.role ?? "user") as UserRole, "accounts")
  const canDelete = canDeleteModule((user?.role ?? "user") as UserRole, "accounts")

  const [records, setRecords] = useState<PickingRecord[]>([])
  const recordControls = useListControls(records, {
    searchFields: (r) => [r.workerName, r.pickDate, r.notes],
    sorters: {
      date: (r) => String(r.pickDate || "").slice(0, 10),
      worker: (r) => String(r.workerName || ""),
      kg: (r) => Number(r.kgPicked) || 0,
      amount: (r) => Number(r.amount) || 0,
    },
    defaultSort: "date",
  })
  const [workers, setWorkers] = useState<Worker[]>([])
  const [workersError, setWorkersError] = useState(false)
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [loading, setLoading] = useState(true)
  const [totalKg, setTotalKg] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [startDate, setStartDate] = useState(firstOfMonth())
  const [endDate, setEndDate] = useState(today())
// Radix throws on <SelectItem value="">, which takes the whole tab down via the error boundary.
// The "all" option therefore needs a real sentinel rather than the empty string that the rest of
// this component uses for "no filter". This is what crashed the tab in production: the filter only
// renders once a tenant has workers, so estates with an empty roster never hit it -- hence
// "crashing for some tenants" in 1272d15.
const ALL_WORKERS = "all"

  const [filterWorker, setFilterWorker] = useState(ALL_WORKERS)

  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editForm, setEditForm] = useState(EMPTY_FORM)

  const fetchWorkers = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance?date=" + today() + "&scope=all")
      const data = await res.json()
      if (!res.ok || !data?.success) {
        // A refused roster is not an empty roster. Without this the worker picker is simply blank
        // and the writer concludes there is nobody to pick for -- the same shape as the Workers
        // tab bug fixed in #74, one screen over.
        setWorkersError(true)
        return
      }
      setWorkersError(false)
      setWorkers(
        (data.workers || []).map((w: any) => ({
          id: String(w.id),
          name: String(w.name),
          dailyRate: w.dailyRate != null ? Number(w.dailyRate) : null,
          kind: w.kind === "gang" ? "gang" : "individual",
          headcount: w.headcount != null ? Number(w.headcount) : null,
          workerType: w.workerType || null,
        })),
      )
    } catch {
      setWorkersError(true)
    }
  }, [])

  const fetchLocations = useCallback(async () => {
    try {
      const res = await fetch("/api/locations")
      const data = await res.json()
      if (data.success) {
        setLocations(data.locations || [])
        if (data.locations?.length) {
          setForm((f) => ({ ...f, locationId: f.locationId || data.locations[0].id }))
        }
      }
    } catch {}
  }, [])

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ startDate, endDate })
      if (filterWorker && filterWorker !== ALL_WORKERS) params.set("workerId", filterWorker)
      const res = await fetch(`/api/picking-records?${params}`)
      const data = await res.json()
      if (data.success) {
        setRecords(data.records || [])
        setTotalKg(data.totalKg || 0)
        setTotalAmount(data.totalAmount || 0)
      }
    } catch {
      toast.error("Failed to load picking records")
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, filterWorker])

  useEffect(() => { fetchWorkers() }, [fetchWorkers])
  useEffect(() => { fetchLocations() }, [fetchLocations])
  useEffect(() => { fetchRecords() }, [fetchRecords])

  const handleAddUnguarded = async () => {
    /**
     * The guard used to require ratePerKg, which a day-rate row does not have -- so the three new
     * modes would have been unsaveable from a form that happily offered them. pickingRowProblem
     * asks the mode what it needs, and mirrors the CHECK constraint in scripts/154 so the answer
     * is a sentence rather than a constraint name.
     */
    const problem = pickingRowProblem({ ...asPayInput(form, selectedWorker), workerId: form.workerId })
    if (problem) {
      toast.error(problem)
      return
    }
    if (locations.length > 0 && !form.locationId) {
      toast.error("Select a block before saving.")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/picking-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId: form.workerId, ...toPickingPayload(form) }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to save")
      toast.success("Picking record saved")
      setForm({ ...EMPTY_FORM, locationId: form.locationId })
      setIsAdding(false)
      fetchRecords()
      window.dispatchEvent(new CustomEvent(FARMFLOW_RECORD_SAVED_EVENT))
    } catch (err: any) {
      toast.error(err?.message || "Failed to save record")
    } finally {
      setSaving(false)
    }
  }

  // Mobile double-tap guard: `disabled` only applies after a re-render, so two fast
  // taps both entered this handler and wrote the picking entry twice. See lib/single-flight.ts.
  const handleAdd = useSingleFlight(handleAddUnguarded)

  const startEdit = (r: PickingRecord) => {
    setEditingId(r.id)
    setEditForm({
      workerId: r.workerId,
      pickDate: r.pickDate.slice(0, 10),
      payMode: r.payMode,
      kgPicked: String(r.kgPicked),
      // "" rather than String(null) -> "null" in the input. Each of these is genuinely absent on
      // the modes that do not use it, and an edit must round-trip that absence rather than
      // inventing a zero.
      ratePerKg: r.ratePerKg != null ? String(r.ratePerKg) : "",
      dayRate: r.dayRate != null ? String(r.dayRate) : "",
      incentiveThresholdKg: r.incentiveThresholdKg != null ? String(r.incentiveThresholdKg) : "",
      incentiveRatePerKg: r.incentiveRatePerKg != null ? String(r.incentiveRatePerKg) : "",
      kgRipe: r.kgRipe != null ? String(r.kgRipe) : "",
      kgGreen: r.kgGreen != null ? String(r.kgGreen) : "",
      crop: r.crop || "coffee",
      dayFraction: String(r.dayFraction ?? 1),
      locationId: r.locationId || "",
      notes: r.notes || "",
    })
  }

  const handleSaveEdit = async (id: string) => {
    /**
     * Checked here as well as on the server, exactly as the add path is. Without it the writer
     * waits for a round trip to be told the ripe/green split no longer adds up -- and before the
     * server learned the pay-mode fields at all, the same mistake came back as HTTP 500 and
     * "Failed to update picking record", which names nothing.
     */
    const editProblem = pickingRowProblem({
      ...asPayInput(editForm, workers.find((w) => w.id === editForm.workerId) ?? null),
      workerId: editForm.workerId,
    })
    if (editProblem) {
      toast.error(editProblem)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/picking-records/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPickingPayload(editForm)),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to update")
      toast.success("Record updated")
      setEditingId(null)
      fetchRecords()
    } catch (err: any) {
      toast.error(err?.message || "Failed to update")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this picking record?")) return
    try {
      const res = await fetch(`/api/picking-records/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to delete")
      toast.success("Record deleted")
      fetchRecords()
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete")
    }
  }

  const resolveLocationName = (locationId?: string | null) =>
    locationId ? locations.find((loc) => loc.id === locationId)?.name || null : null

  const selectedWorker = workers.find((w) => w.id === form.workerId) || null

  /** The numbers the form is holding, in the shape the cost helper and the route both expect. */
  const asPayInput = (f: typeof EMPTY_FORM, worker: Worker | null) => ({
    payMode: f.payMode,
    kgPicked: Number(f.kgPicked) || 0,
    ratePerKg: f.ratePerKg === "" ? null : Number(f.ratePerKg),
    dayRate: f.dayRate === "" ? null : Number(f.dayRate),
    // From the ROSTER, never the form. headcount multiplies a day rate, so a typed one would let
    // whoever is filling in the sheet choose the cost -- scripts/154 and the route both read it
    // from the worker for the same reason.
    headcount: worker?.kind === "gang" ? Math.max(1, worker.headcount || 1) : 1,
    dayFraction: Number(f.dayFraction) || 0,
    incentiveThresholdKg: f.incentiveThresholdKg === "" ? null : Number(f.incentiveThresholdKg),
    incentiveRatePerKg: f.incentiveRatePerKg === "" ? null : Number(f.incentiveRatePerKg),
    kgRipe: f.kgRipe === "" ? null : Number(f.kgRipe),
    kgGreen: f.kgGreen === "" ? null : Number(f.kgGreen),
  })

  const formPay = asPayInput(form, selectedWorker)
  const formProblem = pickingRowProblem({ ...formPay, workerId: form.workerId })
  const formCost = pickingRowCost(formPay)
  const formShortfall = pickingMinimumWageShortfall({
    ...formPay,
    dayRate: selectedWorker?.dailyRate ?? null,
    kind: selectedWorker?.kind,
  })
  const needs = pickingModeNeeds(form.payMode)

  const canSaveForm =
    !formProblem && (locations.length === 0 || Boolean(form.locationId))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wheat className="h-4 w-4 text-amber-400" />
              Picking Log
            </CardTitle>
            <CardDescription>
              Piece-rate cherry picking using the shared worker roster. Use this only when you pay pickers per kg.
              {!loading && (
                <span className="ml-2 font-medium text-foreground">
                  {totalKg.toLocaleString("en-IN", { maximumFractionDigits: 1 })} kg · {formatCurrency(totalAmount)}
                </span>
              )}
            </CardDescription>
          </div>
          {canWrite && !isAdding && (
            <Button size="sm" onClick={() => setIsAdding(true)} className="shrink-0">
              <Plus className="mr-1.5 h-4 w-4" />
              Add Entry
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="picking-filter-from" className="shrink-0 text-xs">From</Label>
              <Input id="picking-filter-from" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 w-32 sm:w-36 text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="picking-filter-to" className="shrink-0 text-xs">To</Label>
              <Input id="picking-filter-to" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 w-32 sm:w-36 text-sm" />
            </div>
            <Select value={filterWorker} onValueChange={setFilterWorker}>
              <SelectTrigger aria-label="Filter by worker" className="h-8 w-40 sm:w-44 text-sm"><SelectValue placeholder="All workers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_WORKERS}>All workers</SelectItem>
                {workers.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Add form */}
          {isAdding && (
            <form
              className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3"
              onSubmit={(e) => { e.preventDefault(); if (canSaveForm && !saving) void handleAdd() }}
            >
              {/*
                THE MODE COMES FIRST because it decides what the rest of the form asks for. Three
                coexist at one estate in one season, so this is a per-row decision and not a
                setting: checkroll and casual on day rate plus incentive, arabica fly picking on a
                flat day, Assam and outside labour per kilo.
              */}
              <div className="space-y-1.5">
                <Label>How is this paid? *</Label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {PAY_MODES.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setForm((f) => ({
                        ...f,
                        payMode: m.value,
                        // Prefill the day rate from the roster the moment it becomes relevant.
                        // Stored per row, so a later change to the worker cannot rewrite this day.
                        dayRate: m.value !== "piece" && !f.dayRate && selectedWorker?.dailyRate != null
                          ? String(selectedWorker.dailyRate)
                          : f.dayRate,
                      }))}
                      aria-pressed={form.payMode === m.value}
                      className={cn(
                        "rounded-md border px-3 py-2 text-left text-xs transition-colors",
                        form.payMode === m.value
                          ? "border-amber-500 bg-amber-50 dark:bg-amber-500/10"
                          : "border-border/60 hover:bg-muted/50",
                      )}
                    >
                      <span className="block font-medium text-foreground">{m.label}</span>
                      <span className="mt-0.5 block text-muted-foreground">{m.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="picking-worker">Worker *</Label>
                  <Select
                    value={form.workerId}
                    onValueChange={(v) => {
                      const w = workers.find((x) => x.id === v) || null
                      setForm((f) => ({
                        ...f,
                        workerId: v,
                        dayRate: f.payMode !== "piece" && w?.dailyRate != null ? String(w.dailyRate) : f.dayRate,
                      }))
                    }}
                  >
                    <SelectTrigger id="picking-worker"><SelectValue placeholder="Select worker" /></SelectTrigger>
                    <SelectContent>
                      {workers.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                          {/* A family or contract crew is one payee of several people. The size is
                              what a day rate multiplies, so it belongs on the label. */}
                          {w.kind === "gang" ? ` · crew of ${w.headcount ?? "?"}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="picking-date">Date *</Label>
                  <Input id="picking-date" type="date" value={form.pickDate} onChange={(e) => setForm((f) => ({ ...f, pickDate: e.target.value }))} />
                </div>
                {locations.length > 0 && (
                  <div className="space-y-1.5">
                    <Label htmlFor="picking-location">Block *</Label>
                    <Select value={form.locationId} onValueChange={(v) => setForm((f) => ({ ...f, locationId: v }))}>
                      <SelectTrigger id="picking-location"><SelectValue placeholder="Select block" /></SelectTrigger>
                      <SelectContent>
                        {locations.map((loc) => <SelectItem key={loc.id} value={loc.id}>{formatLocationLabel(loc, locations)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="picking-crop">Crop *</Label>
                  <Select value={form.crop} onValueChange={(v) => setForm((f) => ({ ...f, crop: v }))}>
                    <SelectTrigger id="picking-crop"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="coffee">Coffee</SelectItem>
                      <SelectItem value="pepper">Pepper</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <FieldLabel
                    label="Kg picked *"
                    tooltip="Total weight this worker or crew picked. Asked on every mode, including a day rate: the kilos are the crop figure and the block yield whether or not they set the pay."
                  />
                  <Input
                    type="number" inputMode="decimal" min={0} step={0.1}
                    value={numericInputValue(form.kgPicked)}
                    onChange={(e) => setForm((f) => ({ ...f, kgPicked: e.target.value }))}
                    placeholder="48.5"
                  />
                </div>

                {needs.ratePerKg && (
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Rate / kg (₹) *"
                      tooltip="Paid per kg picked. For a family or contract crew this is the lump sum rate for the whole crew's weight, which the head distributes."
                    />
                    <Input
                      type="number" inputMode="decimal" min={0} step={0.5}
                      value={numericInputValue(form.ratePerKg)}
                      onChange={(e) => setForm((f) => ({ ...f, ratePerKg: e.target.value }))}
                      placeholder="4.00"
                    />
                  </div>
                )}

                {needs.dayRate && (
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Day rate (₹) *"
                      tooltip="Prefilled from the worker's rate and stored on this row, so changing their rate later cannot rewrite what this day cost."
                    />
                    <Input
                      type="number" inputMode="decimal" min={0} step={1}
                      value={numericInputValue(form.dayRate)}
                      onChange={(e) => setForm((f) => ({ ...f, dayRate: e.target.value }))}
                      placeholder={selectedWorker?.dailyRate != null ? String(selectedWorker.dailyRate) : "494"}
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <FieldLabel
                    label="Day used"
                    tooltip="How much of the worker's day this pick took. Picking and day-work share one day, so half a day here leaves half for watering or drying-yard work on the muster."
                  />
                  <Select value={form.dayFraction} onValueChange={(v) => setForm((f) => ({ ...f, dayFraction: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Whole day</SelectItem>
                      <SelectItem value="0.75">Three quarters</SelectItem>
                      <SelectItem value="0.5">Half day</SelectItem>
                      <SelectItem value="0.25">Quarter day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {needs.incentive && (
                <div className="grid gap-3 rounded-md border border-border/50 bg-background/40 p-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Threshold (kg per person) *"
                      tooltip="Kilos above this earn the incentive. PER PERSON, so a crew of six against a 40 kg threshold starts earning above 240 kg — the day rate beside it is per person too."
                    />
                    <Input
                      type="number" inputMode="decimal" min={0} step={1}
                      value={numericInputValue(form.incentiveThresholdKg)}
                      onChange={(e) => setForm((f) => ({ ...f, incentiveThresholdKg: e.target.value }))}
                      placeholder="40"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel
                      label="Incentive / kg above it (₹) *"
                      tooltip="Paid only on the kilos above the threshold. Below it they still receive the full day rate, never less."
                    />
                    <Input
                      type="number" inputMode="decimal" min={0} step={0.5}
                      value={numericInputValue(form.incentiveRatePerKg)}
                      onChange={(e) => setForm((f) => ({ ...f, incentiveRatePerKg: e.target.value }))}
                      placeholder="3.00"
                    />
                  </div>
                </div>
              )}

              {/*
                RIPE AND GREEN, where the estate separates them. HoneyFarm weigh them apart on the
                washed route; on the dry/cherry route "red and green are not segregated or weighed
                separately, only total pick is recorded". Opt-in rather than always shown, and left
                ABSENT rather than zeroed when unused -- a 0 would record a measurement nobody took.
              */}
              <div className="space-y-2">
                <button
                  type="button"
                  className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setForm((f) => (f.kgRipe === "" && f.kgGreen === ""
                    ? { ...f, kgRipe: "0", kgGreen: "0" }
                    : { ...f, kgRipe: "", kgGreen: "" }))}
                >
                  {form.kgRipe === "" && form.kgGreen === "" ? "Record ripe and green separately" : "Record one total only"}
                </button>
                {!(form.kgRipe === "" && form.kgGreen === "") && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="picking-ripe">Ripe (kg)</Label>
                      <Input id="picking-ripe" type="number" inputMode="decimal" min={0} step={0.1}
                        value={numericInputValue(form.kgRipe)}
                        onChange={(e) => setForm((f) => ({ ...f, kgRipe: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="picking-green">Green (kg)</Label>
                      <Input id="picking-green" type="number" inputMode="decimal" min={0} step={0.1}
                        value={numericInputValue(form.kgGreen)}
                        onChange={(e) => setForm((f) => ({ ...f, kgGreen: e.target.value }))} />
                    </div>
                  </div>
                )}
              </div>

              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Notes (optional) — e.g. second weighment, upper block"
                rows={2}
                className="resize-none text-sm"
              />

              {/* The one line that tells the writer the mode is doing what they expect. */}
              {Number(form.kgPicked) > 0 && (
                <div className="rounded-md border border-border/50 bg-background/60 px-3 py-2 text-xs">
                  <p>
                    Pay for this row:{" "}
                    <span className="font-semibold text-foreground">{formatCurrency(formCost)}</span>
                    {selectedWorker?.kind === "gang" && (
                      <span className="text-muted-foreground"> · crew of {selectedWorker.headcount ?? "?"}, paid as one</span>
                    )}
                  </p>
                  {/*
                    SURFACED, NEVER APPLIED. Dad: "They will be paid minimum wage nevertheless. We
                    may move them out to do other tasks." Two remedies, and the estate picks per
                    person per day — topping this up automatically would present a derived figure
                    as a measured one and hide the second option entirely.
                  */}
                  {formShortfall > 0 && (
                    <p className="mt-1 text-amber-700 dark:text-amber-400">
                      {formatCurrency(formShortfall)} below this worker&apos;s day rate for the day used.
                      Pay the day rate instead, or move them to other work for part of the day.
                    </p>
                  )}
                </div>
              )}

              {formProblem && form.workerId && (
                <p className="text-xs text-amber-700 dark:text-amber-400">{formProblem}</p>
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => { setIsAdding(false); setForm({ ...EMPTY_FORM, locationId: form.locationId }) }}>
                  <X className="mr-1 h-4 w-4" /> Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!canSaveForm || saving}>
                  {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                  Save
                </Button>
              </div>
            </form>
          )}

          {/* Table */}
          {records.length > 0 && (
            <FilterBar
              className="mb-4"
              search={recordControls.search}
              onSearchChange={recordControls.setSearch}
              searchPlaceholder="Search worker, date, notes…"
              sortOptions={[
                { value: "date", label: "Date" },
                { value: "worker", label: "Worker" },
                { value: "kg", label: "Kg Picked" },
                { value: "amount", label: "Amount" },
              ]}
              sortValue={recordControls.sortValue}
              onSortChange={recordControls.setSortValue}
              sortDirection={recordControls.sortDirection}
              onSortDirectionChange={recordControls.setSortDirection}
            />
          )}
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : records.length === 0 ? (
            <EmptyStateTable title="No picking records for this period." />
          ) : recordControls.isFiltering && recordControls.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No picking records match your search.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Worker</TableHead>
                    <TableHead className="text-right">Kg</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="hidden md:table-cell">Location</TableHead>
                    <TableHead className="hidden md:table-cell">Notes</TableHead>
                    {(canWrite || canDelete) && <TableHead className="w-20" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recordControls.items.map((r) =>
                    editingId === r.id ? (
                      <TableRow key={r.id} className="bg-muted/20">
                        <TableCell><Input type="date" value={editForm.pickDate} onChange={(e) => setEditForm((f) => ({ ...f, pickDate: e.target.value }))} className="h-8 w-36" /></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.workerName}</TableCell>
                        <TableCell><Input type="number" inputMode="decimal" min={0} step={0.1} value={numericInputValue(editForm.kgPicked)} onChange={(e) => setEditForm((f) => ({ ...f, kgPicked: e.target.value }))} className="h-8 w-24 text-right" /></TableCell>
                        <TableCell><Input type="number" inputMode="decimal" min={0} step={0.5} value={numericInputValue(editForm.ratePerKg)} onChange={(e) => setEditForm((f) => ({ ...f, ratePerKg: e.target.value }))} className="h-8 w-24 text-right" /></TableCell>
                        <TableCell className="text-right text-sm">{editForm.kgPicked && editForm.ratePerKg ? formatCurrency(Number(editForm.kgPicked) * Number(editForm.ratePerKg)) : "—"}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Select value={editForm.locationId} onValueChange={(v) => setEditForm((f) => ({ ...f, locationId: v }))}>
                            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Location" /></SelectTrigger>
                            <SelectContent>
                              {locations.map((loc) => <SelectItem key={loc.id} value={loc.id}>{formatLocationLabel(loc, locations)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="hidden md:table-cell"><Input value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} className="h-8 w-40" placeholder="Notes" /></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Save edit" disabled={saving} onClick={() => handleSaveEdit(r.id)}>
                              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-emerald-500" />}
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Cancel edit" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm">{r.pickDate.slice(0, 10)}</TableCell>
                        <TableCell className="font-medium text-sm">
                          {r.workerName}
                          {/* Location is desktop-only below md and Notes below sm, so on a phone
                              you could not tell which block was picked or read any note. Both are
                              surfaced here as sub-lines rather than as extra columns. */}
                          {/* A crew is one payee of several people, and the headcount is what a
                              day rate multiplied -- without it the amount looks wrong. */}
                          {r.headcount > 1 && (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">crew of {r.headcount}</span>
                          )}
                          {r.dayFraction < 1 && (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">{r.dayFraction} day</span>
                          )}
                          <span className="mt-0.5 block text-xs font-normal text-muted-foreground md:hidden">
                            {[resolveLocationName(r.locationId), r.notes].filter(Boolean).join(" · ") || null}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm">{r.kgPicked.toLocaleString("en-IN", { maximumFractionDigits: 1 })}</TableCell>
                        {/*
                          "₹{r.ratePerKg}" rendered "₹null" on a day-rate row -- the column means
                          "per kilo" and a day-rate row has no per-kilo rate. It now says what the
                          row actually is, so the amount beside it can be explained.
                        */}
                        <TableCell className="text-right text-sm">
                          {r.ratePerKg != null ? (
                            `₹${r.ratePerKg}`
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {r.payMode === "daily_plus_incentive" ? "day + incentive" : "day rate"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(r.amount)}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{resolveLocationName(r.locationId) || "—"}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[160px] truncate">{r.notes || "—"}</TableCell>
                        {(canWrite || canDelete) && (
                          <TableCell>
                            <TooltipProvider>
                              <div className="flex gap-1">
                                {canWrite && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit record" onClick={() => startEdit(r)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">Edit record</TooltipContent>
                                  </Tooltip>
                                )}
                                {canDelete && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" aria-label="Delete record" onClick={() => handleDelete(r.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">Delete record</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </TooltipProvider>
                          </TableCell>
                        )}
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
