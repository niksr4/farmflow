"use client"

import type React from "react"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import InPageNav from "@/components/in-page-nav"
import FilterBar from "@/components/filter-bar"
import { useListControls } from "@/hooks/use-list-controls"
import { useFormDraft } from "@/hooks/use-form-draft"
import { cn } from "@/lib/utils"
import { FARMFLOW_RECORD_SAVED_EVENT } from "@/components/inventory-system/constants"
import { useConsumablesData } from "@/hooks/use-consumables-data"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Check, PlusCircle, Trash2, Edit2, Save, X, ChevronDown, ChevronUp, Plus } from "lucide-react"
import type { LocationOption } from "@/components/inventory-system/types"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { EditRecordDialog } from "@/components/ui/edit-record-dialog"
import { formatDateOnly, todayIso } from "@/lib/date-utils"
import { formatCurrency } from "@/lib/format"
import { SkeletonTable } from "@/components/ui/skeleton"
import WorkflowEmptyState from "@/components/workflow-empty-state"
import { toast } from "sonner"
import { trackClick, reportActionFailure, reportActionError } from "@/lib/track-action"
import { deleteWithUndo } from "@/lib/undo-delete"
import { useMediaQuery } from "@/hooks/use-media-query"
import { resolveActivityFromQuery } from "@/lib/activity-code-match"
import ActivitySuggestList, { filterActivitySuggestions } from "@/components/activity-suggest-list"
import { formatLocationLabel } from "@/lib/location-label"
import { numericInputValue } from "@/lib/number-input"
import { useSingleFlight } from "@/hooks/use-single-flight"

/**
 * Chosen when a cost belongs to the estate rather than to any one block. Stored as NULL, which is
 * what the rest of the app already reads as "applies everywhere".
 */
const LOCATION_ESTATE_WIDE = "__estate_wide__"

interface ActivityCode {
  code: string
  reference: string
  module_hint?: string | null
  tracks_inventory?: boolean
  labor_count?: number
  expense_count?: number
}

interface InventoryItem {
  itemType: string
  unit: string
  quantity: number
  /** Weighted average cost this item was bought in at. 0 means nothing priced it yet. */
  avgPrice: number
}

const formatInventoryUsage = (inventoryItems?: Array<{ itemType: string; quantity?: number | null }>) => {
  if (!Array.isArray(inventoryItems) || inventoryItems.length === 0) {
    return "-"
  }

  return inventoryItems
    .map((item) => `${item.itemType}${item.quantity != null ? ` × ${item.quantity}` : ""}`)
    .join(", ")
}

export default function OtherExpensesTab({
  startDate,
  endDate,
}: {
  startDate?: string
  endDate?: string
}) {
  const [locations, setLocations] = useState<LocationOption[]>([])
  // Form-only field, not a history filter — expense history predates this field and mostly
  // has no location on existing rows, so filtering the list by it would hide old entries.
  const [formLocationId, setFormLocationId] = useState("")

  const {
    deployments,
    loading,
    loadingMore,
    totalAmount,
    totalCount,
    hasMore,
    loadMore,
    allLoaded,
    loadAll,
    addDeployment,
    updateDeployment,
    deleteDeployment,
  } = useConsumablesData(undefined, { startDate, endDate })

  const isMobile = useMediaQuery("(max-width: 768px)")
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [savedConfirm, setSavedConfirm] = useState<{ reference: string; total: number } | null>(null)
  const [activities, setActivities] = useState<ActivityCode[]>([])
  const [showAllCodes, setShowAllCodes] = useState(false)
  // Activity picker: null = no dropdown open, string = active search query.
  // codeQuery drives the "Type of cost" field. There was a second one for the removed "Cost name"
  // box; it is gone with the field, because dead state is how a deleted input comes back.
  // field — both search the same activities list by code or reference, so
  // either field can be typed into and resolves the other.
  const [codeQuery, setCodeQuery] = useState<string | null>(null)
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [supportsMultiInventoryItems, setSupportsMultiInventoryItems] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  type InventoryLineItem = { itemType: string; quantity: string | number }

  // Form state
  const [formData, setFormData] = useState({
    date: todayIso(),
    code: "",
    reference: "",
    amount: 0,
    notes: "",
  })
  const [invLines, setInvLines] = useState<InventoryLineItem[]>([])

  // Survive app kills / dead network: persist the in-progress new entry
  const { loadDraft, clearDraft } = useFormDraft(
    "expense-form",
    { formData, invLines },
    isAdding && !editingId,
  )

  const openNewExpenseForm = () => {
    const draft = loadDraft()
    if (draft && (draft.formData.code || draft.formData.notes || draft.formData.amount > 0)) {
      setFormData(draft.formData)
      setInvLines(draft.invLines || [])
      toast.info("Unsaved entry restored")
    }
    setIsAdding(true)
  }

  const fetchActivities = useCallback(async () => {
    try {
      const response = await fetch(
        formLocationId ? `/api/get-activity?locationId=${formLocationId}` : "/api/get-activity",
      )
      const data = await response.json()
      if (data.success && data.activities) {
        setActivities(data.activities)
      }
    } catch (error) {
      console.error("Error fetching activities:", error)
    }
  }, [formLocationId])

  const fetchInventoryItems = useCallback(async () => {
    try {
      const response = await fetch("/api/expenses-neon?inventoryItems=1")
      const data = await response.json()
      if (data.success && Array.isArray(data.items)) {
        setInventoryItems(data.items)
        setSupportsMultiInventoryItems(Boolean(data.supportsInventoryLinksTable))
      }
    } catch (error) {
      console.error("Error fetching inventory items:", error)
    }
  }, [])

  const fetchLocations = useCallback(async () => {
    try {
      const response = await fetch("/api/locations")
      const data = await response.json()
      if (data.success) {
        setLocations(data.locations || [])
        // Nothing is preselected. This used to default to data.locations[0] -- whichever block
        // sorted first alphabetically -- so an estate-wide cost like electricity was attributed to
        // "Arabica block" unless someone noticed and changed it. A default that silently answers a
        // question nobody was asked is the worst kind, because the record looks deliberate.
      }
    } catch (error) {
      console.error("Error fetching locations:", error)
    }
  }, [])

  useEffect(() => {
    fetchActivities()
    fetchInventoryItems()
    fetchLocations()
  }, [fetchActivities, fetchInventoryItems, fetchLocations])

  // Autofill reference when code changes
  const handleCodeChange = (code: string) => {
    setFormData((prev) => ({ ...prev, code }))
    const matchingActivity = activities.find((activity) => activity.code.toLowerCase() === code.toLowerCase())
    if (matchingActivity) {
      setFormData((prev) => ({ ...prev, reference: matchingActivity.reference }))
    }
  }

  const selectedActivity = activities.find(
    (a) => a.code.toLowerCase() === formData.code.toLowerCase()
  ) ?? null
  const selectedActivityHint = selectedActivity?.module_hint ?? null
  const selectedTracksInventory = selectedActivity?.tracks_inventory ?? false

  /**
   * What the linked stock is worth, at the average cost it was bought in at.
   *
   * The server has always done this -- deriveAmountFromStock in /api/expenses-neon, saved as
   * `derivedAmount ?? amount`. The form did not, so it kept asking for an Amount and then had it
   * silently replaced: you typed Rs 5,000, linked 10 kg at Rs 400, and Rs 4,000 was stored. Two
   * numbers that need never agree, with the receipt showing one and the P&L the other.
   *
   * The arithmetic here is deliberately identical to the server's, including the "any unpriced
   * item means no derivation at all" rule. Matching it is the point: a form that computes a
   * *slightly* different total is worse than one that computes none, because the disagreement
   * only shows up after saving.
   */
  const stockCost = useMemo(() => {
    const linked = invLines
      .map((line) => ({ line, stock: inventoryItems.find((item) => item.itemType === line.itemType) }))
      .filter(({ line }) => line.itemType && Number(line.quantity) > 0)

    if (linked.length === 0) return { derived: null as number | null, unpriced: [] as string[], working: "" }

    // An item at Rs 0 is stock that arrived before prices were required. The server refuses to
    // derive from it rather than rewrite a real typed amount to nothing, and so does this.
    const unpriced = linked.filter(({ stock }) => !(Number(stock?.avgPrice) > 0)).map(({ line }) => line.itemType)
    if (unpriced.length > 0) return { derived: null, unpriced, working: "" }

    const total = linked.reduce((sum, { line, stock }) => sum + Number(line.quantity) * Number(stock!.avgPrice), 0)
    const working = linked
      .map(({ line, stock }) => `${Number(line.quantity)} ${stock!.unit} x Rs ${Number(stock!.avgPrice).toLocaleString("en-IN")}`)
      .join("  +  ")
    return { derived: Number(total.toFixed(2)), unpriced: [], working }
  }, [invLines, inventoryItems])

  // Keep the field showing what will actually be saved. Without this the form displays a stale
  // typed figure right up to the moment the server replaces it.
  useEffect(() => {
    if (stockCost.derived === null) return
    setFormData((prev) => (prev.amount === stockCost.derived ? prev : { ...prev, amount: stockCost.derived! }))
  }, [stockCost.derived])

  const sortedActivities = [...activities].sort((a, b) =>
    ((b.expense_count ?? 0) + (b.labor_count ?? 0)) - ((a.expense_count ?? 0) + (a.labor_count ?? 0))
  )
  const usedActivities = sortedActivities.filter((a) => (a.expense_count ?? 0) + (a.labor_count ?? 0) > 0)
  const unusedActivities = sortedActivities.filter((a) => (a.expense_count ?? 0) + (a.labor_count ?? 0) === 0)
  const visibleActivities = showAllCodes ? sortedActivities : usedActivities

  const resetForm = () => {
    setFormData({
      date: todayIso(),
      code: "",
      reference: "",
      amount: 0,
      notes: "",
    })
    setInvLines([])
    setIsAdding(false)
    setEditingId(null)
    clearDraft()
  }

  const handleSubmitUnguarded = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    if (locations.length > 0 && !formLocationId) {
      toast.error("Say where this cost belongs — a block, or the whole estate.")
      return
    }
    // The Amount field is `required` with `min="0"`, but a typed "0" satisfies both, so
    // native validation lets an empty-value expense through. Check it here the way the
    // labour and sales forms do. `!(x > 0)` also catches the NaN the field can't produce
    // today but would if numericInputValue ever stopped coercing.
    if (!(formData.amount > 0)) {
      toast.error("Enter an amount greater than zero.")
      return
    }
    trackClick(editingId ? "expense_update" : "expense_save")
    setIsSubmitting(true)

    const validInvItems = invLines
      .map((l) => ({ itemType: l.itemType.trim(), quantity: Number(l.quantity) || 0 }))
      .filter((l) => l.itemType && l.quantity > 0)
    const inventoryPayload = supportsMultiInventoryItems ? validInvItems : validInvItems.slice(0, 1)

    // formData.code already tracks every keystroke (see the code field's onChange),
    // so a fast Save can't lose the typed code — but if it also resolves to a saved
    // activity, prefer the canonical code/reference over raw not-yet-blurred text.
    const pendingCodeResolution = codeQuery !== null ? resolveActivityFromQuery(codeQuery, activities) : null
    const effectiveCode = pendingCodeResolution?.code ?? formData.code
    const effectiveReference = pendingCodeResolution?.reference ?? formData.reference

    const deployment: any = {
      date: formData.date,
      code: effectiveCode,
      reference: effectiveReference,
      amount: formData.amount,
      notes: formData.notes,
      // The sentinel means "no block", which is stored as NULL -- not as a location id.
      locationId: formLocationId && formLocationId !== LOCATION_ESTATE_WIDE ? formLocationId : null,
      user: "admin",
    }
    if (validInvItems.length > 0) {
      deployment.inventoryItems = inventoryPayload
      // Keep legacy single fields for first item so the DB column stays populated
      deployment.inventoryItemType = inventoryPayload[0].itemType
      deployment.inventoryQuantity = inventoryPayload[0].quantity
    }

    try {
      const result = editingId ? await updateDeployment(editingId, deployment) : await addDeployment(deployment)
      if (result.ok) {
        if (isMobile && !editingId) setSavedConfirm({ reference: formData.reference, total: formData.amount })
        resetForm()
        window.dispatchEvent(new CustomEvent(FARMFLOW_RECORD_SAVED_EVENT))
      } else {
        reportActionFailure(editingId ? "expense_update" : "expense_save", result.error || "non-ok response")
        toast.error(result.error)
      }
    } catch (error) {
      reportActionError(editingId ? "expense_update" : "expense_save", error)
      toast.error("An unexpected error occurred. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Mobile double-tap guard: `disabled` only takes effect on the next render, so two
  // fast taps both entered this handler and saved the entry twice. lib/single-flight.ts.
  const handleSubmit = useSingleFlight(handleSubmitUnguarded)

  const startEdit = (deployment: any) => {
    trackClick("expense_edit", { id: deployment.id })
    setFormData({
      date: deployment.date.split("T")[0],
      code: deployment.code,
      reference: deployment.reference,
      amount: deployment.amount,
      notes: deployment.notes || "",
    })
    // Always set it, including to empty. Setting it only when the row HAS a block left the
    // previous row's block in state -- so editing an expense on HF A/C and then one with no
    // block showed, and saved, HF A/C. Silent re-attribution of cost to a block it never
    // touched. resetForm does not clear this either, which is deliberate for consecutive NEW
    // entries (a writer filing ten expenses for one block should not repick it ten times) but
    // is exactly wrong when opening an existing row.
    // A stored NULL is "whole estate", not "unset". Mapping it to "" would show an empty picker
    // and make an edit of an estate-wide cost demand an answer it already had -- and the easiest
    // way out of that prompt is to pick a block, which silently attributes it.
    setFormLocationId(deployment.locationId || LOCATION_ESTATE_WIDE)
    const linkedItems = Array.isArray(deployment.inventoryItems) && deployment.inventoryItems.length > 0
      ? deployment.inventoryItems
      : deployment.inventoryItemType
        ? [{ itemType: deployment.inventoryItemType, quantity: deployment.inventoryQuantity ?? "" }]
        : []
    setInvLines(
      (supportsMultiInventoryItems ? linkedItems : linkedItems.slice(0, 1)).map((item: any) => ({
        itemType: item.itemType,
        quantity: item.quantity ?? "",
      })),
    )
    setEditingId(deployment.id)
    setIsAdding(true)
  }

  const addInvLine = () => setInvLines((prev) => [...prev, { itemType: "", quantity: "" }])
  const removeInvLine = (idx: number) => setInvLines((prev) => prev.filter((_, i) => i !== idx))
  const updateInvLine = (idx: number, field: keyof InventoryLineItem, value: string) =>
    setInvLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)))

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const resolveLocationName = (locationId?: string | null) =>
    locationId ? locations.find((loc) => loc.id === locationId)?.name || null : null

  const computedTotalAmount = deployments.reduce((sum, d) => sum + d.amount, 0)
  const totalExpenses = totalAmount || computedTotalAmount
  const resolvedTotalCount = totalCount || deployments.length

  const formSectionRef = useRef<HTMLDivElement>(null)
  const historySectionRef = useRef<HTMLDivElement>(null)
  const [activeSection, setActiveSection] = useState<"form" | "history">("form")

  // Rows optimistically hidden while their undo-delete window is open
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set())
  const visibleDeployments = useMemo(
    () => (hiddenIds.size === 0 ? deployments : deployments.filter((d) => !hiddenIds.has(d.id))),
    [deployments, hiddenIds],
  )
  const unhide = (id: number) =>
    setHiddenIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })

  const handleDeleteWithUndo = (deployment: any) => {
    trackClick("expense_delete", { id: deployment.id })
    deleteWithUndo({
      description: `expense · ${formatDateOnly(deployment.date)}`,
      onHide: () => setHiddenIds((prev) => new Set(prev).add(deployment.id)),
      onRestore: () => unhide(deployment.id),
      onDelete: async () => {
        const result = await deleteDeployment(deployment.id)
        if (!result.ok) {
          unhide(deployment.id)
          reportActionFailure("expense_delete", result.error || "non-ok response", { id: deployment.id })
          toast.error(result.error)
        }
      },
    })
  }

  const historyControls = useListControls(visibleDeployments, {
    searchFields: (d) => [d.code, d.reference, d.notes, d.user],
    sorters: {
      date: (d) => String(d.date || "").slice(0, 10),
      amount: (d) => Number(d.amount) || 0,
      code: (d) => String(d.code || ""),
    },
    defaultSort: "date",
  })

  useEffect(() => {
    if (!savedConfirm) return
    const t = setTimeout(() => setSavedConfirm(null), 2000)
      return () => clearTimeout(t)
  }, [savedConfirm])

  /**
   * One form, rendered in one of two frames.
   *
   * Reported by HoneyFarm 2026-08-31: pressing Edit on a history row appeared to do nothing.
   * startEdit filled this form and set isAdding, but the form lives in the "form" section and the
   * writer was standing in "history" -- so the record loaded somewhere they could not see, and
   * they had to work out for themselves that they should navigate back to the log form.
   *
   * Editing now opens the record where it was clicked, in a dialog. Deliberately the SAME node,
   * not a second copy of the form: an edit form that drifts from the entry form is how a field
   * ends up saving on one screen and not the other, which this file has already been bitten by
   * twice (the block picker, and the pay basis on the roster).
   */
  const expenseFormNode = (
    <form onSubmit={handleSubmit} className="space-y-4 border rounded-lg p-3 sm:p-4 bg-muted/50">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="expense-date" className="text-base">
                    Date
                  </Label>
                  <Input
                    id="expense-date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                    required
                    className="h-11"
                  />
                </div>

                {locations.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="expense-location" className="text-base">
                      Where the cost belongs
                    </Label>
                    <Select value={formLocationId} onValueChange={setFormLocationId}>
                      <SelectTrigger id="expense-location" className="h-11 w-full">
                        <SelectValue placeholder="Select location" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Electricity, the phone bill, an audit fee -- these belong to the estate,
                            not to a block, and forcing them onto one puts a cost per acre on land
                            that never saw the money. NULL is already the app's word for "applies
                            everywhere" (lib/estate-filter.ts), and 9 of Laxmi's 21 expenses are
                            already stored that way -- a state the data held but this form could
                            not produce. */}
                        <SelectItem value={LOCATION_ESTATE_WIDE}>Whole estate — not one block</SelectItem>
                        {locations.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id}>
                            {formatLocationLabel(loc, locations)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="expense-amount" className="text-base">
                    {stockCost.derived !== null ? "Amount (₹) — from stock" : "Amount (₹)"}
                  </Label>
                  <Input
                    id="expense-amount"
                    type="number" inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={numericInputValue(formData.amount)}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, amount: Number.parseFloat(e.target.value) || 0 }))
                    }
                    required
                    /* Read-only rather than hidden: the number is the point of the form, and an
                       amount that vanishes when you link an item looks like a bug. Read-only says
                       "this is computed", which is the honest description. */
                    readOnly={stockCost.derived !== null}
                    aria-describedby={stockCost.derived !== null || stockCost.unpriced.length > 0 ? "expense-amount-help" : undefined}
                    className={cn("h-11", stockCost.derived !== null && "bg-muted text-muted-foreground")}
                  />
                  {stockCost.derived !== null && (
                    /* Shows its working. "Rs 4,000" alone invites the question this answers. */
                    <p id="expense-amount-help" className="text-xs text-muted-foreground">
                      {stockCost.working} — the average cost this stock was bought in at. Change the
                      quantity above to change the amount.
                    </p>
                  )}
                  {stockCost.unpriced.length > 0 && (
                    /* The case that used to pass silently: unpriced stock means the server keeps
                       whatever was typed, so the expense and the stock it consumed can disagree
                       by any amount. Saying so here is the difference between a number someone
                       chose and a number nobody checked. */
                    <p id="expense-amount-help" className="text-xs text-amber-600">
                      {stockCost.unpriced.join(", ")} {stockCost.unpriced.length === 1 ? "has" : "have"} no
                      cost recorded, so the amount can&apos;t be worked out from stock. Price the stock
                      under Inventory, or enter the amount yourself and know it isn&apos;t derived.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expense-code" className="text-base">
                    Type of cost
                  </Label>
                  <Input
                    id="expense-code"
                    value={
                      codeQuery !== null
                        ? codeQuery
                        : formData.code
                          ? formData.reference
                            ? `${formData.code} — ${formData.reference}`
                            : formData.code
                          : ""
                    }
                    onChange={(e) => {
                      const value = e.target.value
                      setCodeQuery(value)
                      // Expenses allow ad-hoc codes that aren't in the saved list yet, so
                      // formData.code must track every keystroke directly — unlike labour,
                      // it can't wait for a resolved match, or a typed-but-unmatched code
                      // would be silently discarded when the field loses focus.
                      setFormData((prev) => ({ ...prev, code: value }))
                    }}
                    onFocus={() => setCodeQuery("")}
                    onBlur={() => {
                      // If the typed text also resolves to a saved activity, canonicalize
                      // the code and auto-fill its category — a convenience on top of the
                      // live commit above, not something the field's correctness depends on.
                      const query = (codeQuery ?? "").trim()
                      setTimeout(() => {
                        const resolved = resolveActivityFromQuery(query, activities)
                        if (resolved) handleCodeChange(resolved.code)
                        setCodeQuery(null)
                      }, 150)
                    }}
                    placeholder="e.g. Fertiliser, Fuel"
                    required
                    className={cn("h-11", isMobile && "h-12 rounded-xl text-base")}
                  />
                  {codeQuery !== null && (
                    <ActivitySuggestList
                      options={filterActivitySuggestions(codeQuery, visibleActivities, sortedActivities)}
                      onSelect={(a) => {
                        handleCodeChange(a.code)
                        setCodeQuery(null)
                      }}
                    />
                  )}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Your most-used cost types appear first. Type a code or category name.</p>
                    {unusedActivities.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowAllCodes((v) => !v)}
                        className="text-xs text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
                      >
                        {showAllCodes ? "Fewer" : `+${unusedActivities.length} unused`}
                      </button>
                    )}
                  </div>
                </div>

                {selectedActivityHint === "labour" && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                    <span className="mt-0.5 shrink-0 text-base leading-none">⚠️</span>
                    <span>
                      <strong>{formData.code} — {formData.reference}</strong> is a labour cost code.
                      If this is a wages or bonus payment, log it in the <strong>Labour tab</strong> instead so it counts toward your cost-per-kg.
                    </span>
                  </div>
                )}

                {/* "Cost name" used to be a second required free-text box here. It was never
                    stored -- expense_transactions has no reference column, and the API derives the
                    name on read as COALESCE(aa.activity, et.code) by joining account_activities.
                    So whatever was typed was discarded, and because it was free text you could
                    pick code 155 and then name it something else entirely, see your words on
                    screen, save, and get the code's own name back.

                    One fact, one field. "Type of cost" above already searches the code AND the
                    name, so "electricity" finds 122 the same way typing 122 does. What it resolves
                    to is confirmed below rather than asked for again. */}
                {formData.code && formData.reference && (
                  <p className="text-xs text-muted-foreground">
                    Recorded as <strong className="text-foreground">{formData.code} — {formData.reference}</strong>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="expense-notes" className="text-base">
                  Notes
                </Label>
                <Textarea
                  id="expense-notes"
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="What was this expense for?"
                  rows={3}
                  className="text-base"
                />
              </div>

              {selectedTracksInventory && (
                <div className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-800">
                  <span className="mt-0.5 shrink-0">📦</span>
                  <span>
                    If you <strong>bought</strong> this supply, go to <strong>Stock → Restock</strong> to add it to your inventory. The expense records the cost; the restock records the stock arriving.
                  </span>
                </div>
              )}

              {inventoryItems.length > 0 && (
                <div className="space-y-3 border rounded-md p-3 bg-background">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground">
                      Deduct from stock{" "}<span className="font-normal">(optional — only if this cost used supplies already in your inventory)</span>
                    </p>
                    {supportsMultiInventoryItems && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={addInvLine}
                        className="h-8 px-2 text-xs gap-1"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add item
                      </Button>
                    )}
                  </div>

                  {invLines.length === 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addInvLine}
                      className="w-full h-9 text-sm bg-transparent"
                    >
                      <Plus className="h-4 w-4 mr-1" /> Link an inventory item
                    </Button>
                  )}

                  {(supportsMultiInventoryItems ? invLines : invLines.slice(0, 1)).map((line, idx) => {
                    const selectedStock = inventoryItems.find((item) => item.itemType === line.itemType)
                    const requestedQty = Number(line.quantity) || 0
                    const exceedsStock = Boolean(selectedStock) && requestedQty > selectedStock!.quantity + 0.0001
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="grid grid-cols-[1fr_6rem_2rem] gap-2 items-end">
                          <div className="space-y-1">
                            {idx === 0 && <Label className="text-xs text-muted-foreground">Item</Label>}
                            <select
                              value={line.itemType}
                              onChange={(e) => updateInvLine(idx, "itemType", e.target.value)}
                              className="flex h-10 w-full rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <option value="">— Select —</option>
                              {inventoryItems.map((item) => (
                                <option key={item.itemType} value={item.itemType}>
                                  {item.itemType} ({item.quantity.toFixed(1)} {item.unit})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            {idx === 0 && <Label className="text-xs text-muted-foreground">Qty used</Label>}
                            <Input
                              type="number" inputMode="decimal"
                              min="0.001"
                              step="0.001"
                              value={line.quantity}
                              onChange={(e) => updateInvLine(idx, "quantity", e.target.value)}
                              placeholder="0"
                              disabled={!line.itemType}
                              className={cn("h-10", exceedsStock && "border-amber-500 focus-visible:ring-amber-500")}
                            />
                          </div>
                          {supportsMultiInventoryItems ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeInvLine(idx)}
                              className="h-10 w-8 text-muted-foreground hover:text-destructive"
                              aria-label="Remove item"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          ) : (
                            <div />
                          )}
                        </div>
                        {exceedsStock && (
                          <p className="text-xs text-amber-600">
                            Only {selectedStock!.quantity.toFixed(1)} {selectedStock!.unit} of {selectedStock!.itemType} in stock. Saving will fail unless you restock first or lower the quantity.
                          </p>
                        )}
                      </div>
                    )
                  })}

                  {invLines.some((l) => l.itemType) && (
                    <p className="text-xs text-muted-foreground">
                      These quantities will be deducted from inventory when you save the expense.
                    </p>
                  )}
                  {!supportsMultiInventoryItems && (
                    <p className="text-xs text-muted-foreground">
                      This estate currently supports one linked inventory item per expense.
                    </p>
                  )}
                </div>
              )}

              <div className={cn(
                "flex flex-col sm:flex-row gap-2",
                isMobile && "sticky bottom-0 -mx-5 px-5 pb-4 pt-3 bg-white/95 backdrop-blur-sm border-t border-stone-100",
              )}>
                <button
                  type="submit"
                  data-testid="expense-save-button"
                  disabled={isSubmitting}
                  className="flex-1 h-14 rounded-2xl bg-emerald-700 text-white text-base font-bold flex items-center justify-center gap-2 shadow-md shadow-emerald-100 active:scale-[0.98] transition-all touch-manipulation disabled:opacity-70"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2"><Save className="h-5 w-5 animate-pulse" />Saving…</span>
                  ) : (
                    <><Save className="h-5 w-5" />{editingId ? "Update" : "Save"} expense</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={isSubmitting}
                  className="h-14 rounded-2xl border border-stone-200 bg-white text-base font-semibold text-stone-500 px-6 touch-manipulation"
                >
                  Cancel
                </button>
              </div>
            </form>
  )

  return (
    <>
    {savedConfirm && (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-emerald-700 touch-manipulation"
        onClick={() => setSavedConfirm(null)}
      >
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/20 mb-6">
          <Check className="h-14 w-14 text-white stroke-[3]" />
        </div>
        <p className="text-4xl font-black text-white mb-2">Saved!</p>
        <p className="text-lg font-semibold text-white/90 mb-1">{savedConfirm.reference}</p>
        {savedConfirm.total > 0 && (
          <p className="text-base text-white/70">{formatCurrency(savedConfirm.total)}</p>
        )}
        <p className="mt-8 text-xs text-white/40">Tap anywhere to continue</p>
      </div>
    )}
    <div className="space-y-4">
      <InPageNav items={[
        { label: "Log Expense", active: activeSection === "form", onClick: () => setActiveSection("form") },
        { label: "History", active: activeSection === "history", onClick: () => setActiveSection("history") },
      ]} />
      {/* Add entry button */}
      {activeSection === "form" && !isAdding && (
        <button
          type="button"
          onClick={openNewExpenseForm}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 text-base font-bold text-white shadow-md shadow-emerald-100 active:scale-[0.98] transition-transform touch-manipulation hover:bg-emerald-600"
        >
          <PlusCircle className="h-5 w-5" /> Log non-labour expense
        </button>
      )}

      {activeSection === "form" && <Card ref={formSectionRef}>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-xl sm:text-2xl">💸 Non-Labour Expenses</CardTitle>
              <CardDescription className="text-sm">Track real spend with a simple estate code and category</CardDescription>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm font-medium text-muted-foreground">Total Non-Labour Expenses</p>
              <p className="text-xl sm:text-2xl font-bold">{formatCurrency(totalExpenses)}</p>
              {resolvedTotalCount > deployments.length && (
                <p className="text-xs text-muted-foreground mt-1">
                  Showing {deployments.length} of {resolvedTotalCount}
                </p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activities.length === 0 && !isAdding && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <p className="text-sm font-semibold text-amber-900">No saved codes yet</p>
              <p className="mt-1 text-xs text-amber-800">
                You can still log the expense now. Type a short estate code and a plain category name here, then clean it up in Codes later.
              </p>
            </div>
          )}
          {/* Inline only for a NEW entry. An edit opens in the dialog below, where it was clicked. */}
          {isAdding && !editingId ? expenseFormNode : null}
        </CardContent>
      </Card>}

      {activeSection === "history" && (loading ? (
        <Card><CardContent className="p-0"><SkeletonTable rows={4} cols={5} /></CardContent></Card>
      ) : deployments.length > 0 ? (
        <Card ref={historySectionRef}>
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl">📋 Expense History</CardTitle>
            <FilterBar
              className="mt-3"
              search={historyControls.search}
              onSearchChange={(value) => {
                historyControls.setSearch(value)
                // Filtering is client-side; without pulling the full list first, a search over
                // a paginated page reports "no matches" for entries that plainly exist.
                if (value.trim() && !allLoaded && !loadingMore) void loadAll()
              }}
              searchPlaceholder="Search code, reference, notes…"
              sortOptions={[
                { value: "date", label: "Date" },
                { value: "amount", label: "Amount" },
                { value: "code", label: "Code" },
              ]}
              sortValue={historyControls.sortValue}
              onSortChange={historyControls.setSortValue}
              sortDirection={historyControls.sortDirection}
              onSortDirectionChange={historyControls.setSortDirection}
            />
          </CardHeader>
          <CardContent className="p-0">
            {historyControls.isFiltering && historyControls.items.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-stone-400">
                {loadingMore || loading
                  ? "Searching all entries…"
                  : allLoaded
                    ? `No expenses match “${historyControls.search.trim()}”.`
                    : "No entries match your search."}
              </p>
            )}
            {/* Mobile View */}
            <div className="block sm:hidden divide-y divide-stone-50">
              {historyControls.items.map((deployment) => {
                const isExpanded = expandedRows.has(deployment.id)
                return (
                  <Collapsible key={deployment.id} open={isExpanded} onOpenChange={() => toggleRow(deployment.id)}>
                    <CollapsibleTrigger className="w-full text-left">
                      <div className="flex items-center justify-between px-4 py-4 active:bg-stone-50 touch-manipulation">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold text-stone-400 uppercase tracking-wide">
                              {formatDateOnly(deployment.date)}
                            </span>
                            <span className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full font-mono font-semibold">
                              {deployment.code}
                            </span>
                          </div>
                          <p className="text-base font-bold text-stone-800 truncate leading-tight">
                            {deployment.reference || deployment.code}
                          </p>
                          <p className="text-lg font-black text-emerald-700 mt-0.5 tabular-nums leading-none">
                            {formatCurrency(deployment.amount)}
                          </p>
                          {resolveLocationName(deployment.locationId) && (
                            <p className="text-xs text-stone-400 mt-0.5">{resolveLocationName(deployment.locationId)}</p>
                          )}
                        </div>
                        <div className="shrink-0 ml-3 text-stone-400">
                          {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-4 pb-4 space-y-2 bg-stone-50/50">
                        {((Array.isArray(deployment.inventoryItems) && deployment.inventoryItems.length > 0) || deployment.inventoryItemType) && (
                          <p className="text-sm text-stone-500">
                            <span className="font-semibold text-stone-600">Stock: </span>
                            {formatInventoryUsage(
                              Array.isArray(deployment.inventoryItems) && deployment.inventoryItems.length > 0
                                ? deployment.inventoryItems
                                : [{ itemType: deployment.inventoryItemType ?? "", quantity: deployment.inventoryQuantity }],
                            )}
                          </p>
                        )}
                        {deployment.notes && (
                          <p className="text-sm text-stone-500 italic">{deployment.notes}</p>
                        )}
                        <div className="flex gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => startEdit(deployment)}
                            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl border border-stone-200 bg-white text-sm font-semibold text-stone-600 touch-manipulation"
                          >
                            <Edit2 className="h-3.5 w-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteWithUndo(deployment)}
                            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl border border-stone-200 bg-white text-sm font-semibold text-red-500 touch-manipulation"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
            </div>

            {/* Desktop View */}
            <div className="hidden sm:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="sticky top-0 bg-muted/60">Date</TableHead>
                    <TableHead className="sticky top-0 bg-muted/60">Code</TableHead>
                    <TableHead className="sticky top-0 bg-muted/60">Reference</TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/60">Amount</TableHead>
                    <TableHead className="sticky top-0 bg-muted/60">Location</TableHead>
                    <TableHead className="sticky top-0 bg-muted/60">Inventory used</TableHead>
                    <TableHead className="sticky top-0 bg-muted/60">Notes</TableHead>
                    <TableHead className="w-[100px] sticky top-0 bg-muted/60">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyControls.items.map((deployment, index) => (
                    <TableRow key={deployment.id} className={index % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                      <TableCell>{formatDateOnly(deployment.date)}</TableCell>
                      <TableCell className="font-medium">{deployment.code}</TableCell>
                      <TableCell>{deployment.reference || deployment.code}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(deployment.amount)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{resolveLocationName(deployment.locationId) || "-"}</TableCell>
                      <TableCell className="text-sm">
                        {formatInventoryUsage(
                          Array.isArray(deployment.inventoryItems) && deployment.inventoryItems.length > 0
                            ? deployment.inventoryItems
                            : deployment.inventoryItemType
                              ? [{ itemType: deployment.inventoryItemType, quantity: deployment.inventoryQuantity }]
                              : [],
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{deployment.notes || "-"}</TableCell>
                      <TableCell>
                        <TooltipProvider>
                          <div className="flex gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => startEdit(deployment)}>
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit expense</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteWithUndo(deployment)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete expense</TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {hasMore && (
              <div className="flex justify-center p-4 border-t">
                <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading..." : "Load more"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <WorkflowEmptyState
          title="No expenses recorded yet"
          description="Start with the date, amount, and cost code for the first real spend. You can keep the first entry very simple."
          steps={[
            "Enter the real date and amount you already know.",
            "Use a short estate code and plain category name if saved codes are not ready yet.",
            "Add linked inventory usage only when the expense actually consumed stock.",
          ]}
          tip="Do not postpone expense logging until the chart of accounts feels perfect. Clean up code labels later if needed."
          askPrompt="How do I log my first expense and inventory usage?"
          primaryAction={{ label: isAdding ? "Continue entry" : "Add expense", onClick: openNewExpenseForm }}
          className="mt-2"
        />
      ))}
    </div>
    <EditRecordDialog
      open={editingId != null}
      onClose={resetForm}
      title="Edit expense"
      description="Change the code, the block, the amount or the stock used. Saving replaces the record and recalculates the stock it drew on."
    >
      {expenseFormNode}
    </EditRecordDialog>

    </>
  )
}
