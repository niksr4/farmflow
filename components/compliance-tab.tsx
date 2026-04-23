"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ShieldCheck, ClipboardList, Plus, CheckCircle2, Clock, AlertCircle, XCircle } from "lucide-react"
import { formatDateOnly } from "@/lib/date-utils"

interface Certification {
  id: string
  name: string
  certification_type: string
  issuing_body: string | null
  certificate_number: string | null
  valid_from: string | null
  valid_until: string | null
  status: string
  notes: string | null
}

interface ChecklistItem {
  id: string
  certification_id: string | null
  certification_name: string | null
  title: string
  description: string | null
  due_date: string | null
  completed_at: string | null
  completed_by: string | null
  status: string
  notes: string | null
}

const CERT_TYPE_LABELS: Record<string, string> = {
  rainforest_alliance: "Rainforest Alliance",
  utz: "UTZ Certified",
  fair_trade: "Fair Trade",
  organic_india: "Organic India",
  coffee_board: "Coffee Board",
  custom: "Custom",
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  active: { label: "Active", icon: CheckCircle2, cls: "text-emerald-600 dark:text-emerald-400" },
  pending: { label: "Pending", icon: Clock, cls: "text-amber-600 dark:text-amber-400" },
  expired: { label: "Expired", icon: XCircle, cls: "text-rose-600 dark:text-rose-400" },
  suspended: { label: "Suspended", icon: AlertCircle, cls: "text-orange-600 dark:text-orange-400" },
}

const CHECKLIST_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20" },
  completed: { label: "Done", cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20" },
  overdue: { label: "Overdue", cls: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20" },
  not_applicable: { label: "N/A", cls: "bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-500/10 dark:text-slate-500 dark:border-slate-500/20" },
}

export default function ComplianceTab() {
  const [certifications, setCertifications] = useState<Certification[]>([])
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [certDialogOpen, setCertDialogOpen] = useState(false)
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false)

  const [certForm, setCertForm] = useState({
    name: "",
    certification_type: "custom",
    issuing_body: "",
    certificate_number: "",
    valid_from: "",
    valid_until: "",
    status: "active",
    notes: "",
  })
  const [checklistForm, setChecklistForm] = useState({
    certification_id: "",
    title: "",
    description: "",
    due_date: "",
    notes: "",
  })

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/api/compliance")
      const data = await res.json()
      if (!data.success) throw new Error(data.error || "Failed to load compliance data")
      setCertifications(data.certifications)
      setChecklistItems(data.checklistItems)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAddCertification = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!certForm.name.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "certification", ...certForm }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setCertDialogOpen(false)
      setCertForm({
        name: "",
        certification_type: "custom",
        issuing_body: "",
        certificate_number: "",
        valid_from: "",
        valid_until: "",
        status: "active",
        notes: "",
      })
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add certification")
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddChecklistItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!checklistForm.title.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "checklist_item",
          ...checklistForm,
          certification_id: checklistForm.certification_id || null,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setChecklistDialogOpen(false)
      setChecklistForm({ certification_id: "", title: "", description: "", due_date: "", notes: "" })
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add checklist item")
    } finally {
      setSubmitting(false)
    }
  }

  const handleCompleteItem = async (itemId: string) => {
    try {
      const res = await fetch("/api/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "complete_checklist_item", id: itemId }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update item")
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const activeCerts = certifications.filter((c) => c.status === "active")
  const expiringSoon = certifications.filter((c) => {
    if (!c.valid_until || c.status !== "active") return false
    const daysLeft = (new Date(c.valid_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    return daysLeft >= 0 && daysLeft <= 60
  })
  const pendingItems = checklistItems.filter((i) => i.status === "pending")

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400">
          {error}
        </div>
      )}

      {expiringSoon.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
            {expiringSoon.length} certification{expiringSoon.length > 1 ? "s" : ""} expiring within 60 days
          </p>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-500">
            {expiringSoon.map((c) => c.name).join(", ")}
          </p>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-border/70">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-500/10">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </span>
              <div>
                <p className="text-2xl font-bold text-foreground">{activeCerts.length}</p>
                <p className="text-xs text-muted-foreground">Active Certs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-500/10">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </span>
              <div>
                <p className="text-2xl font-bold text-foreground">{expiringSoon.length}</p>
                <p className="text-xs text-muted-foreground">Expiring Soon</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 dark:bg-white/5">
                <ClipboardList className="h-4 w-4 text-slate-600 dark:text-white/60" />
              </span>
              <div>
                <p className="text-2xl font-bold text-foreground">{pendingItems.length}</p>
                <p className="text-xs text-muted-foreground">Open Tasks</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Certifications */}
      <Card className="border-border/70">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Certifications
          </CardTitle>
          <Dialog open={certDialogOpen} onOpenChange={setCertDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Add Certification
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <div className="pb-1">
                <DialogTitle>Add Certification</DialogTitle>
              </div>
              <form onSubmit={handleAddCertification} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Name *</Label>
                  <Input
                    value={certForm.name}
                    onChange={(e) => setCertForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Rainforest Alliance 2024"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select
                      value={certForm.certification_type}
                      onValueChange={(v) => setCertForm((f) => ({ ...f, certification_type: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CERT_TYPE_LABELS).map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select
                      value={certForm.status}
                      onValueChange={(v) => setCertForm((f) => ({ ...f, status: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Issuing Body</Label>
                    <Input
                      value={certForm.issuing_body}
                      onChange={(e) => setCertForm((f) => ({ ...f, issuing_body: e.target.value }))}
                      placeholder="e.g. SAN"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cert. Number</Label>
                    <Input
                      value={certForm.certificate_number}
                      onChange={(e) => setCertForm((f) => ({ ...f, certificate_number: e.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Valid From</Label>
                    <Input
                      type="date"
                      value={certForm.valid_from}
                      onChange={(e) => setCertForm((f) => ({ ...f, valid_from: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Valid Until</Label>
                    <Input
                      type="date"
                      value={certForm.valid_until}
                      onChange={(e) => setCertForm((f) => ({ ...f, valid_until: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea
                    value={certForm.notes}
                    onChange={(e) => setCertForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Audit cycle, conditions, renewal contacts…"
                    rows={2}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="ghost" onClick={() => setCertDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting} className="bg-emerald-700 hover:bg-emerald-800">
                    {submitting ? "Saving…" : "Save"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {certifications.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No certifications recorded. Add Rainforest Alliance, organic, or other certifications.
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {certifications.map((cert) => {
                const statusCfg = STATUS_CONFIG[cert.status] ?? STATUS_CONFIG.pending
                const StatusIcon = statusCfg.icon
                return (
                  <div key={cert.id} className="flex items-start justify-between py-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`h-3.5 w-3.5 ${statusCfg.cls}`} />
                        <p className="text-sm font-medium text-foreground">{cert.name}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {CERT_TYPE_LABELS[cert.certification_type] ?? cert.certification_type}
                        {cert.issuing_body ? ` · ${cert.issuing_body}` : ""}
                      </p>
                      {(cert.valid_from || cert.valid_until) && (
                        <p className="text-xs text-muted-foreground">
                          {cert.valid_from ? formatDateOnly(cert.valid_from) : "?"}
                          {" → "}
                          {cert.valid_until ? formatDateOnly(cert.valid_until) : "ongoing"}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[11px]">
                      {statusCfg.label}
                    </Badge>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compliance Checklist */}
      <Card className="border-border/70">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <ClipboardList className="h-4 w-4 text-slate-600 dark:text-white/60" />
            Compliance Checklist
          </CardTitle>
          <Dialog open={checklistDialogOpen} onOpenChange={setChecklistDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Add Task
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <div className="pb-1">
                <DialogTitle>Add Compliance Task</DialogTitle>
              </div>
              <form onSubmit={handleAddChecklistItem} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label>Certification</Label>
                  <Select
                    value={checklistForm.certification_id}
                    onValueChange={(v) => setChecklistForm((f) => ({ ...f, certification_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Link to certification (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {certifications.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Task *</Label>
                  <Input
                    value={checklistForm.title}
                    onChange={(e) => setChecklistForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Submit annual audit report"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea
                    value={checklistForm.description}
                    onChange={(e) => setChecklistForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Details, requirements…"
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Due Date</Label>
                  <Input
                    type="date"
                    value={checklistForm.due_date}
                    onChange={(e) => setChecklistForm((f) => ({ ...f, due_date: e.target.value }))}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="ghost" onClick={() => setChecklistDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting} className="bg-emerald-700 hover:bg-emerald-800">
                    {submitting ? "Saving…" : "Add Task"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {checklistItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No compliance tasks yet. Add audit requirements, reporting deadlines, or renewal reminders.
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {checklistItems.map((item) => {
                const statusCfg = CHECKLIST_STATUS_CONFIG[item.status] ?? CHECKLIST_STATUS_CONFIG.pending
                return (
                  <div key={item.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className={`text-sm font-medium ${item.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {item.title}
                      </p>
                      {item.certification_name && (
                        <p className="text-xs text-muted-foreground">{item.certification_name}</p>
                      )}
                      {item.due_date && (
                        <p className="text-xs text-muted-foreground">
                          Due {formatDateOnly(item.due_date)}
                          {item.completed_at && ` · Done ${formatDateOnly(item.completed_at)}`}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className={`text-[11px] font-medium ${statusCfg.cls}`}>
                        {statusCfg.label}
                      </Badge>
                      {item.status === "pending" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                          onClick={() => handleCompleteItem(item.id)}
                        >
                          Done
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
