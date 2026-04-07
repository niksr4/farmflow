"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Pencil, UserX, Check, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyStateTable } from "@/components/ui/empty-state"
import { FieldLabel } from "@/components/ui/field-label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { canWriteModule, type UserRole } from "@/lib/permissions"
import { useAuth } from "@/hooks/use-auth"

type WorkerType = "permanent" | "seasonal" | "contractor"

type Worker = {
  id: string
  name: string
  workerType: WorkerType | null
  phone: string | null
  dailyRate: number | null
  bankName: string | null
  bankAccount: string | null
  bankIfsc: string | null
  active: boolean
}

const WORKER_TYPE_LABELS: Record<WorkerType, string> = {
  permanent: "Permanent",
  seasonal: "Seasonal",
  contractor: "Contractor",
}

const WORKER_TYPE_COLORS: Record<WorkerType, string> = {
  permanent: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  seasonal: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  contractor: "border-sky-400/30 bg-sky-400/10 text-sky-300",
}

const EMPTY_FORM = {
  name: "",
  workerType: "" as WorkerType | "",
  phone: "",
  dailyRate: "",
  bankName: "",
  bankAccount: "",
  bankIfsc: "",
}

export default function WorkerProfilesTab() {
  const { user } = useAuth()
  const canWrite = canWriteModule((user?.role ?? "user") as UserRole, "accounts")

  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editForm, setEditForm] = useState(EMPTY_FORM)

  const fetchWorkers = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance?date=" + new Date().toISOString().slice(0, 10))
      const data = await res.json()
      if (data.success) {
        setWorkers(
          (data.workers || []).map((w: any) => ({
            id: String(w.id),
            name: String(w.name || ""),
            workerType: w.workerType || null,
            phone: w.phone || null,
            dailyRate: w.dailyRate != null ? Number(w.dailyRate) : null,
            bankName: w.bankName || null,
            bankAccount: w.bankAccount || null,
            bankIfsc: w.bankIfsc || null,
            active: true,
          })),
        )
      }
    } catch {
      toast.error("Failed to load workers")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWorkers()
  }, [fetchWorkers])

  const handleAdd = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch("/api/attendance/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          workerType: form.workerType || null,
          dailyRate: form.dailyRate ? Number(form.dailyRate) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to add worker")
      toast.success("Worker added")
      setForm(EMPTY_FORM)
      setIsAdding(false)
      fetchWorkers()
    } catch (err: any) {
      toast.error(err?.message || "Failed to add worker")
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (worker: Worker) => {
    setEditingId(worker.id)
    setEditForm({
      name: worker.name,
      workerType: worker.workerType || "",
      phone: worker.phone || "",
      dailyRate: worker.dailyRate != null ? String(worker.dailyRate) : "",
      bankName: worker.bankName || "",
      bankAccount: worker.bankAccount || "",
      bankIfsc: worker.bankIfsc || "",
    })
  }

  const handleSaveEdit = async (id: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/attendance/workers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim() || undefined,
          workerType: editForm.workerType || null,
          phone: editForm.phone.trim() || null,
          dailyRate: editForm.dailyRate ? Number(editForm.dailyRate) : null,
          bankName: editForm.bankName.trim() || null,
          bankAccount: editForm.bankAccount.trim() || null,
          bankIfsc: editForm.bankIfsc.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to update")
      toast.success("Worker updated")
      setEditingId(null)
      fetchWorkers()
    } catch (err: any) {
      toast.error(err?.message || "Failed to update worker")
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async (id: string, name: string) => {
    if (!confirm(`Deactivate ${name}? They will no longer appear on the muster.`)) return
    try {
      const res = await fetch(`/api/attendance/workers/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to deactivate")
      toast.success("Worker deactivated")
      fetchWorkers()
    } catch (err: any) {
      toast.error(err?.message || "Failed to deactivate worker")
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Worker Roster</CardTitle>
            <CardDescription>
              This shared roster feeds Attendance, Picking, Ledger, and Payroll. Add only the workers you want tracked across those tabs. {workers.length} active worker{workers.length !== 1 ? "s" : ""}.
            </CardDescription>
          </div>
          {canWrite && !isAdding && (
            <Button size="sm" onClick={() => setIsAdding(true)} className="shrink-0">
              <Plus className="mr-1.5 h-4 w-4" />
              Add Worker
            </Button>
          )}
        </CardHeader>

        {isAdding && (
          <CardContent className="border-t border-border/50 pt-4">
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
              <div className="space-y-1.5">
                <FieldLabel label="Full name *" />
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ravi Kumar"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel
                  label="Type"
                  tooltip="Permanent: on the estate year-round. Seasonal: hired for harvest season only. Contractor: paid by task or through a labour contractor, not tracked individually."
                />
                <Select
                  value={form.workerType}
                  onValueChange={(v) => setForm((f) => ({ ...f, workerType: v as WorkerType | "" }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="permanent">Permanent</SelectItem>
                    <SelectItem value="seasonal">Seasonal</SelectItem>
                    <SelectItem value="contractor">Contractor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <FieldLabel
                  label="Daily rate (₹)"
                  tooltip="Standard daily wage for this worker. Used to calculate attendance earnings in Payroll Summary. E.g. ₹500 per day."
                />
                <Input
                  type="number"
                  min={0}
                  value={form.dailyRate}
                  onChange={(e) => setForm((f) => ({ ...f, dailyRate: e.target.value }))}
                  placeholder="500"
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setIsAdding(false); setForm(EMPTY_FORM) }}>
                <X className="mr-1 h-4 w-4" /> Cancel
              </Button>
              <Button size="sm" disabled={!form.name.trim() || saving} onClick={handleAdd}>
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                Save
              </Button>
            </div>
          </CardContent>
        )}

        <CardContent className={isAdding ? "pt-2" : undefined}>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading workers…
            </div>
          ) : workers.length === 0 ? (
            <EmptyStateTable title="No workers yet — add your first worker to start tracking attendance, picking, ledger, or payroll." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Daily Rate</TableHead>
                    <TableHead className="hidden sm:table-cell">Phone</TableHead>
                    <TableHead className="hidden md:table-cell">Bank</TableHead>
                    {canWrite && <TableHead className="w-20" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workers.map((w) =>
                    editingId === w.id ? (
                      <TableRow key={w.id} className="bg-muted/30">
                        <TableCell>
                          <Input
                            value={editForm.name}
                            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                            className="h-8 w-36"
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={editForm.workerType}
                            onValueChange={(v) => setEditForm((f) => ({ ...f, workerType: v as WorkerType | "" }))}
                          >
                            <SelectTrigger className="h-8 w-32"><SelectValue placeholder="Type" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="permanent">Permanent</SelectItem>
                              <SelectItem value="seasonal">Seasonal</SelectItem>
                              <SelectItem value="contractor">Contractor</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={editForm.dailyRate}
                            onChange={(e) => setEditForm((f) => ({ ...f, dailyRate: e.target.value }))}
                            className="h-8 w-24"
                            placeholder="₹/day"
                          />
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Input
                            value={editForm.phone}
                            onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                            className="h-8 w-32"
                            placeholder="Phone"
                          />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex gap-1.5">
                            <Input
                              value={editForm.bankName}
                              onChange={(e) => setEditForm((f) => ({ ...f, bankName: e.target.value }))}
                              className="h-8 w-28"
                              placeholder="Bank"
                            />
                            <Input
                              value={editForm.bankAccount}
                              onChange={(e) => setEditForm((f) => ({ ...f, bankAccount: e.target.value }))}
                              className="h-8 w-32"
                              placeholder="Account no."
                            />
                            <Input
                              value={editForm.bankIfsc}
                              onChange={(e) => setEditForm((f) => ({ ...f, bankIfsc: e.target.value }))}
                              className="h-8 w-24"
                              placeholder="IFSC"
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={saving} onClick={() => handleSaveEdit(w.id)}>
                              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-emerald-500" />}
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={w.id}>
                        <TableCell className="font-medium">{w.name}</TableCell>
                        <TableCell>
                          {w.workerType ? (
                            <Badge variant="outline" className={`text-xs ${WORKER_TYPE_COLORS[w.workerType]}`}>
                              {WORKER_TYPE_LABELS[w.workerType]}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {w.dailyRate != null ? `₹${w.dailyRate.toLocaleString("en-IN")}` : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{w.phone || "—"}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {w.bankName ? (
                            <span>{w.bankName}{w.bankAccount ? ` · ${w.bankAccount}` : ""}{w.bankIfsc ? ` (${w.bankIfsc})` : ""}</span>
                          ) : "—"}
                        </TableCell>
                        {canWrite && (
                          <TableCell>
                            <TooltipProvider>
                              <div className="flex gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(w)}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">Edit worker — update type, rate, phone, bank details</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeactivate(w.id, w.name)}>
                                      <UserX className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">Deactivate — removes from muster, keeps historical records</TooltipContent>
                                </Tooltip>
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
