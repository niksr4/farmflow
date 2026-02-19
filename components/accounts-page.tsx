"use client"

import type React from "react"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { useMemo, useState, useEffect } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLaborData, type LaborEntry, type LaborDeployment } from "@/hooks/use-labor-data"
import { useConsumablesData, type ConsumableDeployment } from "@/hooks/use-consumables-data"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileText, Coins, PlusCircle, Settings, Users, Receipt } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import LaborDeploymentTab from "./labor-deployment-tab"
import OtherExpensesTab from "./other-expenses-tab"
import { toast } from "sonner"
import { getCurrentFiscalYear, getAvailableFiscalYears, type FiscalYear } from "@/lib/fiscal-year-utils"
import { formatDateOnly } from "@/lib/date-utils"
import { formatCurrency } from "@/lib/format"

interface AccountActivity {
  code: string
  reference: string
}

interface Activity {
  code: string
  reference: string
}

export default function AccountsPage() {
  const { isAdmin, user } = useAuth()
  const { deployments: laborDeployments, loading: laborLoading, totalCount: laborCount } = useLaborData()
  const { deployments: consumableDeployments, loading: consumablesLoading, totalCount: consumablesCount } =
    useConsumablesData()

  const [selectedFiscalYear, setSelectedFiscalYear] = useState<FiscalYear>(getCurrentFiscalYear())
  const availableFiscalYears = getAvailableFiscalYears()

  const [exportStartDate, setExportStartDate] = useState<string>("")
  const [exportEndDate, setExportEndDate] = useState<string>("")
  const [accountActivities, setAccountActivities] = useState<AccountActivity[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadingActivities, setLoadingActivities] = useState(false)
  const [isAddingActivity, setIsAddingActivity] = useState(false)
  const [newActivityCode, setNewActivityCode] = useState("")
  const [newActivityReference, setNewActivityReference] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [summaryTotals, setSummaryTotals] = useState({
    laborTotal: 0,
    otherTotal: 0,
    grandTotal: 0,
  })
  const [summaryLoading, setSummaryLoading] = useState(true)
  const exportDateRangeError = useMemo(() => {
    if ((exportStartDate && !exportEndDate) || (!exportStartDate && exportEndDate)) {
      return "Select both start and end date, or leave both empty."
    }
    if (exportStartDate && exportEndDate) {
      const startDate = new Date(exportStartDate)
      const endDate = new Date(exportEndDate)
      if (startDate > endDate) {
        return "Start date cannot be after end date."
      }
    }
    return null
  }, [exportEndDate, exportStartDate])

  useEffect(() => {
    fetchAllActivities()
    fetchAccountActivities()
  }, [])

  useEffect(() => {
    const fetchTotals = async () => {
      if (!user?.tenantId) {
        setSummaryLoading(false)
        return
      }
      try {
        setSummaryLoading(true)
        const params = new URLSearchParams({
          startDate: selectedFiscalYear.startDate,
          endDate: selectedFiscalYear.endDate,
        })
        const response = await fetch(`/api/accounts-totals?${params.toString()}`)
        const data = await response.json()

        if (!response.ok || !data.success) {
          console.error("Failed to load account totals:", data)
          setSummaryTotals({ laborTotal: 0, otherTotal: 0, grandTotal: 0 })
          return
        }

        setSummaryTotals({
          laborTotal: Number(data.laborTotal) || 0,
          otherTotal: Number(data.otherTotal) || 0,
          grandTotal: Number(data.grandTotal) || 0,
        })
      } catch (error) {
        console.error("Error loading account totals:", error)
        setSummaryTotals({ laborTotal: 0, otherTotal: 0, grandTotal: 0 })
      } finally {
        setSummaryLoading(false)
      }
    }

    fetchTotals()
  }, [selectedFiscalYear.endDate, selectedFiscalYear.startDate, user?.tenantId])

  const fetchAllActivities = async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/get-activity")
      const data = await response.json()

      if (data.activities) {
        // Map 'activity' field to 'reference' for display
        const mappedActivities = data.activities.map((item: any) => ({
          code: item.code,
          reference: item.activity,
        }))
        setActivities(mappedActivities)
      }
    } catch (error) {
      console.error("Error fetching activities:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchAccountActivities = async () => {
    setLoadingActivities(true)
    try {
      const response = await fetch("/api/get-activity")
      const data = await response.json()
      if (data.success && data.activities) {
        setAccountActivities(data.activities)
      }
    } catch (error) {
      console.error("Error fetching account activities:", error)
    } finally {
      setLoadingActivities(false)
    }
  }

  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newActivityCode.trim() || !newActivityReference.trim()) {
      toast.error("Please fill in both code and reference")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch("/api/add-activity", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: newActivityCode.trim(),
          reference: newActivityReference.trim(),
        }),
      })

      const data = await response.json()

      if (data.success) {
        toast.success("Activity added successfully")
        setNewActivityCode("")
        setNewActivityReference("")
        setIsAddingActivity(false)
        await fetchAccountActivities()
        await fetchAllActivities()
      } else {
        toast.error(data.error || "Failed to add activity")
      }
    } catch (error) {
      console.error("Error adding activity:", error)
      toast.error("Failed to add activity")
    } finally {
      setIsSubmitting(false)
    }
  }

  type CombinedDeployment =
    | (LaborDeployment & { entryType: "Labor"; totalCost: number })
    | (ConsumableDeployment & { entryType: "Other Expense"; totalCost: number })

  const fetchAllDeploymentsForExport = async (): Promise<CombinedDeployment[] | null> => {
    try {
      const [laborResponse, expenseResponse] = await Promise.all([
        fetch("/api/labor-neon?all=true"),
        fetch("/api/expenses-neon?all=true"),
      ])

      if (!laborResponse.ok) {
        const errorText = await laborResponse.text()
        console.error("Failed to load labor deployments for export:", errorText)
        toast.error("Failed to load labor deployments for export")
        return null
      }

      if (!expenseResponse.ok) {
        const errorText = await expenseResponse.text()
        console.error("Failed to load expenses for export:", errorText)
        toast.error("Failed to load expenses for export")
        return null
      }

      const laborData = await laborResponse.json()
      const expenseData = await expenseResponse.json()

      if (!laborData.success || !expenseData.success) {
        toast.error("Failed to load export data")
        return null
      }

      const typedLaborDeployments = (laborData.deployments || []).map((d: LaborDeployment) => ({
        ...d,
        entryType: "Labor" as const,
      }))
      const typedConsumableDeployments = (expenseData.deployments || []).map((d: ConsumableDeployment) => ({
        ...d,
        entryType: "Other Expense" as const,
        totalCost: d.amount,
      }))

      return [...typedLaborDeployments, ...typedConsumableDeployments].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      )
    } catch (error) {
      console.error("Error fetching export data:", error)
      toast.error("Failed to load export data")
      return null
    }
  }

  const getFilteredDeploymentsForExport = async () => {
    const allDeployments = await fetchAllDeploymentsForExport()
    if (!allDeployments) {
      return null
    }

    if (exportDateRangeError) {
      toast.error(exportDateRangeError)
      return null
    }

    let deploymentsToExport = [...allDeployments]
    if (exportStartDate && exportEndDate) {
      const startDate = new Date(exportStartDate)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date(exportEndDate)
      endDate.setHours(23, 59, 59, 999)
      deploymentsToExport = deploymentsToExport.filter((d) => {
        const deploymentDate = new Date(d.date)
        return deploymentDate >= startDate && deploymentDate <= endDate
      })
    }

    if (deploymentsToExport.length === 0) {
      toast.error("No entries found for the selected date range.")
      return null
    }
    return deploymentsToExport
  }

  const exportCombinedCSV = async () => {
    const escapeCsvField = (field: any): string => {
      if (field === null || field === undefined) return ""
      const stringField = String(field)
      if (stringField.search(/("|,|\n)/g) >= 0) return `"${stringField.replace(/"/g, '""')}"`
      return stringField
    }

    const deploymentsToExport = await getFilteredDeploymentsForExport()
    if (!deploymentsToExport) return

    deploymentsToExport.sort((a, b) => {
      const dateA = new Date(a.date).getTime()
      const dateB = new Date(b.date).getTime()
      return dateB - dateA
    })

    const headers = [
      "Date",
      "Entry Type",
      "Code",
      "Reference",
      "HF Labor Details",
      "Outside Labor Details",
      "Total Expenditure (₹)",
      "Notes",
      "Recorded By",
    ]

    const rows = deploymentsToExport.map((d) => {
      let hfLaborDetails = ""
      let outsideLaborDetails = ""
      if (d.entryType === "Labor" && d.laborEntries && d.laborEntries.length > 0) {
        const hfEntry = d.laborEntries[0]
        hfLaborDetails = `${hfEntry.laborCount} @ ${hfEntry.costPerLabor.toFixed(2)}`
        if (d.laborEntries.length > 1) {
          outsideLaborDetails = d.laborEntries
            .slice(1)
            .map((le: LaborEntry) => `${le.laborCount} @ ${le.costPerLabor.toFixed(2)}`)
            .join("; ")
        }
      }
      const expenditureAmount = d.entryType === "Labor" ? d.totalCost : (d as ConsumableDeployment).amount
      return [
        escapeCsvField(formatDateOnly(d.date)),
        escapeCsvField(d.entryType),
        escapeCsvField(d.code),
        escapeCsvField(d.reference),
        escapeCsvField(hfLaborDetails),
        escapeCsvField(outsideLaborDetails),
        escapeCsvField(expenditureAmount.toFixed(2)),
        escapeCsvField(d.notes),
        escapeCsvField(d.user),
      ]
    })

    let csvContent = "data:text/csv;charset=utf-8," + headers.map(escapeCsvField).join(",") + "\n"
    csvContent += rows.map((row) => row.join(",")).join("\n")

    let totalHfLaborCount = 0,
      totalHfLaborCost = 0
    let totalOutsideLaborCount = 0,
      totalOutsideLaborCost = 0
    let totalConsumablesCost = 0
    const totalsByCode: { [code: string]: number } = {}

    deploymentsToExport.forEach((d) => {
      const expenditureAmount = d.entryType === "Labor" ? d.totalCost : (d as ConsumableDeployment).amount
      totalsByCode[d.code] = (totalsByCode[d.code] || 0) + expenditureAmount

      if (d.entryType === "Labor") {
        if (d.laborEntries && d.laborEntries.length > 0) {
          const hfEntry = d.laborEntries[0]
          const hfCount =
            typeof hfEntry.laborCount === "number"
              ? hfEntry.laborCount
              : Number.parseFloat(String(hfEntry.laborCount)) || 0
          totalHfLaborCount += hfCount
          totalHfLaborCost += hfCount * hfEntry.costPerLabor
        }
        if (d.laborEntries && d.laborEntries.length > 1) {
          d.laborEntries.slice(1).forEach((le: LaborEntry) => {
            const outsideCount =
              typeof le.laborCount === "number" ? le.laborCount : Number.parseFloat(String(le.laborCount)) || 0
            totalOutsideLaborCount += outsideCount
            totalOutsideLaborCost += outsideCount * le.costPerLabor
          })
        }
      } else {
        totalConsumablesCost += (d as ConsumableDeployment).amount
      }
    })
    const grandTotalForExport = totalHfLaborCost + totalOutsideLaborCost + totalConsumablesCost

    csvContent += "\n"
    const summaryHeaders = ["", "", "", "Summary Category", "Count/Details", "", "Total (₹)", "", ""]
    csvContent += "\n" + summaryHeaders.map(escapeCsvField).join(",")

    const hfSummaryRow = [
      "",
      "",
      "",
      "Total HF Labor",
      `HF: ${totalHfLaborCount.toFixed(1)} laborers`,
      "",
      totalHfLaborCost.toFixed(2),
      "",
      "",
    ]
    csvContent += "\n" + hfSummaryRow.map(escapeCsvField).join(",")
    const outsideSummaryRow = [
      "",
      "",
      "",
      "Total Outside Labor",
      `Outside: ${totalOutsideLaborCount.toFixed(1)} laborers`,
      "",
      totalOutsideLaborCost.toFixed(2),
      "",
      "",
    ]
    csvContent += "\n" + outsideSummaryRow.map(escapeCsvField).join(",")

    const consumablesSummaryRow = ["", "", "", "Total Other Expenses", "", "", totalConsumablesCost.toFixed(2), "", ""]
    csvContent += "\n" + consumablesSummaryRow.map(escapeCsvField).join(",")
    const totalRow = ["", "", "", "GRAND TOTAL", "", "", grandTotalForExport.toFixed(2), "", ""]
    csvContent += "\n" + totalRow.map(escapeCsvField).join(",")

    csvContent += "\n\n"
    csvContent += escapeCsvField("Summary by Expenditure Code") + ",,,\n"
    const codeSummaryHeaders = ["Code", "Reference", "Total Expenditure (₹)"]
    csvContent += codeSummaryHeaders.map(escapeCsvField).join(",") + "\n"

    Object.entries(totalsByCode)
      .sort(([codeA], [codeB]) => codeA.localeCompare(codeB))
      .forEach(([code, totalAmount]) => {
        const deployment = deploymentsToExport.find((d) => d.code === code)
        const reference = deployment?.reference || code
        const codeRow = [escapeCsvField(code), escapeCsvField(reference), escapeCsvField(totalAmount.toFixed(2))]
        csvContent += codeRow.join(",") + "\n"
      })

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    const dateSuffix = exportStartDate && exportEndDate ? `${exportStartDate}_to_${exportEndDate}` : "all_entries"
    link.setAttribute("download", `accounts_summary_${dateSuffix}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const exportQIF = async () => {
    const deploymentsToExport = await getFilteredDeploymentsForExport()
    if (!deploymentsToExport) return

    let qifContent = "!Type:Bank\n"

    deploymentsToExport
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .forEach((d) => {
        const date = new Date(d.date)
        const month = date.getMonth() + 1
        const day = date.getDate()
        const year = date.getFullYear()
        const formattedDate = `${month}/${day}/${year}`

        const amount = d.entryType === "Labor" ? d.totalCost : (d as ConsumableDeployment).amount

        let payee = ""
        let category = ""
        let memo = ""

        if (d.entryType === "Labor") {
          // Payee is the notes
          payee = d.notes || ""

          // Category is code + reference
          category = `${d.code} ${d.reference}`

          if (d.laborEntries && d.laborEntries.length > 0) {
            const hfDetail = d.laborEntries[0]
              ? `HF: ${d.laborEntries[0].laborCount}@${d.laborEntries[0].costPerLabor.toFixed(2)}`
              : ""
            const outsideDetails = d.laborEntries
              .slice(1)
              .map((le: LaborEntry, index: number) => `DS${index + 1}: ${le.laborCount}@${le.costPerLabor.toFixed(2)}`)
              .join("; ")
            memo = [hfDetail, outsideDetails].filter(Boolean).join("; ")
          }
        } else {
          const reference = d.reference || activities.find((a) => a.code === d.code)?.reference || d.code

          // Payee is the notes
          payee = d.notes || ""

          // Category is code + reference
          category = `${d.code} ${reference}`

          // Memo is blank for other expenses
          memo = ""
        }

        qifContent += `D${formattedDate}\n`
        qifContent += `T-${amount.toFixed(2)}\n`
        qifContent += `P${payee}\n`
        qifContent += `L${category}\n`
        if (memo) qifContent += `M${memo}\n`
        qifContent += "^\n"
      })

    const encodedUri = encodeURI("data:application/qif;charset=utf-8," + qifContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    const dateSuffix = exportStartDate && exportEndDate ? `${exportStartDate}_to_${exportEndDate}` : "all_entries"
    link.setAttribute("download", `accounts_export_${dateSuffix}.qif`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const totalEntries =
    (laborCount || laborDeployments.length) + (consumablesCount || consumableDeployments.length)
  const hasAnyData = totalEntries > 0
  const canExport = hasAnyData && !summaryLoading && !laborLoading && !consumablesLoading && !exportDateRangeError
  const filteredLaborTotal = summaryTotals.laborTotal
  const filteredOtherExpensesTotal = summaryTotals.otherTotal
  const filteredGrandTotal = summaryTotals.grandTotal

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Accounts Management</h1>
        <p className="text-muted-foreground">Track labor deployments and expense records</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fiscal Year</CardTitle>
          <CardDescription>Select the accounting year to view (April 1 - March 31)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Label>Fiscal Year</Label>
              <Select
                value={selectedFiscalYear.label}
                onValueChange={(value) => {
                  const fy = availableFiscalYears.find((f) => f.label === value)
                  if (fy) setSelectedFiscalYear(fy)
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableFiscalYears.map((fy) => (
                    <SelectItem key={fy.label} value={fy.label}>
                      {fy.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isAdmin && hasAnyData && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>Combined Accounts Export</CardTitle>
                <CardDescription className="mt-1">
                  Export both labor and other expenses to a single CSV or QIF file.
                </CardDescription>
              </div>
              <div className="text-right flex-shrink-0 pl-4">
                <p className="text-sm font-medium text-muted-foreground">Grand Total</p>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-32 mt-1" />
                ) : (
                  <div className="space-y-1">
                    <p className="text-2xl font-bold">{formatCurrency(filteredGrandTotal)}</p>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div>Labor: {formatCurrency(filteredLaborTotal)}</div>
                      <div>Other: {formatCurrency(filteredOtherExpensesTotal)}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row items-center gap-2 flex-wrap">
            <Label htmlFor="exportStartDateCombined" className="text-sm font-medium">
              From:
            </Label>
            <Input
              type="date"
              id="exportStartDateCombined"
              value={exportStartDate}
              onChange={(e) => setExportStartDate(e.target.value)}
              className="h-9 text-sm"
              aria-label="Combined export start date"
            />
            <Label htmlFor="exportEndDateCombined" className="text-sm font-medium">
              To:
            </Label>
            <Input
              type="date"
              id="exportEndDateCombined"
              value={exportEndDate}
              onChange={(e) => setExportEndDate(e.target.value)}
              className="h-9 text-sm"
              aria-label="Combined export end date"
            />
            <Button
              onClick={exportCombinedCSV}
              variant="outline"
              size="sm"
              disabled={!canExport}
              className="w-full sm:w-auto bg-transparent"
            >
              <FileText className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button
              onClick={exportQIF}
              variant="outline"
              size="sm"
              disabled={!canExport}
              className="w-full sm:w-auto bg-transparent"
            >
              <Coins className="mr-2 h-4 w-4" /> Export QIF
            </Button>
            {exportDateRangeError ? (
              <p className="w-full text-xs text-rose-600">{exportDateRangeError}</p>
            ) : (
              <p className="w-full text-xs text-muted-foreground">
                Optional date filter applies to both exports.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="labor" className="w-full space-y-4">
        <TabsList className="w-full justify-start sm:justify-center">
          <TabsTrigger value="labor" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Labor Deployments
          </TabsTrigger>
          <TabsTrigger value="expenses" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Other Expenses
          </TabsTrigger>
          <TabsTrigger value="activities" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Account Activities
          </TabsTrigger>
        </TabsList>

        <TabsContent value="labor" className="mt-6">
            <LaborDeploymentTab />
          </TabsContent>

        <TabsContent value="expenses" className="mt-6">
            <OtherExpensesTab />
          </TabsContent>

        <TabsContent value="activities">
          <Card>
            <CardHeader>
              <CardTitle>Add New Activity</CardTitle>
              <CardDescription>Create a new activity category for tracking labor and expenses</CardDescription>
            </CardHeader>
            <CardContent>
              {!isAddingActivity ? (
                <Button onClick={() => setIsAddingActivity(true)} className="w-full">
                  <PlusCircle className="mr-2 h-4 w-4" /> Add Category
                </Button>
              ) : (
                <form onSubmit={handleAddActivity} className="space-y-4 border rounded-lg p-4 bg-muted/50">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="code">Activity Code</Label>
                      <Input
                        id="code"
                        placeholder="e.g., 555"
                        value={newActivityCode}
                        onChange={(e) => setNewActivityCode(e.target.value)}
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reference">Activity Reference</Label>
                      <Input
                        id="reference"
                        placeholder="e.g., Solar Fence"
                        value={newActivityReference}
                        onChange={(e) => setNewActivityReference(e.target.value)}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Adding..." : "Add Activity"}
                  </Button>
                </form>
              )}

              {loadingActivities ? (
                <div className="text-center py-8 text-muted-foreground">Loading account activities...</div>
              ) : accountActivities.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[150px]">Code</TableHead>
                        <TableHead>Reference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accountActivities.map((activity) => (
                        <TableRow key={activity.code}>
                          <TableCell className="font-medium">{activity.code}</TableCell>
                          <TableCell>{activity.reference}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No account activities yet</p>
                  <p className="text-sm mt-2">Add labor or expense codes to start tracking estate spend.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
