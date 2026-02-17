"use client"

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

type LocationOption = {
  id: string
  name: string
  code?: string | null
}

type ReceivableRecord = {
  id: number
  buyer_name: string
  invoice_no?: string | null
  invoice_date: string
  due_date?: string | null
  amount: number
  status: string
  notes?: string | null
  location_id?: string | null
  location_name?: string | null
  location_code?: string | null
  created_at?: string
  updated_at?: string
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

export default function ReceivablesTab() {
  const { toast } = useToast()
  const { user } = useAuth()
  const canEdit = user?.role === "admin" || user?.role === "owner"
  const [records, setRecords] = useState<ReceivableRecord[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingRecord, setEditingRecord] = useState<ReceivableRecord | null>(null)
  const [form, setForm] = useState({ ...emptyForm })

  const loadLocations = useCallback(async () => {
    try {
      const response = await fetch("/api/locations")
      const data = await response.json()
      if (response.ok && data.success) {
        setLocations(data.locations || [])
      }
    } catch (error) {
      console.error("Failed to load locations", error)
    }
  }, [])

  const loadRecords = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/receivables")
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load receivables")
      }
      setRecords(data.records || [])
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load receivables", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadLocations()
    loadRecords()
  }, [loadLocations, loadRecords])

  const totals = useMemo(() => {
    const total = records.reduce((sum, record) => sum + (Number(record.amount) || 0), 0)
    const outstanding = records
      .filter((record) => record.status !== "paid")
      .reduce((sum, record) => sum + (Number(record.amount) || 0), 0)
    return { total, outstanding }
  }, [records])

  const handleChange = (field: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const handleSave = async () => {
    if (!canEdit) {
      toast({ title: "Insufficient role", description: "Only estate admins can edit receivables." })
      return
    }

    if (!form.buyer_name.trim() || !form.invoice_date) {
      toast({ title: "Missing fields", description: "Buyer name and invoice date are required." })
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        buyer_name: form.buyer_name.trim(),
        invoice_no: form.invoice_no || null,
        invoice_date: form.invoice_date,
        due_date: form.due_date || null,
        amount: Number(form.amount || 0),
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
      status: record.status || "unpaid",
      notes: record.notes || "",
      location_id: record.location_id || "",
    })
  }

  const handleDelete = async (record: ReceivableRecord) => {
    if (!canEdit) {
      toast({ title: "Insufficient role", description: "Only estate admins can edit receivables." })
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

  const resolveLocationLabel = (record: ReceivableRecord) => {
    if (record.location_name) return record.location_name
    if (record.location_code) return record.location_code
    return "-"
  }

  return (
    <div className="space-y-6">
      <Card className="border-emerald-100 bg-emerald-50/50">
        <CardHeader>
          <CardTitle>Receivables</CardTitle>
          <CardDescription>Track invoices, due dates, and collections by buyer.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Total invoiced</p>
            <p className="text-lg font-semibold">{formatCurrency(totals.total)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="text-lg font-semibold">{formatCurrency(totals.outstanding)}</p>
          </div>
        </CardContent>
      </Card>

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
              <Input type="number" value={form.amount} onChange={handleChange("amount")} placeholder="0" />
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
              <Select value={form.location_id || ""} onValueChange={(value) => setForm((prev) => ({ ...prev, location_id: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
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
              <Button variant="outline" onClick={() => { setEditingRecord(null); setForm({ ...emptyForm }) }}>
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>Track what is due and what has been collected.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading receivables...</div>
          ) : records.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No receivables yet. Add the first buyer invoice to start tracking collections.
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Date</TableHead>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>{formatDateOnly(record.invoice_date)}</TableCell>
                      <TableCell className="font-medium">{record.buyer_name}</TableCell>
                      <TableCell>{record.invoice_no || "-"}</TableCell>
                      <TableCell>{resolveLocationLabel(record)}</TableCell>
                      <TableCell className="capitalize">{record.status || "unpaid"}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(record.amount) || 0)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleEdit(record)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(record)}>
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
