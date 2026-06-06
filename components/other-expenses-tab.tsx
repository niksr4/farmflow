"use client"

import type React from "react"

import { useState, useEffect, useCallback, useRef } from "react"
import InPageNav from "@/components/in-page-nav"
import { cn } from "@/lib/utils"
import { FARMFLOW_RECORD_SAVED_EVENT } from "@/components/inventory-system/constants"
import { useConsumablesData } from "@/hooks/use-consumables-data"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Check, PlusCircle, Trash2, Edit2, Save, X, ChevronDown, ChevronUp, Plus } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { formatDateOnly } from "@/lib/date-utils"
import { formatCurrency } from "@/lib/format"
import { SkeletonTable } from "@/components/ui/skeleton"
import WorkflowEmptyState from "@/components/workflow-empty-state"
import { toast } from "sonner"
import { useMediaQuery } from "@/hooks/use-media-query"

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
  locationId,
  startDate,
  endDate,
}: {
  locationId?: string
  startDate?: string
  endDate?: string
}) {
  const {
    deployments,
    loading,
    loadingMore,
    totalAmount,
    totalCount,
    hasMore,
    loadMore,
    addDeployment,
    updateDeployment,
    deleteDeployment,
  } = useConsumablesData(locationId, { startDate, endDate })

  const isMobile = useMediaQuery("(max-width: 768px)")
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [savedConfirm, setSavedConfirm] = useState<{ reference: string; total: number } | null>(null)
  const [activities, setActivities] = useState<ActivityCode[]>([])
  const [showAllCodes, setShowAllCodes] = useState(false)
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [supportsMultiInventoryItems, setSupportsMultiInventoryItems] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  type InventoryLineItem = { itemType: string; quantity: string | number }

  // Form state
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    code: "",
    reference: "",
    amount: 0,
    notes: "",
  })
  const [invLines, setInvLines] = useState<InventoryLineItem[]>([])

  const fetchActivities = useCallback(async () => {
    try {
      const response = await fetch(
        locationId ? `/api/get-activity?locationId=${locationId}` : "/api/get-activity",
      )
      const data = await response.json()
      if (data.success && data.activities) {
        setActivities(data.activities)
      }
    } catch (error) {
      console.error("Error fetching activities:", error)
    }
  }, [locationId])

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

  useEffect(() => {
    fetchActivities()
    fetchInventoryItems()
  }, [fetchActivities, fetchInventoryItems])

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

  const sortedActivities = [...activities].sort((a, b) =>
    ((b.expense_count ?? 0) + (b.labor_count ?? 0)) - ((a.expense_count ?? 0) + (a.labor_count ?? 0))
  )
  const usedActivities = sortedActivities.filter((a) => (a.expense_count ?? 0) + (a.labor_count ?? 0) > 0)
  const unusedActivities = sortedActivities.filter((a) => (a.expense_count ?? 0) + (a.labor_count ?? 0) === 0)
  const visibleActivities = showAllCodes ? sortedActivities : usedActivities

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split("T")[0],
      code: "",
      reference: "",
      amount: 0,
      notes: "",
    })
    setInvLines([])
    setIsAdding(false)
    setEditingId(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)

    const validInvItems = invLines
      .map((l) => ({ itemType: l.itemType.trim(), quantity: Number(l.quantity) || 0 }))
      .filter((l) => l.itemType && l.quantity > 0)
    const inventoryPayload = supportsMultiInventoryItems ? validInvItems : validInvItems.slice(0, 1)

    const deployment: any = {
      date: formData.date,
      code: formData.code,
      reference: formData.reference,
      amount: formData.amount,
      notes: formData.notes,
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
        toast.error(result.error)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const startEdit = (deployment: any) => {
    setFormData({
      date: deployment.date.split("T")[0],
      code: deployment.code,
      reference: deployment.reference,
      amount: deployment.amount,
      notes: deployment.notes || "",
    })
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

  const computedTotalAmount = deployments.reduce((sum, d) => sum + d.amount, 0)
  const totalExpenses = totalAmount || computedTotalAmount
  const resolvedTotalCount = totalCount || deployments.length

  const formSectionRef = useRef<HTMLDivElement>(null)
  const historySectionRef = useRef<HTMLDivElement>(null)
  const [activeSection, setActiveSection] = useState<"form" | "history">("form")

  useEffect(() => {
    if (!savedConfirm) return
    const t = setTimeout(() => setSavedConfirm(null), 2000)
    return () => clearTimeout(t)
  }, [savedConfirm])

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
          onClick={() => setIsAdding(true)}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 text-base font-bold text-white shadow-md shadow-emerald-100 active:scale-[0.98] transition-transform touch-manipulation hover:bg-emerald-600"
        >
          <PlusCircle className="h-5 w-5" /> Log expense
        </button>
      )}

      {activeSection === "form" && <Card ref={formSectionRef}>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-xl sm:text-2xl">💸 Other Expenses</CardTitle>
              <CardDescription className="text-sm">Track real spend with a simple estate code and category</CardDescription>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm font-medium text-muted-foreground">Total Expenses</p>
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
          {isAdding ? (
            <form onSubmit={handleSubmit} className="space-y-4 border rounded-lg p-3 sm:p-4 bg-muted/50">
              <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                <p className="text-sm font-medium text-foreground">Expense details</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Start with the date, amount, and cost code. If you do not have saved codes yet, type a simple code and category name.
                </p>
              </div>

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

                <div className="space-y-2">
                  <Label htmlFor="expense-amount" className="text-base">
                    Amount (₹)
                  </Label>
                  <Input
                    id="expense-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, amount: Number.parseFloat(e.target.value) || 0 }))
                    }
                    required
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expense-code" className="text-base">
                    Type of cost
                  </Label>
                  {isMobile && activities.length > 0 ? (
                    <>
                      <select
                        value={formData.code}
                        onChange={(e) => handleCodeChange(e.target.value)}
                        required
                        className="w-full h-12 rounded-xl border border-input bg-background px-3 text-base font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">Choose a cost type…</option>
                        {usedActivities.length > 0 && (
                          <optgroup label="Used codes">
                            {usedActivities.map((a) => (
                              <option key={a.code} value={a.code}>{a.code} — {a.reference}</option>
                            ))}
                          </optgroup>
                        )}
                        {showAllCodes && unusedActivities.length > 0 && (
                          <optgroup label="Unused codes">
                            {unusedActivities.map((a) => (
                              <option key={a.code} value={a.code}>{a.code} — {a.reference}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      {unusedActivities.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowAllCodes((v) => !v)}
                          className="text-xs text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
                        >
                          {showAllCodes ? "Show fewer codes" : `Show ${unusedActivities.length} unused codes`}
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <Input
                        id="expense-code"
                        value={formData.code}
                        onChange={(e) => handleCodeChange(e.target.value)}
                        placeholder="e.g. Fertiliser, Fuel"
                        required
                        list="expense-activity-codes"
                        className="h-11"
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">Your most-used cost types appear first. Type to search.</p>
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
                      <datalist id="expense-activity-codes">
                        {visibleActivities.map((a) => (
                          <option key={a.code} value={a.code}>{a.reference}</option>
                        ))}
                      </datalist>
                    </>
                  )}
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

                <div className="space-y-2">
                  <Label htmlFor="expense-reference" className="text-base">
                    Cost name
                  </Label>
                  <Input
                    id="expense-reference"
                    value={formData.reference}
                    onChange={(e) => setFormData((prev) => ({ ...prev, reference: e.target.value }))}
                    placeholder="Auto-filled from code"
                    required
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">Use a plain category name the owner and accountant will both recognize.</p>
                </div>
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

                  {(supportsMultiInventoryItems ? invLines : invLines.slice(0, 1)).map((line, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_6rem_2rem] gap-2 items-end">
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
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={line.quantity}
                          onChange={(e) => updateInvLine(idx, "quantity", e.target.value)}
                          placeholder="0"
                          disabled={!line.itemType}
                          className="h-10"
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
                  ))}

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
          ) : null}
        </CardContent>
      </Card>}

      {activeSection === "history" && (loading ? (
        <Card><CardContent className="p-0"><SkeletonTable rows={4} cols={5} /></CardContent></Card>
      ) : deployments.length > 0 ? (
        <Card ref={historySectionRef}>
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl">📋 Expense History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Mobile View */}
            <div className="block sm:hidden divide-y divide-stone-50">
              {deployments.map((deployment) => {
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
                            onClick={async () => {
                              if (confirm("Delete this expense?")) {
                                const result = await deleteDeployment(deployment.id)
                                if (!result.ok) toast.error(result.error)
                              }
                            }}
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
                    <TableHead className="sticky top-0 bg-muted/60">Inventory used</TableHead>
                    <TableHead className="sticky top-0 bg-muted/60">Notes</TableHead>
                    <TableHead className="w-[100px] sticky top-0 bg-muted/60">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deployments.map((deployment, index) => (
                    <TableRow key={deployment.id} className={index % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                      <TableCell>{formatDateOnly(deployment.date)}</TableCell>
                      <TableCell className="font-medium">{deployment.code}</TableCell>
                      <TableCell>{deployment.reference || deployment.code}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(deployment.amount)}</TableCell>
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
                                  onClick={async () => {
                                    if (confirm("Are you sure you want to delete this expense?")) {
                                      const result = await deleteDeployment(deployment.id)
                                      if (!result.ok) toast.error(result.error)
                                    }
                                  }}
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
          primaryAction={{ label: isAdding ? "Continue entry" : "Add expense", onClick: () => setIsAdding(true) }}
          className="mt-2"
        />
      ))}
    </div>
    </>
  )
}
