"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback } from "react"
import { useLaborData } from "@/hooks/use-labor-data"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { PlusCircle, Trash2, Edit2, Save, X, ChevronDown, ChevronUp } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { formatDateOnly } from "@/lib/date-utils"
import { formatCurrency, formatNumber } from "@/lib/format"

interface ActivityCode {
  code: string
  reference: string
}

interface FormData {
  date: string
  code: string
  reference: string
  hfLaborers: number
  hfCostPerLaborer: number
  outsideLaborers: number
  outsideCostPerLaborer: number
  notes: string
}

export default function LaborDeploymentTab({ locationId }: { locationId?: string }) {
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
  } = useLaborData(locationId)

  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activities, setActivities] = useState<ActivityCode[]>([])
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [formData, setFormData] = useState<FormData>({
    date: new Date().toISOString().split("T")[0],
    code: "",
    reference: "",
    hfLaborers: 0,
    hfCostPerLaborer: 475,
    outsideLaborers: 0,
    outsideCostPerLaborer: 450,
    notes: "",
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

  // Autofill reference when code changes
  const handleCodeChange = (code: string) => {
    setFormData((prev) => ({ ...prev, code }))

    // Find matching activity and autofill reference
    const matchingActivity = activities.find((activity) => activity.code.toLowerCase() === code.toLowerCase())

    if (matchingActivity) {
      setFormData((prev) => ({ ...prev, reference: matchingActivity.reference }))
    }
  }

  const calculateTotal = () => {
    const hfTotal = formData.hfLaborers * formData.hfCostPerLaborer
    const outsideTotal = formData.outsideLaborers * formData.outsideCostPerLaborer
    return hfTotal + outsideTotal
  }

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split("T")[0],
      code: "",
      reference: "",
      hfLaborers: 0,
      hfCostPerLaborer: 475,
      outsideLaborers: 0,
      outsideCostPerLaborer: 450,
      notes: "",
    })
    setIsAdding(false)
    setEditingId(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)

    const laborEntries = [
      {
        name: "Estate Labor",
        laborCount: formData.hfLaborers,
        costPerLabor: formData.hfCostPerLaborer,
      },
    ]

    if (formData.outsideLaborers > 0) {
      laborEntries.push({
        name: "Outside Labor",
        laborCount: formData.outsideLaborers,
        costPerLabor: formData.outsideCostPerLaborer,
      })
    }

    const deployment = {
      date: formData.date,
      code: formData.code,
      reference: formData.reference,
      laborEntries,
      totalCost: calculateTotal(),
      notes: formData.notes,
      user: "admin",
    }

    try {
      const success = editingId ? await updateDeployment(editingId, deployment) : await addDeployment(deployment)
      if (success) {
        resetForm()
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const startEdit = (deployment: any) => {

    const hfEntry = deployment.laborEntries.find((entry: any) => entry.name === "Estate Labor")
    const outsideEntry = deployment.laborEntries.find((entry: any) => entry.name === "Outside Labor")

    setFormData({
      date: deployment.date.split("T")[0],
      code: deployment.code,
      reference: deployment.reference,
      hfLaborers: hfEntry?.laborCount || 0,
      hfCostPerLaborer: hfEntry?.costPerLabor || 475,
      outsideLaborers: outsideEntry?.laborCount || 0,
      outsideCostPerLaborer: outsideEntry?.costPerLabor || 450,
      notes: deployment.notes || "",
    })
    setEditingId(deployment.id)
    setIsAdding(true)


    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 100)
  }

  const toggleRow = (id: string) => {
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

  const computedTotalCost = deployments.reduce((sum, d) => sum + d.totalCost, 0)
  const totalDeploymentCost = totalCost || computedTotalCost
  const resolvedTotalCount = totalCount || deployments.length

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-xl sm:text-2xl">Labor Deployments</CardTitle>
              <CardDescription className="text-sm">Track estate and outside labor</CardDescription>
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
          {!isAdding ? (
            <Button onClick={() => setIsAdding(true)} className="w-full h-12 text-base">
              <PlusCircle className="mr-2 h-5 w-5" /> Add Labor Deployment
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 border rounded-lg p-3 sm:p-4 bg-muted/50" ref={formRef}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="date" className="text-base">
                    Date
                  </Label>
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
                  <Label htmlFor="code" className="text-base">
                    Code
                  </Label>
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
                      <option key={activity.code} value={activity.code}>
                        {activity.reference}
                      </option>
                    ))}
                  </datalist>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reference" className="text-base">
                    Reference
                  </Label>
                  <Input
                    id="reference"
                    value={formData.reference}
                    onChange={(e) => setFormData((prev) => ({ ...prev, reference: e.target.value }))}
                    placeholder="Auto-filled from code"
                    required
                    className="h-11"
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3 text-base">Estate Labor</h4>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="hfLaborers" className="text-base">
                      Number of Laborers (0.5 for half day)
                    </Label>
                    <Input
                      id="hfLaborers"
                      type="number"
                      min="0"
                      step="0.5"
                      value={formData.hfLaborers}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, hfLaborers: Number.parseFloat(e.target.value) || 0 }))
                      }
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hfCostPerLaborer" className="text-base">
                      Cost per Laborer (₹)
                    </Label>
                    <Input
                      id="hfCostPerLaborer"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.hfCostPerLaborer}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, hfCostPerLaborer: Number.parseFloat(e.target.value) || 0 }))
                      }
                      className="h-11"
                    />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Subtotal: {formatCurrency(formData.hfLaborers * formData.hfCostPerLaborer)}
                </p>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3 text-base">Outside Labor</h4>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="outsideLaborers" className="text-base">
                      Number of Laborers (0.5 for half day)
                    </Label>
                    <Input
                      id="outsideLaborers"
                      type="number"
                      min="0"
                      step="0.5"
                      value={formData.outsideLaborers}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, outsideLaborers: Number.parseFloat(e.target.value) || 0 }))
                      }
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="outsideCostPerLaborer" className="text-base">
                      Cost per Laborer (₹)
                    </Label>
                    <Input
                      id="outsideCostPerLaborer"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.outsideCostPerLaborer}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          outsideCostPerLaborer: Number.parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="h-11"
                    />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Subtotal: {formatCurrency(formData.outsideLaborers * formData.outsideCostPerLaborer)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="text-base">
                  Notes
                </Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes..."
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
                  {isSubmitting ? "Saving..." : `${editingId ? "Update" : "Save"} Deployment`}
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
        <div className="text-center py-8 text-muted-foreground">Loading labor deployments...</div>
      ) : deployments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl">Deployment History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Mobile View */}
            <div className="block sm:hidden">
              {deployments.map((deployment) => {
                const hfEntry = deployment.laborEntries.find((entry: any) => entry.name === "Estate Labor")
                const outsideEntry = deployment.laborEntries.find((entry: any) => entry.name === "Outside Labor")
                const isExpanded = expandedRows.has(deployment.id)

                return (
                  <Collapsible key={deployment.id} open={isExpanded} onOpenChange={() => toggleRow(deployment.id)}>
                    <div className="border-b p-4">
                      <CollapsibleTrigger className="w-full">
                        <div className="flex justify-between items-start">
                          <div className="text-left flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="font-mono text-xs">
                                {deployment.code}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{formatDateOnly(deployment.date)}</span>
                            </div>
                            <p className="font-medium text-sm line-clamp-1">{deployment.reference}</p>
                            <p className="text-lg font-bold text-green-700 mt-1">{formatCurrency(deployment.totalCost)}</p>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent className="pt-3 space-y-2">
                        {hfEntry && Number(hfEntry.laborCount) > 0 && (
                          <div className="text-sm">
                            <span className="font-medium">HF Labor:</span> {formatNumber(Number(hfEntry.laborCount) || 0, 0)} @{" "}
                            {formatCurrency(hfEntry.costPerLabor)}
                          </div>
                        )}
                        {outsideEntry && Number(outsideEntry.laborCount) > 0 && (
                          <div className="text-sm">
                            <span className="font-medium">Outside Labor:</span> {formatNumber(Number(outsideEntry.laborCount) || 0, 0)} @{" "}
                            {formatCurrency(outsideEntry.costPerLabor)}
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
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this deployment?")) {
                                deleteDeployment(deployment.id)
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
                    <TableHead className="sticky top-0 bg-muted/60">Reference</TableHead>
                    <TableHead className="sticky top-0 bg-muted/60">HF Laborers</TableHead>
                    <TableHead className="sticky top-0 bg-muted/60">Outside Laborers</TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/60">Total Cost</TableHead>
                    <TableHead className="w-[100px] sticky top-0 bg-muted/60">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deployments.map((deployment, index) => {
                    const hfEntry = deployment.laborEntries.find((entry) => entry.name === "Estate Labor")
                    const outsideEntry = deployment.laborEntries.find((entry) => entry.name === "Outside Labor")
                    return (
                      <TableRow key={deployment.id} className={index % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                        <TableCell>{formatDateOnly(deployment.date)}</TableCell>
                        <TableCell className="font-medium">{deployment.code}</TableCell>
                        <TableCell>{deployment.reference}</TableCell>
                        <TableCell>
                          {hfEntry
                            ? `${formatNumber(Number(hfEntry.laborCount) || 0, 0)} @ ${formatCurrency(hfEntry.costPerLabor)}`
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {outsideEntry
                            ? `${formatNumber(Number(outsideEntry.laborCount) || 0, 0)} @ ${formatCurrency(outsideEntry.costPerLabor)}`
                            : "-"}
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
                                    onClick={() => {
                                      if (confirm("Are you sure you want to delete this deployment?")) {
                                        deleteDeployment(deployment.id)
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
                    )
                  })}
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
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            No labor deployments recorded yet. Click &quot;Add Labor Deployment&quot; to get started.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
