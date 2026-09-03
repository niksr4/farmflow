"use client"

import { useState, useEffect, useCallback } from "react"
import { todayIso } from "@/lib/date-utils"
import { Plus, Pencil, Trash2, Check, X, Loader2, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyStateTable } from "@/components/ui/empty-state"
import { FieldLabel } from "@/components/ui/field-label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { canWriteModule, canDeleteModule, type UserRole } from "@/lib/permissions"
import { isWorkerLedgerDraftValid, validateWorkerLedgerDraft } from "@/lib/worker-ledger-validation"
import { useAuth } from "@/hooks/use-auth"
import { formatCurrency } from "@/lib/format"
import FilterBar from "@/components/filter-bar"
import { useListControls } from "@/hooks/use-list-controls"
import { numericInputValue } from "@/lib/number-input"

type EntryType = "advance" | "deduction" | "adjustment"
type Worker = { id: string; name: string }

type LedgerEntry = {
  id: string
  workerId: string
  workerName: string
  entryDate: string
  entryType: EntryType
  amount: number
  description: string | null
}

const TYPE_LABELS: Record<EntryType, string> = {
  advance: "Advance",
  deduction: "Deduction",
  adjustment: "Adjustment",
}

const TYPE_COLORS: Record<EntryType, string> = {
  advance: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  deduction: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  adjustment: "border-sky-400/30 bg-sky-400/10 text-sky-300",
}

const today = () => todayIso()
const firstOfMonth = () => new Date().toISOString().slice(0, 7) + "-01"

/** Sentinel for "no worker filter". Must not be "" -- see the note on filterWorker below. */
const ALL_WORKERS = "all"

const EMPTY_FORM = { workerId: "", entryDate: today(), entryType: "" as EntryType | "", amount: "", description: "" }

export default function WorkerLedgerTab() {
  const { user } = useAuth()
  const canWrite = canWriteModule((user?.role ?? "user") as UserRole, "accounts")
  const canDelete = canDeleteModule((user?.role ?? "user") as UserRole, "accounts")

  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const entryControls = useListControls(entries, {
    searchFields: (e) => [e.workerName, e.entryDate, e.entryType, e.description],
    sorters: {
      date: (e) => String(e.entryDate || "").slice(0, 10),
      worker: (e) => String(e.workerName || ""),
      type: (e) => String(e.entryType || ""),
      amount: (e) => Number(e.amount) || 0,
    },
    defaultSort: "date",
  })
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState(firstOfMonth())
  const [endDate, setEndDate] = useState(today())
  // Radix throws on <SelectItem value="">, which takes the whole tab down via the error boundary --
  // the same crash picking-log-tab.tsx fixed with this sentinel on 2026-07-25. Both tabs went
  // offline together in 1272d15; only picking got repaired, and this was the last one left.
  const [filterWorker, setFilterWorker] = useState(ALL_WORKERS)
  const [workerBalance, setWorkerBalance] = useState<{ totalDeductions: number; totalAdjustments: number } | null>(null)

  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editForm, setEditForm] = useState(EMPTY_FORM)

  const fetchWorkers = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance?date=" + today())
      const data = await res.json()
      if (data.success) setWorkers((data.workers || []).map((w: any) => ({ id: String(w.id), name: String(w.name) })))
    } catch {}
  }, [])

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ startDate, endDate })
      // The sentinel is truthy, unlike the "" it replaced, so every guard on it has to say what it
      // means rather than lean on falsiness. Sending workerId=all would be silently dropped by the
      // route's UUID check -- no crash, but the filter would look applied and do nothing.
      if (filterWorker && filterWorker !== ALL_WORKERS) params.set("workerId", filterWorker)
      const res = await fetch(`/api/worker-ledger?${params}`)
      const data = await res.json()
      if (data.success) {
        setEntries(data.entries || [])
        setWorkerBalance(data.workerBalance || null)
      }
    } catch {
      toast.error("Failed to load ledger")
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, filterWorker])

  useEffect(() => { fetchWorkers() }, [fetchWorkers])
  useEffect(() => { fetchEntries() }, [fetchEntries])

  const handleAdd = async () => {
    if (!isWorkerLedgerDraftValid(form)) return
    setSaving(true)
    try {
      const res = await fetch("/api/worker-ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workerId: form.workerId,
          entryDate: form.entryDate,
          entryType: form.entryType,
          amount: Number(form.amount),
          description: form.description.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to save")
      toast.success("Entry saved")
      setForm(EMPTY_FORM)
      setIsAdding(false)
      fetchEntries()
    } catch (err: any) {
      toast.error(err?.message || "Failed to save entry")
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (e: LedgerEntry) => {
    setEditingId(e.id)
    setEditForm({ workerId: e.workerId, entryDate: e.entryDate.slice(0, 10), entryType: e.entryType, amount: String(e.amount), description: e.description || "" })
  }

  const handleSaveEdit = async (id: string) => {
    // Guarded like the add form. Without this an emptied amount saved as 0 and a
    // non-numeric one saved as null, silently corrupting the worker's payable balance.
    const validation = validateWorkerLedgerDraft(editForm, { requireWorker: false })
    if (!validation.valid) {
      toast.error(validation.reason || "Check the entry before saving.")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/worker-ledger/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryDate: editForm.entryDate,
          entryType: editForm.entryType || undefined,
          amount: Number(editForm.amount),
          description: editForm.description.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to update")
      toast.success("Entry updated")
      setEditingId(null)
      fetchEntries()
    } catch (err: any) {
      toast.error(err?.message || "Failed to update entry")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this ledger entry?")) return
    try {
      const res = await fetch(`/api/worker-ledger/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to delete")
      toast.success("Entry deleted")
      fetchEntries()
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete entry")
    }
  }

  const canSaveForm = isWorkerLedgerDraftValid(form)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-sky-400" />
              Advances & Deductions
            </CardTitle>
            <CardDescription>
              Track advances paid, deductions, and adjustments from the shared worker roster. Use this only if you want these balances reflected in payroll.
              {filterWorker !== ALL_WORKERS && workerBalance && (
                <span className="ml-2 text-xs">
                  Deductions: <span className="font-medium text-rose-400">{formatCurrency(workerBalance.totalDeductions)}</span>
                  {" · "}Adjustments: <span className="font-medium text-sky-400">{formatCurrency(workerBalance.totalAdjustments)}</span>
                  <span className="text-muted-foreground"> (filtered period)</span>
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
              <Label className="shrink-0 text-xs">From</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 w-32 sm:w-36 text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="shrink-0 text-xs">To</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 w-32 sm:w-36 text-sm" />
            </div>
            <Select value={filterWorker} onValueChange={setFilterWorker}>
              <SelectTrigger className="h-8 w-40 sm:w-44 text-sm"><SelectValue placeholder="All workers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_WORKERS}>All workers</SelectItem>
                {workers.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Add form */}
          {isAdding && (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Worker *</Label>
                  <Select value={form.workerId} onValueChange={(v) => setForm((f) => ({ ...f, workerId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select worker" /></SelectTrigger>
                    <SelectContent>{workers.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Date *</Label>
                  <Input type="date" value={form.entryDate} onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel
                    label="Type *"
                    tooltip="Advance: cash paid to the worker before payday — reduces net payable. Deduction: amount withheld (food, accommodation, loan repayment) — reduces net payable. Adjustment: bonus or correction — adds to net payable."
                  />
                  <Select value={form.entryType} onValueChange={(v) => setForm((f) => ({ ...f, entryType: v as EntryType }))}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="advance">Advance paid</SelectItem>
                      <SelectItem value="deduction">Deduction</SelectItem>
                      <SelectItem value="adjustment">Adjustment (bonus)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Amount (₹) *</Label>
                  <Input type="number" inputMode="decimal" min={0} step={10} value={numericInputValue(form.amount)} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="500" />
                </div>
              </div>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Description (optional) — e.g. Food deduction, Festival advance, Bonus for extra harvest"
                className="text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setIsAdding(false); setForm(EMPTY_FORM) }}>
                  <X className="mr-1 h-4 w-4" /> Cancel
                </Button>
                <Button size="sm" disabled={!canSaveForm || saving} onClick={handleAdd}>
                  {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                  Save
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          {entries.length > 0 && (
            <FilterBar
              className="mb-4"
              search={entryControls.search}
              onSearchChange={entryControls.setSearch}
              searchPlaceholder="Search worker, type, description…"
              sortOptions={[
                { value: "date", label: "Date" },
                { value: "worker", label: "Worker" },
                { value: "type", label: "Type" },
                { value: "amount", label: "Amount" },
              ]}
              sortValue={entryControls.sortValue}
              onSortChange={entryControls.setSortValue}
              sortDirection={entryControls.sortDirection}
              onSortDirectionChange={entryControls.setSortDirection}
            />
          )}
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : entries.length === 0 ? (
            <EmptyStateTable title="No ledger entries for this period." />
          ) : entryControls.isFiltering && entryControls.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No ledger entries match your search.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Worker</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="hidden sm:table-cell">Description</TableHead>
                    {(canWrite || canDelete) && <TableHead className="w-20" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entryControls.items.map((e) =>
                    editingId === e.id ? (
                      <TableRow key={e.id} className="bg-muted/20">
                        <TableCell><Input type="date" value={editForm.entryDate} onChange={(ev) => setEditForm((f) => ({ ...f, entryDate: ev.target.value }))} className="h-8 w-36" /></TableCell>
                        <TableCell className="text-sm">{e.workerName}</TableCell>
                        <TableCell>
                          <Select value={editForm.entryType} onValueChange={(v) => setEditForm((f) => ({ ...f, entryType: v as EntryType }))}>
                            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="advance">Advance</SelectItem>
                              <SelectItem value="deduction">Deduction</SelectItem>
                              <SelectItem value="adjustment">Adjustment</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell><Input type="number" inputMode="decimal" value={numericInputValue(editForm.amount)} onChange={(ev) => setEditForm((f) => ({ ...f, amount: ev.target.value }))} className="h-8 w-28 text-right" /></TableCell>
                        <TableCell className="hidden sm:table-cell"><Input value={editForm.description} onChange={(ev) => setEditForm((f) => ({ ...f, description: ev.target.value }))} className="h-8 w-48" placeholder="Description" /></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={saving || !isWorkerLedgerDraftValid(editForm, { requireWorker: false })} onClick={() => handleSaveEdit(e.id)}>
                              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-emerald-500" />}
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={e.id}>
                        <TableCell className="text-sm">{e.entryDate.slice(0, 10)}</TableCell>
                        <TableCell className="font-medium text-sm">
                          {e.workerName}
                          {/* The Description column is desktop-only, so on a phone the ledger was
                              a list of amounts with no indication of what any of them were for.
                              Surfaced here as a sub-line rather than a sixth column. */}
                          {e.description && (
                            <span className="mt-0.5 block text-xs font-normal text-muted-foreground sm:hidden">
                              {e.description}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${TYPE_COLORS[e.entryType]}`}>
                            {TYPE_LABELS[e.entryType]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(e.amount)}</TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground max-w-[200px] truncate">{e.description || "—"}</TableCell>
                        {(canWrite || canDelete) && (
                          <TableCell>
                            <TooltipProvider>
                              <div className="flex gap-1">
                                {canWrite && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(e)}><Pencil className="h-3.5 w-3.5" /></Button>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">Edit entry</TooltipContent>
                                  </Tooltip>
                                )}
                                {canDelete && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Delete entry</TooltipContent>
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
