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
import { FileText, Coins, PlusCircle, Settings, Users, Receipt, Loader2, Pencil, Trash2, Check, X } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import LaborDeploymentTab from "./labor-deployment-tab"
import OtherExpensesTab from "./other-expenses-tab"
import { toast } from "sonner"
import { getCurrentFiscalYear, getAvailableFiscalYears, type FiscalYear } from "@/lib/fiscal-year-utils"
import { formatDateOnly } from "@/lib/date-utils"
import { formatCurrency, formatNumber } from "@/lib/format"

interface AccountActivity {
  code: string
  reference: string
  labor_count?: number
  expense_count?: number
}

interface Activity {
  code: string
  reference: string
}

interface IntelligenceCodePattern {
  code: string
  reference: string
  totalAmount: number
  entryCount: number
}

interface IntelligenceDayPattern {
  date: string
  totalAmount: number
  entryCount: number
}

interface AccountsIntelligence {
  accountsPatterns: {
    totalLabor: number
    totalExpenses: number
    totalSpend: number
    laborSharePct: number
    expenseSharePct: number
    topCostCodes: IntelligenceCodePattern[]
    mostFrequentCodes: IntelligenceCodePattern[]
    highestLaborDays: IntelligenceDayPattern[]
    highestExpenseDays: IntelligenceDayPattern[]
    laborTrendPct: number | null
    expenseTrendPct: number | null
  } | null
  highlights: string[]
}

export default function AccountsPage() {
  const { isAdmin, user } = useAuth()
  const canManageActivities = isAdmin || user?.role === "owner"
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
  const [editingActivityCode, setEditingActivityCode] = useState<string | null>(null)
  const [editingActivityNextCode, setEditingActivityNextCode] = useState("")
  const [editingActivityReference, setEditingActivityReference] = useState("")
  const [isUpdatingActivity, setIsUpdatingActivity] = useState(false)
  const [isDeletingActivityCode, setIsDeletingActivityCode] = useState<string | null>(null)
  const [summaryTotals, setSummaryTotals] = useState({
    laborTotal: 0,
    otherTotal: 0,
    grandTotal: 0,
  })
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [accountsIntelligence, setAccountsIntelligence] = useState<AccountsIntelligence | null>(null)
  const [accountsIntelligenceLoading, setAccountsIntelligenceLoading] = useState(false)
  const [accountsIntelligenceError, setAccountsIntelligenceError] = useState<string | null>(null)
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

  useEffect(() => {
    if (!user?.tenantId) {
      setAccountsIntelligence(null)
      setAccountsIntelligenceError(null)
      return
    }

    let ignore = false
    const fetchIntelligence = async () => {
      setAccountsIntelligenceLoading(true)
      setAccountsIntelligenceError(null)
      try {
        const params = new URLSearchParams({
          startDate: selectedFiscalYear.startDate,
          endDate: selectedFiscalYear.endDate,
        })
        const response = await fetch(`/api/intelligence-brief?${params.toString()}`, { cache: "no-store" })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !data?.success) {
          throw new Error(data?.error || "Failed to load accounts intelligence")
        }
        if (!ignore) {
          setAccountsIntelligence({
            accountsPatterns: data.accountsPatterns || null,
            highlights: Array.isArray(data.highlights) ? data.highlights : [],
          })
        }
      } catch (error: any) {
        if (!ignore) {
          setAccountsIntelligence(null)
          setAccountsIntelligenceError(error?.message || "Failed to load accounts intelligence")
        }
      } finally {
        if (!ignore) {
          setAccountsIntelligenceLoading(false)
        }
      }
    }

    fetchIntelligence()
    return () => {
      ignore = true
    }
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
          reference: item.reference || item.activity || "",
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
        const normalized = (data.activities || []).map((activity: any) => ({
          code: String(activity.code || ""),
          reference: String(activity.reference || activity.activity || ""),
          labor_count: Number(activity.labor_count) || 0,
          expense_count: Number(activity.expense_count) || 0,
        }))
        setAccountActivities(normalized)
      }
    } catch (error) {
      console.error("Error fetching account activities:", error)
    } finally {
      setLoadingActivities(false)
    }
  }

  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!canManageActivities) {
      toast.error("Only admin or owner can add activity codes")
      return
    }

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

  const startEditingActivity = (activity: AccountActivity) => {
    if (!canManageActivities) {
      toast.error("Only admin or owner can edit activity codes")
      return
    }
    setEditingActivityCode(activity.code)
    setEditingActivityNextCode(activity.code)
    setEditingActivityReference(activity.reference)
  }

  const cancelEditingActivity = () => {
    setEditingActivityCode(null)
    setEditingActivityNextCode("")
    setEditingActivityReference("")
  }

  const handleUpdateActivity = async () => {
    if (!editingActivityCode) return
    const nextCode = editingActivityNextCode.trim().toUpperCase()
    const nextReference = editingActivityReference.trim()

    if (!nextCode || !nextReference) {
      toast.error("Code and reference are required")
      return
    }

    setIsUpdatingActivity(true)
    try {
      const response = await fetch("/api/get-activity", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: editingActivityCode,
          nextCode,
          reference: nextReference,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to update activity")
      }

      toast.success("Activity updated")
      cancelEditingActivity()
      await fetchAccountActivities()
      await fetchAllActivities()
    } catch (error: any) {
      console.error("Error updating activity:", error)
      toast.error(error?.message || "Failed to update activity")
    } finally {
      setIsUpdatingActivity(false)
    }
  }

  const handleDeleteActivity = async (code: string) => {
    if (!canManageActivities) {
      toast.error("Only admin or owner can delete activity codes")
      return
    }
    if (!window.confirm(`Delete activity code ${code}?`)) {
      return
    }

    setIsDeletingActivityCode(code)
    try {
      const response = await fetch(`/api/get-activity?code=${encodeURIComponent(code)}`, {
        method: "DELETE",
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete activity")
      }

      toast.success("Activity deleted")
      if (editingActivityCode === code) {
        cancelEditingActivity()
      }
      await fetchAccountActivities()
      await fetchAllActivities()
    } catch (error: any) {
      console.error("Error deleting activity:", error)
      toast.error(error?.message || "Failed to delete activity")
    } finally {
      setIsDeletingActivityCode(null)
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
  const patterns = accountsIntelligence?.accountsPatterns
  const topCostCode = patterns?.topCostCodes?.[0] || null
  const mostFrequentCode = patterns?.mostFrequentCodes?.[0] || null
  const highestLaborDay = patterns?.highestLaborDays?.[0] || null
  const highestExpenseDay = patterns?.highestExpenseDays?.[0] || null
  const topCostCodes = patterns?.topCostCodes?.slice(0, 5) || []
  const topFrequencyCodes = patterns?.mostFrequentCodes?.slice(0, 5) || []
  const topHighlights = (accountsIntelligence?.highlights || []).slice(0, 3)

  return (
    <div className="container mx-auto space-y-6 px-4 py-6 sm:p-6">
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
                <SelectTrigger className="w-full sm:w-[200px]">
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

      <Card>
        <CardHeader>
          <CardTitle>Smart Cost Patterns</CardTitle>
          <CardDescription>Frequency and highest-cost intelligence for labor and other expenses.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {accountsIntelligenceLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Building accounts intelligence...
            </div>
          ) : accountsIntelligenceError ? (
            <p className="text-sm text-rose-600">{accountsIntelligenceError}</p>
          ) : !patterns ? (
            <p className="text-sm text-muted-foreground">No pattern data yet for this fiscal year.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border bg-card p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Highest Cost Code</p>
                  <p className="mt-1 text-sm font-semibold">
                    {topCostCode ? `${topCostCode.code} · ${topCostCode.reference}` : "No data"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {topCostCode
                      ? `${formatCurrency(topCostCode.totalAmount, 0)} across ${topCostCode.entryCount} entries`
                      : "Add labor/expense entries"}
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Most Frequent Code</p>
                  <p className="mt-1 text-sm font-semibold">
                    {mostFrequentCode ? `${mostFrequentCode.code} · ${mostFrequentCode.reference}` : "No data"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {mostFrequentCode
                      ? `${formatNumber(mostFrequentCode.entryCount, 0)} entries · ${formatCurrency(mostFrequentCode.totalAmount, 0)}`
                      : "Track recurring spend"}
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Peak Labor Day</p>
                  <p className="mt-1 text-sm font-semibold">{highestLaborDay ? formatDateOnly(highestLaborDay.date) : "No data"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {highestLaborDay
                      ? `${formatCurrency(highestLaborDay.totalAmount, 0)} across ${highestLaborDay.entryCount} entries`
                      : "No labor entries in range"}
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Peak Other Expense Day</p>
                  <p className="mt-1 text-sm font-semibold">
                    {highestExpenseDay ? formatDateOnly(highestExpenseDay.date) : "No data"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {highestExpenseDay
                      ? `${formatCurrency(highestExpenseDay.totalAmount, 0)} across ${highestExpenseDay.entryCount} entries`
                      : "No expense entries in range"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border bg-card p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Spend Mix</p>
                  <p className="mt-1 text-sm text-foreground">
                    Labor {formatNumber(patterns.laborSharePct, 0)}% · Other expenses {formatNumber(patterns.expenseSharePct, 0)}%
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Total spend: {formatCurrency(patterns.totalSpend, 0)}
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Recent Cost Trend (30d vs prior 30d)</p>
                  <p className="mt-1 text-sm text-foreground">
                    Labor:{" "}
                    {patterns.laborTrendPct === null
                      ? "Not enough baseline"
                      : `${patterns.laborTrendPct >= 0 ? "+" : ""}${formatNumber(patterns.laborTrendPct, 1)}%`}
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    Other:{" "}
                    {patterns.expenseTrendPct === null
                      ? "Not enough baseline"
                      : `${patterns.expenseTrendPct >= 0 ? "+" : ""}${formatNumber(patterns.expenseTrendPct, 1)}%`}
                  </p>
                </div>
              </div>

              {topHighlights.length > 0 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {topHighlights.map((highlight, index) => (
                    <div key={`${highlight}-${index}`} className="rounded-xl border bg-card p-3">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Insight {index + 1}</p>
                      <p className="mt-1 text-sm text-foreground">{highlight}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-xl border bg-card p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Top Cost Codes</p>
                  {topCostCodes.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">No cost ranking yet.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {topCostCodes.map((row) => (
                        <div key={`cost-${row.code}`} className="flex items-center justify-between gap-3 rounded-lg border p-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {row.code} · {row.reference}
                            </p>
                            <p className="text-xs text-muted-foreground">{formatNumber(row.entryCount, 0)} entries</p>
                          </div>
                          <p className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(row.totalAmount, 0)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border bg-card p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Most Frequent Codes</p>
                  {topFrequencyCodes.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">No frequency ranking yet.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {topFrequencyCodes.map((row) => (
                        <div key={`freq-${row.code}`} className="flex items-center justify-between gap-3 rounded-lg border p-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {row.code} · {row.reference}
                            </p>
                            <p className="text-xs text-muted-foreground">{formatCurrency(row.totalAmount, 0)} total</p>
                          </div>
                          <p className="text-sm font-semibold tabular-nums text-foreground">{formatNumber(row.entryCount, 0)}x</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
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
              <CardTitle>Account Activity Codes</CardTitle>
              <CardDescription>
                Define tenant-specific labor and expense codes, then edit them as your accounting structure evolves.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isAddingActivity ? (
                <Button onClick={() => setIsAddingActivity(true)} className="w-full" disabled={!canManageActivities}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Add Category
                </Button>
              ) : (
                <form onSubmit={handleAddActivity} className="space-y-4 border rounded-lg p-4 bg-muted/50">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="code">Activity Code</Label>
                      <Input
                        id="code"
                        placeholder="e.g., 555"
                        value={newActivityCode}
                        onChange={(e) => setNewActivityCode(e.target.value.toUpperCase())}
                        disabled={isSubmitting || !canManageActivities}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reference">Activity Reference</Label>
                      <Input
                        id="reference"
                        placeholder="e.g., Solar Fence"
                        value={newActivityReference}
                        onChange={(e) => setNewActivityReference(e.target.value)}
                        disabled={isSubmitting || !canManageActivities}
                      />
                    </div>
                  </div>
                  <Button type="submit" disabled={isSubmitting || !canManageActivities}>
                    {isSubmitting ? "Adding..." : "Add Activity"}
                  </Button>
                </form>
              )}

              {!canManageActivities && (
                <p className="text-xs text-muted-foreground">
                  You have read-only access to activity codes. Ask an admin/owner to manage this list.
                </p>
              )}

              {loadingActivities ? (
                <div className="text-center py-8 text-muted-foreground">Loading account activities...</div>
              ) : accountActivities.length > 0 ? (
                <>
                  <div className="rounded-md border hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[160px]">Code</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead className="w-[190px]">Usage</TableHead>
                          <TableHead className="w-[180px] text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {accountActivities.map((activity) => {
                          const isEditing = editingActivityCode === activity.code
                          const usageCount = (activity.labor_count || 0) + (activity.expense_count || 0)
                          const canDelete = canManageActivities && usageCount === 0
                          return (
                            <TableRow key={activity.code}>
                              <TableCell className="font-medium">
                                {isEditing ? (
                                  <Input
                                    value={editingActivityNextCode}
                                    onChange={(event) => setEditingActivityNextCode(event.target.value.toUpperCase())}
                                    disabled={isUpdatingActivity}
                                    className="h-8"
                                  />
                                ) : (
                                  activity.code
                                )}
                              </TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <Input
                                    value={editingActivityReference}
                                    onChange={(event) => setEditingActivityReference(event.target.value)}
                                    disabled={isUpdatingActivity}
                                    className="h-8"
                                  />
                                ) : (
                                  activity.reference
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {usageCount > 0
                                  ? `${usageCount} records (${activity.labor_count || 0} labor, ${activity.expense_count || 0} expense)`
                                  : "Unused"}
                              </TableCell>
                              <TableCell>
                                <div className="flex justify-end gap-1">
                                  {isEditing ? (
                                    <>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={handleUpdateActivity}
                                        disabled={isUpdatingActivity}
                                        aria-label="Save activity"
                                      >
                                        <Check className="h-4 w-4 text-emerald-700" />
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={cancelEditingActivity}
                                        disabled={isUpdatingActivity}
                                        aria-label="Cancel activity edit"
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => startEditingActivity(activity)}
                                        disabled={!canManageActivities}
                                        aria-label="Edit activity"
                                      >
                                        <Pencil className="h-4 w-4 text-amber-700" />
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => handleDeleteActivity(activity.code)}
                                        disabled={!canDelete || isDeletingActivityCode === activity.code}
                                        aria-label="Delete activity"
                                      >
                                        <Trash2 className="h-4 w-4 text-rose-700" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="space-y-3 md:hidden">
                    {accountActivities.map((activity) => {
                      const isEditing = editingActivityCode === activity.code
                      const usageCount = (activity.labor_count || 0) + (activity.expense_count || 0)
                      const canDelete = canManageActivities && usageCount === 0
                      return (
                        <Card key={activity.code} className="border-border/60">
                          <CardContent className="space-y-3 p-3">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Code</Label>
                              {isEditing ? (
                                <Input
                                  value={editingActivityNextCode}
                                  onChange={(event) => setEditingActivityNextCode(event.target.value.toUpperCase())}
                                  disabled={isUpdatingActivity}
                                  className="h-9"
                                />
                              ) : (
                                <p className="text-sm font-medium">{activity.code}</p>
                              )}
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Reference</Label>
                              {isEditing ? (
                                <Input
                                  value={editingActivityReference}
                                  onChange={(event) => setEditingActivityReference(event.target.value)}
                                  disabled={isUpdatingActivity}
                                  className="h-9"
                                />
                              ) : (
                                <p className="text-sm">{activity.reference}</p>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {usageCount > 0
                                ? `${usageCount} linked records (${activity.labor_count || 0} labor, ${activity.expense_count || 0} expense)`
                                : "No linked records"}
                            </p>
                            <div className="flex gap-2">
                              {isEditing ? (
                                <>
                                  <Button size="sm" onClick={handleUpdateActivity} disabled={isUpdatingActivity} className="flex-1">
                                    <Check className="mr-1.5 h-4 w-4" />
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={cancelEditingActivity}
                                    disabled={isUpdatingActivity}
                                    className="flex-1"
                                  >
                                    <X className="mr-1.5 h-4 w-4" />
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => startEditingActivity(activity)}
                                    disabled={!canManageActivities}
                                    className="flex-1"
                                  >
                                    <Pencil className="mr-1.5 h-4 w-4" />
                                    Edit
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDeleteActivity(activity.code)}
                                    disabled={!canDelete || isDeletingActivityCode === activity.code}
                                    className="flex-1"
                                  >
                                    <Trash2 className="mr-1.5 h-4 w-4" />
                                    Delete
                                  </Button>
                                </>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </>
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
