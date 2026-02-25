"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
import { useConsumablesData } from "@/hooks/use-consumables-data"
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
import { formatCurrency } from "@/lib/format"

interface ActivityCode {
  code: string
  reference: string
}

export default function OtherExpensesTab({ locationId }: { locationId?: string }) {
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
  } = useConsumablesData(locationId)

  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activities, setActivities] = useState<ActivityCode[]>([])
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  // Form state
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    code: "",
    reference: "",
    amount: 0,
    notes: "",
  })

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

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split("T")[0],
      code: "",
      reference: "",
      amount: 0,
      notes: "",
    })
    setIsAdding(false)
    setEditingId(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)

    const deployment = {
      date: formData.date,
      code: formData.code,
      reference: formData.reference,
      amount: formData.amount,
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
    setFormData({
      date: deployment.date.split("T")[0],
      code: deployment.code,
      reference: deployment.reference,
      amount: deployment.amount,
      notes: deployment.notes || "",
    })
    setEditingId(deployment.id)
    setIsAdding(true)
  }

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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-xl sm:text-2xl">Other Expenses</CardTitle>
              <CardDescription className="text-sm">Track miscellaneous expenses by activity code</CardDescription>
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
          {!isAdding ? (
            <Button onClick={() => setIsAdding(true)} className="w-full h-12 text-base">
              <PlusCircle className="mr-2 h-5 w-5" /> Add Expense
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 border rounded-lg p-3 sm:p-4 bg-muted/50">
              <div className="space-y-4">
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
                  <Label htmlFor="expense-code" className="text-base">
                    Code
                  </Label>
                  <Input
                    id="expense-code"
                    value={formData.code}
                    onChange={(e) => handleCodeChange(e.target.value)}
                    placeholder="Enter activity code"
                    required
                    list="expense-activity-codes"
                    className="h-11"
                  />
                  <datalist id="expense-activity-codes">
                    {activities.map((activity) => (
                      <option key={activity.code} value={activity.code}>
                        {activity.reference}
                      </option>
                    ))}
                  </datalist>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expense-reference" className="text-base">
                    Reference
                  </Label>
                  <Input
                    id="expense-reference"
                    value={formData.reference}
                    onChange={(e) => setFormData((prev) => ({ ...prev, reference: e.target.value }))}
                    placeholder="Auto-filled from code"
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="expense-notes" className="text-base">
                  Notes
                </Label>
                <Textarea
                  id="expense-notes"
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes..."
                  rows={3}
                  className="text-base"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button type="submit" className="flex-1 h-12 text-base" disabled={isSubmitting}>
                  <Save className="mr-2 h-5 w-5" />
                  {isSubmitting ? "Saving..." : `${editingId ? "Update" : "Save"} Expense`}
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
        <div className="text-center py-8 text-muted-foreground">Loading expenses...</div>
      ) : deployments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl">Expense History</CardTitle>
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
                              <Badge variant="outline" className="font-mono text-xs">
                                {deployment.code}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{formatDateOnly(deployment.date)}</span>
                            </div>
                            <p className="font-medium text-sm line-clamp-1">
                              {deployment.reference || deployment.code}
                            </p>
                            <p className="text-lg font-bold text-green-700 mt-1">
                              {formatCurrency(deployment.amount)}
                            </p>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent className="pt-3 space-y-2">
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
                              if (confirm("Are you sure you want to delete this expense?")) {
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
                    <TableHead className="text-right sticky top-0 bg-muted/60">Amount</TableHead>
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
                                  onClick={() => {
                                    if (confirm("Are you sure you want to delete this expense?")) {
                                      deleteDeployment(deployment.id)
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
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            No expenses recorded yet. Click &quot;Add Expense&quot; to get started.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
