"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback } from "react"
import { useLaborData } from "@/hooks/use-labor-data"
import { useTenantSettings } from "@/hooks/use-tenant-settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { PlusCircle, Trash2, Edit2, Save, X, ChevronDown, ChevronUp, Plus, Minus } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { formatDateOnly } from "@/lib/date-utils"
import { cn } from "@/lib/utils"
import { formatCurrency, formatNumber } from "@/lib/format"
import { SkeletonTable } from "@/components/ui/skeleton"
import TaskGuideCard from "@/components/task-guide-card"
import WorkflowEmptyState from "@/components/workflow-empty-state"
import { useToast } from "@/hooks/use-toast"
import { FARMFLOW_RECORD_SAVED_EVENT } from "@/components/inventory-system/constants"
import { useMediaQuery } from "@/hooks/use-media-query"
import QuickLogPanel from "@/components/quick-log-panel"


interface ActivityCode {
  code: string
  reference: string
  module_hint?: string | null
  labor_count?: number
  expense_count?: number
}

interface LaborSet {
  label: string
  laborers: number
  costPerLaborer: number
  isContract?: boolean
}

interface FormData {
  date: string
  code: string
  reference: string
  laborSets: LaborSet[]
  notes: string
  taskDescription: string
}

const DEFAULT_SET_LABELS = ["In-house", "Outside"]

function makeDefaultSets(inHouseWage: number, outsideWage: number): LaborSet[] {
  return [
    { label: "In-house", laborers: 0, costPerLaborer: inHouseWage },
    { label: "Outside", laborers: 0, costPerLaborer: outsideWage },
  ]
}

export default function LaborDeploymentTab({
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
    totalCost,
    totalCount,
    hasMore,
    loadMore,
    addDeployment,
    updateDeployment,
    deleteDeployment,
    refetch,
  } = useLaborData(locationId, { startDate, endDate })
  const { settings } = useTenantSettings()
  const isMobile = useMediaQuery("(max-width: 768px)")
  const { toast } = useToast()

  const inHouseWage = settings.laborWages?.defaultInHouseWage ?? 0
  const outsideWage = settings.laborWages?.defaultOutsideWage ?? 0

  const [isAdding, setIsAdding] = useState(false)
  const [prefilled, setPrefilled] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [savedConfirm, setSavedConfirm] = useState<{ reference: string; total: number } | null>(null)
  const [activities, setActivities] = useState<ActivityCode[]>([])
  const [showAllCodes, setShowAllCodes] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [formData, setFormData] = useState<FormData>({
    date: new Date().toISOString().split("T")[0],
    code: "",
    reference: "",
    laborSets: makeDefaultSets(inHouseWage, outsideWage),
    notes: "",
    taskDescription: "",
  })

  const formRef = useRef<HTMLFormElement>(null)

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

  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  // Refresh history when QuickLogPanel (or anything else) saves a record
  useEffect(() => {
    const handler = () => refetch()
    window.addEventListener(FARMFLOW_RECORD_SAVED_EVENT, handler)
    return () => window.removeEventListener(FARMFLOW_RECORD_SAVED_EVENT, handler)
  }, [refetch])

  // Auto-dismiss the full-form save confirmation after 2s
  useEffect(() => {
    if (!savedConfirm) return
    const t = setTimeout(() => setSavedConfirm(null), 2000)
    return () => clearTimeout(t)
  }, [savedConfirm])

  const handleCodeChange = (code: string) => {
    setFormData((prev) => ({ ...prev, code }))
    const matchingActivity = activities.find((a) => a.code.toLowerCase() === code.toLowerCase())
    if (matchingActivity) {
      setFormData((prev) => ({ ...prev, reference: matchingActivity.reference }))
    }
  }

  const selectedActivityHint = activities.find(
    (a) => a.code.toLowerCase() === formData.code.toLowerCase()
  )?.module_hint ?? null

  const sortedActivities = [...activities].sort((a, b) =>
    ((b.labor_count ?? 0) + (b.expense_count ?? 0)) - ((a.labor_count ?? 0) + (a.expense_count ?? 0))
  )
  const usedActivities = sortedActivities.filter((a) => (a.labor_count ?? 0) + (a.expense_count ?? 0) > 0)
  const unusedActivities = sortedActivities.filter((a) => (a.labor_count ?? 0) + (a.expense_count ?? 0) === 0)
  const visibleActivities = showAllCodes ? sortedActivities : usedActivities

  const calculateTotal = (sets = formData.laborSets) =>
    sets.reduce((sum, s) => sum + (s.isContract ? s.costPerLaborer : s.laborers * s.costPerLaborer), 0)

  const formatLaborCount = (value: number) => {
    const n = Number(value) || 0
    return Number.isInteger(n) ? formatNumber(n, 0) : formatNumber(n, 1)
  }

  const openNewForm = useCallback(() => {
    const last = deployments[0]
    if (last && last.laborEntries?.length > 0) {
      const sets: LaborSet[] = last.laborEntries.map((e: any) => ({
        label: e.name === "Estate Labour" ? "In-house" : e.name === "Outside Labour" ? "Outside" : e.name,
        laborers: Number(e.laborCount) || 0,
        costPerLaborer: Number(e.costPerLabor) || 0,
      }))
      setFormData({
        date: new Date().toISOString().split("T")[0],
        code: last.code || "",
        reference: last.reference || "",
        laborSets: sets,
        notes: "",
        taskDescription: "",
      })
      setPrefilled(true)
    } else {
      setFormData({
        date: new Date().toISOString().split("T")[0],
        code: "",
        reference: "",
        laborSets: makeDefaultSets(inHouseWage, outsideWage),
        notes: "",
        taskDescription: "",
      })
      setPrefilled(false)
    }
    setIsAdding(true)
  }, [deployments, inHouseWage, outsideWage])

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split("T")[0],
      code: "",
      reference: "",
      laborSets: makeDefaultSets(inHouseWage, outsideWage),
      notes: "",
      taskDescription: "",
    })
    setPrefilled(false)
    setIsAdding(false)
    setEditingId(null)
  }

  const updateSet = (index: number, field: keyof LaborSet, value: string | number) => {
    setFormData((prev) => {
      const sets = prev.laborSets.map((s, i) => (i === index ? { ...s, [field]: value } : s))
      return { ...prev, laborSets: sets }
    })
  }

  const addSet = () => {
    setFormData((prev) => ({
      ...prev,
      laborSets: [
        ...prev.laborSets,
        {
          label: `Group ${prev.laborSets.length + 1}`,
          laborers: 0,
          costPerLaborer: prev.laborSets[prev.laborSets.length - 1]?.costPerLaborer ?? 0,
        },
      ],
    }))
  }

  const removeSet = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      laborSets: prev.laborSets.filter((_, i) => i !== index),
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)

    const laborEntries = formData.laborSets
      .filter((s) => s.isContract ? s.costPerLaborer > 0 : s.laborers > 0)
      .map((s) => s.isContract
        ? { name: s.label, laborCount: 0, costPerLabor: 0, contractTotal: s.costPerLaborer }
        : { name: s.label, laborCount: s.laborers, costPerLabor: s.costPerLaborer }
      )

    if (laborEntries.length === 0) {
      toast({ title: "No workers logged", description: "Enter at least one worker count or contract amount above zero.", variant: "destructive" })
      setIsSubmitting(false)
      return
    }

    const deployment = {
      date: formData.date,
      code: formData.code,
      reference: formData.reference,
      laborEntries,
      totalCost: calculateTotal(),
      notes: formData.notes,
      taskDescription: formData.taskDescription,
      user: "admin",
    }

    try {
      const result = editingId ? await updateDeployment(editingId, deployment) : await addDeployment(deployment)
      if (result.ok) {
        if (isMobile && !editingId) setSavedConfirm({ reference: formData.reference, total: calculateTotal() })
        resetForm()
        window.dispatchEvent(new CustomEvent(FARMFLOW_RECORD_SAVED_EVENT))
      } else {
        toast({
          title: "Couldn't save record",
          description: result.error || "Please check your entries and try again.",
          variant: "destructive",
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const startEdit = (deployment: any) => {
    const sets: LaborSet[] = (deployment.laborEntries || []).map((e: any) => ({
      label: e.name === "Estate Labour" ? "In-house" : e.name === "Outside Labour" ? "Outside" : e.name,
      laborers: Number(e.laborCount) || 0,
      costPerLaborer: Number(e.costPerLabor) || 0,
    }))
    if (sets.length === 0) {
      sets.push(...makeDefaultSets(inHouseWage, outsideWage))
    }
    setFormData({
      date: deployment.date.split("T")[0],
      code: deployment.code,
      reference: deployment.reference,
      laborSets: sets,
      notes: deployment.notes || "",
      taskDescription: deployment.taskDescription || "",
    })
    setPrefilled(false)
    setEditingId(deployment.id)
    setIsAdding(true)
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 100)
  }

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const computedTotalCost = deployments.reduce((sum, d) => sum + d.totalCost, 0)
  const totalDeploymentCost = totalCost || computedTotalCost
  const resolvedTotalCount = totalCount || deployments.length

  const formSectionRef = useRef<HTMLDivElement>(null)
  const historySectionRef = useRef<HTMLDivElement>(null)

  return (
    <>
    {savedConfirm && (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-emerald-700 touch-manipulation"
        onClick={() => setSavedConfirm(null)}
      >
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/20 mb-6">
          <Save className="h-12 w-12 text-white" />
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
      {/* Mobile: QuickLogPanel tiles as default entry — full form opens via "More details" */}
      {isMobile && !isAdding && (
        <QuickLogPanel
          locationId={locationId}
          onNavigateToFull={openNewForm}
        />
      )}

      {/* Desktop: traditional add button */}
      {!isMobile && !isAdding && (
        <button
          type="button"
          onClick={openNewForm}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 text-base font-bold text-white shadow-md shadow-emerald-100 transition-colors hover:bg-emerald-600 active:scale-[0.98] touch-manipulation"
        >
          <PlusCircle className="h-5 w-5" /> Log labour entry
        </button>
      )}

      {!loading && activities.length === 0 && (
        <TaskGuideCard
          tone="finance"
          eyebrow="Simple start"
          title="Start with a few simple work codes"
          description="You do not need a full chart of accounts before logging labour. If you already know the estate codes, use them. If not, type a short code and work name now, then tidy the Codes tab later."
          bullets={[
            "Use short, stable work codes your team will actually remember.",
            "Type the code and category name directly here if no saved list exists yet.",
            "Use Codes later when you want autocomplete and cleaner exports.",
          ]}
          tip="A simple code like HARVEST, WEEDING, or PRUNING is better than waiting for a perfect accounting structure."
        />
      )}
      {/* On mobile hide the form card unless we're in detailed-entry mode */}
      <Card ref={formSectionRef} className={cn("border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card", isMobile && !isAdding && "hidden")}>
        <CardHeader className="border-b border-stone-100 dark:border-white/[0.05]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Labour</p>
              <CardTitle className="mt-0.5 text-xl">Log labour entry</CardTitle>
              <CardDescription>One day · one activity code · in-house and outside workers separately.</CardDescription>
            </div>
            <div className="rounded-xl border border-stone-100 bg-stone-50 px-5 py-3 text-right dark:border-white/[0.05] dark:bg-white/[0.03]">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Season total</p>
              <p className="mt-0.5 text-2xl font-black tabular-nums text-stone-900 dark:text-white">{formatCurrency(totalDeploymentCost)}</p>
              {resolvedTotalCount > deployments.length && (
                <p className="text-[10px] text-stone-400 mt-0.5">
                  Showing {deployments.length} of {resolvedTotalCount}
                </p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          {!isAdding && (
            <div className="mb-5 grid gap-2 md:grid-cols-3">
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.02]">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Rule</p>
                <p className="mt-1 text-sm font-semibold text-stone-800 dark:text-stone-200">One day, one activity code</p>
              </div>
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.02]">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">In-house</p>
                <p className="mt-1 text-sm font-semibold text-stone-800 dark:text-stone-200">Workers paid by the estate</p>
              </div>
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.02]">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Outside</p>
                <p className="mt-1 text-sm font-semibold text-stone-800 dark:text-stone-200">Contract or outside workers</p>
              </div>
            </div>
          )}

          {isAdding ? (
            <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-stone-200 p-4 bg-stone-50/40 dark:border-white/[0.06] dark:bg-white/[0.02]" ref={formRef} /* form opens via top-level button */>
              {prefilled && (
                <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-2.5 text-sm text-blue-800">
                  <span>Prefilled from your last entry — update as needed.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, code: "", reference: "", laborSets: makeDefaultSets(inHouseWage, outsideWage), taskDescription: "" }))
                      setPrefilled(false)
                    }}
                    className="ml-3 text-blue-600 underline text-xs hover:text-blue-800"
                  >
                    Clear
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 border-b border-stone-200 pb-3 dark:border-white/[0.06]">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Entry details</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="date" className="text-base">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                    required
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="code" className="text-base">Activity code</Label>
                  {isMobile && activities.length > 0 ? (
                    <>
                      <select
                        value={formData.code}
                        onChange={(e) => handleCodeChange(e.target.value)}
                        required
                        className="w-full h-12 rounded-xl border border-input bg-background px-3 text-base font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">Select activity code…</option>
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
                        id="code"
                        value={formData.code}
                        onChange={(e) => handleCodeChange(e.target.value)}
                        placeholder="Enter activity code"
                        required
                        list="activity-codes"
                        className="h-11"
                      />
                      <datalist id="activity-codes">
                        {visibleActivities.map((a) => (
                          <option key={a.code} value={a.code}>{a.reference}</option>
                        ))}
                      </datalist>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">Most-used codes appear first. Type a code or name to filter.</p>
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
                    </>
                  )}
                </div>

                {selectedActivityHint === "expense" && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                    <span className="mt-0.5 shrink-0 text-base leading-none">⚠️</span>
                    <span>
                      <strong>{formData.code} — {formData.reference}</strong> is an expense code (materials, utilities, capital).
                      If this is not a wages payment, use the <strong>Other Expenses tab</strong> instead.
                    </span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="reference" className="text-base">Category name</Label>
                  <Input
                    id="reference"
                    value={formData.reference}
                    onChange={(e) => setFormData((prev) => ({ ...prev, reference: e.target.value }))}
                    placeholder="Auto-filled from activity code"
                    required
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">Use a plain work name the field team and owner will both recognize.</p>
                </div>
              </div>

              {/* Dynamic labour sets */}
              <div className="space-y-3">
                {formData.laborSets.map((set, i) => (
                  <div key={i} className={cn(
                    "rounded-xl border p-4",
                    set.isContract
                      ? "border-orange-200 bg-orange-50/40 dark:border-orange-900/30 dark:bg-orange-900/10"
                      : "border-stone-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]",
                  )}>
                    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2">
                        <Input
                          value={set.label}
                          onChange={(e) => updateSet(i, "label", e.target.value)}
                          className="h-8 w-36 text-sm font-medium"
                          aria-label="Labour group label"
                        />
                        {set.isContract && (
                          <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700">
                            Contract
                          </span>
                        )}
                        {formData.laborSets.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSet(i)}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Remove labour group"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Subtotal: {formatCurrency(set.isContract ? set.costPerLaborer : set.laborers * set.costPerLaborer)}
                      </p>
                    </div>

                    {set.isContract ? (
                      <div className="space-y-2">
                        <Label className="text-base">Total contract amount (₹)</Label>
                        {isMobile ? (
                          <Input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            step="1"
                            value={set.costPerLaborer || ""}
                            onChange={(e) => updateSet(i, "costPerLaborer", Number.parseFloat(e.target.value) || 0)}
                            placeholder="Enter total amount paid"
                            className="h-14 text-2xl font-black tabular-nums"
                          />
                        ) : (
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={set.costPerLaborer || ""}
                            onChange={(e) => updateSet(i, "costPerLaborer", Number.parseFloat(e.target.value) || 0)}
                            placeholder="Enter total amount paid"
                            className="h-11"
                          />
                        )}
                        <p className="text-xs text-muted-foreground">Flat contract amount — no worker count needed.</p>
                      </div>
                    ) : (
                      <div className={isMobile ? "space-y-4" : "grid gap-4 md:grid-cols-2"}>
                        <div>
                          <p className={isMobile ? "text-sm font-semibold text-stone-700 mb-3" : "text-sm font-medium mb-2"}>
                            {isMobile ? "Workers" : "Number of workers (0.5 for half day)"}
                          </p>
                          {isMobile ? (
                            <div className="flex items-center gap-5">
                              <button
                                type="button"
                                onClick={() => updateSet(i, "laborers", Math.max(0, set.laborers - 1))}
                                className="h-14 w-14 rounded-2xl bg-stone-100 flex items-center justify-center active:scale-95 transition-transform touch-manipulation"
                              >
                                <Minus className="h-6 w-6 text-stone-600" />
                              </button>
                              <span className="text-5xl font-black text-stone-900 w-14 text-center tabular-nums leading-none">
                                {set.laborers}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateSet(i, "laborers", set.laborers + 1)}
                                className="h-14 w-14 rounded-2xl bg-stone-100 flex items-center justify-center active:scale-95 transition-transform touch-manipulation"
                              >
                                <Plus className="h-6 w-6 text-stone-600" />
                              </button>
                              <button
                                type="button"
                                onClick={() => updateSet(i, "laborers", set.laborers + 0.5)}
                                className="h-10 px-3 rounded-xl bg-stone-50 border border-stone-200 text-xs font-bold text-stone-500 touch-manipulation"
                              >
                                +½
                              </button>
                            </div>
                          ) : (
                            <Input
                              type="number"
                              min="0"
                              step="0.5"
                              value={set.laborers}
                              onChange={(e) => updateSet(i, "laborers", Number.parseFloat(e.target.value) || 0)}
                              className="h-11"
                            />
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label className="text-base">Cost per worker (₹)</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={set.costPerLaborer}
                            onChange={(e) => updateSet(i, "costPerLaborer", Number.parseFloat(e.target.value) || 0)}
                            className="h-11"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addSet}
                    className="flex-1 border-dashed bg-transparent"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add labour group
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormData((prev) => ({
                      ...prev,
                      laborSets: [...prev.laborSets, { label: "Contract", laborers: 1, costPerLaborer: 0, isContract: true }],
                    }))}
                    className="flex-1 border-dashed border-orange-300 bg-transparent text-orange-700 hover:bg-orange-50"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add contract
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="taskDescription" className="text-base">What work was done</Label>
                <Textarea
                  id="taskDescription"
                  value={formData.taskDescription}
                  onChange={(e) => setFormData((prev) => ({ ...prev, taskDescription: e.target.value }))}
                  placeholder="Describe the work simply, for example Weeding block 3 or Pruning section A..."
                  rows={2}
                  className="text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="text-base">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Payment note, field note, or anything the owner should know..."
                  rows={3}
                  className="text-base"
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-5 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Entry total</p>
                <p className="text-2xl font-black tabular-nums text-stone-900 dark:text-white">{formatCurrency(calculateTotal())}</p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex flex-1 h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 active:scale-[0.98] touch-manipulation disabled:opacity-60 dark:bg-emerald-800 dark:hover:bg-emerald-700"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2"><Save className="h-4 w-4 animate-pulse" />Saving…</span>
                  ) : (
                    <><Save className="h-4 w-4" />{editingId ? "Update" : "Save"} entry</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={isSubmitting}
                  className="h-11 rounded-lg border border-stone-200 bg-white px-6 text-sm font-semibold text-stone-600 touch-manipulation hover:bg-stone-50 dark:border-white/[0.08] dark:bg-transparent dark:text-stone-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </CardContent>
      </Card>

      {loading ? (
        <Card><CardContent className="p-0"><SkeletonTable rows={4} cols={5} /></CardContent></Card>
      ) : deployments.length > 0 ? (
        <Card ref={historySectionRef} className="border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card">
          <CardHeader className="border-b border-stone-100 dark:border-white/[0.05]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">History</p>
                <CardTitle className="mt-0.5 text-lg">Labour entries</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Mobile View */}
            <div className="block sm:hidden divide-y divide-stone-50">
              {deployments.map((deployment) => {
                const isExpanded = expandedRows.has(deployment.id)
                const totalWorkers = (deployment.laborEntries || []).reduce((sum: number, e: any) => sum + (Number(e.laborCount) || 0), 0)
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
                          <p className="text-sm font-bold text-stone-800 truncate leading-tight">{deployment.reference}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-xl font-black text-emerald-700 tabular-nums leading-none">
                              {formatCurrency(deployment.totalCost)}
                            </p>
                            {totalWorkers > 0 && (
                              <span className="text-xs font-bold text-stone-400">
                                👷 {formatLaborCount(totalWorkers)} {totalWorkers === 1 ? "person" : "people"}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 ml-3 text-stone-400">
                          {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        </div>
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="px-4 pb-4 space-y-2 bg-stone-50/50">
                        {(deployment.laborEntries || []).map((entry: any, i: number) =>
                          Number(entry.laborCount) > 0 ? (
                            <div key={i} className="flex justify-between text-sm">
                              <span className="font-semibold text-stone-600">
                                {entry.name === "Estate Labour" ? "In-house" : entry.name === "Outside Labour" ? "Outside" : entry.name}
                              </span>
                              <span className="text-stone-800 font-medium">
                                {formatLaborCount(Number(entry.laborCount))} × {formatCurrency(entry.costPerLabor)}
                              </span>
                            </div>
                          ) : null
                        )}
                        {deployment.taskDescription && (
                          <p className="text-sm text-stone-500 pt-1">{deployment.taskDescription}</p>
                        )}
                        {deployment.notes && (
                          <p className="text-xs text-stone-400 italic">{deployment.notes}</p>
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
                              if (confirm("Delete this labour entry?")) {
                                const result = await deleteDeployment(deployment.id)
                                if (!result.ok) {
                                  toast({ title: "Couldn't delete record", description: result.error, variant: "destructive" })
                                }
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
                  <TableRow className="bg-stone-900 hover:bg-stone-900 dark:bg-stone-800">
                    <TableHead className="text-stone-300 font-bold text-[11px] uppercase tracking-[0.16em] dark:text-stone-400">Date</TableHead>
                    <TableHead className="text-stone-300 font-bold text-[11px] uppercase tracking-[0.16em] dark:text-stone-400">Code</TableHead>
                    <TableHead className="text-stone-300 font-bold text-[11px] uppercase tracking-[0.16em] dark:text-stone-400">Category</TableHead>
                    <TableHead className="text-stone-300 font-bold text-[11px] uppercase tracking-[0.16em] dark:text-stone-400">Workers</TableHead>
                    <TableHead className="text-right text-stone-300 font-bold text-[11px] uppercase tracking-[0.16em] dark:text-stone-400">Total Cost</TableHead>
                    <TableHead className="w-[100px] text-stone-300 font-bold text-[11px] uppercase tracking-[0.16em] dark:text-stone-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deployments.map((deployment, index) => (
                    <TableRow key={deployment.id} className="border-stone-100 hover:bg-stone-50/60 dark:border-white/[0.04] dark:hover:bg-white/[0.02]">
                      <TableCell>{formatDateOnly(deployment.date)}</TableCell>
                      <TableCell className="font-medium">{deployment.code}</TableCell>
                      <TableCell>{deployment.reference}</TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          {(deployment.laborEntries || []).map((entry: any, i: number) =>
                            Number(entry.laborCount) > 0 ? (
                              <div key={i} className="text-sm">
                                <span className="text-muted-foreground text-xs">
                                  {entry.name === "Estate Labour" ? "In-house" : entry.name === "Outside Labour" ? "Outside" : entry.name}:
                                </span>{" "}
                                {formatLaborCount(Number(entry.laborCount))} @ {formatCurrency(entry.costPerLabor)}
                              </div>
                            ) : null
                          )}
                          {(deployment.laborEntries || []).filter((e: any) => Number(e.laborCount) > 0).length === 0 && deployment.taskDescription && (
                            <span className="text-xs text-muted-foreground italic">{deployment.taskDescription}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(deployment.totalCost)}</TableCell>
                      <TableCell>
                        <TooltipProvider>
                          <div className="flex gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => startEdit(deployment)}>
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit entry</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={async () => {
                                    if (confirm("Delete this labour entry? This cannot be undone.")) {
                                      const result = await deleteDeployment(deployment.id)
                                      if (!result.ok) {
                                        toast({ title: "Couldn't delete record", description: result.error, variant: "destructive" })
                                      }
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete entry</TooltipContent>
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
          title="No labour deployments yet"
          description="Start with one real workday and one activity code. That is enough to begin tracking labour cost cleanly."
          steps={[
            "Use the real date and work code for the task your team completed.",
            "Enter in-house workers and outside workers separately only if both were actually used.",
            "Leave extra notes for later if they are slowing you down.",
          ]}
          tip="One entry should represent one day and one activity. Keeping that rule makes labour totals much easier to trust."
          askPrompt="How do I record my first labour entry?"
          primaryAction={{ label: isAdding ? "Continue entry" : "Add labour entry", onClick: openNewForm }}
          className="mt-2"
        />
      )}
    </div>
    </>
  )
}
