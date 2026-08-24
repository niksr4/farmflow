"use client"

import { useState, useEffect, useCallback } from "react"
import { todayIso } from "@/lib/date-utils"
import { Plus, Pencil, UserX, Check, X, Loader2, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { EmptyStateTable } from "@/components/ui/empty-state"
import { FieldLabel } from "@/components/ui/field-label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { canWriteModule, type UserRole } from "@/lib/permissions"
import { useAuth } from "@/hooks/use-auth"
import FilterBar from "@/components/filter-bar"
import { useListControls } from "@/hooks/use-list-controls"
import { cn } from "@/lib/utils"
import { numericInputValue } from "@/lib/number-input"
import type { LocationOption } from "@/components/inventory-system/types"
import { formatLocationLabel } from "@/lib/location-label"

type WorkerType = "permanent" | "seasonal" | "contractor"

/** Label/value row used by the mobile card list's expanded section. */
function MobileField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-stone-400">{label}</span>
      <span className={`min-w-0 text-right text-sm text-stone-700 dark:text-stone-300 ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  )
}

type Worker = {
  id: string
  name: string
  workerType: WorkerType | null
  phone: string | null
  dailyRate: number | null
  gender: string | null
  bankName: string | null
  bankAccount: string | null
  bankIfsc: string | null
  locationId: string | null
  estate: string | null
  deviceUserCode: string | null
  active: boolean
  /** A contract crew is one row with a headcount, not N invented people. scripts/115. */
  kind: "individual" | "gang"
  headcount: number | null
}

const UNASSIGNED_LOCATION = "__unassigned__"
const UNASSIGNED_ESTATE = "__unassigned_estate__"

/** Recorded for INDICOFS workforce returns. Never an input to pay. */
const GENDER_LABELS: Record<string, string> = { female: "Female", male: "Male", other: "Other" }
const formatGender = (g: string | null) => (g ? GENDER_LABELS[g] ?? g : null)

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
  /** "gang" is a contract crew: one row with a headcount, not N invented people. scripts/115. */
  kind: "individual" as "individual" | "gang",
  headcount: "",
  workerType: "" as WorkerType | "",
  phone: "",
  dailyRate: "",
  gender: "",
  bankName: "",
  bankAccount: "",
  bankIfsc: "",
  deviceUserCode: "",
  locationId: UNASSIGNED_LOCATION,
  estate: UNASSIGNED_ESTATE,
}

export default function WorkerProfilesTab() {
  const { user } = useAuth()
  const canWrite = canWriteModule((user?.role ?? "user") as UserRole, "accounts")

  const [workers, setWorkers] = useState<Worker[]>([])
  const workerControls = useListControls(workers, {
    searchFields: (w) => [w.name, w.phone, w.bankName, w.bankAccount, w.workerType],
    sorters: {
      name: (w) => String(w.name || ""),
      type: (w) => String(w.workerType || ""),
      rate: (w) => Number(w.dailyRate) || 0,
    },
    defaultSort: "name",
    defaultDirection: "asc",
  })
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Phone and bank details were `hidden sm:table-cell` -- unreachable on a phone, which is
  // the device you would actually call a worker from. The mobile list shows the essentials
  // and puts the rest one tap away rather than dropping them or cramming eight columns in.
  const [expandedWorkerId, setExpandedWorkerId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  // Same data-driven gate as the attendance tab: estates without a terminal see no
  // biometric fields at all.
  const [hasBiometricDevices, setHasBiometricDevices] = useState(false)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [locations, setLocations] = useState<LocationOption[]>([])
  const locationById = new Map(locations.map((loc) => [loc.id, loc]))
  // Same "only show the estate picker for genuinely multi-estate tenants" convention as the
  // header estate selector (components/inventory-system.tsx's canSelectEstate) -- two locations
  // under the same single estate shouldn't surface this field.
  // The estates this tenant actually has, taken from the blocks. A worker belongs to an estate;
  // a deployment happens on a block, which is why this offers 2 options where the old block
  // picker offered 21.
  const estates = Array.from(
    new Set(locations.map((loc) => loc.estate).filter((value): value is string => Boolean(value))),
  ).sort((a, b) => a.localeCompare(b))
  const showEstateField =
    new Set(locations.map((loc) => loc.estate).filter((value): value is string => Boolean(value))).size > 1

  // The roster endpoint (GET /api/attendance) applies the header estate filter, so it's not a
  // reliable source for "every location this worker could be assigned to" -- always show the
  // full unfiltered list here regardless of which estate is currently selected up top.
  const fetchLocations = useCallback(async () => {
    try {
      const res = await fetch("/api/locations?scope=all")
      const data = await res.json()
      if (data.success) {
        setLocations(data.locations || [])
      }
    } catch {
      // Non-fatal -- the location field just won't offer options; existing assignments still load.
    }
  }, [])

  const fetchWorkers = useCallback(async () => {
    try {
      // no-store because this reloads immediately after a save; a cached response would show the
      // pre-edit values and read as "the save silently did nothing".
      const res = await fetch("/api/attendance?date=" + todayIso() + "&scope=all", { cache: "no-store" })
      const data = await res.json()
      if (data.success) {
        setHasBiometricDevices(Boolean(data.hasBiometricDevices))
        setWorkers(
          (data.workers || []).map((w: any) => ({
            id: String(w.id),
            name: String(w.name || ""),
            workerType: w.workerType || null,
            phone: w.phone || null,
            dailyRate: w.dailyRate != null ? Number(w.dailyRate) : null,
            gender: w.gender ?? null,
            bankName: w.bankName || null,
            bankAccount: w.bankAccount || null,
            bankIfsc: w.bankIfsc || null,
            locationId: w.locationId || null,
            estate: w.estate || null,
            deviceUserCode: w.deviceUserCode || null,
            active: true,
            kind: w.kind === "gang" ? "gang" : "individual",
            headcount: w.headcount != null ? Number(w.headcount) : null,
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
    fetchLocations()
  }, [fetchWorkers, fetchLocations])

  const handleAdd = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch("/api/attendance/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          kind: form.kind,
          headcount: form.kind === "gang" ? Number(form.headcount) : undefined,
          workerType: form.workerType || null,
          dailyRate: form.dailyRate ? Number(form.dailyRate) : null,
          gender: form.gender || null,
          estate: form.estate === UNASSIGNED_ESTATE ? null : form.estate,
          phone: form.phone.trim() || null,
          bankName: form.bankName.trim() || null,
          bankAccount: form.bankAccount.trim() || null,
          bankIfsc: form.bankIfsc.trim() || null,
          deviceUserCode: form.deviceUserCode.trim() || null,
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
      kind: worker.kind,
      headcount: worker.headcount != null ? String(worker.headcount) : "",
      workerType: worker.workerType || "",
      phone: worker.phone || "",
      dailyRate: worker.dailyRate != null ? String(worker.dailyRate) : "",
      gender: worker.gender || "",
      bankName: worker.bankName || "",
      bankAccount: worker.bankAccount || "",
      deviceUserCode: worker.deviceUserCode || "",
      bankIfsc: worker.bankIfsc || "",
      locationId: worker.locationId || UNASSIGNED_LOCATION,
      estate: worker.estate || UNASSIGNED_ESTATE,
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
          ...(editForm.kind === "gang" ? { headcount: Number(editForm.headcount) } : {}),
          workerType: editForm.workerType || null,
          phone: editForm.phone.trim() || null,
          dailyRate: editForm.dailyRate ? Number(editForm.dailyRate) : null,
          bankName: editForm.bankName.trim() || null,
          bankAccount: editForm.bankAccount.trim() || null,
          bankIfsc: editForm.bankIfsc.trim() || null,
          estate: editForm.estate === UNASSIGNED_ESTATE ? null : editForm.estate,
          deviceUserCode: editForm.deviceUserCode.trim() || null,
          gender: editForm.gender || null,
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
              {/* The estate banner promises "every tab is filtered to this estate", and this one
                  deliberately is not: it fetches with scope=all so a worker assigned to another
                  estate stays reachable and reassignable. Without saying so, the unfiltered list
                  reads as the estate filter being broken -- which is exactly how it was reported. */}
              {showEstateField && (
                <span className="mt-1 block text-muted-foreground">
                  Every worker is listed here whichever estate is selected, so you can assign them.
                  The Attendance tab shows only the selected estate&apos;s crew.
                </span>
              )}
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
            {/* Person or crew, and it sits above the name because it changes what the name means.
                The muster tab has offered this since scripts/115; this roster -- which calls itself
                the shared roster feeding Attendance, Picking, Ledger and Payroll -- could display a
                crew and edit its rate but never create one. So the only way to add a contract gang
                was to find the inline form on another tab, which nobody would guess.

                It matters at cutover: Laxmi paid Rs 1,07,650 for 111 man-days of outside labour
                this season and has no crew on the roster, so the first contract job after they
                switch has nowhere to go. */}
            <div className="mb-3 flex items-center gap-1 rounded-xl bg-muted p-0.5 max-w-xs">
              {[
                { kind: "individual" as const, label: "Person" },
                { kind: "gang" as const, label: "Contract crew" },
              ].map((opt) => (
                <button
                  key={opt.kind}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, kind: opt.kind }))}
                  disabled={saving}
                  className={cn(
                    "flex-1 rounded-lg px-2 py-1.5 text-xs font-bold transition-colors",
                    form.kind === opt.kind ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
              <div className="space-y-1.5">
                <FieldLabel label={form.kind === "gang" ? "Crew name *" : "Full name *"} />
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={form.kind === "gang" ? "Rathi & Team" : "Ravi Kumar"}
                  autoFocus
                />
              </div>
              {form.kind === "gang" && (
                <div className="space-y-1.5">
                  <FieldLabel
                    label="Headcount *"
                    tooltip="How many people the crew normally brings. It can be changed on any given day from the muster, so this is the usual number, not a promise."
                  />
                  <Input
                    value={form.headcount}
                    onChange={(e) => setForm((f) => ({ ...f, headcount: e.target.value }))}
                    placeholder="e.g. 10"
                    inputMode="numeric"
                  />
                </div>
              )}
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
              {/* Recorded for INDICOFS reporting. Deliberately not an input to pay -- everyone
                  doing the same work is paid the same rate. */}
              <div className="space-y-1.5">
                <FieldLabel
                  label="Gender"
                  tooltip="Reported in INDICOFS workforce returns. It has no effect on pay: the rate belongs to the work, and everyone doing that work is paid the same."
                />
                <Select
                  value={form.gender || "unset"}
                  onValueChange={(v) => setForm((f) => ({ ...f, gender: v === "unset" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Not recorded" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Not recorded</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* The estate's normal wage for this person, and the base of the chain: a rate on
                  the work overrides it for jobs that pay differently, and an amount typed on a
                  deployment overrides both for a day that was unusual. Most days fall through to
                  this one, which is how most estates actually pay. */}
              <div className="space-y-1.5">
                <FieldLabel
                  label="Daily wage (₹)"
                  tooltip="What this worker normally earns for a day. For a contract crew this is the rate PER PERSON — the day's cost is this times the headcount. Work that pays differently can carry its own rate under Costs, and a one-off amount can be typed on the deployment itself; both override this."
                />
                <Input
                  type="number" inputMode="decimal"
                  min={0}
                  value={numericInputValue(form.dailyRate)}
                  onChange={(e) => setForm((f) => ({ ...f, dailyRate: e.target.value }))}
                  placeholder="500"
                />
              </div>
              {showEstateField && (
                <div className="space-y-1.5">
                  <FieldLabel
                    label="Estate"
                    tooltip="Which estate this worker belongs to. Leave unassigned to have them show up under every estate until you assign one."
                  />
                  <Select
                    value={form.estate}
                    onValueChange={(v) => setForm((f) => ({ ...f, estate: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED_ESTATE}>Unassigned</SelectItem>
                                {estates.map((name) => (
                                  <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {/* Phone and bank are columns in the table below and are editable inline, but the
                  add form never collected them — so adding a worker meant saving, then immediately
                  reopening them to enter details the form had already implied it wanted. */}
              <div className="space-y-1.5">
                <FieldLabel label="Phone" tooltip="Contact number for this worker. Optional." />
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="9876543210"
                  inputMode="tel"
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel label="Bank name" tooltip="Used for payroll payouts. Optional." />
                <Input
                  value={form.bankName}
                  onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                  placeholder="Canara Bank"
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel label="Account number" tooltip="Bank account for payroll payouts. Optional." />
                <Input
                  value={form.bankAccount}
                  onChange={(e) => setForm((f) => ({ ...f, bankAccount: e.target.value }))}
                  placeholder="123456789012"
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel label="IFSC" tooltip="Bank branch IFSC code for payroll payouts. Optional." />
                <Input
                  value={form.bankIfsc}
                  onChange={(e) => setForm((f) => ({ ...f, bankIfsc: e.target.value }))}
                  placeholder="CNRB0001234"
                />
              </div>
              {/* Only for estates that actually have a fingerprint terminal — same gate as the
                  attendance tab, so nobody else sees a field they cannot use. */}
              {hasBiometricDevices && (
                <div className="space-y-1.5">
                  <FieldLabel
                    label="Finger ID"
                    tooltip="The enrol ID shown on the fingerprint terminal for this worker. Punches from that ID are attributed to them. Can also be assigned later from the unmapped-codes panel."
                  />
                  <Input
                    value={form.deviceUserCode}
                    onChange={(e) => setForm((f) => ({ ...f, deviceUserCode: e.target.value }))}
                    placeholder="1"
                    inputMode="numeric"
                  />
                </div>
              )}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setIsAdding(false); setForm(EMPTY_FORM) }}>
                <X className="mr-1 h-4 w-4" /> Cancel
              </Button>
              {/* A crew with no headcount is refused by the route anyway; disabling here says so
                  before the round trip instead of after it. */}
              <Button
                size="sm"
                disabled={!form.name.trim() || saving || (form.kind === "gang" && !(Number(form.headcount) >= 1))}
                onClick={handleAdd}
              >
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                Save
              </Button>
            </div>
          </CardContent>
        )}

        <CardContent className={isAdding ? "pt-2" : undefined}>
          {workers.length > 0 && (
            <FilterBar
              className="mb-4"
              search={workerControls.search}
              onSearchChange={workerControls.setSearch}
              searchPlaceholder="Search name, phone, bank…"
              sortOptions={[
                { value: "name", label: "Name" },
                { value: "type", label: "Type" },
                { value: "rate", label: "Daily Rate" },
              ]}
              sortValue={workerControls.sortValue}
              onSortChange={workerControls.setSortValue}
              sortDirection={workerControls.sortDirection}
              onSortDirectionChange={workerControls.setSortDirection}
            />
          )}
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading workers…
            </div>
          ) : workers.length === 0 ? (
            <EmptyStateTable title="No workers yet — add your first worker to start tracking attendance, picking, ledger, or payroll." />
          ) : workerControls.isFiltering && workerControls.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No workers match your search.</p>
          ) : (
            <>
            {/* Mobile: card list with progressive disclosure. Same data as the table above,
                fewer things on screen at once -- the pattern Labour and Other Expenses use. */}
            <div className="divide-y divide-stone-100 sm:hidden dark:divide-white/[0.06]">
              {workerControls.items.map((w) => {
                const isExpanded = expandedWorkerId === w.id
                const isEditing = editingId === w.id
                // Reads the worker's own estate now, not the estate of whichever block they were
                // pointed at. See scripts/115 and validateEstateForTenant.
                const estate = w.estate
                return (
                  <Collapsible
                    key={w.id}
                    open={isExpanded || isEditing}
                    onOpenChange={() => setExpandedWorkerId(isExpanded ? null : w.id)}
                  >
                    <CollapsibleTrigger className="w-full text-left">
                      <div className="flex items-center justify-between gap-3 px-1 py-3.5 active:bg-stone-50 touch-manipulation dark:active:bg-white/[0.03]">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-bold text-stone-800 dark:text-stone-100">{w.name}</p>
                            {/* A crew reads as one person otherwise, and its rate is per head --
                                so the row has to say both, or the day's cost is off by the
                                headcount and looks entirely plausible. */}
                            {w.kind === "gang" && (
                              <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                                Crew of {w.headcount ?? "?"}
                                {Number(w.dailyRate) > 0 && w.headcount
                                  ? ` · ₹${(Number(w.dailyRate) * Number(w.headcount)).toLocaleString("en-IN")}/day`
                                  : ""}
                              </span>
                            )}
                            {w.workerType && (
                              <Badge variant="outline" className={`text-[10px] ${WORKER_TYPE_COLORS[w.workerType]}`}>
                                {WORKER_TYPE_LABELS[w.workerType]}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-500">
                            {w.dailyRate != null ? `₹${w.dailyRate.toLocaleString("en-IN")}/day` : "No rate set"}
                          </p>
                        </div>
                        <span className="shrink-0 text-stone-400">
                          {isExpanded || isEditing ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        </span>
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      {isEditing ? (
                        <div className="space-y-2 bg-stone-50/60 px-1 pb-4 dark:bg-white/[0.02]">
                          <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name" />
                          {/* Worker type and estate were desktop-only when this card list was added,
                              so a phone could read them but never set them. Assigning a worker to an
                              estate is precisely the job a field writer is asked to do -- and they do
                              it on a phone -- so leaving it off the small screen made the instruction
                              impossible to follow. Availability parity, per the table above. */}
                          <Select
                            value={editForm.workerType}
                            onValueChange={(v) => setEditForm((f) => ({ ...f, workerType: v as WorkerType | "" }))}
                          >
                            <SelectTrigger className="h-10"><SelectValue placeholder="Worker type" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="permanent">Permanent</SelectItem>
                              <SelectItem value="seasonal">Seasonal</SelectItem>
                              <SelectItem value="contractor">Contractor</SelectItem>
                            </SelectContent>
                          </Select>
                          {showEstateField && (
                            <Select
                              value={editForm.estate}
                              onValueChange={(v) => setEditForm((f) => ({ ...f, estate: v }))}
                            >
                              <SelectTrigger className="h-10"><SelectValue placeholder="Estate / block" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={UNASSIGNED_ESTATE}>Unassigned</SelectItem>
                                {estates.map((name) => (
                                  <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          <Input value={editForm.dailyRate} onChange={(e) => setEditForm((f) => ({ ...f, dailyRate: e.target.value }))} placeholder={w.kind === "gang" ? "Daily rate per person" : "Daily rate"} inputMode="decimal" />
                          {/* A crew's size changes between jobs -- 8 in June, 12 in October -- and
                              it was settable at creation and never again. Headcount multiplies the
                              day's cost, so a stale one is not a cosmetic error. */}
                          {w.kind === "gang" && (
                            <Input
                              value={editForm.headcount}
                              onChange={(e) => setEditForm((f) => ({ ...f, headcount: e.target.value }))}
                              placeholder="How many in the crew"
                              inputMode="numeric"
                            />
                          )}
                          <Input value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone" inputMode="tel" />
                          {/* Editable, not just settable. It was on the create form and nowhere
                              else, so a worker added before the field existed -- or added in a
                              hurry -- could never be corrected. INDICOFS asks for the workforce
                              broken down by gender; a value you cannot fix later is a return you
                              cannot file. The API has always accepted it on update. */}
                          <Select
                            value={editForm.gender || "unset"}
                            onValueChange={(v) => setEditForm((f) => ({ ...f, gender: v === "unset" ? "" : v }))}
                          >
                            <SelectTrigger className="h-10"><SelectValue placeholder="Gender" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unset">Gender not recorded</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input value={editForm.bankName} onChange={(e) => setEditForm((f) => ({ ...f, bankName: e.target.value }))} placeholder="Bank name" />
                          <Input value={editForm.bankAccount} onChange={(e) => setEditForm((f) => ({ ...f, bankAccount: e.target.value }))} placeholder="Account no." />
                          <Input value={editForm.bankIfsc} onChange={(e) => setEditForm((f) => ({ ...f, bankIfsc: e.target.value }))} placeholder="IFSC" />
                          {hasBiometricDevices && (
                            <Input value={editForm.deviceUserCode} onChange={(e) => setEditForm((f) => ({ ...f, deviceUserCode: e.target.value }))} placeholder="Finger ID" inputMode="numeric" />
                          )}
                          <div className="flex gap-2 pt-1">
                            <Button size="sm" className="flex-1" disabled={saving} onClick={() => handleSaveEdit(w.id)}>
                              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                              Save
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditingId(null)}>
                              <X className="mr-1.5 h-3.5 w-3.5" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1.5 bg-stone-50/60 px-1 pb-4 pt-1 text-sm dark:bg-white/[0.02]">
                          <MobileField label="Gender" value={formatGender(w.gender) ?? "—"} />
                          <MobileField label="Phone" value={w.phone || "—"} />
                          <MobileField
                            label="Bank"
                            value={w.bankName ? `${w.bankName}${w.bankAccount ? ` · ${w.bankAccount}` : ""}${w.bankIfsc ? ` (${w.bankIfsc})` : ""}` : "—"}
                          />
                          {showEstateField && (
                            <MobileField label="Estate" value={estate ?? "Unassigned"} />
                          )}
                          {hasBiometricDevices && <MobileField label="Finger ID" value={w.deviceUserCode || "—"} mono />}
                          {canWrite && (
                            <div className="flex gap-2 pt-2">
                              <Button size="sm" variant="outline" className="flex-1" onClick={() => startEdit(w)}>
                                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                Edit
                              </Button>
                              <Button size="sm" variant="outline" className="flex-1 text-destructive" onClick={() => handleDeactivate(w.id, w.name)}>
                                <UserX className="mr-1.5 h-3.5 w-3.5" />
                                Deactivate
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    {showEstateField && <TableHead>Estate</TableHead>}
                    <TableHead>Daily Rate</TableHead>
                    {/* Gender was settable on create and displayed nowhere, which made it
                        write-only: you could record it and never see or correct it. INDICOFS
                        4.6.3G asks the estate to *demonstrate* this data. */}
                    <TableHead className="hidden lg:table-cell">Gender</TableHead>
                    <TableHead className="hidden sm:table-cell">Phone</TableHead>
                    <TableHead className="hidden md:table-cell">Bank</TableHead>
                    {/* Only for estates with a terminal — same gate as everywhere else. */}
                    {hasBiometricDevices && <TableHead>Finger ID</TableHead>}
                    {canWrite && <TableHead className="w-20" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workerControls.items.map((w) =>
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
                        {showEstateField && (
                          <TableCell>
                            <Select
                              value={editForm.estate}
                              onValueChange={(v) => setEditForm((f) => ({ ...f, estate: v }))}
                            >
                              <SelectTrigger className="h-8 w-32"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={UNASSIGNED_ESTATE}>Unassigned</SelectItem>
                                {estates.map((name) => (
                                  <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        )}
                        <TableCell>
                          <Input
                            type="number" inputMode="decimal"
                            value={numericInputValue(editForm.dailyRate)}
                            onChange={(e) => setEditForm((f) => ({ ...f, dailyRate: e.target.value }))}
                            className="h-8 w-24"
                            placeholder="₹/day"
                          />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <Select
                            value={editForm.gender || "unset"}
                            onValueChange={(v) => setEditForm((f) => ({ ...f, gender: v === "unset" ? "" : v }))}
                          >
                            <SelectTrigger className="h-8 w-28"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unset">Not recorded</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
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
                        {hasBiometricDevices && (
                          <TableCell>
                            <Input
                              className="h-8 w-24"
                              value={editForm.deviceUserCode}
                              onChange={(e) => setEditForm((f) => ({ ...f, deviceUserCode: e.target.value }))}
                              placeholder="Finger ID"
                              inputMode="numeric"
                            />
                          </TableCell>
                        )}
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
                        {showEstateField && (
                          <TableCell>
                            {w.estate ? (
                              <Badge variant="outline" className="text-xs">
                                {w.estate}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Unassigned</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-sm">
                          {w.dailyRate != null ? `₹${w.dailyRate.toLocaleString("en-IN")}` : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{formatGender(w.gender) ?? "—"}</TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{w.phone || "—"}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {w.bankName ? (
                            <span>{w.bankName}{w.bankAccount ? ` · ${w.bankAccount}` : ""}{w.bankIfsc ? ` (${w.bankIfsc})` : ""}</span>
                          ) : "—"}
                        </TableCell>
                        {hasBiometricDevices && (
                          <TableCell className="text-sm">
                            {w.deviceUserCode ? (
                              <span className="font-mono">{w.deviceUserCode}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
