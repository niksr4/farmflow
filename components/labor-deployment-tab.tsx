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
import { PlusCircle, Trash2, Edit2, Save, X, ChevronDown, ChevronUp, Plus } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { formatDateOnly } from "@/lib/date-utils"
import { formatCurrency, formatNumber } from "@/lib/format"
import { SkeletonTable } from "@/components/ui/skeleton"
import TaskGuideCard from "@/components/task-guide-card"
import WorkflowEmptyState from "@/components/workflow-empty-state"
import { useToast } from "@/hooks/use-toast"
import { FARMFLOW_RECORD_SAVED_EVENT } from "@/components/inventory-system/constants"

interface ActivityCode {
  code: string
  reference: string
}

interface LaborSet {
  label: string
  laborers: number
  costPerLaborer: number
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
    error: deployError,
    totalCost,
    totalCount,
    hasMore,
    loadMore,
    addDeployment,
    updateDeployment,
    deleteDeployment,
  } = useLaborData(locationId, { startDate, endDate })
  const { settings } = useTenantSettings()
  const { toast } = useToast()

  const inHouseWage = settings.laborWages?.defaultInHouseWage ?? 0
  const outsideWage = settings.laborWages?.defaultOutsideWage ?? 0

  const [isAdding, setIsAdding] = useState(false)
  const [prefilled, setPrefilled] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activities, setActivities] = useState<ActivityCode[]>([])
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

  const handleCodeChange = (code: string) => {
    setFormData((prev) => ({ ...prev, code }))
    const matchingActivity = activities.find((a) => a.code.toLowerCase() === code.toLowerCase())
    if (matchingActivity) {
      setFormData((prev) => ({ ...prev, reference: matchingActivity.reference }))
    }
  }

  const calculateTotal = (sets = formData.laborSets) =>
    sets.reduce((sum, s) => sum + s.laborers * s.costPerLaborer, 0)

  const formatLaborCount = (value: number) => {
    const n = Number(value) || 0
    return Number.isInteger(n) ? formatNumber(n, 0) : formatNumber(n, 1)
  }

  const openNewForm = useCallback(() => {
    const last = deployments[0]
    if (last && last.laborEntries?.length > 0) {
      const sets: LaborSet[] = last.laborEntries.map((e: any) => ({
        label: e.name === "Estate Labor" ? "In-house" : e.name === "Outside Labor" ? "Outside" : e.name,
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
      .filter((s) => s.laborers > 0)
      .map((s) => ({ name: s.label, laborCount: s.laborers, costPerLabor: s.costPerLaborer }))

    if (laborEntries.length === 0) {
      toast({ title: "No workers logged", description: "Enter at least one worker count above zero.", variant: "destructive" })
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
      label: e.name === "Estate Labor" ? "In-house" : e.name === "Outside Labor" ? "Outside" : e.name,
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

  return (
    <div className="space-y-4">
      {!loading && activities.length === 0 && (
        <TaskGuideCard
          tone="finance"
          eyebrow="Simple start"
          title="Start with a few simple work codes"
          description="You do not need a full chart of accounts before logging labor. If you already know the estate codes, use them. If not, type a short code and work name now, then tidy the Codes tab later."
          bullets={[
            "Use short, stable work codes your team will actually remember.",
            "Type the code and category name directly here if no saved list exists yet.",
            "Use Codes later when you want autocomplete and cleaner exports.",
          ]}
          tip="A simple code like HARVEST, WEEDING, or PRUNING is better than waiting for a perfect accounting structure."
        />
      )}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-xl sm:text-2xl">Labor</CardTitle>
              <CardDescription className="text-sm">Log what work was done and how many people were paid.</CardDescription>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm font-medium text-muted-foreground">Total Labor Cost</p>
              <p className="text-xl sm:text-2xl font-bold">{formatCurrency(totalDeploymentCost)}</p>
              {resolvedTotalCount > deployments.length && (
                <p className="text-xs text-muted-foreground mt-1">
                  Showing {deployments.length} of {resolvedTotalCount}
                </p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-white/70 bg-white/85 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-700">One entry</p>
                <p className="mt-1 text-sm font-semibold text-foreground">One day, one activity code</p>
              </div>
              <div className="rounded-xl border border-white/70 bg-white/85 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-700">In-house team</p>
                <p className="mt-1 text-sm font-semibold text-foreground">Workers paid by the estate</p>
              </div>
              <div className="rounded-xl border border-white/70 bg-white/85 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-700">Outside team</p>
                <p className="mt-1 text-sm font-semibold text-foreground">Contract or outside workers for the same task</p>
              </div>
            </div>
          </div>

          {!isAdding ? (
            <Button onClick={openNewForm} className="w-full h-12 text-base">
              <PlusCircle className="mr-2 h-5 w-5" /> Add labor entry
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 border rounded-lg p-3 sm:p-4 bg-muted/50" ref={formRef}>
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

              <div className="rounded-xl border border-border/60 bg-white/80 p-4">
                <p className="text-sm font-semibold text-foreground">Entry basics</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Start with the day and work code. If you do not have saved codes yet, type a short code and work name manually.
                </p>
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
                    {activities.map((activity) => (
                      <option key={activity.code} value={activity.code}>{activity.reference}</option>
                    ))}
                  </datalist>
                  <p className="text-xs text-muted-foreground">Saved codes appear here, but you can type a short estate work code now.</p>
                </div>

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

              {/* Dynamic labor sets */}
              <div className="space-y-3">
                {formData.laborSets.map((set, i) => (
                  <div key={i} className="rounded-xl border border-border/60 bg-white/80 p-4">
                    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2">
                        <Input
                          value={set.label}
                          onChange={(e) => updateSet(i, "label", e.target.value)}
                          className="h-8 w-36 text-sm font-medium"
                          aria-label="Labor group label"
                        />
                        {formData.laborSets.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSet(i)}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Remove labor group"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Subtotal: {formatCurrency(set.laborers * set.costPerLaborer)}
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-base">Number of workers (0.5 for half day)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          value={set.laborers}
                          onChange={(e) => updateSet(i, "laborers", Number.parseFloat(e.target.value) || 0)}
                          className="h-11"
                        />
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
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSet}
                  className="w-full border-dashed bg-transparent"
                >
                  <Plus className="mr-2 h-4 w-4" /> Add another labor group
                </Button>
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

              <div className="border-t pt-4">
                <p className="text-lg font-semibold">Total Cost: {formatCurrency(calculateTotal())}</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button type="submit" className="flex-1 h-12 text-base" disabled={isSubmitting}>
                  <Save className="mr-2 h-5 w-5" />
                  {isSubmitting ? "Saving..." : `${editingId ? "Update" : "Save"} labor entry`}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  className="h-12 text-base bg-transparent"
                  disabled={isSubmitting}
                >
                  <X className="mr-2 h-5 w-5" /> Cancel
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <Card><CardContent className="p-0"><SkeletonTable rows={4} cols={5} /></CardContent></Card>
      ) : deployments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl">Labor history</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Mobile View */}
            <div className="block sm:hidden">
              {deployments.map((deployment) => {
                const isExpanded = expandedRows.has(deployment.id)
                return (
                  <Collapsible key={deployment.id} open={isExpanded} onOpenChange={() => toggleRow(deployment.id)}>
                    <div className="border-b p-4">
                      <CollapsibleTrigger className="w-full">
                        <div className="flex justify-between items-start">
                          <div className="text-left flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="font-mono text-xs">{deployment.code}</Badge>
                              <span className="text-xs text-muted-foreground">{formatDateOnly(deployment.date)}</span>
                            </div>
                            <p className="font-medium text-sm line-clamp-1">{deployment.reference}</p>
                            <p className="text-lg font-bold text-green-700 mt-1">{formatCurrency(deployment.totalCost)}</p>
                          </div>
                          {isExpanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent className="pt-3 space-y-2">
                        {(deployment.laborEntries || []).map((entry: any, i: number) =>
                          Number(entry.laborCount) > 0 ? (
                            <div key={i} className="text-sm">
                              <span className="font-medium">
                                {entry.name === "Estate Labor" ? "In-house" : entry.name === "Outside Labor" ? "Outside" : entry.name}:
                              </span>{" "}
                              {formatLaborCount(Number(entry.laborCount))} @ {formatCurrency(entry.costPerLabor)}
                            </div>
                          ) : null
                        )}
                        {deployment.taskDescription && (
                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium">Task:</span> {deployment.taskDescription}
                          </div>
                        )}
                        {deployment.notes && (
                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium">Notes:</span> {deployment.notes}
                          </div>
                        )}
                        <div className="flex gap-2 pt-2">
                          <Button variant="outline" size="sm" onClick={() => startEdit(deployment)} className="flex-1">
                            <Edit2 className="h-4 w-4 mr-1" /> Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 bg-transparent"
                            onClick={async () => {
                              if (confirm("Are you sure you want to delete this deployment?")) {
                                const result = await deleteDeployment(deployment.id)
                                if (!result.ok) {
                                  toast({ title: "Couldn't delete record", description: result.error, variant: "destructive" })
                                }
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-1" /> Delete
                          </Button>
                        </div>
                      </CollapsibleContent>
                    </div>
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
                    <TableHead className="sticky top-0 bg-muted/60">Category</TableHead>
                    <TableHead className="sticky top-0 bg-muted/60">Labor groups</TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/60">Total Cost</TableHead>
                    <TableHead className="w-[100px] sticky top-0 bg-muted/60">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deployments.map((deployment, index) => (
                    <TableRow key={deployment.id} className={index % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                      <TableCell>{formatDateOnly(deployment.date)}</TableCell>
                      <TableCell className="font-medium">{deployment.code}</TableCell>
                      <TableCell>{deployment.reference}</TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          {(deployment.laborEntries || []).map((entry: any, i: number) =>
                            Number(entry.laborCount) > 0 ? (
                              <div key={i} className="text-sm">
                                <span className="text-muted-foreground text-xs">
                                  {entry.name === "Estate Labor" ? "In-house" : entry.name === "Outside Labor" ? "Outside" : entry.name}:
                                </span>{" "}
                                {formatLaborCount(Number(entry.laborCount))} @ {formatCurrency(entry.costPerLabor)}
                              </div>
                            ) : null
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
                              <TooltipContent>Edit deployment</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={async () => {
                                    if (confirm("Are you sure you want to delete this deployment?")) {
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
                              <TooltipContent>Delete deployment</TooltipContent>
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
          title="No labor deployments yet"
          description="Start with one real workday and one activity code. That is enough to begin tracking labor cost cleanly."
          steps={[
            "Use the real date and work code for the task your team completed.",
            "Enter in-house workers and outside workers separately only if both were actually used.",
            "Leave extra notes for later if they are slowing you down.",
          ]}
          tip="One entry should represent one day and one activity. Keeping that rule makes labor totals much easier to trust."
          askPrompt="How do I record my first labor entry?"
          primaryAction={{ label: isAdding ? "Continue entry" : "Add labor entry", onClick: openNewForm }}
          className="mt-2"
        />
      )}
    </div>
  )
}
