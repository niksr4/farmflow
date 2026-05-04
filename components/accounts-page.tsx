"use client"

import type React from "react"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { useMemo, useState, useEffect, useRef } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLaborData, type LaborEntry, type LaborDeployment } from "@/hooks/use-labor-data"
import { useConsumablesData, type ConsumableDeployment } from "@/hooks/use-consumables-data"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileSpreadsheet, FileText, Coins, PlusCircle, Settings, Users, Receipt, Loader2, Pencil, Trash2, Check, X, BarChart2, ChevronDown, ChevronUp, Wheat, BookOpen, DollarSign, UserCheck } from "lucide-react"
import { Skeleton, SkeletonTable, SkeletonCard } from "@/components/ui/skeleton"
import { EmptyStateTable } from "@/components/ui/empty-state"
import AttendanceTab from "./attendance-tab"
import LaborDeploymentTab from "./labor-deployment-tab"
import OtherExpensesTab from "./other-expenses-tab"
import WorkerProfilesTab from "./worker-profiles-tab"
import PickingLogTab from "./picking-log-tab"
import WorkerLedgerTab from "./worker-ledger-tab"
import PayrollSummaryTab from "./payroll-summary-tab"
import TaskGuideCard from "@/components/task-guide-card"
import WorkspacePageShell from "@/components/workspace-page-shell"
import { toast } from "sonner"
import { getCurrentFiscalYear, getAvailableFiscalYears, type FiscalYear } from "@/lib/fiscal-year-utils"
import { formatDateForQIF, formatDateOnly } from "@/lib/date-utils"
import { formatCurrency, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  buildAccountsCsvFilename,
  buildAccountsQifFilename,
  buildAccountsXlsxFilename,
  normalizeAccountsExportFormat,
  normalizeAccountsInterchangeFormat,
  type LegacyAccountsExportFormat,
} from "@/lib/accounts-export"
import { buildXlsxArrayBufferFromCsv, XLSX_MIME_TYPE } from "@/lib/spreadsheet"
import {
  buildAccountActivityReferenceCsv,
  buildAccountActivityReferenceFilename,
  buildAccountActivityReferencePdf,
  type AccountActivityReferenceExportFormat,
} from "@/lib/account-activity-suggestions"
import posthog from "posthog-js"

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

interface ActivitySuggestion {
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

type AccountsTabValue = "labor" | "expenses" | "attendance" | "activities" | "workers" | "picking" | "ledger" | "payroll"

const LABOR_MANAGEMENT_TAB_VALUES = new Set<AccountsTabValue>(["workers", "ledger", "payroll"])
const PEOPLE_WORKFLOW_TAB_VALUES = new Set<AccountsTabValue>(["attendance", "workers", "picking", "ledger", "payroll"])

const normalizeAccountsTab = (
  initialTab: AccountsTabValue | undefined,
  showLaborManagement: boolean,
  showPickingLog: boolean,
): AccountsTabValue => {
  if (!initialTab) {
    return "labor"
  }
  if (!showLaborManagement && LABOR_MANAGEMENT_TAB_VALUES.has(initialTab)) {
    return "labor"
  }
  if (!showPickingLog && !showLaborManagement && initialTab === "picking") {
    return "labor"
  }
  return initialTab
}

type AccountsPageProps = {
  showDataToolsControls?: boolean
  requestedExport?: { requestId: number; format: LegacyAccountsExportFormat } | null
  onRequestedExportHandled?: (requestId: number) => void
  initialTab?: AccountsTabValue
  showLaborManagement?: boolean
  showPickingLog?: boolean
}

export default function AccountsPage({
  showDataToolsControls = false,
  requestedExport = null,
  onRequestedExportHandled,
  initialTab,
  showLaborManagement = false,
  showPickingLog = false,
}: AccountsPageProps) {
  const { isAdmin, isOwner, user } = useAuth()
  const canManageActivities = isAdmin || isOwner || user?.role === "user"
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<FiscalYear>(getCurrentFiscalYear())
  const availableFiscalYears = getAvailableFiscalYears()
  const fiscalYearStartDate = selectedFiscalYear.startDate
  const fiscalYearEndDate = selectedFiscalYear.endDate
  const { deployments: laborDeployments, loading: laborLoading, totalCount: laborCount } = useLaborData(undefined, {
    startDate: fiscalYearStartDate,
    endDate: fiscalYearEndDate,
  })
  const { deployments: consumableDeployments, loading: consumablesLoading, totalCount: consumablesCount } =
    useConsumablesData(undefined, {
      startDate: fiscalYearStartDate,
      endDate: fiscalYearEndDate,
    })

  const [useCustomExportRange, setUseCustomExportRange] = useState(false)
  const [customExportStartDate, setCustomExportStartDate] = useState<string>("")
  const [customExportEndDate, setCustomExportEndDate] = useState<string>("")
  const [accountActivities, setAccountActivities] = useState<AccountActivity[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [activitySuggestions, setActivitySuggestions] = useState<ActivitySuggestion[]>([])
  const [loadingActivities, setLoadingActivities] = useState(false)
  const [isAddingActivity, setIsAddingActivity] = useState(false)
  const [showAllActivitySuggestions, setShowAllActivitySuggestions] = useState(false)
  const [showCostPatterns, setShowCostPatterns] = useState(false)
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
  const [activeTab, setActiveTab] = useState<AccountsTabValue>(() => normalizeAccountsTab(initialTab, showLaborManagement, showPickingLog))
  const handledExportRequestRef = useRef<number | null>(null)
  const exportCombinedCSVRef = useRef<() => Promise<void>>(async () => undefined)
  const exportCombinedXlsxRef = useRef<() => Promise<void>>(async () => undefined)
  const exportInterchangeRef = useRef<(format?: LegacyAccountsExportFormat) => Promise<void>>(async () => undefined)
  const resolvedExportStartDate = useCustomExportRange ? customExportStartDate : fiscalYearStartDate
  const resolvedExportEndDate = useCustomExportRange ? customExportEndDate : fiscalYearEndDate
  const exportDateRangeError = useMemo(() => {
    if (!useCustomExportRange) {
      return null
    }
    if (!customExportStartDate || !customExportEndDate) {
      return "Select both start and end date for the custom export range."
    }
    if (customExportStartDate && customExportEndDate) {
      const startDate = new Date(customExportStartDate)
      const endDate = new Date(customExportEndDate)
      if (startDate > endDate) {
        return "Start date cannot be after end date."
      }
    }
    return null
  }, [customExportEndDate, customExportStartDate, useCustomExportRange])
  const accountsGuide = useMemo(() => {
    if (PEOPLE_WORKFLOW_TAB_VALUES.has(activeTab)) {
      return {
        eyebrow: "People guide",
        title: "One worker roster, optional people tools",
        description:
          "Workers is the shared roster for Attendance, Picking, Ledger, and Payroll. Use only the parts your estate actually needs.",
        bullets: [
          "Use Attendance alone if you only want daily muster.",
          "Add daily rates in Workers only when you want attendance wages in Payroll.",
          "Use Picking for piece-rate harvest and Ledger only for advances, deductions, or corrections.",
        ],
        tip: "Payroll combines whichever people records exist. It does not require every people tab to be used.",
        tone: "operations" as const,
      }
    }

    return {
      eyebrow: "Accounts guide",
      title: "Keep cost coding simple",
      description:
        "Most estates only need a few stable cost habits here: record labor, record expenses, keep attendance clean when needed, and use codes consistently.",
      bullets: [
        "Use labor and expenses for real spend only, not estimates you may change later.",
        "If you do not have a full chart of accounts yet, start with a short estate code and plain category name.",
        "Use the Codes tab when you want autocomplete, cleaner exports, and shared labels across the estate.",
      ],
      tip: "A small, stable code list is easier to run than a complex chart nobody remembers in the field.",
      tone: "finance" as const,
    }
  }, [activeTab])

  useEffect(() => {
    fetchAllActivities()
    fetchAccountActivities()
  }, [])

  useEffect(() => {
    setActiveTab(normalizeAccountsTab(initialTab, showLaborManagement, showPickingLog))
  }, [initialTab, showLaborManagement, showPickingLog])

  useEffect(() => {
    const fetchTotals = async () => {
      if (!user?.tenantId) {
        setSummaryLoading(false)
        return
      }
      try {
        setSummaryLoading(true)
        const params = new URLSearchParams({
          startDate: fiscalYearStartDate,
          endDate: fiscalYearEndDate,
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
  }, [fiscalYearEndDate, fiscalYearStartDate, user?.tenantId])

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
          startDate: fiscalYearStartDate,
          endDate: fiscalYearEndDate,
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
  }, [fiscalYearEndDate, fiscalYearStartDate, user?.tenantId])

  const fetchAllActivities = async () => {
    try {
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
      if (Array.isArray(data.suggestions)) {
        setActivitySuggestions(
          data.suggestions.map((item: any) => ({
            code: String(item.code || ""),
            reference: String(item.reference || item.activity || ""),
          })),
        )
      }
    } catch (error) {
      console.error("Error fetching activities:", error)
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
      if (Array.isArray(data.suggestions)) {
        setActivitySuggestions(
          data.suggestions.map((item: any) => ({
            code: String(item.code || ""),
            reference: String(item.reference || item.activity || ""),
          })),
        )
      }
    } catch (error) {
      console.error("Error fetching account activities:", error)
    } finally {
      setLoadingActivities(false)
    }
  }

  const applyActivitySuggestion = (suggestion: ActivitySuggestion) => {
    setIsAddingActivity(true)
    setNewActivityCode(suggestion.code)
    setNewActivityReference(suggestion.reference)
  }

  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!canManageActivities) {
      toast.error("You do not have permission to add activity codes")
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
      toast.error("You do not have permission to edit activity codes")
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
      toast.error("You do not have permission to delete activity codes")
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
    if (resolvedExportStartDate && resolvedExportEndDate) {
      const startDate = new Date(resolvedExportStartDate)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date(resolvedExportEndDate)
      endDate.setHours(23, 59, 59, 999)
      deploymentsToExport = deploymentsToExport.filter((d) => {
        const deploymentDate = new Date(d.date)
        return deploymentDate >= startDate && deploymentDate <= endDate
      })
    }

    if (deploymentsToExport.length === 0) {
      toast.error(useCustomExportRange ? "No entries found for the selected export range." : "No entries found in this fiscal year.")
      return null
    }
    return deploymentsToExport
  }

  const escapeCsvField = (field: any): string => {
    if (field === null || field === undefined) return ""
    const stringField = String(field)
    if (stringField.search(/("|,|\n)/g) >= 0) return `"${stringField.replace(/"/g, '""')}"`
    return stringField
  }

  const buildCombinedAccountsCsv = (deploymentsToExport: CombinedDeployment[]) => {
    const sortedDeployments = [...deploymentsToExport].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const headers = [
      "Date",
      "Entry Type",
      "Code",
      "Reference",
      "Estate Labor Details",
      "Outside Labor Details",
      "Total Expenditure (₹)",
      "Notes",
      "Recorded By",
    ]

    const rows = sortedDeployments.map((d) => {
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

    let csvContent = headers.map(escapeCsvField).join(",") + "\n"
    csvContent += rows.map((row) => row.join(",")).join("\n")

    let totalHfLaborCount = 0,
      totalHfLaborCost = 0
    let totalOutsideLaborCount = 0,
      totalOutsideLaborCost = 0
    let totalConsumablesCost = 0
    const totalsByCode: { [code: string]: number } = {}

    sortedDeployments.forEach((d) => {
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
      "Total Estate Labor",
      `Estate: ${totalHfLaborCount.toFixed(1)} laborers`,
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
        const deployment = sortedDeployments.find((d) => d.code === code)
        const reference = deployment?.reference || code
        const codeRow = [escapeCsvField(code), escapeCsvField(reference), escapeCsvField(totalAmount.toFixed(2))]
        csvContent += codeRow.join(",") + "\n"
      })

    return csvContent
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const downloadActivityReference = (format: AccountActivityReferenceExportFormat) => {
    try {
      const filename = buildAccountActivityReferenceFilename(format)

      if (format === "csv") {
        const csv = buildAccountActivityReferenceCsv()
        downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename)
      } else if (format === "xlsx") {
        const csv = buildAccountActivityReferenceCsv()
        const workbookBytes = buildXlsxArrayBufferFromCsv(csv, "Activity Reference")
        downloadBlob(new Blob([workbookBytes], { type: XLSX_MIME_TYPE }), filename)
      } else {
        const pdfBytes = buildAccountActivityReferencePdf()
        downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), filename)
      }

      toast.success(`Activity reference ${format.toUpperCase()} downloaded`)
      posthog.capture("account_activity_reference_downloaded", { format })
    } catch (error: any) {
      console.error("Error downloading activity reference:", error)
      toast.error(error?.message || "Failed to download activity reference")
    }
  }

  const handleCustomExportRangeToggle = () => {
    setUseCustomExportRange((prev) => {
      const next = !prev
      if (next) {
        setCustomExportStartDate(fiscalYearStartDate)
        setCustomExportEndDate(fiscalYearEndDate)
      } else {
        setCustomExportStartDate("")
        setCustomExportEndDate("")
      }
      return next
    })
  }

  const exportCombinedCSV = async () => {
    const deploymentsToExport = await getFilteredDeploymentsForExport()
    if (!deploymentsToExport) return

    const csvBody = buildCombinedAccountsCsv(deploymentsToExport)
    const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvBody)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", buildAccountsCsvFilename(resolvedExportStartDate, resolvedExportEndDate))
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success(`Accounts CSV exported (${deploymentsToExport.length} entries)`)

    posthog.capture("accounts_export_downloaded", {
      format: "csv",
      rows_exported: deploymentsToExport.length,
      date_range_start: resolvedExportStartDate || null,
      date_range_end: resolvedExportEndDate || null,
    })
  }

  const exportCombinedXlsx = async () => {
    posthog.capture("accounts_export_requested", {
      format: "xlsx",
      date_range_start: resolvedExportStartDate || null,
      date_range_end: resolvedExportEndDate || null,
    })

    try {
      const deploymentsToExport = await getFilteredDeploymentsForExport()
      if (!deploymentsToExport) return
      const csvBody = buildCombinedAccountsCsv(deploymentsToExport)
      const workbookBytes = buildXlsxArrayBufferFromCsv(csvBody, "Accounts Export")
      const blob = new Blob([workbookBytes], { type: XLSX_MIME_TYPE })
      downloadBlob(blob, buildAccountsXlsxFilename(resolvedExportStartDate, resolvedExportEndDate))
      toast.success(`Accounts XLSX exported (${deploymentsToExport.length} entries)`)

      posthog.capture("accounts_export_downloaded", {
        format: "xlsx",
        rows_exported: deploymentsToExport.length,
        date_range_start: resolvedExportStartDate || null,
        date_range_end: resolvedExportEndDate || null,
      })
    } catch (error: any) {
      console.error("Error exporting accounts xlsx file:", error)
      toast.error(error?.message || "Failed to export XLSX file")
      posthog.capture("accounts_export_failed", {
        format: "xlsx",
        reason: error?.message || "unknown",
      })
    }
  }

  const exportInterchange = async (format: LegacyAccountsExportFormat = "qif") => {
    const canonicalFormat = normalizeAccountsInterchangeFormat(format)
    posthog.capture("accounts_export_requested", {
      format: canonicalFormat,
      date_range_start: resolvedExportStartDate || null,
      date_range_end: resolvedExportEndDate || null,
    })

    try {
      const deploymentsToExport = await getFilteredDeploymentsForExport()
      if (!deploymentsToExport) return

      let qifContent = "!Type:Bank\n"

      deploymentsToExport
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .forEach((d) => {
          const formattedDate = formatDateForQIF(d.date)
          const amount = d.entryType === "Labor" ? d.totalCost : (d as ConsumableDeployment).amount

          let payee = ""
          let category = ""
          let memo = ""

          if (d.entryType === "Labor") {
            payee = d.notes || ""
            category = `${d.code} ${d.reference}`

            if (d.laborEntries && d.laborEntries.length > 0) {
              const hfDetail = d.laborEntries[0]
                ? `Estate: ${d.laborEntries[0].laborCount}@${d.laborEntries[0].costPerLabor.toFixed(2)}`
                : ""
              const outsideDetails = d.laborEntries
                .slice(1)
                .map((le: LaborEntry, index: number) => `DS${index + 1}: ${le.laborCount}@${le.costPerLabor.toFixed(2)}`)
                .join("; ")
              memo = [hfDetail, outsideDetails].filter(Boolean).join("; ")
            }
          } else {
            const reference = d.reference || activities.find((a) => a.code === d.code)?.reference || d.code
            payee = d.notes || ""
            category = `${d.code} ${reference}`
            memo = ""
          }

          qifContent += `D${formattedDate}\n`
          qifContent += `T-${amount.toFixed(2)}\n`
          qifContent += `P${payee}\n`
          qifContent += `L${category}\n`
          if (memo) qifContent += `M${memo}\n`
          qifContent += "^\n"
        })

      const encodedUri = encodeURI("data:text/plain;charset=utf-8," + qifContent)
      const link = document.createElement("a")
      link.setAttribute("href", encodedUri)
      link.setAttribute("download", buildAccountsQifFilename(resolvedExportStartDate, resolvedExportEndDate))
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success(`Accounts ${canonicalFormat.toUpperCase()} exported (${deploymentsToExport.length} entries)`)

      posthog.capture("accounts_export_downloaded", {
        format: canonicalFormat,
        rows_exported: deploymentsToExport.length,
        date_range_start: resolvedExportStartDate || null,
        date_range_end: resolvedExportEndDate || null,
      })
    } catch (error: any) {
      console.error("Error exporting accounts interchange file:", error)
      toast.error(error?.message || "Failed to export QIF file")
      posthog.capture("accounts_export_failed", {
        format: canonicalFormat,
        reason: error?.message || "unknown",
      })
    }
  }

  exportCombinedCSVRef.current = exportCombinedCSV
  exportCombinedXlsxRef.current = exportCombinedXlsx
  exportInterchangeRef.current = exportInterchange

  const totalEntries =
    (laborCount || laborDeployments.length) + (consumablesCount || consumableDeployments.length)
  const hasAnyData = totalEntries > 0
  const canExport = hasAnyData && !summaryLoading && !laborLoading && !consumablesLoading && !exportDateRangeError
  const exportDisabledReason = useMemo(() => {
    if (exportDateRangeError) return exportDateRangeError
    if (summaryLoading || laborLoading || consumablesLoading) return "Loading latest accounts data..."
    if (!hasAnyData) return "No labor or expense records yet. Add one entry to enable export."
    return null
  }, [consumablesLoading, exportDateRangeError, hasAnyData, laborLoading, summaryLoading])
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
  const visibleActivitySuggestions = showAllActivitySuggestions ? activitySuggestions : activitySuggestions.slice(0, 12)
  const accountsShellStats = [
    {
      label: "Fiscal Year",
      value: selectedFiscalYear.label,
      detail: "April 1 to March 31 reporting window",
      tooltip: "All figures below are filtered to this fiscal year. Switch the year using the selector in the header.",
    },
    {
      label: "Labor Tracked",
      value: summaryLoading ? "Loading..." : formatCurrency(filteredLaborTotal),
      detail: `${formatNumber(laborCount || laborDeployments.length, 0)} labor records in range`,
      tooltip: "Total wages, advances, and labor costs recorded for the selected fiscal year and active filters.",
    },
    {
      label: "Other Expenses",
      value: summaryLoading ? "Loading..." : formatCurrency(filteredOtherExpensesTotal),
      detail: `${formatNumber(consumablesCount || consumableDeployments.length, 0)} expense records in range`,
      tooltip: "Non-labor operational expenses: consumables, equipment, repairs, and other coded activities.",
    },
    {
      label: "Account Codes",
      value: formatNumber(accountActivities.length || activities.length, 0),
      detail: topCostCode ? `Top cost code: ${topCostCode.code}` : "Add estate codes for exports and summaries",
      tooltip: "Estate-defined activity codes used to categorize labor and expenses. Used for cost reporting and export formats.",
    },
  ]

  useEffect(() => {
    if (!requestedExport) return
    if (handledExportRequestRef.current === requestedExport.requestId) return

    handledExportRequestRef.current = requestedExport.requestId
    const run = async () => {
      try {
        const normalizedFormat = normalizeAccountsExportFormat(requestedExport.format)
        if (normalizedFormat === "csv") {
          await exportCombinedCSVRef.current()
        } else if (normalizedFormat === "xlsx") {
          await exportCombinedXlsxRef.current()
        } else {
          await exportInterchangeRef.current(normalizedFormat)
        }
      } finally {
        onRequestedExportHandled?.(requestedExport.requestId)
      }
    }
    void run()
  }, [onRequestedExportHandled, requestedExport])

  return (
    <WorkspacePageShell
      className="container mx-auto px-4 py-6 sm:p-6"
      badge="Finance workspace"
      title="Accounts Management"
      description="Track labor, expenses, attendance, and estate activity codes."
      accent="amber"
      stats={accountsShellStats}
      supportingContent={
        <p>
          Record actual estate spend here, then export it in CSV, XLSX, or QIF when needed.
        </p>
      }
      actions={
        <div className="rounded-2xl border border-amber-100/90 bg-white/85 p-3 shadow-sm">
          <Label className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Fiscal Year</Label>
          <Select
            value={selectedFiscalYear.label}
            onValueChange={(value) => {
              const fy = availableFiscalYears.find((f) => f.label === value)
              if (fy) setSelectedFiscalYear(fy)
            }}
          >
            <SelectTrigger className="mt-2 w-full min-w-[220px] bg-white sm:min-w-[240px]">
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
      }
    >
      <TaskGuideCard
        eyebrow={accountsGuide.eyebrow}
        title={accountsGuide.title}
        description={accountsGuide.description}
        bullets={accountsGuide.bullets}
        tip={accountsGuide.tip}
        tone={accountsGuide.tone}
      />

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowCostPatterns((prev) => !prev)}
          className="bg-white text-xs"
        >
          <BarChart2 className="mr-1.5 h-3.5 w-3.5" />
          {showCostPatterns ? "Hide Cost Patterns" : "Show Cost Patterns"}
          {showCostPatterns ? <ChevronUp className="ml-1.5 h-3.5 w-3.5" /> : <ChevronDown className="ml-1.5 h-3.5 w-3.5" />}
        </Button>
      </div>

      {showCostPatterns && (
      <Card>
        <CardHeader>
          <CardTitle>Smart Cost Patterns</CardTitle>
          <CardDescription>Frequency and highest-cost intelligence for labor and other expenses.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {accountsIntelligenceLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
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
                    <div key={`${highlight}-${index}`} className="rounded-xl border border-amber-100 bg-amber-50/40 p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                        <p className="text-[10px] uppercase tracking-[0.18em] text-amber-700">AI Signal {index + 1}</p>
                      </div>
                      <p className="text-sm text-neutral-800">{highlight}</p>
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
      )}

      {showDataToolsControls && (isAdmin || isOwner) && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>Accounts Export</CardTitle>
                <CardDescription className="mt-1">
                  Export labor and other expenses using the same fiscal year already selected above.
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
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {useCustomExportRange ? "Custom export range" : `Using ${selectedFiscalYear.label}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {useCustomExportRange
                    ? "Exports use the custom dates below until you switch back to the fiscal year."
                    : `Exports currently cover ${fiscalYearStartDate} to ${fiscalYearEndDate}.`}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleCustomExportRangeToggle} className="bg-white">
                {useCustomExportRange ? "Use Fiscal Year" : "Use Custom Range"}
              </Button>
            </div>

            {useCustomExportRange && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="exportStartDateCombined" className="text-sm font-medium">
                    From
                  </Label>
                  <Input
                    type="date"
                    id="exportStartDateCombined"
                    value={customExportStartDate}
                    onChange={(e) => setCustomExportStartDate(e.target.value)}
                    className="h-9 text-sm"
                    aria-label="Combined export start date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exportEndDateCombined" className="text-sm font-medium">
                    To
                  </Label>
                  <Input
                    type="date"
                    id="exportEndDateCombined"
                    value={customExportEndDate}
                    onChange={(e) => setCustomExportEndDate(e.target.value)}
                    className="h-9 text-sm"
                    aria-label="Combined export end date"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
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
              onClick={exportCombinedXlsx}
              variant="outline"
              size="sm"
              disabled={!canExport}
              className="w-full sm:w-auto bg-transparent"
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Export XLSX
            </Button>
            <Button
              onClick={() => void exportInterchange("qif")}
              variant="outline"
              size="sm"
              disabled={!canExport}
              className="w-full sm:w-auto bg-transparent"
            >
              <Coins className="mr-2 h-4 w-4" /> Export QIF
            </Button>
            <p className={cn("w-full text-xs", exportDateRangeError ? "text-rose-600" : "text-muted-foreground")}>
              {exportDisabledReason || "CSV, XLSX, and QIF exports use the range shown above."}
            </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AccountsTabValue)} className="w-full space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-2 sm:justify-center">
          <TabsTrigger value="labor" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Labor
          </TabsTrigger>
          <TabsTrigger value="expenses" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Expenses
          </TabsTrigger>
          <TabsTrigger value="attendance" className="flex items-center gap-2">
            <Check className="h-4 w-4" />
            Attendance
          </TabsTrigger>
          <TabsTrigger value="activities" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Codes
          </TabsTrigger>
          {(showPickingLog || showLaborManagement) && (
            <TabsTrigger value="picking" className="flex items-center gap-2">
              <Wheat className="h-4 w-4" />
              Picking
            </TabsTrigger>
          )}
          {showLaborManagement && (
            <>
              <TabsTrigger value="workers" className="flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                Workers
              </TabsTrigger>
              <TabsTrigger value="ledger" className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Ledger
              </TabsTrigger>
              <TabsTrigger value="payroll" className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Payroll
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="labor" className="mt-6">
            <LaborDeploymentTab startDate={fiscalYearStartDate} endDate={fiscalYearEndDate} />
          </TabsContent>

        <TabsContent value="expenses" className="mt-6">
            <OtherExpensesTab startDate={fiscalYearStartDate} endDate={fiscalYearEndDate} />
          </TabsContent>

        <TabsContent value="attendance" className="mt-6">
            <AttendanceTab />
          </TabsContent>

        <TabsContent value="activities">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Account Activity Codes</CardTitle>
                  <CardDescription className="mt-1">
                    Pre-filled with the standard HoneyFarm and Seshagiri estate structure. Edit, add, or remove codes to match your accounting setup.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => downloadActivityReference("pdf")}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Reference PDF
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => downloadActivityReference("xlsx")}
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Excel
                  </Button>
                </div>
              </div>
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
                  You have read-only access to activity codes.
                </p>
              )}

              {activitySuggestions.length > 0 && (
                <div className="space-y-3 rounded-lg border border-emerald-200/70 bg-emerald-50/60 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-emerald-900">
                        {activitySuggestions.length} standard codes not yet in your list
                      </p>
                      <p className="text-xs text-emerald-800">
                        These are from the HoneyFarm and Seshagiri structure — add any that fit your estate.
                      </p>
                    </div>
                    {activitySuggestions.length > 12 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="bg-white"
                        onClick={() => setShowAllActivitySuggestions((current) => !current)}
                      >
                        {showAllActivitySuggestions ? "Show fewer" : `Show all ${activitySuggestions.length}`}
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {visibleActivitySuggestions.map((suggestion) => (
                      <div key={suggestion.code} className="rounded-lg border border-emerald-200 bg-white/90 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-mono text-xs font-semibold text-emerald-900">{suggestion.code}</p>
                            <p className="mt-1 text-sm text-foreground">{suggestion.reference}</p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="bg-white"
                            onClick={() => applyActivitySuggestion(suggestion)}
                            disabled={!canManageActivities}
                          >
                            Use
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {loadingActivities ? (
                <SkeletonTable rows={4} cols={4} />
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
                <EmptyStateTable
                  title="No account activities yet"
                  description="Add labor or expense codes to start tracking estate spend."
                  size="md"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {(showPickingLog || showLaborManagement) && (
          <TabsContent value="picking" className="mt-6">
            <PickingLogTab />
          </TabsContent>
        )}
        {showLaborManagement && (
          <>
            <TabsContent value="workers" className="mt-6">
              <WorkerProfilesTab />
            </TabsContent>

            <TabsContent value="ledger" className="mt-6">
              <WorkerLedgerTab />
            </TabsContent>

            <TabsContent value="payroll" className="mt-6">
              <PayrollSummaryTab />
            </TabsContent>
          </>
        )}
      </Tabs>
    </WorkspacePageShell>
  )
}
