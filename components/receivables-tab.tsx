"use client"

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/use-auth"
import { formatDateOnly } from "@/lib/date-utils"
import { formatCurrency } from "@/lib/format"

const STATUS_OPTIONS = [
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partially paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
]

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...STATUS_OPTIONS,
]

const LOCATION_ALL_VALUE = "__all__"
const LOCATION_UNASSIGNED_VALUE = "__unassigned__"

type LocationOption = {
  id: string
  name: string
  code?: string | null
}

type ReceivableRecord = {
  id: string | number
  buyer_name: string
  invoice_no?: string | null
  invoice_date: string
  due_date?: string | null
  amount: number
  status: string
  effective_status?: string
  notes?: string | null
  location_id?: string | null
  location_name?: string | null
  location_code?: string | null
  created_at?: string
  updated_at?: string
}

type ReceivablesSummary = {
  totalInvoiced: number
  totalOutstanding: number
  totalOverdue: number
  totalPaid: number
  dueSoonAmount: number
  totalCount: number
  overdueCount: number
  dueSoonCount: number
}

const emptySummary: ReceivablesSummary = {
  totalInvoiced: 0,
  totalOutstanding: 0,
  totalOverdue: 0,
  totalPaid: 0,
  dueSoonAmount: 0,
  totalCount: 0,
  overdueCount: 0,
  dueSoonCount: 0,
}

const emptyForm = {
  buyer_name: "",
  invoice_no: "",
  invoice_date: new Date().toISOString().slice(0, 10),
  due_date: "",
  amount: "",
  status: "unpaid",
  notes: "",
  location_id: "",
}

const getStatusLabel = (status: string) => {
  const match = STATUS_OPTIONS.find((item) => item.value === status)
  return match?.label || "Unpaid"
}

const getEffectiveStatus = (record: ReceivableRecord) => {
  const raw = String(record.effective_status || record.status || "unpaid").toLowerCase()
  return STATUS_OPTIONS.some((option) => option.value === raw) ? raw : "unpaid"
}

const getStatusClassName = (status: string) => {
  switch (status) {
    case "paid":
      return "border-emerald-200 bg-emerald-50 text-emerald-700"
    case "partial":
      return "border-amber-200 bg-amber-50 text-amber-700"
    case "overdue":
      return "border-rose-200 bg-rose-50 text-rose-700"
    default:
      return "border-slate-200 bg-slate-50 text-slate-700"
  }
}

const getDueContext = (record: ReceivableRecord) => {
  if (!record.due_date) return "No due date"
  const effectiveStatus = getEffectiveStatus(record)
  if (effectiveStatus === "paid") return "Settled"

  const today = new Date()
  const due = new Date(record.due_date)
  if (Number.isNaN(due.getTime())) return "No due date"
  const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const utcDue = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate())
  const deltaDays = Math.round((utcDue - utcToday) / (24 * 60 * 60 * 1000))

  if (deltaDays < 0) return `${Math.abs(deltaDays)}d overdue`
  if (deltaDays === 0) return "Due today"
  if (deltaDays <= 7) return `Due in ${deltaDays}d`
  return `Due in ${deltaDays}d`
}

export default function ReceivablesTab() {
  const { toast } = useToast()
  const { user } = useAuth()
  const searchParams = useSearchParams()

  const previewTenantId = (searchParams.get("previewTenantId") || "").trim()
  const previewRoleParam = (searchParams.get("previewRole") || "").toLowerCase()
  const previewRole = previewRoleParam === "admin" || previewRoleParam === "user" ? previewRoleParam : null
  const isPlatformOwner = user?.role?.toLowerCase() === "owner"
  const isPreviewMode = Boolean(isPlatformOwner && previewTenantId && previewRole)
  const canEdit = !isPreviewMode && (user?.role === "admin" || user?.role === "owner")

  const [records, setRecords] = useState<ReceivableRecord[]>([])
  const [summary, setSummary] = useState<ReceivablesSummary>(emptySummary)
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingRecord, setEditingRecord] = useState<ReceivableRecord | null>(null)
  const [updatingStatusId, setUpdatingStatusId] = useState<string | number | null>(null)
  const [statusFilter, setStatusFilter] = useState("all")
  const [locationFilter, setLocationFilter] = useState(LOCATION_ALL_VALUE)
  const [searchQuery, setSearchQuery] = useState("")
  const [form, setForm] = useState({ ...emptyForm })

  const tenantPreviewQuery = useMemo(() => {
    if (!isPreviewMode || !previewTenantId) return ""
    return `tenantId=${encodeURIComponent(previewTenantId)}`
  }, [isPreviewMode, previewTenantId])

  const loadLocations = useCallback(async () => {
    try {
      const endpoint = tenantPreviewQuery ? `/api/locations?${tenantPreviewQuery}` : "/api/locations"
      const response = await fetch(endpoint)
      const data = await response.json()
      if (response.ok && data.success) {
        setLocations(data.locations || [])
      }
    } catch (error) {
      console.error("Failed to load locations", error)
    }
  }, [tenantPreviewQuery])

  const loadRecords = useCallback(async () => {
    setIsLoading(true)
    try {
      const endpoint = tenantPreviewQuery ? `/api/receivables?${tenantPreviewQuery}` : "/api/receivables"
      const response = await fetch(endpoint, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load receivables")
      }
      setRecords(Array.isArray(data.records) ? data.records : [])
      setSummary(
        data.summary
          ? {
              totalInvoiced: Number(data.summary.totalInvoiced) || 0,
              totalOutstanding: Number(data.summary.totalOutstanding) || 0,
              totalOverdue: Number(data.summary.totalOverdue) || 0,
              totalPaid: Number(data.summary.totalPaid) || 0,
              dueSoonAmount: Number(data.summary.dueSoonAmount) || 0,
              totalCount: Number(data.summary.totalCount) || 0,
              overdueCount: Number(data.summary.overdueCount) || 0,
              dueSoonCount: Number(data.summary.dueSoonCount) || 0,
            }
          : emptySummary,
      )
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load receivables", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }, [tenantPreviewQuery, toast])

  useEffect(() => {
    loadLocations()
    loadRecords()
  }, [loadLocations, loadRecords])

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const effectiveStatus = getEffectiveStatus(record)
      if (statusFilter !== "all" && effectiveStatus !== statusFilter) {
        return false
      }
      if (locationFilter !== LOCATION_ALL_VALUE) {
        if (locationFilter === LOCATION_UNASSIGNED_VALUE) {
          if (record.location_id) return false
        } else if (record.location_id !== locationFilter) {
          return false
        }
      }
      if (searchQuery.trim()) {
        const needle = searchQuery.trim().toLowerCase()
        const haystack = [
          record.buyer_name || "",
          record.invoice_no || "",
          record.notes || "",
          record.location_name || "",
          record.location_code || "",
        ]
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [locationFilter, records, searchQuery, statusFilter])

  const filteredTotal = useMemo(() => {
    return filteredRecords.reduce((sum, record) => sum + (Number(record.amount) || 0), 0)
  }, [filteredRecords])

  const handleChange = (field: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const handleSave = async () => {
    if (!canEdit) {
      toast({ title: "Read-only mode", description: "Receivables are read-only while preview mode is active." })
      return
    }

    if (!form.buyer_name.trim() || !form.invoice_date) {
      toast({ title: "Missing fields", description: "Buyer name and invoice date are required." })
      return
    }

    const amount = Number(form.amount || 0)
    if (!Number.isFinite(amount) || amount < 0) {
      toast({ title: "Invalid amount", description: "Amount must be zero or greater." })
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        buyer_name: form.buyer_name.trim(),
        invoice_no: form.invoice_no || null,
        invoice_date: form.invoice_date,
        due_date: form.due_date || null,
        amount,
        status: form.status,
        notes: form.notes || null,
        location_id: form.location_id || null,
      }

      const response = await fetch("/api/receivables", {
        method: editingRecord ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingRecord ? { ...payload, id: editingRecord.id } : payload),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save receivable")
      }
      toast({ title: editingRecord ? "Receivable updated" : "Receivable added" })
      setEditingRecord(null)
      setForm({ ...emptyForm })
      await loadRecords()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save receivable", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  const handleEdit = (record: ReceivableRecord) => {
    setEditingRecord(record)
    setForm({
      buyer_name: record.buyer_name || "",
      invoice_no: record.invoice_no || "",
      invoice_date: record.invoice_date?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      due_date: record.due_date?.slice(0, 10) || "",
      amount: String(record.amount ?? ""),
      status: getEffectiveStatus(record),
      notes: record.notes || "",
      location_id: record.location_id || "",
    })
  }

  const handleDelete = async (record: ReceivableRecord) => {
    if (!canEdit) {
      toast({ title: "Read-only mode", description: "Receivables are read-only while preview mode is active." })
      return
    }
    if (!window.confirm(`Delete invoice for ${record.buyer_name}?`)) return
    try {
      const response = await fetch(`/api/receivables?id=${record.id}`, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete receivable")
      }
      toast({ title: "Receivable deleted" })
      await loadRecords()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete receivable", variant: "destructive" })
    }
  }

  const handleQuickStatus = async (record: ReceivableRecord, nextStatus: string) => {
    if (!canEdit) return
    setUpdatingStatusId(record.id)
    try {
      const payload = {
        id: record.id,
        buyer_name: record.buyer_name,
        invoice_no: record.invoice_no || null,
        invoice_date: record.invoice_date?.slice(0, 10),
        due_date: record.due_date ? record.due_date.slice(0, 10) : null,
        amount: Number(record.amount) || 0,
        status: nextStatus,
        notes: record.notes || null,
        location_id: record.location_id || null,
      }
      const response = await fetch("/api/receivables", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update status")
      }
      await loadRecords()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update status", variant: "destructive" })
    } finally {
      setUpdatingStatusId(null)
    }
  }

  const resolveLocationLabel = (record: ReceivableRecord) => {
    if (record.location_name) return record.location_name
    if (record.location_code) return record.location_code
    return "Unassigned"
  }

  const resetForm = () => {
    setEditingRecord(null)
    setForm({ ...emptyForm })
  }

  return (
    <div className="space-y-6">
      <Card className="border-emerald-100 bg-emerald-50/40">
        <CardHeader>
          <CardTitle>Receivables Control</CardTitle>
          <CardDescription>Track invoices, due dates, and buyer collections from one workflow.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className="text-xs text-muted-foreground">Total invoiced</p>
            <p className="text-lg font-semibold">{formatCurrency(summary.totalInvoiced)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="text-lg font-semibold text-amber-700">{formatCurrency(summary.totalOutstanding)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Overdue</p>
            <p className="text-lg font-semibold text-rose-700">{formatCurrency(summary.totalOverdue)}</p>
            <p className="text-xs text-muted-foreground">{summary.overdueCount} invoice(s)</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Due in 7 days</p>
            <p className="text-lg font-semibold">{formatCurrency(summary.dueSoonAmount)}</p>
            <p className="text-xs text-muted-foreground">{summary.dueSoonCount} invoice(s)</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Collected</p>
            <p className="text-lg font-semibold text-emerald-700">{formatCurrency(summary.totalPaid)}</p>
          </div>
        </CardContent>
      </Card>

      {isPreviewMode && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="pt-6 text-sm text-amber-900">
            Preview mode is read-only. Exit preview to create, edit, or delete receivables.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{editingRecord ? "Edit receivable" : "Add receivable"}</CardTitle>
          <CardDescription>Record buyer invoices and expected collections.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Buyer</Label>
              <Input value={form.buyer_name} onChange={handleChange("buyer_name")} placeholder="Buyer name" />
            </div>
            <div className="space-y-2">
              <Label>Invoice No</Label>
              <Input value={form.invoice_no} onChange={handleChange("invoice_no")} placeholder="INV-2026-001" />
            </div>
            <div className="space-y-2">
              <Label>Invoice Date</Label>
              <Input type="date" value={form.invoice_date} onChange={handleChange("invoice_date")} />
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input type="date" value={form.due_date} onChange={handleChange("due_date")} />
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" min="0" value={form.amount} onChange={handleChange("amount")} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Location (optional)</Label>
              <Select
                value={form.location_id || LOCATION_UNASSIGNED_VALUE}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, location_id: value === LOCATION_UNASSIGNED_VALUE ? "" : value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={LOCATION_UNASSIGNED_VALUE}>Unassigned</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name || loc.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={handleChange("notes")} placeholder="Notes or payment terms" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} disabled={isSaving || !canEdit}>
              {isSaving ? "Saving..." : editingRecord ? "Update receivable" : "Save receivable"}
            </Button>
            {editingRecord && (
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>Filter by status, location, and buyer to focus collection follow-up.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Search</Label>
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buyer, invoice no, notes..."
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTER_OPTIONS.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={LOCATION_ALL_VALUE}>All locations</SelectItem>
                  <SelectItem value={LOCATION_UNASSIGNED_VALUE}>Unassigned</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name || loc.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {filteredRecords.length} of {records.length} invoice(s)
            </span>
            <span>Filtered amount: {formatCurrency(filteredTotal)}</span>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading receivables...</div>
          ) : filteredRecords.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No receivables match your filters. Clear filters or add a new invoice.
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Invoice Date</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((record) => {
                    const effectiveStatus = getEffectiveStatus(record)
                    const dueContext = getDueContext(record)
                    return (
                      <TableRow key={record.id}>
                        <TableCell>{formatDateOnly(record.invoice_date)}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div>{record.due_date ? formatDateOnly(record.due_date) : "-"}</div>
                            <div className="text-xs text-muted-foreground">{dueContext}</div>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{record.buyer_name}</TableCell>
                        <TableCell>{record.invoice_no || "-"}</TableCell>
                        <TableCell>{resolveLocationLabel(record)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getStatusClassName(effectiveStatus)}>
                            {getStatusLabel(effectiveStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(record.amount) || 0)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {canEdit && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleQuickStatus(record, effectiveStatus === "paid" ? "unpaid" : "paid")}
                                disabled={updatingStatusId === record.id}
                              >
                                {updatingStatusId === record.id
                                  ? "Saving..."
                                  : effectiveStatus === "paid"
                                    ? "Reopen"
                                    : "Mark paid"}
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => handleEdit(record)} disabled={!canEdit}>
                              Edit
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDelete(record)} disabled={!canEdit}>
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
