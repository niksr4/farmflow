"use client"

import { useState, useEffect, useCallback } from "react"
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
import { formatCurrency } from "@/lib/format"

type Worker = { id: string; name: string }

type PickingRecord = {
  id: string
  workerId: string
  workerName: string
  pickDate: string
  kgPicked: number
  ratePerKg: number
  amount: number
  notes: string | null
}

const today = () => todayIso()
const firstOfMonth = () => todayIso().slice(0, 7) + "-01"

const EMPTY_FORM = {
  workerId: "",
  pickDate: today(),
  kgPicked: "",
  ratePerKg: "",
  notes: "",
}

export default function PickingLogTab() {
  const { user } = useAuth()
  const canWrite = canWriteModule((user?.role ?? "user") as UserRole, "accounts")
  const canDelete = canDeleteModule((user?.role ?? "user") as UserRole, "accounts")

  const [records, setRecords] = useState<PickingRecord[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [totalKg, setTotalKg] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [startDate, setStartDate] = useState(firstOfMonth())
  const [endDate, setEndDate] = useState(today())
  const [filterWorker, setFilterWorker] = useState("")

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

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ startDate, endDate })
      if (filterWorker) params.set("workerId", filterWorker)
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
  useEffect(() => { fetchRecords() }, [fetchRecords])

  const handleAdd = async () => {
    if (!form.workerId || !form.kgPicked || !form.ratePerKg) return
    setSaving(true)
    try {
      const res = await fetch("/api/picking-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workerId: form.workerId,
          pickDate: form.pickDate,
          kgPicked: Number(form.kgPicked),
          ratePerKg: Number(form.ratePerKg),
          notes: form.notes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to save")
      toast.success("Picking record saved")
      setForm(EMPTY_FORM)
      setIsAdding(false)
      fetchRecords()
      window.dispatchEvent(new CustomEvent(FARMFLOW_RECORD_SAVED_EVENT))
    } catch (err: any) {
      toast.error(err?.message || "Failed to save record")
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (r: PickingRecord) => {
    setEditingId(r.id)
    setEditForm({ workerId: r.workerId, pickDate: r.pickDate.slice(0, 10), kgPicked: String(r.kgPicked), ratePerKg: String(r.ratePerKg), notes: r.notes || "" })
  }

  const handleSaveEdit = async (id: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/picking-records/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickDate: editForm.pickDate,
          kgPicked: Number(editForm.kgPicked),
          ratePerKg: Number(editForm.ratePerKg),
          notes: editForm.notes.trim() || null,
        }),
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

  const canSaveForm = form.workerId && Number(form.kgPicked) > 0 && Number(form.ratePerKg) >= 0

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
                <SelectItem value="">All workers</SelectItem>
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
                    <SelectContent>
                      {workers.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Date *</Label>
                  <Input type="date" value={form.pickDate} onChange={(e) => setForm((f) => ({ ...f, pickDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel
                    label="Kg picked *"
                    tooltip="Total cherry weight this worker picked, in kilograms. Use decimals for precision — e.g. 48.5 kg."
                  />
                  <Input
                    type="number" min={0} step={0.1}
                    value={form.kgPicked}
                    onChange={(e) => setForm((f) => ({ ...f, kgPicked: e.target.value }))}
                    placeholder="48.5"
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel
                    label="Rate / kg (₹) *"
                    tooltip="Piece rate paid per kg of cherry picked. Typically ₹3–₹6 per kg during harvest season. This rate is saved with the record."
                  />
                  <Input
                    type="number" min={0} step={0.5}
                    value={form.ratePerKg}
                    onChange={(e) => setForm((f) => ({ ...f, ratePerKg: e.target.value }))}
                    placeholder="4.00"
                  />
                </div>
              </div>
              {form.kgPicked && form.ratePerKg && (
                <p className="text-xs text-muted-foreground">
                  Amount: <span className="font-semibold text-foreground">{formatCurrency(Number(form.kgPicked) * Number(form.ratePerKg))}</span>
                </p>
              )}
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Notes (optional) — e.g. Block 3, Upper estate"
                rows={2}
                className="resize-none text-sm"
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
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : records.length === 0 ? (
            <EmptyStateTable title="No picking records for this period." />
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
                    <TableHead className="hidden sm:table-cell">Notes</TableHead>
                    {(canWrite || canDelete) && <TableHead className="w-20" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r) =>
                    editingId === r.id ? (
                      <TableRow key={r.id} className="bg-muted/20">
                        <TableCell><Input type="date" value={editForm.pickDate} onChange={(e) => setEditForm((f) => ({ ...f, pickDate: e.target.value }))} className="h-8 w-36" /></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.workerName}</TableCell>
                        <TableCell><Input type="number" min={0} step={0.1} value={editForm.kgPicked} onChange={(e) => setEditForm((f) => ({ ...f, kgPicked: e.target.value }))} className="h-8 w-24 text-right" /></TableCell>
                        <TableCell><Input type="number" min={0} step={0.5} value={editForm.ratePerKg} onChange={(e) => setEditForm((f) => ({ ...f, ratePerKg: e.target.value }))} className="h-8 w-24 text-right" /></TableCell>
                        <TableCell className="text-right text-sm">{editForm.kgPicked && editForm.ratePerKg ? formatCurrency(Number(editForm.kgPicked) * Number(editForm.ratePerKg)) : "—"}</TableCell>
                        <TableCell className="hidden sm:table-cell"><Input value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} className="h-8 w-40" placeholder="Notes" /></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={saving} onClick={() => handleSaveEdit(r.id)}>
                              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-emerald-500" />}
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm">{r.pickDate.slice(0, 10)}</TableCell>
                        <TableCell className="font-medium text-sm">{r.workerName}</TableCell>
                        <TableCell className="text-right text-sm">{r.kgPicked.toLocaleString("en-IN", { maximumFractionDigits: 1 })}</TableCell>
                        <TableCell className="text-right text-sm">₹{r.ratePerKg}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(r.amount)}</TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground max-w-[160px] truncate">{r.notes || "—"}</TableCell>
                        {(canWrite || canDelete) && (
                          <TableCell>
                            <TooltipProvider>
                              <div className="flex gap-1">
                                {canWrite && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(r)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">Edit record</TooltipContent>
                                  </Tooltip>
                                )}
                                {canDelete && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(r.id)}>
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
