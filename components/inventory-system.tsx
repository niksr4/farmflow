"use client"

import React, { useEffect, useState, useCallback, useMemo } from "react"
import {
  Check,
  Download,
  List,
  Home,
  LogOut,
  Edit,
  Trash2,
  Plus,
  RefreshCw,
  Search,
  SortAsc,
  SortDesc,
  History,
  Brain,
  Loader2,
  TrendingUp,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  CloudRain,
  Newspaper,
  Truck,
  Users,
  Factory,
  Leaf,
  NotebookPen,
  Receipt,
  Settings,
  Info,
  BookOpen,
  Scale,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useAuth } from "@/hooks/use-auth"
import { useTenantExperience } from "@/hooks/use-tenant-experience"
import { useRouter, useSearchParams } from "next/navigation"
import AiAnalysisCharts from "@/components/ai-analysis-charts"
import AccountsPage from "@/components/accounts-page"
import ActivityLogTab from "@/components/activity-log-tab"
import DispatchTab from "@/components/dispatch-tab"
import ProcessingTab from "@/components/processing-tab"
import RainfallWeatherTab from "@/components/rainfall-weather-tab"
import SalesTab from "@/components/sales-tab"
import OtherSalesTab from "@/components/other-sales-tab"
import NewsTab from "@/components/news-tab"
import SeasonDashboard from "@/components/season-dashboard"
import CuringTab from "@/components/curing-tab"
import QualityGradingTab from "@/components/quality-grading-tab"
import BillingTab from "@/components/billing-tab"
import ReceivablesTab from "@/components/receivables-tab"
import BalanceSheetTab from "@/components/balance-sheet-tab"
import JournalTab from "@/components/journal-tab"
import ResourcesTab from "@/components/resources-tab"
import YieldForecastTab from "@/components/yield-forecast-tab"
import { PepperTab } from "./pepper-tab"
import OnboardingChecklist, { type OnboardingStep } from "@/components/onboarding-checklist"
import Link from "next/link"
import Image from "next/image"
import { formatDateForDisplay, generateTimestamp, isWithinLast24Hours } from "@/lib/date-utils"
import { formatCurrency, formatNumber } from "@/lib/format"
import { getCurrentFiscalYear } from "@/lib/fiscal-year-utils"
import { getModuleDefaultEnabled } from "@/lib/modules"
import type { InventoryItem, Transaction } from "@/lib/inventory-types"
import { cn } from "@/lib/utils"
import { toast } from "@/components/ui/use-toast"
import { roleLabel } from "@/lib/roles"

// API endpoints (adjust if your routes are different)
const API_TRANSACTIONS = "/api/transactions-neon"
const API_INVENTORY = "/api/inventory-neon"

const LOCATION_ALL = "all"
const LOCATION_UNASSIGNED = "unassigned"
const UNASSIGNED_LABEL = "Unassigned (legacy)"
const PREVIEW_TENANT_COOKIE = "farmflow_preview_tenant"
const DEFAULT_DASHBOARD_TAB_PRIORITY = [
  "home",
  "processing",
  "dispatch",
  "sales",
  "other-sales",
  "season",
  "yield-forecast",
  "accounts",
  "transactions",
  "balance-sheet",
  "receivables",
  "billing",
  "rainfall",
  "journal",
  "resources",
  "ai-analysis",
  "news",
  "pepper",
  "curing",
  "quality",
  "inventory",
]

interface LocationOption {
  id: string
  name: string
  code?: string | null
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

interface IntelligenceBrief {
  dateRange: {
    startDate: string
    endDate: string
  }
  generatedAt: string
  highlights: string[]
  actions: Array<{
    label: string
    tab: string
  }>
  reconciliation: {
    totalReceivedKgs: number
    totalSoldKgs: number
    saleableKgs: number
    overdrawnKgs: number
    overdrawnSlots: Array<{
      coffeeType: string
      bagType: string
      overdrawnKgs: number
    }>
  } | null
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
}

function parseCustomDateString(dateString: string | undefined | null): Date | null {
  if (!dateString || typeof dateString !== "string") return null
  // accept ISO or custom "DD/MM/YYYY hh:mm"
  const iso = Date.parse(dateString)
  if (!isNaN(iso)) return new Date(iso)

  const parts = dateString.split(" ")
  const dateParts = parts[0].split("/")
  const timeParts = parts[1] ? parts[1].split(":") : ["00", "00"]

  if (dateParts.length !== 3) return null

  const day = Number.parseInt(dateParts[0], 10)
  const month = Number.parseInt(dateParts[1], 10) - 1
  const year = Number.parseInt(dateParts[2], 10)
  const hour = Number.parseInt(timeParts[0], 10)
  const minute = Number.parseInt(timeParts[1], 10)

  if (isNaN(day) || isNaN(month) || isNaN(year) || isNaN(hour) || isNaN(minute)) {
    return null
  }

  return new Date(year, month, day, hour, minute)
}

const formatDate = (dateString?: string | null) => {
  if (!dateString) return ""
  const parsed = parseCustomDateString(dateString)
  return formatDateForDisplay(parsed ?? dateString)
}

const safeGet = <T,>(value: T | null | undefined, fallback: T): T => {
  return value !== null && value !== undefined ? value : fallback
}

const parseJsonResponse = async (res: Response) => {
  const text = await res.text()
  if (!text) {
    return { json: null as any, text: "" }
  }
  try {
    return { json: JSON.parse(text), text }
  } catch {
    return { json: null as any, text }
  }
}

const createDefaultTransaction = (): Transaction => {
  // Keep snake_case fields aligned to backend
  return {
    item_type: "",
    quantity: 0,
    transaction_type: "deplete",
    notes: "",
    transaction_date: new Date().toISOString(),
    user_id: "unknown",
    price: 0,
    total_cost: 0,
    unit: "kg",
    location_id: null,
    id: undefined as any, // optional
  } as Transaction
}

export default function InventorySystem() {
  // UI / paging
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const [activeTab, setActiveTab] = useState("home")
  const [enabledModules, setEnabledModules] = useState<string[] | null>(null)
  const [isModulesLoading, setIsModulesLoading] = useState(false)

  // data & states
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [laborDeployments, setLaborDeployments] = useState<any[]>([])
  const [summary, setSummary] = useState({ total_inventory_value: 0, total_items: 0, total_quantity: 0 })
  const [accountsTotals, setAccountsTotals] = useState({ laborTotal: 0, otherTotal: 0, grandTotal: 0 })
  const [accountsTotalsLoading, setAccountsTotalsLoading] = useState(false)
  const [processingTotals, setProcessingTotals] = useState({
    arabicaKg: 0,
    arabicaBags: 0,
    robustaKg: 0,
    robustaBags: 0,
    loading: false,
    error: null as string | null,
  })
  const [dispatchHeroTotals, setDispatchHeroTotals] = useState({
    arabicaBags: 0,
    arabicaKgs: 0,
    robustaBags: 0,
    robustaKgs: 0,
    totalDispatches: 0,
    loading: false,
    error: null as string | null,
  })
  const [salesHeroTotals, setSalesHeroTotals] = useState({
    arabicaBags: 0,
    arabicaKgs: 0,
    robustaBags: 0,
    robustaKgs: 0,
    totalSales: 0,
    totalRevenue: 0,
    loading: false,
    error: null as string | null,
  })
  const [curingHeroTotals, setCuringHeroTotals] = useState({
    totalRecords: 0,
    totalOutputKg: 0,
    avgDryingDays: 0,
    avgMoistureDrop: 0,
    loading: false,
    error: null as string | null,
  })
  const [qualityHeroTotals, setQualityHeroTotals] = useState({
    totalRecords: 0,
    avgCupScore: 0,
    avgOutturnPct: 0,
    avgDefects: 0,
    loading: false,
    error: null as string | null,
  })
  const [pepperHeroTotals, setPepperHeroTotals] = useState({
    totalRecords: 0,
    totalPickedKg: 0,
    totalDryKg: 0,
    avgDryPercent: 0,
    loading: false,
    error: null as string | null,
  })
  const [rainfallHeroTotals, setRainfallHeroTotals] = useState({
    totalRecords: 0,
    totalInches: 0,
    latestDate: null as string | null,
    loading: false,
    error: null as string | null,
  })
  const [receivablesHeroTotals, setReceivablesHeroTotals] = useState({
    totalInvoiced: 0,
    totalOutstanding: 0,
    totalOverdue: 0,
    totalPaid: 0,
    totalCount: 0,
    loading: false,
    error: null as string | null,
  })
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<string>(LOCATION_ALL)
  const [transactionLocationId, setTransactionLocationId] = useState<string>(LOCATION_UNASSIGNED)
  const [inventoryEditLocationId, setInventoryEditLocationId] = useState<string>(LOCATION_UNASSIGNED)
  const [loading, setLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<Date | null>(null)

  // edit/create UI
  const [isNewItemDialogOpen, setIsNewItemDialogOpen] = useState(false)
  const [editingInventoryItem, setEditingInventoryItem] = useState<InventoryItem | null>(null)
  const [isInventoryEditDialogOpen, setIsInventoryEditDialogOpen] = useState(false)
  const [inventoryEditForm, setInventoryEditForm] = useState({ name: "", unit: "kg", quantity: "" })
  const [isSavingInventoryEdit, setIsSavingInventoryEdit] = useState(false)
  const [newItemForm, setNewItemForm] = useState({
    name: "",
    unit: "kg",
    quantity: "",
    price: "",
    notes: "",
    locationId: LOCATION_UNASSIGNED,
  })
  const [isSavingNewItem, setIsSavingNewItem] = useState(false)
  const [isMovementDrawerOpen, setIsMovementDrawerOpen] = useState(false)

  // transaction creation/editing
  const [newTransaction, setNewTransaction] = useState<Transaction | null>(createDefaultTransaction())
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isSavingTransactionEdit, setIsSavingTransactionEdit] = useState(false)
  const [deleteConfirmDialogOpen, setDeleteConfirmDialogOpen] = useState(false)
  const [transactionToDelete, setTransactionToDelete] = useState<number | null>(null)

  // UI controls
  const [inventorySearchTerm, setInventorySearchTerm] = useState("")
  const [transactionSearchTerm, setTransactionSearchTerm] = useState("")
  const [recentTransactionSearchTerm, setRecentTransactionSearchTerm] = useState("")
  const [filterType, setFilterType] = useState("All Types")
  const [inventoryDrilldownItemName, setInventoryDrilldownItemName] = useState("")
  const [inventorySortOrder, setInventorySortOrder] = useState<"asc" | "desc" | null>(null)
  const [transactionSortOrder, setTransactionSortOrder] = useState<"asc" | "desc">("desc")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState("")
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [showWelcome, setShowWelcome] = useState(false)
  const WELCOME_SKIP_TENANTS = useMemo(
    () => new Set<string>(["41b4b10c-428c-4155-882f-1cc7f6e89a78"]),
    [],
  )
  const [exceptionsSummary, setExceptionsSummary] = useState<{ count: number; highlights: string[] }>({
    count: 0,
    highlights: [],
  })
  const [exceptionsLoading, setExceptionsLoading] = useState(false)
  const [exceptionsError, setExceptionsError] = useState<string | null>(null)
  const [intelligenceBrief, setIntelligenceBrief] = useState<IntelligenceBrief | null>(null)
  const [intelligenceLoading, setIntelligenceLoading] = useState(false)
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null)
  const [onboardingStatus, setOnboardingStatus] = useState({
    locations: false,
    inventory: false,
    processing: false,
    dispatch: false,
    sales: false,
  })
  const [isOnboardingLoading, setIsOnboardingLoading] = useState(false)
  const [onboardingError, setOnboardingError] = useState<string | null>(null)
  const [newLocationName, setNewLocationName] = useState("")
  const [newLocationCode, setNewLocationCode] = useState("")
  const [isCreatingLocation, setIsCreatingLocation] = useState(false)

  // auth + router
  const { user, logout, status } = useAuth()
  const { settings: tenantSettings, isFeatureEnabled } = useTenantExperience()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tenantId = user?.tenantId || null
  const previewTenantId = (searchParams.get("previewTenantId") || "").trim()
  const previewTenantName = (searchParams.get("previewTenantName") || "").trim()
  const previewRoleParam = (searchParams.get("previewRole") || "").toLowerCase()
  const previewRole = previewRoleParam === "admin" || previewRoleParam === "user" ? previewRoleParam : null
  const isPlatformOwner = !!user?.role && user.role.toLowerCase() === "owner"
  const isPreviewMode = Boolean(isPlatformOwner && previewTenantId && previewRole)
  const effectiveRole = isPreviewMode ? previewRole : user?.role?.toLowerCase() || ""
  const roleBadgeLabel = isPreviewMode ? `Preview: ${roleLabel(effectiveRole)}` : roleLabel(user?.role)
  const tenantLabel = isPreviewMode
    ? previewTenantName || `Tenant ${previewTenantId.slice(0, 8)}`
    : tenantSettings.estateName
      ? `Estate: ${tenantSettings.estateName}`
      : "Estate: add a name in Settings"
  const activityTenantId = isPreviewMode ? previewTenantId : tenantId
  const hideEmptyMetrics = Boolean(tenantSettings.uiPreferences?.hideEmptyMetrics)
  const isAdmin = effectiveRole === "admin"
  const isOwner = effectiveRole === "owner"
  const isScopedUser = effectiveRole === "user"
  const showFinancialHomeCards = isAdmin || isOwner
  const canManageData = !isPreviewMode && (isAdmin || isOwner)
  const isTenantLoading = status === "loading"
  const preventNegativeKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "-" || event.key === "e" || event.key === "E") {
      event.preventDefault()
    }
  }
  const coerceNonNegativeNumber = (value: string) => {
    const numeric = Number(value)
    if (Number.isNaN(numeric) || numeric < 0) return null
    return numeric
  }
  const isModuleEnabled = useCallback(
    (moduleId: string) => {
      if (isOwner && !isPreviewMode) {
        return true
      }
      if (!enabledModules) {
        return getModuleDefaultEnabled(moduleId)
      }
      return enabledModules.includes(moduleId)
    },
    [enabledModules, isOwner, isPreviewMode],
  )

  // helpers
  const isMobile = useMediaQuery("(max-width: 768px)")
  const currentFiscalYear = useMemo(() => getCurrentFiscalYear(), [])
  const estateMetrics = useMemo(() => {
    const inventoryCount = inventory.length
    const locationCount = locations.length
    const recentActivity = transactions.filter((t) => isWithinLast24Hours(t.transaction_date)).length

    return {
      inventoryCount,
      locationCount,
      recentActivity,
      inventoryValue: summary.total_inventory_value,
    }
  }, [inventory.length, locations.length, summary.total_inventory_value, transactions])

  useEffect(() => {
    if (!user) {
      // If auth removed, push to homepage
      router.push("/")
    }
  }, [user, router])

  useEffect(() => {
    if (typeof document === "undefined") return
    if (isPreviewMode && previewTenantId) {
      document.cookie = `${PREVIEW_TENANT_COOKIE}=${encodeURIComponent(previewTenantId)}; path=/; SameSite=Lax`
      return
    }
    document.cookie = `${PREVIEW_TENANT_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
  }, [isPreviewMode, previewTenantId])

  const loadTenantModules = useCallback(async () => {
    if (isPreviewMode) {
      setIsModulesLoading(true)
      try {
        const response = await fetch(`/api/admin/tenant-modules?tenantId=${encodeURIComponent(previewTenantId)}`, {
          cache: "no-store",
        })
        const data = await response.json()
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to load tenant modules")
        }
        if (Array.isArray(data.modules)) {
          const moduleIds = data.modules
            .filter((module: any) => {
              if (typeof module === "string") return true
              return Boolean(module?.enabled)
            })
            .map((module: any) => (typeof module === "string" ? module : String(module.id)))
          setEnabledModules(moduleIds)
        } else {
          setEnabledModules(null)
        }
      } catch (error) {
        console.error("Failed to load preview tenant modules:", error)
        setEnabledModules(null)
      } finally {
        setIsModulesLoading(false)
      }
      return
    }
    if (!tenantId || isOwner) {
      setEnabledModules(null)
      return
    }
    setIsModulesLoading(true)
    try {
      const response = await fetch("/api/tenant-modules", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load tenant modules")
      }
      if (Array.isArray(data.modules)) {
        setEnabledModules(data.modules.map((module: string) => String(module)))
      } else {
        setEnabledModules(null)
      }
    } catch (error) {
      console.error("Failed to load tenant modules:", error)
      setEnabledModules(null)
    } finally {
      setIsModulesLoading(false)
    }
  }, [isOwner, isPreviewMode, previewTenantId, tenantId])

  useEffect(() => {
    loadTenantModules()
  }, [loadTenantModules])

  const loadLocations = useCallback(async () => {
    if (!tenantId) return
    try {
      const endpoint =
        isPreviewMode && previewTenantId
          ? `/api/locations?tenantId=${encodeURIComponent(previewTenantId)}`
          : "/api/locations"
      const response = await fetch(endpoint)
      const data = await response.json()
      const loaded = Array.isArray(data.locations) ? data.locations : []
      setLocations(loaded)
    } catch (error) {
      console.error("Failed to load locations:", error)
    }
  }, [isPreviewMode, previewTenantId, tenantId])

  useEffect(() => {
    loadLocations()
  }, [loadLocations])

  useEffect(() => {
    if (!tenantId) return
    if (activeTab !== "accounts" && activeTab !== "billing" && activeTab !== "balance-sheet") {
      setAccountsTotalsLoading(false)
      return
    }

    let isActive = true
    const fetchAccountsTotals = async () => {
      try {
        setAccountsTotalsLoading(true)
        const params = new URLSearchParams({
          startDate: currentFiscalYear.startDate,
          endDate: currentFiscalYear.endDate,
        })
        const response = await fetch(`/api/accounts-totals?${params.toString()}`)
        const data = await response.json()

        if (!response.ok || !data.success) {
          console.error("Failed to load accounts totals:", data)
          if (isActive) {
            setAccountsTotals({ laborTotal: 0, otherTotal: 0, grandTotal: 0 })
          }
          return
        }

        if (isActive) {
          setAccountsTotals({
            laborTotal: Number(data.laborTotal) || 0,
            otherTotal: Number(data.otherTotal) || 0,
            grandTotal: Number(data.grandTotal) || 0,
          })
        }
      } catch (error) {
        console.error("Error loading accounts totals:", error)
        if (isActive) {
          setAccountsTotals({ laborTotal: 0, otherTotal: 0, grandTotal: 0 })
        }
      } finally {
        if (isActive) {
          setAccountsTotalsLoading(false)
        }
      }
    }

    fetchAccountsTotals()

    return () => {
      isActive = false
    }
  }, [activeTab, currentFiscalYear.endDate, currentFiscalYear.startDate, tenantId])

  useEffect(() => {
    if (selectedLocationId !== LOCATION_ALL) {
      setTransactionLocationId(selectedLocationId)
    }
  }, [selectedLocationId])

  useEffect(() => {
    if (
      transactionLocationId !== LOCATION_UNASSIGNED &&
      transactionLocationId !== LOCATION_ALL &&
      !locations.find((loc) => loc.id === transactionLocationId)
    ) {
      setTransactionLocationId(LOCATION_UNASSIGNED)
    }
  }, [locations, transactionLocationId])

  // load initial data
  const refreshData = useCallback(async (force = false) => {
    if (!tenantId) {
      return
    }
    try {
      setLoading(true)
      setSyncError(null)
      const locationQuery = selectedLocationId !== LOCATION_ALL ? `?locationId=${encodeURIComponent(selectedLocationId)}` : ""
      const inventoryUrl = `${API_INVENTORY}${locationQuery}`
      const transactionsUrl = `${API_TRANSACTIONS}?limit=100${selectedLocationId !== LOCATION_ALL ? `&locationId=${encodeURIComponent(selectedLocationId)}` : ""}`
      const shouldFetchTransactions = isOwner || !enabledModules || enabledModules.includes("transactions")
      // fetch inventory and transactions in parallel
      const [invRes, txRes] = await Promise.all([
        fetch(inventoryUrl),
        shouldFetchTransactions ? fetch(transactionsUrl) : Promise.resolve(null),
      ])

      if (!invRes.ok) {
        const err = await invRes.json().catch(() => ({}))
        setSyncError(err?.message || "Failed to fetch inventory")
      } else {
        const invJson = await invRes.json()
        setInventory(invJson.items || invJson.inventory || [])
        if (invJson.summary) {
          setSummary(invJson.summary)
        }
      }

      if (!txRes) {
        setTransactions([])
      } else if (!txRes.ok) {
        const err = await txRes.json().catch(() => ({}))
        setSyncError((prev) => prev ? prev + "; " + (err?.message || "Failed transactions") : (err?.message || "Failed transactions"))
      } else {
        const txJson = await txRes.json()
        setTransactions(txJson.transactions || [])
      }

      setLastSync(new Date())
      setLoading(false)
    } catch (error: any) {
      setLoading(false)
      setSyncError(error.message || "Unexpected error during sync")
      console.error("refreshData error:", error)
    }
  }, [enabledModules, isOwner, selectedLocationId, tenantId])

  useEffect(() => {
    if (!tenantId) return
    refreshData()
  }, [tenantId, refreshData])

  const loadOnboardingStatus = useCallback(async () => {
    if (!tenantId || isOwner) {
      return
    }
    setIsOnboardingLoading(true)
    setOnboardingError(null)
    try {
      const locationsEndpoint =
        isPreviewMode && previewTenantId
          ? `/api/locations?tenantId=${encodeURIComponent(previewTenantId)}`
          : "/api/locations"
      const results = await Promise.allSettled([
        fetch(locationsEndpoint),
        fetch("/api/inventory-neon"),
        fetch("/api/processing-records?limit=1&offset=0"),
        fetch("/api/dispatch?limit=1&offset=0"),
        fetch("/api/sales?limit=1&offset=0"),
      ])

      const parseJson = async (result: PromiseSettledResult<Response>) => {
        if (result.status !== "fulfilled") {
          return null
        }
        const response = result.value
        if (!response.ok) {
          return null
        }
        try {
          return await response.json()
        } catch {
          return null
        }
      }

      const locationsData = await parseJson(results[0])
      const inventoryData = await parseJson(results[1])
      const processingData = await parseJson(results[2])
      const dispatchData = await parseJson(results[3])
      const salesData = await parseJson(results[4])

      const hasLocations = Array.isArray(locationsData?.locations) && locationsData.locations.length > 0
      const processingCount = Number(processingData?.totalCount) || (Array.isArray(processingData?.records) ? processingData.records.length : 0)
      const dispatchCount = Number(dispatchData?.totalCount) || (Array.isArray(dispatchData?.records) ? dispatchData.records.length : 0)
      const salesCount = Number(salesData?.totalCount) || (Array.isArray(salesData?.records) ? salesData.records.length : 0)
      const hasInventory =
        Number(inventoryData?.summary?.total_items) > 0 ||
        (Array.isArray(inventoryData?.inventory) && inventoryData.inventory.length > 0) ||
        (Array.isArray(inventoryData?.items) && inventoryData.items.length > 0)

      setOnboardingStatus({
        locations: hasLocations,
        inventory: hasInventory,
        processing: processingCount > 0,
        dispatch: dispatchCount > 0,
        sales: salesCount > 0,
      })

      const hasError = results.some(
        (result) => result.status === "rejected" || (result.status === "fulfilled" && !result.value.ok),
      )
      if (hasError) {
        setOnboardingError("Some checklist data could not be loaded. Refresh to try again.")
      }
    } catch (error: any) {
      setOnboardingError(error?.message || "Failed to load setup checklist.")
    } finally {
      setIsOnboardingLoading(false)
    }
  }, [isOwner, isPreviewMode, previewTenantId, tenantId])

  useEffect(() => {
    if (!tenantId || isOwner) return
    loadOnboardingStatus()
  }, [tenantId, isOwner, loadOnboardingStatus])

  const handleCreateLocation = async () => {
    if (!newLocationName.trim()) {
      toast({
        title: "Location name required",
        description: "Enter a location name to continue.",
        variant: "destructive",
      })
      return
    }

    setIsCreatingLocation(true)
    try {
      const response = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newLocationName.trim(),
          code: newLocationCode.trim() || undefined,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create location")
      }

      toast({
        title: "Location added",
        description: `${data.location?.name || newLocationName.trim()} is ready.`,
      })
      setNewLocationName("")
      setNewLocationCode("")
      loadLocations()
      loadOnboardingStatus()
    } catch (error: any) {
      toast({
        title: "Failed to add location",
        description: error?.message || "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsCreatingLocation(false)
    }
  }

  const handleLogout = async () => {
    if (typeof document !== "undefined") {
      document.cookie = `${PREVIEW_TENANT_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
    }
    await logout()
    router.push("/")
  }

  const toggleInventorySort = () => {
    if (inventorySortOrder === null) setInventorySortOrder("asc")
    else if (inventorySortOrder === "asc") setInventorySortOrder("desc")
    else setInventorySortOrder(null)
  }

  const toggleTransactionSort = () => {
    setTransactionSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))
  }

  const locationMap = useMemo(() => {
    return new Map(locations.map((loc) => [loc.id, loc]))
  }, [locations])

  const resolveLocationLabel = useCallback(
    (locationId?: string | null, fallback?: string) => {
      if (!locationId) return UNASSIGNED_LABEL
      const location = locationMap.get(locationId)
      if (location) {
        return location.name || location.code || "Unknown"
      }
      if (fallback) return fallback
      return "Unknown"
    },
    [locationMap],
  )

  const selectedLocationLabel = useMemo(() => {
    if (selectedLocationId === LOCATION_ALL) return "All locations"
    if (selectedLocationId === LOCATION_UNASSIGNED) return UNASSIGNED_LABEL
    return resolveLocationLabel(selectedLocationId)
  }, [selectedLocationId, resolveLocationLabel])

  // computed lists
  const activeItemTypesForDropdown = Array.from(new Set(inventory.filter((i) => i.quantity > 0).map((i) => i.name))).sort()
  const allItemTypesForDropdown = Array.from(new Set([...inventory.map((i) => i.name), ...transactions.map((t) => t.item_type)])).sort().filter(Boolean)

  const filteredAndSortedInventory = inventory
    .filter((item) => item.name && item.name.toLowerCase().includes(inventorySearchTerm.toLowerCase()))
    .sort((a, b) => {
      if (!a.name || !b.name) return 0
      if (inventorySortOrder === "asc") return a.name.localeCompare(b.name)
      if (inventorySortOrder === "desc") return b.name.localeCompare(a.name)
      return 0
    })

  const transactionPricing = useMemo(() => {
    const agg: Record<string, { totalCost: number; totalQty: number }> = {}
    transactions.forEach((tx) => {
      const itemName = String(tx.item_type || "").trim()
      if (!itemName) return
      const qty = Number(tx.quantity) || 0
      if (!Number.isFinite(qty) || qty <= 0) return
      const priceValue = Number(tx.price)
      const totalCostValue = Number(tx.total_cost)
      let unitPrice = 0
      if (Number.isFinite(priceValue) && priceValue > 0) {
        unitPrice = priceValue
      } else if (Number.isFinite(totalCostValue) && totalCostValue > 0) {
        unitPrice = totalCostValue / qty
      }
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) return
      const existing = agg[itemName] || { totalCost: 0, totalQty: 0 }
      existing.totalCost += unitPrice * qty
      existing.totalQty += qty
      agg[itemName] = existing
    })

    const pricing: Record<string, { avgPrice: number; totalCost: number }> = {}
    Object.entries(agg).forEach(([itemName, data]) => {
      const avgPrice = data.totalQty > 0 ? data.totalCost / data.totalQty : 0
      pricing[itemName] = { avgPrice, totalCost: data.totalCost }
    })
    return pricing
  }, [transactions])

  const hasLegacyUnassignedTransactions = useMemo(
    () => transactions.some((t) => !t.location_id),
    [transactions],
  )

  const resolveItemValue = useCallback(
    (item: InventoryItem) => {
      const avgFromInventory = Number(item.avg_price) || 0
      const totalFromInventory = Number(item.total_cost) || 0
      const quantityValue = Number(item.quantity) || 0
      const avgFromTotal = totalFromInventory > 0 && quantityValue > 0 ? totalFromInventory / quantityValue : 0
      const fallback = transactionPricing[item.name] || { avgPrice: 0, totalCost: 0 }
      const avgPrice =
        avgFromInventory > 0 ? avgFromInventory : avgFromTotal > 0 ? avgFromTotal : fallback.avgPrice || 0
      const totalValue =
        totalFromInventory > 0 ? totalFromInventory : avgPrice * quantityValue
      return { avgPrice, totalValue }
    },
    [transactionPricing],
  )

  const resolvedInventoryValue = useMemo(() => {
    return inventory.reduce((sum, item) => {
      const valueInfo = resolveItemValue(item)
      return sum + (Number(valueInfo.totalValue) || 0)
    }, 0)
  }, [inventory, resolveItemValue])

  const filteredInventoryTotals = useMemo(() => {
    const totalQuantity = filteredAndSortedInventory.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
    const totalValue = filteredAndSortedInventory.reduce((sum, item) => {
      const valueInfo = resolveItemValue(item)
      return sum + (valueInfo.totalValue || 0)
    }, 0)
    const units = Array.from(new Set(filteredAndSortedInventory.map((item) => item.unit || "unit")))
    return {
      totalQuantity,
      totalValue,
      itemCount: filteredAndSortedInventory.length,
      unitLabel: units.length === 1 ? units[0] : "mixed units",
    }
  }, [filteredAndSortedInventory, resolveItemValue])

  const selectedInventoryDrilldownItem = useMemo(() => {
    if (!inventoryDrilldownItemName) return null
    return filteredAndSortedInventory.find((item) => item.name === inventoryDrilldownItemName) || null
  }, [filteredAndSortedInventory, inventoryDrilldownItemName])

  const selectedInventoryDrilldownValue = useMemo(() => {
    if (!selectedInventoryDrilldownItem) return null
    return resolveItemValue(selectedInventoryDrilldownItem)
  }, [selectedInventoryDrilldownItem, resolveItemValue])

  const recentDrilldownTransactions = useMemo(() => {
    if (!inventoryDrilldownItemName) return []
    return transactions
      .filter((tx) => String(tx.item_type || "").trim() === inventoryDrilldownItemName)
      .sort((a, b) => {
        const dateA = a.transaction_date ? parseCustomDateString(a.transaction_date) : null
        const dateB = b.transaction_date ? parseCustomDateString(b.transaction_date) : null
        return (dateB?.getTime() || 0) - (dateA?.getTime() || 0)
      })
      .slice(0, 6)
  }, [transactions, inventoryDrilldownItemName])

  useEffect(() => {
    if (!inventoryDrilldownItemName) return
    const stillVisible = filteredAndSortedInventory.some((item) => item.name === inventoryDrilldownItemName)
    if (!stillVisible) {
      setInventoryDrilldownItemName("")
    }
  }, [filteredAndSortedInventory, inventoryDrilldownItemName])

  const formatCount = useCallback((value: number) => formatNumber(value, 0), [])
  const totalTransactions = transactions.length
  const unassignedTransactions = transactions.filter((t) => !t.location_id).length
  const unassignedLabel = `Unassigned moves: ${formatCount(unassignedTransactions)}`
  const bagWeightValue = Number(tenantSettings.bagWeightKg || 50)
  const bagWeightLabel = `Standard bag weight: ${formatNumber(bagWeightValue, 0)} kg`
  const recentActivityLabel = `24h activity: ${formatCount(estateMetrics.recentActivity)}`

  type HeroChip = { icon: React.ElementType; label: string; metricValue?: number | null }
  type HeroStat = { label: string; value: string; subValue?: string; metricValue?: number | null }
  type HeroContent = {
    badge: string
    title: string
    description: string
    chips: HeroChip[]
    stats: HeroStat[]
  }

  const filterEmptyMetrics = useCallback(
    <T extends { metricValue?: number | null }>(items: T[]) => {
      if (!hideEmptyMetrics) return items
      const filtered = items.filter((item) => item.metricValue === undefined || item.metricValue === null || item.metricValue !== 0)
      return filtered.length ? filtered : items
    },
    [hideEmptyMetrics],
  )

  const heroContent: HeroContent = useMemo(() => {
    const inventoryValueStat: HeroStat = {
      label: "Inventory value",
      value: formatCurrency(resolvedInventoryValue, 0),
      metricValue: resolvedInventoryValue,
    }
    const activeLocationsStat: HeroStat = {
      label: "Active locations",
      value: formatCount(estateMetrics.locationCount),
      metricValue: estateMetrics.locationCount,
    }
    const recentActivityStat: HeroStat = {
      label: "24h activity",
      value: formatCount(estateMetrics.recentActivity),
      metricValue: estateMetrics.recentActivity,
    }
    const unassignedStat: HeroStat = {
      label: "Unassigned moves",
      value: formatCount(unassignedTransactions),
      metricValue: unassignedTransactions,
    }
    const totalTransactionsStat: HeroStat = {
      label: "Total transactions",
      value: formatCount(totalTransactions),
      metricValue: totalTransactions,
    }
    const bagWeightStat: HeroStat = {
      label: "Bag weight (kg)",
      value: formatNumber(bagWeightValue, 0),
      metricValue: bagWeightValue,
    }
    const exceptionsStat: HeroStat = {
      label: "Exceptions",
      value: formatCount(exceptionsSummary.count),
      metricValue: exceptionsSummary.count,
    }
    const availableStockUnit =
      filteredInventoryTotals.unitLabel === "mixed units" ? "units" : filteredInventoryTotals.unitLabel
    const availableStockValue = `${formatNumber(filteredInventoryTotals.totalQuantity, 0)} ${availableStockUnit}`
    const availableStockStat: HeroStat = {
      label: "Available to use",
      value: availableStockValue,
      metricValue: filteredInventoryTotals.totalQuantity,
    }

    const inventoryStats: HeroStat[] = [
      inventoryValueStat,
      availableStockStat,
      exceptionsStat,
    ]

    const transactionStats: HeroStat[] = [
      totalTransactionsStat,
      unassignedStat,
      recentActivityStat,
    ]

    const arabicaProcessingStat: HeroStat = {
      label: "Arabica total",
      value: processingTotals.loading ? "Loading..." : `${formatNumber(processingTotals.arabicaKg, 0)} kg`,
      subValue: processingTotals.loading ? undefined : `${formatNumber(processingTotals.arabicaBags, 0)} bags`,
      metricValue: processingTotals.loading ? null : processingTotals.arabicaKg,
    }
    const robustaProcessingStat: HeroStat = {
      label: "Robusta total",
      value: processingTotals.loading ? "Loading..." : `${formatNumber(processingTotals.robustaKg, 0)} kg`,
      subValue: processingTotals.loading ? undefined : `${formatNumber(processingTotals.robustaBags, 0)} bags`,
      metricValue: processingTotals.loading ? null : processingTotals.robustaKg,
    }

    const processingTotalsStats: HeroStat[] = [
      arabicaProcessingStat,
      robustaProcessingStat,
      activeLocationsStat,
    ]

    const curingStats: HeroStat[] = [
      {
        label: "Curing output",
        value: curingHeroTotals.loading
          ? "Loading..."
          : curingHeroTotals.error
            ? "Unavailable"
            : `${formatNumber(curingHeroTotals.totalOutputKg, 0)} kg`,
        metricValue: curingHeroTotals.loading || curingHeroTotals.error ? null : curingHeroTotals.totalOutputKg,
      },
      {
        label: "Avg drying days",
        value: curingHeroTotals.loading
          ? "Loading..."
          : curingHeroTotals.error
            ? "Unavailable"
            : formatNumber(curingHeroTotals.avgDryingDays, 1),
        metricValue: curingHeroTotals.loading || curingHeroTotals.error ? null : curingHeroTotals.avgDryingDays,
      },
      {
        label: "Avg moisture drop",
        value: curingHeroTotals.loading
          ? "Loading..."
          : curingHeroTotals.error
            ? "Unavailable"
            : `${formatNumber(curingHeroTotals.avgMoistureDrop, 1)}%`,
        metricValue: curingHeroTotals.loading || curingHeroTotals.error ? null : curingHeroTotals.avgMoistureDrop,
      },
    ]

    const qualityStats: HeroStat[] = [
      {
        label: "Lots graded",
        value: qualityHeroTotals.loading
          ? "Loading..."
          : qualityHeroTotals.error
            ? "Unavailable"
            : formatCount(qualityHeroTotals.totalRecords),
        metricValue: qualityHeroTotals.loading || qualityHeroTotals.error ? null : qualityHeroTotals.totalRecords,
      },
      {
        label: "Avg cup score",
        value: qualityHeroTotals.loading
          ? "Loading..."
          : qualityHeroTotals.error
            ? "Unavailable"
            : formatNumber(qualityHeroTotals.avgCupScore, 1),
        metricValue: qualityHeroTotals.loading || qualityHeroTotals.error ? null : qualityHeroTotals.avgCupScore,
      },
      {
        label: "Avg outturn",
        value: qualityHeroTotals.loading
          ? "Loading..."
          : qualityHeroTotals.error
            ? "Unavailable"
            : `${formatNumber(qualityHeroTotals.avgOutturnPct, 1)}%`,
        metricValue: qualityHeroTotals.loading || qualityHeroTotals.error ? null : qualityHeroTotals.avgOutturnPct,
      },
    ]

    const pepperConversionPct = pepperHeroTotals.totalPickedKg > 0
      ? (pepperHeroTotals.totalDryKg / pepperHeroTotals.totalPickedKg) * 100
      : 0
    const pepperDryPercent = pepperHeroTotals.avgDryPercent > 0 ? pepperHeroTotals.avgDryPercent : pepperConversionPct
    const pepperStats: HeroStat[] = [
      {
        label: "Picked weight",
        value: pepperHeroTotals.loading
          ? "Loading..."
          : pepperHeroTotals.error
            ? "Unavailable"
            : `${formatNumber(pepperHeroTotals.totalPickedKg, 0)} kg`,
        metricValue: pepperHeroTotals.loading || pepperHeroTotals.error ? null : pepperHeroTotals.totalPickedKg,
      },
      {
        label: "Dry pepper",
        value: pepperHeroTotals.loading
          ? "Loading..."
          : pepperHeroTotals.error
            ? "Unavailable"
            : `${formatNumber(pepperHeroTotals.totalDryKg, 0)} kg`,
        metricValue: pepperHeroTotals.loading || pepperHeroTotals.error ? null : pepperHeroTotals.totalDryKg,
      },
      {
        label: "Dry conversion",
        value: pepperHeroTotals.loading
          ? "Loading..."
          : pepperHeroTotals.error
            ? "Unavailable"
            : `${formatNumber(pepperDryPercent, 1)}%`,
        metricValue: pepperHeroTotals.loading || pepperHeroTotals.error ? null : pepperDryPercent,
      },
    ]

    const showRainfallMetrics = isModuleEnabled("rainfall")
    const latestRainLabel = rainfallHeroTotals.latestDate ? formatDate(rainfallHeroTotals.latestDate) : "No logs"
    const rainfallStats: HeroStat[] = showRainfallMetrics
      ? [
          {
            label: `Rainfall (${currentFiscalYear.label})`,
            value: rainfallHeroTotals.loading
              ? "Loading..."
              : rainfallHeroTotals.error
                ? "Unavailable"
                : `${formatNumber(rainfallHeroTotals.totalInches, 2)} in`,
            metricValue: rainfallHeroTotals.loading || rainfallHeroTotals.error ? null : rainfallHeroTotals.totalInches,
          },
          {
            label: "Rain logs",
            value: rainfallHeroTotals.loading
              ? "Loading..."
              : rainfallHeroTotals.error
                ? "Unavailable"
                : formatCount(rainfallHeroTotals.totalRecords),
            metricValue: rainfallHeroTotals.loading || rainfallHeroTotals.error ? null : rainfallHeroTotals.totalRecords,
          },
          {
            label: "Latest rain log",
            value: rainfallHeroTotals.loading ? "Loading..." : rainfallHeroTotals.error ? "Unavailable" : latestRainLabel,
            metricValue: rainfallHeroTotals.loading || rainfallHeroTotals.error ? null : rainfallHeroTotals.totalRecords,
          },
        ]
      : [
          { label: "Forecast horizon", value: "8 days", metricValue: 8 },
          activeLocationsStat,
          recentActivityStat,
        ]

    const weatherStats: HeroStat[] = [
      { label: "Forecast horizon", value: "8 days", metricValue: 8 },
      {
        label: "Rain logs (FY)",
        value: showRainfallMetrics ? formatCount(rainfallHeroTotals.totalRecords) : "Unavailable",
        metricValue: showRainfallMetrics ? rainfallHeroTotals.totalRecords : null,
      },
      activeLocationsStat,
    ]

    const dispatchArabicaValue = dispatchHeroTotals.loading
      ? "Loading..."
      : dispatchHeroTotals.error
        ? "Unavailable"
        : `${formatNumber(dispatchHeroTotals.arabicaKgs, 0)} kg`
    const dispatchRobustaValue = dispatchHeroTotals.loading
      ? "Loading..."
      : dispatchHeroTotals.error
        ? "Unavailable"
        : `${formatNumber(dispatchHeroTotals.robustaKgs, 0)} kg`
    const dispatchTotalReceivedKgs = dispatchHeroTotals.arabicaKgs + dispatchHeroTotals.robustaKgs
    const salesTotalSoldKgs = salesHeroTotals.arabicaKgs + salesHeroTotals.robustaKgs
    const saleableKgs = Math.max(0, dispatchTotalReceivedKgs - salesTotalSoldKgs)
    const overdrawnKgs = Math.max(0, salesTotalSoldKgs - dispatchTotalReceivedKgs)
    const dispatchArabicaStat: HeroStat = {
      label: "Arabica received",
      value: dispatchArabicaValue,
      subValue: dispatchHeroTotals.loading ? undefined : `${formatNumber(dispatchHeroTotals.arabicaBags, 0)} bags dispatched`,
      metricValue: dispatchHeroTotals.loading || dispatchHeroTotals.error ? null : dispatchHeroTotals.arabicaKgs,
    }
    const dispatchRobustaStat: HeroStat = {
      label: "Robusta received",
      value: dispatchRobustaValue,
      subValue: dispatchHeroTotals.loading ? undefined : `${formatNumber(dispatchHeroTotals.robustaBags, 0)} bags dispatched`,
      metricValue: dispatchHeroTotals.loading || dispatchHeroTotals.error ? null : dispatchHeroTotals.robustaKgs,
    }
    const dispatchEntriesStat: HeroStat = {
      label: "Dispatch entries",
      value: dispatchHeroTotals.loading
        ? "Loading..."
        : dispatchHeroTotals.error
          ? "Unavailable"
          : formatCount(dispatchHeroTotals.totalDispatches),
      metricValue: dispatchHeroTotals.loading || dispatchHeroTotals.error ? null : dispatchHeroTotals.totalDispatches,
    }
    const dispatchStats: HeroStat[] = [
      dispatchArabicaStat,
      dispatchRobustaStat,
      dispatchEntriesStat,
    ]

    const salesArabicaValue = salesHeroTotals.loading
      ? "Loading..."
      : salesHeroTotals.error
        ? "Unavailable"
        : `${formatNumber(salesHeroTotals.arabicaKgs, 0)} kg`
    const salesRobustaValue = salesHeroTotals.loading
      ? "Loading..."
      : salesHeroTotals.error
        ? "Unavailable"
        : `${formatNumber(salesHeroTotals.robustaKgs, 0)} kg`
    const salesArabicaStat: HeroStat = {
      label: "Arabica sold",
      value: salesArabicaValue,
      subValue: salesHeroTotals.loading ? undefined : `${formatNumber(salesHeroTotals.arabicaBags, 0)} bags sold`,
      metricValue: salesHeroTotals.loading || salesHeroTotals.error ? null : salesHeroTotals.arabicaKgs,
    }
    const salesRobustaStat: HeroStat = {
      label: "Robusta sold",
      value: salesRobustaValue,
      subValue: salesHeroTotals.loading ? undefined : `${formatNumber(salesHeroTotals.robustaBags, 0)} bags sold`,
      metricValue: salesHeroTotals.loading || salesHeroTotals.error ? null : salesHeroTotals.robustaKgs,
    }
    const salesAvailabilityStat: HeroStat = {
      label: overdrawnKgs > 0 ? "Overdrawn" : "Saleable stock",
      value: salesHeroTotals.loading || dispatchHeroTotals.loading
        ? "Loading..."
        : salesHeroTotals.error || dispatchHeroTotals.error
          ? "Unavailable"
          : `${formatNumber(overdrawnKgs > 0 ? overdrawnKgs : saleableKgs, 0)} kg`,
      subValue:
        salesHeroTotals.loading || dispatchHeroTotals.loading
          ? undefined
          : overdrawnKgs > 0
            ? "Sold exceeds dispatch-received KGs"
            : "Dispatch received KGs minus sold KGs",
      metricValue:
        salesHeroTotals.loading || dispatchHeroTotals.loading ? null : overdrawnKgs > 0 ? overdrawnKgs : saleableKgs,
    }
    const salesStats: HeroStat[] = [
      salesArabicaStat,
      salesRobustaStat,
      salesAvailabilityStat,
    ]

    const accountsStats: HeroStat[] = [
      {
        label: "FY total spend",
        value: accountsTotalsLoading ? "Loading..." : formatCurrency(accountsTotals.grandTotal, 0),
        metricValue: accountsTotalsLoading ? null : accountsTotals.grandTotal,
      },
      {
        label: "FY labor spend",
        value: accountsTotalsLoading ? "Loading..." : formatCurrency(accountsTotals.laborTotal, 0),
        metricValue: accountsTotalsLoading ? null : accountsTotals.laborTotal,
      },
      {
        label: "FY other expenses",
        value: accountsTotalsLoading ? "Loading..." : formatCurrency(accountsTotals.otherTotal, 0),
        metricValue: accountsTotalsLoading ? null : accountsTotals.otherTotal,
      },
    ]

    const balanceNetBooked = salesHeroTotals.totalRevenue - accountsTotals.grandTotal
    const balanceLivePosition = balanceNetBooked + receivablesHeroTotals.totalOutstanding
    const balanceSheetStats: HeroStat[] = [
      {
        label: "Booked inflow",
        value: salesHeroTotals.loading ? "Loading..." : formatCurrency(salesHeroTotals.totalRevenue, 0),
        metricValue: salesHeroTotals.loading || salesHeroTotals.error ? null : salesHeroTotals.totalRevenue,
      },
      {
        label: "Booked outflow",
        value: accountsTotalsLoading ? "Loading..." : formatCurrency(accountsTotals.grandTotal, 0),
        metricValue: accountsTotalsLoading ? null : accountsTotals.grandTotal,
      },
      {
        label: "Live position",
        value:
          accountsTotalsLoading || receivablesHeroTotals.loading || salesHeroTotals.loading
            ? "Loading..."
            : formatCurrency(balanceLivePosition, 0),
        metricValue:
          accountsTotalsLoading || receivablesHeroTotals.loading || salesHeroTotals.loading
            ? null
            : balanceLivePosition,
      },
    ]

    const receivablesStats: HeroStat[] = [
      {
        label: "Total invoiced",
        value: receivablesHeroTotals.loading
          ? "Loading..."
          : receivablesHeroTotals.error
            ? "Unavailable"
            : formatCurrency(receivablesHeroTotals.totalInvoiced, 0),
        metricValue:
          receivablesHeroTotals.loading || receivablesHeroTotals.error ? null : receivablesHeroTotals.totalInvoiced,
      },
      {
        label: "Outstanding",
        value: receivablesHeroTotals.loading
          ? "Loading..."
          : receivablesHeroTotals.error
            ? "Unavailable"
            : formatCurrency(receivablesHeroTotals.totalOutstanding, 0),
        metricValue:
          receivablesHeroTotals.loading || receivablesHeroTotals.error ? null : receivablesHeroTotals.totalOutstanding,
      },
      {
        label: "Overdue",
        value: receivablesHeroTotals.loading
          ? "Loading..."
          : receivablesHeroTotals.error
            ? "Unavailable"
            : formatCurrency(receivablesHeroTotals.totalOverdue, 0),
        metricValue: receivablesHeroTotals.loading || receivablesHeroTotals.error ? null : receivablesHeroTotals.totalOverdue,
      },
    ]

    const chipsInventory: HeroChip[] = [
      { icon: Leaf, label: bagWeightLabel, metricValue: bagWeightValue },
      { icon: History, label: recentActivityLabel, metricValue: estateMetrics.recentActivity },
    ]

    const chipsTransactions: HeroChip[] = [
      { icon: History, label: recentActivityLabel, metricValue: estateMetrics.recentActivity },
      { icon: AlertTriangle, label: unassignedLabel, metricValue: unassignedTransactions },
    ]

    const salesBagsTotal = salesHeroTotals.arabicaBags + salesHeroTotals.robustaBags
    const dispatchBagsTotal = dispatchHeroTotals.arabicaBags + dispatchHeroTotals.robustaBags
    const chipsSales: HeroChip[] = [
      {
        icon: TrendingUp,
        label: salesHeroTotals.loading
          ? "Sales totals loading..."
          : salesHeroTotals.error
            ? "Sales totals unavailable"
            : `Sales entries: ${formatCount(salesHeroTotals.totalSales)}`,
        metricValue: salesHeroTotals.loading || salesHeroTotals.error ? null : salesHeroTotals.totalSales,
      },
      {
        icon: Receipt,
        label:
          salesHeroTotals.loading || dispatchHeroTotals.loading
            ? "Saleable stock loading..."
            : salesHeroTotals.error || dispatchHeroTotals.error
              ? "Saleable stock unavailable"
              : overdrawnKgs > 0
                ? `Overdrawn by ${formatNumber(overdrawnKgs, 0)} kg`
                : `Saleable now: ${formatNumber(saleableKgs, 0)} kg`,
        metricValue:
          salesHeroTotals.loading || dispatchHeroTotals.loading || salesHeroTotals.error || dispatchHeroTotals.error
            ? null
            : overdrawnKgs > 0
              ? overdrawnKgs
              : saleableKgs,
      },
    ]

    const chipsProcessing: HeroChip[] = [
      { icon: Factory, label: "Processing keeps yields consistent", metricValue: null },
      { icon: History, label: recentActivityLabel, metricValue: estateMetrics.recentActivity },
    ]

    const chipsCuring: HeroChip[] = [
      {
        icon: Factory,
        label: curingHeroTotals.loading
          ? "Curing totals loading..."
          : curingHeroTotals.error
            ? "Curing totals unavailable"
            : `Curing entries: ${formatCount(curingHeroTotals.totalRecords)}`,
        metricValue: curingHeroTotals.loading || curingHeroTotals.error ? null : curingHeroTotals.totalRecords,
      },
      {
        icon: CheckCircle2,
        label: curingHeroTotals.loading
          ? "Moisture trend loading..."
          : curingHeroTotals.error
            ? "Moisture trend unavailable"
            : `Avg moisture drop: ${formatNumber(curingHeroTotals.avgMoistureDrop, 1)}%`,
        metricValue: curingHeroTotals.loading || curingHeroTotals.error ? null : curingHeroTotals.avgMoistureDrop,
      },
    ]

    const chipsQuality: HeroChip[] = [
      {
        icon: CheckCircle2,
        label: qualityHeroTotals.loading
          ? "Quality totals loading..."
          : qualityHeroTotals.error
            ? "Quality totals unavailable"
            : `Quality entries: ${formatCount(qualityHeroTotals.totalRecords)}`,
        metricValue: qualityHeroTotals.loading || qualityHeroTotals.error ? null : qualityHeroTotals.totalRecords,
      },
      {
        icon: AlertTriangle,
        label: qualityHeroTotals.loading
          ? "Defect trend loading..."
          : qualityHeroTotals.error
            ? "Defect trend unavailable"
            : `Avg defects: ${formatNumber(qualityHeroTotals.avgDefects, 1)}`,
        metricValue: qualityHeroTotals.loading || qualityHeroTotals.error ? null : qualityHeroTotals.avgDefects,
      },
    ]

    const chipsDispatch: HeroChip[] = [
      {
        icon: Truck,
        label: dispatchHeroTotals.loading
          ? "Dispatch totals loading..."
          : dispatchHeroTotals.error
            ? "Dispatch totals unavailable"
            : `Dispatch entries: ${formatCount(dispatchHeroTotals.totalDispatches)}`,
        metricValue: dispatchHeroTotals.loading || dispatchHeroTotals.error ? null : dispatchHeroTotals.totalDispatches,
      },
      {
        icon: Factory,
        label: dispatchHeroTotals.loading
          ? "Dispatch volume loading..."
          : dispatchHeroTotals.error
            ? "Dispatch volume unavailable"
            : `Received for sales: ${formatNumber(dispatchTotalReceivedKgs, 0)} kg`,
        metricValue: dispatchHeroTotals.loading || dispatchHeroTotals.error ? null : dispatchTotalReceivedKgs,
      },
    ]

    const chipsRainfall: HeroChip[] = showRainfallMetrics
      ? [
          {
            icon: CloudRain,
            label: rainfallHeroTotals.loading
              ? "Rainfall totals loading..."
              : rainfallHeroTotals.error
                ? "Rainfall totals unavailable"
                : `Rain logs: ${formatCount(rainfallHeroTotals.totalRecords)}`,
            metricValue: rainfallHeroTotals.loading || rainfallHeroTotals.error ? null : rainfallHeroTotals.totalRecords,
          },
          {
            icon: CloudRain,
            label: rainfallHeroTotals.loading
              ? "Latest rain loading..."
              : rainfallHeroTotals.error
                ? "Latest rain unavailable"
                : `Latest log: ${latestRainLabel}`,
            metricValue: rainfallHeroTotals.loading || rainfallHeroTotals.error ? null : rainfallHeroTotals.totalRecords,
          },
        ]
      : [
          { icon: CloudRain, label: "Forecast source: Weather API", metricValue: null },
          { icon: Leaf, label: "Use weather context for field planning", metricValue: null },
        ]

    const chipsPepper: HeroChip[] = [
      {
        icon: Leaf,
        label: pepperHeroTotals.loading
          ? "Pepper totals loading..."
          : pepperHeroTotals.error
            ? "Pepper totals unavailable"
            : `Pepper entries: ${formatCount(pepperHeroTotals.totalRecords)}`,
        metricValue: pepperHeroTotals.loading || pepperHeroTotals.error ? null : pepperHeroTotals.totalRecords,
      },
      {
        icon: TrendingUp,
        label: pepperHeroTotals.loading
          ? "Conversion loading..."
          : pepperHeroTotals.error
            ? "Conversion unavailable"
            : `Dry conversion: ${formatNumber(pepperDryPercent, 1)}%`,
        metricValue: pepperHeroTotals.loading || pepperHeroTotals.error ? null : pepperDryPercent,
      },
    ]

    const chipsAccounts: HeroChip[] = [
      { icon: Users, label: "Labor + expense logs stay audit-ready", metricValue: null },
      { icon: Receipt, label: `Tracking ${currentFiscalYear.label}`, metricValue: null },
    ]

    const chipsBalanceSheet: HeroChip[] = [
      {
        icon: TrendingUp,
        label:
          salesHeroTotals.loading || accountsTotalsLoading
            ? "Booked net loading..."
            : `Booked net: ${formatCurrency(balanceNetBooked, 0)}`,
        metricValue: salesHeroTotals.loading || accountsTotalsLoading ? null : balanceNetBooked,
      },
      {
        icon: Receipt,
        label: receivablesHeroTotals.loading
          ? "Live receivables loading..."
          : `Live receivables: ${formatCurrency(receivablesHeroTotals.totalOutstanding, 0)}`,
        metricValue: receivablesHeroTotals.loading ? null : receivablesHeroTotals.totalOutstanding,
      },
    ]

    const chipsReceivables: HeroChip[] = [
      {
        icon: Receipt,
        label: receivablesHeroTotals.loading
          ? "Receivables totals loading..."
          : receivablesHeroTotals.error
            ? "Receivables totals unavailable"
            : `Open invoices: ${formatCount(receivablesHeroTotals.totalCount)}`,
        metricValue: receivablesHeroTotals.loading || receivablesHeroTotals.error ? null : receivablesHeroTotals.totalCount,
      },
      {
        icon: AlertTriangle,
        label: receivablesHeroTotals.loading
          ? "Overdue balance loading..."
          : receivablesHeroTotals.error
            ? "Overdue balance unavailable"
            : `Overdue: ${formatCurrency(receivablesHeroTotals.totalOverdue, 0)}`,
        metricValue: receivablesHeroTotals.loading || receivablesHeroTotals.error ? null : receivablesHeroTotals.totalOverdue,
      },
    ]

    const journalStats: HeroStat[] = [
      activeLocationsStat,
      unassignedStat,
      recentActivityStat,
    ]

    const chipsJournal: HeroChip[] = [
      { icon: NotebookPen, label: "Daily notes stay searchable", metricValue: null },
      { icon: Leaf, label: "Fertilizer + spray history", metricValue: null },
    ]

    const activityStats: HeroStat[] = [
      exceptionsStat,
      recentActivityStat,
      activeLocationsStat,
    ]

    const chipsActivity: HeroChip[] = [
      { icon: History, label: "Tracks create, update, and delete events across modules", metricValue: null },
      { icon: CheckCircle2, label: "Use this before month-end reconciliation", metricValue: null },
    ]

    switch (activeTab) {
      case "home":
        return {
          badge: "Home Screen",
          title: "Estate command center",
          description: "See key highlights first, then open the module you want to work in.",
          chips: chipsInventory,
          stats: inventoryStats,
        }
      case "transactions":
        return {
          badge: "Traceability Log",
          title: "Audit-ready movements at a glance",
          description: "Review movements, pricing, and accountability in one place.",
          chips: chipsTransactions,
          stats: transactionStats,
        }
      case "processing":
        return {
          badge: "Processing Flow",
          title: "Daily processing, yield, and conversion",
          description: "Keep dispatch and sales aligned with real output.",
          chips: chipsProcessing,
          stats: processingTotalsStats,
        }
      case "dispatch":
        return {
          badge: "Dispatch Highlights",
          title: "Outbound bags and reconciliations",
          description: "Track what leaves the estate and what remains.",
          chips: chipsDispatch,
          stats: dispatchStats,
        }
      case "sales":
        return {
          badge: "Sales Highlights",
          title: "Revenue, buyers, and pricing",
          description: "Stay on top of pricing and inventory available to sell.",
          chips: chipsSales,
          stats: salesStats,
        }
      case "other-sales":
        return {
          badge: "Other Sales",
          title: "Side-crop revenue and contracts",
          description: "Track Pepper, Arecanut, Avocado, Coconut, and contract-based estate sales.",
          chips: [
            { icon: Leaf, label: "Use per-kg mode for PG/MV daily sales", metricValue: null },
            { icon: Receipt, label: "Use contract mode for lease or season contracts", metricValue: null },
          ],
          stats: [activeLocationsStat, recentActivityStat, unassignedStat],
        }
      case "curing":
        return {
          badge: "Curing & Drying",
          title: "Moisture drop and outturn in focus",
          description: "Track drying progress and protect quality.",
          chips: chipsCuring,
          stats: curingStats,
        }
      case "quality":
        return {
          badge: "Quality Checks",
          title: "Grading and defect signals",
          description: "Keep quality scores tied to each lot.",
          chips: chipsQuality,
          stats: qualityStats,
        }
      case "yield-forecast":
        return {
          badge: "Yield Forecast",
          title: "Season forecast from trend + rainfall",
          description: "Blend recent processing momentum with rainfall signals to project season-end dry output.",
          chips: [
            {
              icon: TrendingUp,
              label: processingTotals.loading
                ? "Processing trend loading..."
                : `Processing to date: ${formatNumber(processingTotals.arabicaKg + processingTotals.robustaKg, 0)} kg`,
              metricValue: processingTotals.loading ? null : processingTotals.arabicaKg + processingTotals.robustaKg,
            },
            {
              icon: CloudRain,
              label: rainfallHeroTotals.loading
                ? "Rainfall signal loading..."
                : rainfallHeroTotals.error
                  ? "Rainfall signal unavailable"
                  : `Rainfall logs this FY: ${formatCount(rainfallHeroTotals.totalRecords)}`,
              metricValue:
                rainfallHeroTotals.loading || rainfallHeroTotals.error ? null : rainfallHeroTotals.totalRecords,
            },
          ],
          stats: [
            {
              label: "Arabica processed",
              value: processingTotals.loading ? "Loading..." : `${formatNumber(processingTotals.arabicaKg, 0)} kg`,
              metricValue: processingTotals.loading ? null : processingTotals.arabicaKg,
            },
            {
              label: "Robusta processed",
              value: processingTotals.loading ? "Loading..." : `${formatNumber(processingTotals.robustaKg, 0)} kg`,
              metricValue: processingTotals.loading ? null : processingTotals.robustaKg,
            },
            {
              label: "Rainfall context",
              value:
                rainfallHeroTotals.loading || rainfallHeroTotals.error
                  ? "Unavailable"
                  : `${formatNumber(rainfallHeroTotals.totalInches, 2)} in`,
              metricValue:
                rainfallHeroTotals.loading || rainfallHeroTotals.error ? null : rainfallHeroTotals.totalInches,
            },
          ],
        }
      case "rainfall":
        return {
          badge: showRainfallMetrics ? "Rainfall Signals" : "Weather Signals",
          title: showRainfallMetrics ? "Weather context for yield swings" : "Forecast context for field planning",
          description: showRainfallMetrics
            ? "Link rainfall to processing and drying outcomes."
            : "Use short-term forecast context to plan drying and field operations.",
          chips: chipsRainfall,
          stats: rainfallStats,
        }
      case "pepper":
        return {
          badge: "Pepper Notes",
          title: "Pepper harvest and conversion",
          description: "Track green-to-dry conversion by location.",
          chips: chipsPepper,
          stats: pepperStats,
        }
      case "journal":
        return {
          badge: "Estate Journal",
          title: "Daily notes, searchable anytime",
          description: "Log fertilizers, sprays, irrigation, and observations.",
          chips: chipsJournal,
          stats: journalStats,
        }
      case "activity-log":
        return {
          badge: "Activity Log",
          title: "Who changed what, and when",
          description: "Cross-module timeline of create, update, and delete events.",
          chips: chipsActivity,
          stats: activityStats,
        }
      case "accounts":
        return {
          badge: "Accounts Overview",
          title: "Labor and expense logging",
          description: "Keep cost tracking tight and audit-ready.",
          chips: chipsAccounts,
          stats: accountsStats,
        }
      case "balance-sheet":
        return {
          badge: "Live Balance Sheet",
          title: "Estate cash position in one view",
          description: "See booked inflow/outflow and receivable-backed live position.",
          chips: chipsBalanceSheet,
          stats: balanceSheetStats,
        }
      case "receivables":
        return {
          badge: "Receivables Tracker",
          title: "Invoices, dues, and collections",
          description: "Stay on top of buyer payments and balances.",
          chips: chipsReceivables,
          stats: receivablesStats,
        }
      case "ai-analysis":
        return {
          badge: "AI Highlights",
          title: "Patterns and insights",
          description: "Run summaries to spot drift, waste, and opportunities.",
          chips: chipsTransactions,
          stats: transactionStats,
        }
      case "news":
        return {
          badge: "Market Watch",
          title: "Coffee market signals",
          description: "Stay aware of pricing and demand shifts.",
          chips: chipsSales,
          stats: salesStats,
        }
      case "weather":
        return {
          badge: "Weather Context",
          title: "Rainfall, drying, and readiness",
          description: "Daily signals that impact operations.",
          chips: chipsRainfall,
          stats: weatherStats,
        }
      case "billing":
        return {
          badge: "Billing Snapshot",
          title: "Invoices and GST-ready billing",
          description: "Track billing readiness and documentation.",
          chips: chipsAccounts,
          stats: accountsStats,
        }
      default:
        return {
          badge: "Estate Pulse",
          title: "Estate operations at a glance",
          description: "Track inventory, processing, and sales from one dashboard.",
          chips: chipsInventory,
          stats: inventoryStats,
        }
    }
  }, [
    activeTab,
    accountsTotals.grandTotal,
    accountsTotals.laborTotal,
    accountsTotals.otherTotal,
    accountsTotalsLoading,
    bagWeightLabel,
    bagWeightValue,
    currentFiscalYear.label,
    curingHeroTotals.avgDryingDays,
    curingHeroTotals.avgMoistureDrop,
    curingHeroTotals.error,
    curingHeroTotals.loading,
    curingHeroTotals.totalOutputKg,
    curingHeroTotals.totalRecords,
    dispatchHeroTotals.arabicaBags,
    dispatchHeroTotals.arabicaKgs,
    dispatchHeroTotals.error,
    dispatchHeroTotals.loading,
    dispatchHeroTotals.robustaBags,
    dispatchHeroTotals.robustaKgs,
    dispatchHeroTotals.totalDispatches,
    estateMetrics.locationCount,
    estateMetrics.recentActivity,
    exceptionsSummary.count,
    filteredInventoryTotals.totalQuantity,
    filteredInventoryTotals.unitLabel,
    formatCount,
    isModuleEnabled,
    processingTotals.arabicaKg,
    processingTotals.arabicaBags,
    processingTotals.loading,
    processingTotals.robustaKg,
    processingTotals.robustaBags,
    pepperHeroTotals.avgDryPercent,
    pepperHeroTotals.error,
    pepperHeroTotals.loading,
    pepperHeroTotals.totalDryKg,
    pepperHeroTotals.totalPickedKg,
    pepperHeroTotals.totalRecords,
    qualityHeroTotals.avgCupScore,
    qualityHeroTotals.avgDefects,
    qualityHeroTotals.avgOutturnPct,
    qualityHeroTotals.error,
    qualityHeroTotals.loading,
    qualityHeroTotals.totalRecords,
    rainfallHeroTotals.error,
    rainfallHeroTotals.latestDate,
    rainfallHeroTotals.loading,
    rainfallHeroTotals.totalInches,
    rainfallHeroTotals.totalRecords,
    receivablesHeroTotals.error,
    receivablesHeroTotals.loading,
    receivablesHeroTotals.totalCount,
    receivablesHeroTotals.totalInvoiced,
    receivablesHeroTotals.totalOutstanding,
    receivablesHeroTotals.totalOverdue,
    recentActivityLabel,
    resolvedInventoryValue,
    salesHeroTotals.arabicaBags,
    salesHeroTotals.arabicaKgs,
    salesHeroTotals.error,
    salesHeroTotals.loading,
    salesHeroTotals.robustaBags,
    salesHeroTotals.robustaKgs,
    salesHeroTotals.totalRevenue,
    salesHeroTotals.totalSales,
    totalTransactions,
    unassignedLabel,
    unassignedTransactions,
  ])

  const visibleHeroContent = useMemo(
    () => ({
      ...heroContent,
      chips: filterEmptyMetrics(heroContent.chips),
      stats: filterEmptyMetrics(heroContent.stats),
    }),
    [filterEmptyMetrics, heroContent],
  )

  const filteredTransactions = transactions
    .filter((t) => {
      if (!t) return false
      const passesFilterType = filterType === "All Types" || (t.item_type && t.item_type === filterType)
      if (!passesFilterType) return false
      const searchLower = transactionSearchTerm.toLowerCase()
      if (searchLower === "") return true
      const itemMatch = t.item_type ? t.item_type.toLowerCase().includes(searchLower) : false
      const notesMatch = t.notes ? t.notes.toLowerCase().includes(searchLower) : false
      const userMatch = t.user_id ? t.user_id.toLowerCase().includes(searchLower) : false
      const typeMatch = t.transaction_type ? t.transaction_type.toLowerCase().includes(searchLower) : false
      const locationMatch = resolveLocationLabel(t.location_id, t.location_name || t.location_code).toLowerCase().includes(searchLower)
      return itemMatch || notesMatch || userMatch || typeMatch || locationMatch
    })
    .sort((a, b) => {
      try {
        const dateA = a.transaction_date ? parseCustomDateString(a.transaction_date) : null
        const dateB = b.transaction_date ? parseCustomDateString(b.transaction_date) : null
        if (!dateA || !dateB) return 0
        if (transactionSortOrder === "asc") {
          return dateA.getTime() - dateB.getTime()
        }
        return dateB.getTime() - dateA.getTime()
      } catch (e) {
        console.error("Error sorting transactions by date:", e)
        return 0
      }
    })

  // pagination
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage)
  const validatedCurrentPage = Math.max(1, Math.min(currentPage, totalPages || 1))
  const startIndex = (validatedCurrentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, filteredTransactions.length)
  const currentTransactions = filteredTransactions.slice(startIndex, endIndex)

  useEffect(() => {
    if (currentPage !== validatedCurrentPage) {
      setCurrentPage(validatedCurrentPage)
    }
  }, [currentPage, validatedCurrentPage])

  // helpers for transaction object safety
  const ensureTransactionSafety = (transaction: Transaction | null): Transaction => {
    return {
      item_type: safeGet(transaction?.item_type, ""),
      quantity: safeGet(Number(transaction?.quantity), 0),
      transaction_type: safeGet(transaction?.transaction_type, "deplete"),
      notes: safeGet(transaction?.notes, ""),
      transaction_date: safeGet(transaction?.transaction_date, new Date().toISOString()),
      user_id: safeGet(transaction?.user_id, user?.username || "unknown"),
      price: safeGet(Number(transaction?.price), 0),
      total_cost: safeGet(Number(transaction?.total_cost), 0),
      unit: safeGet(transaction?.unit, "kg"),
      location_id: transaction?.location_id ?? null,
      location_name: transaction?.location_name ?? undefined,
      location_code: transaction?.location_code ?? undefined,
      id: transaction?.id,
    } as Transaction
  }

  const handleNewTransactionChange = (field: keyof Transaction, value: any) => {
    setNewTransaction((prev) => {
      const base = prev ? ensureTransactionSafety(prev) : createDefaultTransaction()
      const updated = { ...base, [field]: value } as Transaction
      // update derived fields
      updated.total_cost = (Number(updated.price) || 0) * (Number(updated.quantity) || 0)
      return updated
    })
  }

  const handleFieldChange = (field: keyof Transaction, value: any) => {
    handleNewTransactionChange(field, value)
  }

  // POST a transaction to the API
  const handleRecordTransaction = async () => {
    const tx = ensureTransactionSafety(newTransaction)
    if (!tx.item_type || !tx.transaction_type) {
      toast({ title: "Missing fields", description: "Please select item and transaction type.", variant: "destructive" })
      return
    }
    if (!tx.quantity || Number(tx.quantity) <= 0) {
      toast({ title: "Invalid quantity", description: "Quantity must be a positive number.", variant: "destructive" })
      return
    }

    const locationValue =
      transactionLocationId && transactionLocationId !== LOCATION_UNASSIGNED && transactionLocationId !== LOCATION_ALL
        ? transactionLocationId
        : null

    try {
      const res = await fetch(API_TRANSACTIONS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...tx, location_id: locationValue }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to record transaction")
      }
      toast({ title: "Transaction recorded", description: "Transaction saved successfully.", variant: "default" })
      // refresh after adding
      await refreshData(true)
      // reset
      setNewTransaction(createDefaultTransaction())
    } catch (error: any) {
      console.error("Record transaction error:", error)
      toast({ title: "Transaction failed", description: error.message || "Try again", variant: "destructive" })
    }
  }

  // Edit / Delete flows (simplified; use your route shapes as needed)
  const handleEditTransaction = (transaction: Transaction) => {
    const safe = ensureTransactionSafety(transaction)
    const normalizedType = String(safe.transaction_type || "").toLowerCase().includes("restock") ? "restock" : "deplete"
    setEditingTransaction({ ...safe, transaction_type: normalizedType })
    setIsEditDialogOpen(true)
  }

  const handleEditTransactionChange = (field: keyof Transaction, value: any) => {
    setEditingTransaction((prev) => {
      if (!prev) return prev
      const updated = { ...prev, [field]: value } as Transaction
      const qty = Number(updated.quantity) || 0
      const price = Number(updated.price) || 0
      updated.total_cost = qty * price
      return updated
    })
  }

  const handleUpdateTransaction = async () => {
    if (!editingTransaction) return
    const tx = ensureTransactionSafety(editingTransaction)
    if (!tx.item_type || !tx.transaction_type) {
      toast({ title: "Missing fields", description: "Item type and transaction type are required.", variant: "destructive" })
      return
    }
    if (!tx.quantity || Number(tx.quantity) <= 0) {
      toast({ title: "Invalid quantity", description: "Quantity must be a positive number.", variant: "destructive" })
      return
    }

    setIsSavingTransactionEdit(true)
    try {
      const res = await fetch("/api/transactions-neon/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...tx, location_id: tx.location_id ?? null }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to update transaction")
      }
      toast({ title: "Transaction updated", description: "Changes saved successfully.", variant: "default" })
      await refreshData(true)
      setIsEditDialogOpen(false)
      setEditingTransaction(null)
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message || "Try again", variant: "destructive" })
    } finally {
      setIsSavingTransactionEdit(false)
    }
  }

  const handleDeleteConfirm = (id?: number) => {
    if (!id) return
    setTransactionToDelete(id)
    setDeleteConfirmDialogOpen(true)
  }

  const handleDeleteTransaction = async () => {
    if (transactionToDelete == null) return
    try {
      const res = await fetch(`${API_TRANSACTIONS}/${transactionToDelete}`, { method: "DELETE" })
      const { json, text } = await parseJsonResponse(res)
      if (!res.ok || !json?.success) {
        const fallback =
          res.status === 401 || res.status === 403 ? "Not authorized to delete this transaction." : "Delete failed"
        throw new Error(json?.message || fallback || text)
      }
      toast({ title: "Transaction deleted", description: "Transaction removed.", variant: "default" })
      await refreshData(true)
    } catch (error: any) {
      toast({ title: "Deletion failed", description: error.message || "Try again", variant: "destructive" })
    } finally {
      setDeleteConfirmDialogOpen(false)
      setTransactionToDelete(null)
    }
  }

  const handleOpenInventoryEdit = (item: InventoryItem) => {
    if (selectedLocationId === LOCATION_ALL) {
      toast({
        title: "Select a location",
        description: "Choose a specific location before adjusting inventory quantities.",
        variant: "destructive",
      })
      return
    }
    setEditingInventoryItem(item)
    setInventoryEditForm({
      name: item.name || "",
      unit: item.unit || "kg",
      quantity: Number(item.quantity ?? 0).toString(),
    })
    const defaultLocation =
      selectedLocationId !== LOCATION_ALL
        ? selectedLocationId
        : transactionLocationId !== LOCATION_ALL
          ? transactionLocationId
          : LOCATION_UNASSIGNED
    setInventoryEditLocationId(defaultLocation)
    setIsInventoryEditDialogOpen(true)
  }

  const handleSaveInventoryEdit = async () => {
    if (!editingInventoryItem) return
    const originalName = editingInventoryItem.name
    const originalUnit = editingInventoryItem.unit || "kg"
    const originalQty = Number(editingInventoryItem.quantity) || 0
    const nextName = inventoryEditForm.name.trim()
    const nextUnit = inventoryEditForm.unit.trim() || originalUnit
    const nextQty = Number(inventoryEditForm.quantity)

    if (!nextName) {
      toast({ title: "Missing name", description: "Item name is required.", variant: "destructive" })
      return
    }
    if (Number.isNaN(nextQty) || nextQty < 0) {
      toast({ title: "Invalid quantity", description: "Quantity must be 0 or more.", variant: "destructive" })
      return
    }

    setIsSavingInventoryEdit(true)
    try {
      if (nextName !== originalName || nextUnit !== originalUnit) {
        const res = await fetch(API_INVENTORY, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item_type: originalName,
            new_item_type: nextName,
            unit: nextUnit,
          }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json.message || "Failed to update item")
        }
      }

      const adjustmentLocationId =
        inventoryEditLocationId !== LOCATION_UNASSIGNED && inventoryEditLocationId !== LOCATION_ALL
          ? inventoryEditLocationId
          : null

      const delta = Number((nextQty - originalQty).toFixed(4))
      if (Math.abs(delta) > 0.0001) {
        const res = await fetch(API_TRANSACTIONS, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item_type: nextName,
            quantity: Math.abs(delta),
            transaction_type: delta > 0 ? "restock" : "deplete",
            notes: `Inventory adjustment (${originalQty} -> ${nextQty} ${nextUnit})`,
            user_id: user?.username || "system",
            price: 0,
            location_id: adjustmentLocationId,
          }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json.message || "Failed to adjust quantity")
        }
      }

      toast({ title: "Inventory updated", description: "Changes saved successfully.", variant: "default" })
      await refreshData(true)
      setIsInventoryEditDialogOpen(false)
      setEditingInventoryItem(null)
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message || "Try again", variant: "destructive" })
    } finally {
      setIsSavingInventoryEdit(false)
    }
  }

  const handleDeleteInventoryItem = async (itemToDelete: InventoryItem) => {
    if (!tenantId) return
    const deleteAllLocations = selectedLocationId === LOCATION_ALL
    const confirmMessage = deleteAllLocations
      ? `Delete "${itemToDelete.name}" across all locations? This removes it from inventory and logs depletion.`
      : `Delete "${itemToDelete.name}" from ${selectedLocationLabel}? This removes it from inventory and logs depletion.`
    if (!confirm(confirmMessage)) return
    const deleteLocationId = deleteAllLocations ? "all" : selectedLocationId
    try {
      const res = await fetch(API_INVENTORY, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_type: itemToDelete.name,
          location_id: deleteLocationId,
          scope: deleteAllLocations ? "all" : "single",
        }),
      })
      const { json, text } = await parseJsonResponse(res)
      if (!res.ok || !json?.success) {
        const fallback =
          res.status === 401 || res.status === 403 ? "Not authorized to delete inventory." : "Failed to delete item"
        throw new Error(json?.message || fallback || text)
      }
      toast({ title: "Item deleted", description: "Inventory updated.", variant: "default" })
      await refreshData(true)
    } catch (err: any) {
      console.error("delete inventory item error", err)
      toast({
        title: "Failed to delete item",
        description: err.message || "Please try again",
        variant: "destructive",
      })
    }
  }

  const openNewItemDialog = () => {
    const defaultLocation =
      selectedLocationId !== LOCATION_ALL ? selectedLocationId : transactionLocationId !== LOCATION_ALL ? transactionLocationId : LOCATION_UNASSIGNED
    setNewItemForm((prev) => ({
      ...prev,
      locationId: defaultLocation,
    }))
    setIsNewItemDialogOpen(true)
  }

  const resetNewItemForm = () => {
    setNewItemForm({
      name: "",
      unit: "kg",
      quantity: "",
      price: "",
      notes: "",
      locationId: LOCATION_UNASSIGNED,
    })
  }

  const handleCreateNewItem = async () => {
    const itemName = newItemForm.name.trim()
    const unit = newItemForm.unit.trim() || "kg"
    const quantityValue = Number(newItemForm.quantity || 0)
    const priceValue = Number(newItemForm.price || 0)
    const notes = newItemForm.notes.trim()

    if (!itemName) {
      toast({ title: "Missing name", description: "Item name is required.", variant: "destructive" })
      return
    }
    if (Number.isNaN(quantityValue) || quantityValue < 0) {
      toast({ title: "Invalid quantity", description: "Quantity must be 0 or more.", variant: "destructive" })
      return
    }
    if (Number.isNaN(priceValue) || priceValue < 0) {
      toast({ title: "Invalid price", description: "Price must be 0 or more.", variant: "destructive" })
      return
    }

    const locationValue =
      newItemForm.locationId !== LOCATION_UNASSIGNED && newItemForm.locationId !== LOCATION_ALL
        ? newItemForm.locationId
        : null

    setIsSavingNewItem(true)
    try {
      const res = await fetch(API_INVENTORY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_type: itemName,
          quantity: quantityValue,
          unit,
          price: priceValue,
          notes: notes || undefined,
          user_id: user?.username || "system",
          location_id: locationValue,
        }),
      })
      const { json, text } = await parseJsonResponse(res)
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || text || "Failed to add item")
      }
      toast({ title: "Item added", description: "Inventory item created successfully.", variant: "default" })
      await refreshData(true)
      setIsNewItemDialogOpen(false)
      resetNewItemForm()
    } catch (error: any) {
      toast({ title: "Add failed", description: error.message || "Try again", variant: "destructive" })
    } finally {
      setIsSavingNewItem(false)
    }
  }

  // CSV export (transactions & inventory)
  const exportInventoryToCSV = () => {
    const headers = ["Item Name", "Quantity", "Unit", "Value"]
    const rows = filteredAndSortedInventory.map((item) => {
      const valueInfo = resolveItemValue(item)
      const itemValue = valueInfo.totalValue || 0
      return [item.name, String(item.quantity), item.unit || "kg", `₹${itemValue.toFixed(2)}`]
    })
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `inventory-${new Date().toISOString().split("T")[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const exportToCSV = () => {
    const headers = ["Date", "Location", "Item Type", "Quantity", "Unit Price", "Total Cost", "Transaction Type", "Notes", "User"]
    const rows = filteredTransactions.map((t) => [
      t.transaction_date ?? "",
      resolveLocationLabel(t.location_id, t.location_name || t.location_code),
      t.item_type ?? "",
      `${t.quantity} ${t.unit ?? ""}`,
      t.price !== undefined ? `₹${Number(t.price).toFixed(2)}` : "-",
      t.total_cost !== undefined ? `₹${Number(t.total_cost).toFixed(2)}` : "-",
      t.transaction_type ?? "",
      (t.notes ?? "").replace(/\n/g, " "),
      t.user_id ?? "",
    ])
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `transactions-${new Date().toISOString().split("T")[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleOpenItemDrilldownHistory = () => {
    if (!inventoryDrilldownItemName) return
    setFilterType(inventoryDrilldownItemName)
    setTransactionSearchTerm("")
    setCurrentPage(1)
    setActiveTab("transactions")
  }

  // AI Analysis trigger (calls your AI API route)
  const generateAIAnalysis = async () => {
    setIsAnalyzing(true)
    setAnalysisError("")
    try {
      const payload = { inventory, transactions: transactions.slice(0, 50), laborDeployments: laborDeployments.slice(0, 50) }
      const res = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error("AI analysis failed")
      const json = await res.json()
      setAiAnalysis(json.analysis || "No analysis returned")
    } catch (err: any) {
      console.error("AI Analysis error:", err)
      setAnalysisError(err.message || "Failed to generate AI analysis")
    } finally {
      setIsAnalyzing(false)
    }
  }

  const showTransactionHistory = isModuleEnabled("transactions")
  const canShowInventory = isModuleEnabled("inventory")
  const canShowAccounts = isModuleEnabled("accounts")
  const canShowBalanceSheet = isModuleEnabled("balance-sheet")
  const canShowProcessing = isModuleEnabled("processing")
  const canShowDispatch = isModuleEnabled("dispatch")
  const canShowSales = isModuleEnabled("sales") && !isScopedUser
  const canShowOtherSales = isModuleEnabled("other-sales") && !isScopedUser
  const canShowCuring = isModuleEnabled("curing")
  const canShowQuality = isModuleEnabled("quality")
  const canShowRainfall = isModuleEnabled("rainfall")
  const canShowPepper = isModuleEnabled("pepper")
  const canShowAiAnalysis = isModuleEnabled("ai-analysis")
  const canShowNews = isModuleEnabled("news")
  const canShowWeather = isModuleEnabled("weather")
  const canShowSeason = isModuleEnabled("season")
  const canShowYieldForecast = canShowSeason
  const canShowActivityLog = (isAdmin || isOwner) && isFeatureEnabled("showActivityLogTab")
  const canShowReceivables = isModuleEnabled("receivables")
  const canShowBilling = isModuleEnabled("billing")
  const canShowJournal = isModuleEnabled("journal")
  const canShowResources = isModuleEnabled("resources") && isFeatureEnabled("showResourcesTab")
  const canShowWelcomeCard = isFeatureEnabled("showWelcomeCard")
  const canShowRainfallSection = canShowRainfall || canShowWeather
  const canShowIntelligence = !isScopedUser && (canShowDispatch || canShowSales || canShowAccounts || canShowSeason)
  const showOperationsTabs =
    canShowInventory ||
    canShowProcessing ||
    canShowCuring ||
    canShowQuality ||
    canShowDispatch ||
    canShowSales ||
    canShowOtherSales ||
    canShowPepper
  const showFinanceTabs =
    canShowAccounts || canShowBalanceSheet || showTransactionHistory || canShowReceivables || canShowBilling
  const showInsightsTabs =
    canShowSeason ||
    canShowYieldForecast ||
    canShowActivityLog ||
    canShowRainfallSection ||
    canShowJournal ||
    canShowResources ||
    canShowAiAnalysis ||
    canShowNews

  useEffect(() => {
    if (!tenantId || !canShowIntelligence) {
      setIntelligenceBrief(null)
      setIntelligenceError(null)
      return
    }
    let ignore = false

    const loadIntelligenceBrief = async () => {
      setIntelligenceLoading(true)
      setIntelligenceError(null)
      try {
        const params = new URLSearchParams({
          startDate: currentFiscalYear.startDate,
          endDate: currentFiscalYear.endDate,
        })
        const response = await fetch(`/api/intelligence-brief?${params.toString()}`, { cache: "no-store" })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !data?.success) {
          throw new Error(data?.error || "Failed to load intelligence brief")
        }
        if (!ignore) {
          setIntelligenceBrief(data as IntelligenceBrief)
        }
      } catch (error: any) {
        if (!ignore) {
          setIntelligenceBrief(null)
          setIntelligenceError(error?.message || "Failed to load intelligence brief")
        }
      } finally {
        if (!ignore) {
          setIntelligenceLoading(false)
        }
      }
    }

    loadIntelligenceBrief()
    return () => {
      ignore = true
    }
  }, [canShowIntelligence, currentFiscalYear.endDate, currentFiscalYear.startDate, tenantId])

  const commandStripItems = useMemo(() => {
    const processingTotalKg = processingTotals.arabicaKg + processingTotals.robustaKg
    const dispatchTotalBags = dispatchHeroTotals.arabicaBags + dispatchHeroTotals.robustaBags
    const dispatchTotalKgs = dispatchHeroTotals.arabicaKgs + dispatchHeroTotals.robustaKgs
    const salesTotalKgs = salesHeroTotals.arabicaKgs + salesHeroTotals.robustaKgs
    const dispatchToSalesRate = dispatchTotalKgs > 0 ? (salesTotalKgs / dispatchTotalKgs) * 100 : 0

    return [
      {
        id: "processing-strip",
        tab: "processing",
        visible: canShowProcessing,
        label: "Processing Output",
        value: processingTotals.loading ? "Loading..." : `${formatNumber(processingTotalKg, 0)} kg`,
        subValue: processingTotals.loading
          ? "Updating totals"
          : `Arabica ${formatNumber(processingTotals.arabicaKg, 0)} kg · Robusta ${formatNumber(processingTotals.robustaKg, 0)} kg`,
      },
      {
        id: "dispatch-strip",
        tab: "dispatch",
        visible: canShowDispatch,
        label: "Dispatch Received",
        value: dispatchHeroTotals.loading ? "Loading..." : `${formatNumber(dispatchTotalKgs, 0)} kg`,
        subValue: dispatchHeroTotals.loading
          ? "Updating totals"
          : `${formatNumber(dispatchTotalBags, 0)} bags · ${formatCount(dispatchHeroTotals.totalDispatches)} entries`,
      },
      {
        id: "sales-strip",
        tab: "sales",
        visible: canShowSales,
        label: "Sales Sold",
        value: salesHeroTotals.loading ? "Loading..." : `${formatNumber(salesTotalKgs, 0)} kg`,
        subValue: salesHeroTotals.loading
          ? "Updating totals"
          : `${formatNumber(dispatchToSalesRate, 0)}% of dispatch-received stock sold`,
      },
    ]
  }, [
    canShowDispatch,
    canShowProcessing,
    canShowSales,
    dispatchHeroTotals.arabicaBags,
    dispatchHeroTotals.arabicaKgs,
    dispatchHeroTotals.loading,
    dispatchHeroTotals.robustaBags,
    dispatchHeroTotals.robustaKgs,
    dispatchHeroTotals.totalDispatches,
    formatCount,
    processingTotals.arabicaKg,
    processingTotals.loading,
    processingTotals.robustaKg,
    salesHeroTotals.arabicaKgs,
    salesHeroTotals.loading,
    salesHeroTotals.robustaKgs,
  ])
  const visibleCommandStripItems = commandStripItems.filter((item) => item.visible)
  const dispatchReceivedKgsTotal = dispatchHeroTotals.arabicaKgs + dispatchHeroTotals.robustaKgs
  const salesSoldKgsTotal = salesHeroTotals.arabicaKgs + salesHeroTotals.robustaKgs
  const saleableCoffeeKgs = Math.max(0, dispatchReceivedKgsTotal - salesSoldKgsTotal)
  const overdrawnCoffeeKgs = Math.max(0, salesSoldKgsTotal - dispatchReceivedKgsTotal)
  const reconciliationStatusLabel = overdrawnCoffeeKgs > 0 ? "Overdrawn" : "Healthy"
  const reconciliationStatusTone =
    overdrawnCoffeeKgs > 0 ? "text-rose-700 border-rose-200 bg-rose-50/70" : "text-emerald-700 border-emerald-200 bg-emerald-50/70"
  const intelligenceHighlights = intelligenceBrief?.highlights || []
  const intelligenceActions = intelligenceBrief?.actions || []
  const intelligenceTopCostCode = intelligenceBrief?.accountsPatterns?.topCostCodes?.[0] || null
  const intelligenceTopFrequencyCode = intelligenceBrief?.accountsPatterns?.mostFrequentCodes?.[0] || null
  const visibleTabs = useMemo(() => {
    const tabs: string[] = ["home"]
    if (canShowInventory) tabs.push("inventory")
    if (showTransactionHistory) tabs.push("transactions")
    if (canShowAccounts) tabs.push("accounts")
    if (canShowBalanceSheet) tabs.push("balance-sheet")
    if (canShowProcessing) tabs.push("processing")
    if (canShowDispatch) tabs.push("dispatch")
    if (canShowSales) tabs.push("sales")
    if (canShowOtherSales) tabs.push("other-sales")
    if (canShowCuring) tabs.push("curing")
    if (canShowQuality) tabs.push("quality")
    if (canShowSeason) tabs.push("season")
    if (canShowYieldForecast) tabs.push("yield-forecast")
    if (canShowActivityLog) tabs.push("activity-log")
    if (canShowRainfallSection) tabs.push("rainfall")
    if (canShowPepper) tabs.push("pepper")
    if (canShowJournal) tabs.push("journal")
    if (canShowResources) tabs.push("resources")
    if (canShowAiAnalysis) tabs.push("ai-analysis")
    if (canShowNews) tabs.push("news")
    if (canShowReceivables) tabs.push("receivables")
    if (canShowBilling) tabs.push("billing")
    return tabs
  }, [
    canShowAccounts,
    canShowBalanceSheet,
    canShowAiAnalysis,
    canShowBilling,
    canShowDispatch,
    canShowOtherSales,
    canShowActivityLog,
    canShowInventory,
    canShowJournal,
    canShowResources,
    canShowNews,
    canShowPepper,
    canShowProcessing,
    canShowCuring,
    canShowQuality,
    canShowRainfallSection,
    canShowReceivables,
    canShowSales,
    canShowSeason,
    canShowYieldForecast,
    showTransactionHistory,
  ])
  const getPreferredDefaultTab = useCallback(
    (tabs: string[]) => DEFAULT_DASHBOARD_TAB_PRIORITY.find((tab) => tabs.includes(tab)) || tabs[0],
    [],
  )

  useEffect(() => {
    if (!tenantId || !canShowProcessing) return
    let ignore = false

    const loadProcessingTotals = async () => {
      setProcessingTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const res = await fetch("/api/processing-records?summary=dashboard")
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Failed to load processing totals")
        }
        const records = Array.isArray(json.records) ? json.records : []
        const totals = records.reduce(
          (acc: { arabicaKg: number; arabicaBags: number; robustaKg: number; robustaBags: number }, record: any) => {
            const type = String(record?.coffee_type || "").toLowerCase()
            const kg =
              (Number(record?.dry_parch_total) || 0) +
              (Number(record?.dry_cherry_total) || 0)
            const bags =
              (Number(record?.dry_p_bags_total) || 0) +
              (Number(record?.dry_cherry_bags_total) || 0)
            if (type.includes("arab")) {
              acc.arabicaKg += kg
              acc.arabicaBags += bags
            } else if (type.includes("rob")) {
              acc.robustaKg += kg
              acc.robustaBags += bags
            }
            return acc
          },
          { arabicaKg: 0, arabicaBags: 0, robustaKg: 0, robustaBags: 0 },
        )
        if (!ignore) {
          setProcessingTotals({
            ...totals,
            loading: false,
            error: null,
          })
        }
      } catch (error: any) {
        if (!ignore) {
          setProcessingTotals((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Failed to load processing totals",
          }))
        }
      }
    }

    loadProcessingTotals()
    return () => {
      ignore = true
    }
  }, [tenantId, canShowProcessing])

  useEffect(() => {
    if (!tenantId || !canShowDispatch) return
    let ignore = false

    const loadDispatchHeroTotals = async () => {
      setDispatchHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const res = await fetch("/api/dispatch?summaryOnly=true")
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Failed to load dispatch totals")
        }
        const totalsByType = Array.isArray(json?.totalsByType) ? json.totalsByType : []
        const totals = totalsByType.reduce(
          (acc: { arabicaBags: number; arabicaKgs: number; robustaBags: number; robustaKgs: number }, row: any) => {
            const type = String(row?.coffee_type || "").toLowerCase()
            const bags = Number(row?.bags_dispatched) || 0
            const kgs = Number(row?.kgs_received) || 0
            if (type.includes("arab")) {
              acc.arabicaBags += bags
              acc.arabicaKgs += kgs
            } else if (type.includes("rob")) {
              acc.robustaBags += bags
              acc.robustaKgs += kgs
            }
            return acc
          },
          { arabicaBags: 0, arabicaKgs: 0, robustaBags: 0, robustaKgs: 0 },
        )
        if (!ignore) {
          setDispatchHeroTotals({
            ...totals,
            totalDispatches: Number(json?.totalCount) || 0,
            loading: false,
            error: null,
          })
        }
      } catch (error: any) {
        if (!ignore) {
          setDispatchHeroTotals((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Failed to load dispatch totals",
          }))
        }
      }
    }

    loadDispatchHeroTotals()
    return () => {
      ignore = true
    }
  }, [tenantId, canShowDispatch])

  useEffect(() => {
    if (!tenantId || !canShowSales) return
    let ignore = false

    const loadSalesHeroTotals = async () => {
      setSalesHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const res = await fetch("/api/sales?summaryOnly=true")
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Failed to load sales totals")
        }
        const totalsByType = Array.isArray(json?.totalsByType) ? json.totalsByType : []
        const totals = totalsByType.reduce(
          (acc: { arabicaBags: number; arabicaKgs: number; robustaBags: number; robustaKgs: number }, row: any) => {
            const type = String(row?.coffee_type || "").toLowerCase()
            const bags = Number(row?.bags_sold) || 0
            const kgs = Number(row?.kgs_sold) || 0
            if (type.includes("arab")) {
              acc.arabicaBags += bags
              acc.arabicaKgs += kgs
            } else if (type.includes("rob")) {
              acc.robustaBags += bags
              acc.robustaKgs += kgs
            }
            return acc
          },
          { arabicaBags: 0, arabicaKgs: 0, robustaBags: 0, robustaKgs: 0 },
        )
        if (!ignore) {
          setSalesHeroTotals({
            ...totals,
            totalSales: Number(json?.totalCount) || 0,
            totalRevenue: Number(json?.totalRevenue) || 0,
            loading: false,
            error: null,
          })
        }
      } catch (error: any) {
        if (!ignore) {
          setSalesHeroTotals((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Failed to load sales totals",
          }))
        }
      }
    }

    loadSalesHeroTotals()
    return () => {
      ignore = true
    }
  }, [tenantId, canShowSales])

  useEffect(() => {
    if (!tenantId || !canShowReceivables) return
    let ignore = false

    const loadReceivablesHeroTotals = async () => {
      setReceivablesHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const params = new URLSearchParams()
        if (isPreviewMode && previewTenantId) {
          params.set("tenantId", previewTenantId)
        }
        const endpoint = params.toString() ? `/api/receivables?${params.toString()}` : "/api/receivables"
        const res = await fetch(endpoint, { cache: "no-store" })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Failed to load receivables totals")
        }
        const payload = json?.summary || {}
        if (!ignore) {
          setReceivablesHeroTotals({
            totalInvoiced: Number(payload.totalInvoiced) || 0,
            totalOutstanding: Number(payload.totalOutstanding) || 0,
            totalOverdue: Number(payload.totalOverdue) || 0,
            totalPaid: Number(payload.totalPaid) || 0,
            totalCount: Number(payload.totalCount) || 0,
            loading: false,
            error: null,
          })
        }
      } catch (error: any) {
        if (!ignore) {
          setReceivablesHeroTotals((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Failed to load receivables totals",
          }))
        }
      }
    }

    loadReceivablesHeroTotals()
    return () => {
      ignore = true
    }
  }, [canShowReceivables, isPreviewMode, previewTenantId, tenantId])

  useEffect(() => {
    if (!tenantId || !canShowCuring) return
    let ignore = false

    const loadCuringHeroTotals = async () => {
      setCuringHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const params = new URLSearchParams({
          fiscalYearStart: currentFiscalYear.startDate,
          fiscalYearEnd: currentFiscalYear.endDate,
          all: "true",
        })
        const res = await fetch(`/api/curing-records?${params.toString()}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Failed to load curing totals")
        }
        const records = Array.isArray(json.records) ? json.records : []
        const totals = records.reduce(
          (
            acc: {
              outputKg: number
              dryingDaysTotal: number
              dryingDaysCount: number
              moistureDropTotal: number
              moistureDropCount: number
            },
            record: any,
          ) => {
            const outputKg = Number(record?.output_kg)
            if (Number.isFinite(outputKg)) {
              acc.outputKg += outputKg
            }
            const dryingDays = Number(record?.drying_days)
            if (Number.isFinite(dryingDays)) {
              acc.dryingDaysTotal += dryingDays
              acc.dryingDaysCount += 1
            }
            const moistureStart = Number(record?.moisture_start_pct)
            const moistureEnd = Number(record?.moisture_end_pct)
            if (Number.isFinite(moistureStart) && Number.isFinite(moistureEnd)) {
              acc.moistureDropTotal += moistureStart - moistureEnd
              acc.moistureDropCount += 1
            }
            return acc
          },
          {
            outputKg: 0,
            dryingDaysTotal: 0,
            dryingDaysCount: 0,
            moistureDropTotal: 0,
            moistureDropCount: 0,
          },
        )
        if (!ignore) {
          setCuringHeroTotals({
            totalRecords: records.length,
            totalOutputKg: totals.outputKg,
            avgDryingDays: totals.dryingDaysCount ? totals.dryingDaysTotal / totals.dryingDaysCount : 0,
            avgMoistureDrop: totals.moistureDropCount ? totals.moistureDropTotal / totals.moistureDropCount : 0,
            loading: false,
            error: null,
          })
        }
      } catch (error: any) {
        if (!ignore) {
          setCuringHeroTotals((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Failed to load curing totals",
          }))
        }
      }
    }

    loadCuringHeroTotals()
    return () => {
      ignore = true
    }
  }, [tenantId, canShowCuring, currentFiscalYear.endDate, currentFiscalYear.startDate])

  useEffect(() => {
    if (!tenantId || !canShowQuality) return
    let ignore = false

    const loadQualityHeroTotals = async () => {
      setQualityHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const params = new URLSearchParams({
          fiscalYearStart: currentFiscalYear.startDate,
          fiscalYearEnd: currentFiscalYear.endDate,
          all: "true",
        })
        const res = await fetch(`/api/quality-grading-records?${params.toString()}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Failed to load quality totals")
        }
        const records = Array.isArray(json.records) ? json.records : []
        const totals = records.reduce(
          (
            acc: {
              cupScoreTotal: number
              cupScoreCount: number
              outturnTotal: number
              outturnCount: number
              defectsTotal: number
              defectsCount: number
            },
            record: any,
          ) => {
            const cupScore = Number(record?.cup_score)
            if (Number.isFinite(cupScore)) {
              acc.cupScoreTotal += cupScore
              acc.cupScoreCount += 1
            }
            const outturnPct = Number(record?.outturn_pct)
            if (Number.isFinite(outturnPct)) {
              acc.outturnTotal += outturnPct
              acc.outturnCount += 1
            }
            const defectsCount = Number(record?.defects_count)
            if (Number.isFinite(defectsCount)) {
              acc.defectsTotal += defectsCount
              acc.defectsCount += 1
            }
            return acc
          },
          {
            cupScoreTotal: 0,
            cupScoreCount: 0,
            outturnTotal: 0,
            outturnCount: 0,
            defectsTotal: 0,
            defectsCount: 0,
          },
        )
        if (!ignore) {
          setQualityHeroTotals({
            totalRecords: records.length,
            avgCupScore: totals.cupScoreCount ? totals.cupScoreTotal / totals.cupScoreCount : 0,
            avgOutturnPct: totals.outturnCount ? totals.outturnTotal / totals.outturnCount : 0,
            avgDefects: totals.defectsCount ? totals.defectsTotal / totals.defectsCount : 0,
            loading: false,
            error: null,
          })
        }
      } catch (error: any) {
        if (!ignore) {
          setQualityHeroTotals((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Failed to load quality totals",
          }))
        }
      }
    }

    loadQualityHeroTotals()
    return () => {
      ignore = true
    }
  }, [tenantId, canShowQuality, currentFiscalYear.endDate, currentFiscalYear.startDate])

  useEffect(() => {
    if (!tenantId || !canShowPepper) return
    let ignore = false

    const loadPepperHeroTotals = async () => {
      setPepperHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const params = new URLSearchParams({
          fiscalYearStart: currentFiscalYear.startDate,
          fiscalYearEnd: currentFiscalYear.endDate,
        })
        const res = await fetch(`/api/pepper-records?${params.toString()}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Failed to load pepper totals")
        }
        const records = Array.isArray(json.records) ? json.records : []
        const totals = records.reduce(
          (acc: { picked: number; dry: number; dryPctTotal: number; dryPctCount: number }, record: any) => {
            const pickedKg = Number(record?.kg_picked)
            if (Number.isFinite(pickedKg)) {
              acc.picked += pickedKg
            }
            const dryKg = Number(record?.dry_pepper)
            if (Number.isFinite(dryKg)) {
              acc.dry += dryKg
            }
            const dryPct = Number(record?.dry_pepper_percent)
            if (Number.isFinite(dryPct)) {
              acc.dryPctTotal += dryPct
              acc.dryPctCount += 1
            }
            return acc
          },
          { picked: 0, dry: 0, dryPctTotal: 0, dryPctCount: 0 },
        )
        if (!ignore) {
          setPepperHeroTotals({
            totalRecords: records.length,
            totalPickedKg: totals.picked,
            totalDryKg: totals.dry,
            avgDryPercent: totals.dryPctCount ? totals.dryPctTotal / totals.dryPctCount : 0,
            loading: false,
            error: null,
          })
        }
      } catch (error: any) {
        if (!ignore) {
          setPepperHeroTotals((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Failed to load pepper totals",
          }))
        }
      }
    }

    loadPepperHeroTotals()
    return () => {
      ignore = true
    }
  }, [tenantId, canShowPepper, currentFiscalYear.endDate, currentFiscalYear.startDate])

  useEffect(() => {
    if (!tenantId || !canShowRainfall) return
    let ignore = false

    const loadRainfallHeroTotals = async () => {
      setRainfallHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const res = await fetch("/api/rainfall")
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "Failed to load rainfall totals")
        }
        const records = Array.isArray(json.records) ? json.records : []
        const startDate = new Date(`${currentFiscalYear.startDate}T00:00:00`)
        const endDate = new Date(`${currentFiscalYear.endDate}T23:59:59`)
        let totalInches = 0
        let totalRecords = 0
        let latestDate: string | null = null
        for (const record of records) {
          const recordDate = new Date(record?.record_date)
          if (Number.isNaN(recordDate.getTime())) continue
          if (recordDate < startDate || recordDate > endDate) continue
          const inches = Number(record?.inches) || 0
          const cents = Number(record?.cents) || 0
          totalInches += inches + cents / 100
          totalRecords += 1
          if (!latestDate || recordDate > new Date(latestDate)) {
            latestDate = String(record?.record_date || "")
          }
        }
        if (!ignore) {
          setRainfallHeroTotals({
            totalRecords,
            totalInches,
            latestDate,
            loading: false,
            error: null,
          })
        }
      } catch (error: any) {
        if (!ignore) {
          setRainfallHeroTotals((prev) => ({
            ...prev,
            loading: false,
            error: error?.message || "Failed to load rainfall totals",
          }))
        }
      }
    }

    loadRainfallHeroTotals()
    return () => {
      ignore = true
    }
  }, [tenantId, canShowRainfall, currentFiscalYear.endDate, currentFiscalYear.startDate])

  useEffect(() => {
    if (!canShowSeason) return
    let isActive = true
    const loadExceptions = async () => {
      setExceptionsLoading(true)
      setExceptionsError(null)
      try {
        const response = await fetch("/api/exception-alerts")
        const data = await response.json()
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to load exceptions")
        }
        const alerts = Array.isArray(data.alerts) ? data.alerts : []
        const severityRank: Record<string, number> = { high: 3, medium: 2, low: 1 }
        const highlights = [...alerts]
          .sort((a: any, b: any) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0))
          .slice(0, 3)
          .map((alert: any) => {
            const context = [alert.location, alert.coffeeType].filter(Boolean).join(" • ")
            return context ? `${context}: ${alert.title}` : alert.title
          })
        if (!isActive) return
        setExceptionsSummary({ count: alerts.length, highlights })
      } catch (error: any) {
        if (!isActive) return
        setExceptionsError(error.message || "Failed to load exceptions")
      } finally {
        if (isActive) {
          setExceptionsLoading(false)
        }
      }
    }

    loadExceptions()
    return () => {
      isActive = false
    }
  }, [canShowSeason])

  const tabParam = searchParams.get("tab")
  useEffect(() => {
    if (isModulesLoading) {
      return
    }
    if (visibleTabs.length && !visibleTabs.includes(activeTab)) {
      const fallbackTab =
        activeTab === "weather" && visibleTabs.includes("rainfall")
          ? "rainfall"
          : getPreferredDefaultTab(visibleTabs)
      setActiveTab(fallbackTab)
    }
  }, [activeTab, getPreferredDefaultTab, isModulesLoading, visibleTabs])

  useEffect(() => {
    if (!tabParam) return
    const requestedTab = tabParam === "weather" ? "rainfall" : tabParam
    if (visibleTabs.includes(requestedTab) && requestedTab !== activeTab) {
      setActiveTab(requestedTab)
    }
  }, [activeTab, tabParam, visibleTabs])

  useEffect(() => {
    if (!user || !tenantId || isOwner || isPreviewMode) return
    if (!canShowWelcomeCard) {
      setShowWelcome(false)
      return
    }
    if (WELCOME_SKIP_TENANTS.has(tenantId)) {
      setShowWelcome(false)
      return
    }
    const key = `farmflow_welcome_seen:${tenantId}:${user.username}`
    try {
      const hasSeen = window.localStorage.getItem(key) === "true"
      if (!hasSeen) {
        setShowWelcome(true)
      }
    } catch (error) {
      console.warn("Unable to read welcome flag", error)
    }
  }, [WELCOME_SKIP_TENANTS, canShowWelcomeCard, isOwner, isPreviewMode, tenantId, user])

  const dismissWelcome = () => {
    if (!user || !tenantId) {
      setShowWelcome(false)
      return
    }
    const key = `farmflow_welcome_seen:${tenantId}:${user.username}`
    try {
      window.localStorage.setItem(key, "true")
    } catch (error) {
      console.warn("Unable to store welcome flag", error)
    }
    setShowWelcome(false)
  }

  const exitPreviewMode = useCallback(() => {
    if (typeof document !== "undefined") {
      document.cookie = `${PREVIEW_TENANT_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
    }
    const params = new URLSearchParams(searchParams.toString())
    params.delete("previewTenantId")
    params.delete("previewRole")
    params.delete("previewTenantName")
    const nextQuery = params.toString()
    router.push(nextQuery ? `/dashboard?${nextQuery}` : "/dashboard")
  }, [router, searchParams])

  // UI render: simplified, mirrors your original layout and components
  if (!user) return null

  if (isTenantLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading tenant context...</p>
        </div>
      </div>
    )
  }

  if (!tenantId) {
    return null
  }

  if (loading && !inventory.length && !syncError) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading inventory data...</p>
        </div>
      </div>
    )
  }

  const onboardingSteps: OnboardingStep[] = [
    {
      key: "locations",
      title: "Add estate locations",
      description: "Set up your coffee processing locations (HF A, MV, etc.).",
      done: onboardingStatus.locations,
      actionLabel: "Go to Processing",
      onAction: () => setActiveTab("processing"),
    },
    {
      key: "inventory",
      title: "Add first inventory item",
      description: "Create your first inventory item and restock quantity.",
      done: onboardingStatus.inventory,
      actionLabel: "Go to Inventory",
      onAction: () => setActiveTab("inventory"),
    },
    {
      key: "processing",
      title: "Record processing output",
      description: "Log today's coffee processing (parchment/cherry).",
      done: onboardingStatus.processing,
      actionLabel: "Open Processing",
      onAction: () => setActiveTab("processing"),
    },
    {
      key: "dispatch",
      title: "Create a dispatch record",
      description: "Send bags out and optionally note KGs received.",
      done: onboardingStatus.dispatch,
      actionLabel: "Open Dispatch",
      onAction: () => setActiveTab("dispatch"),
    },
    ...(canShowSales
      ? [
          {
            key: "sales",
            title: "Record your first sale",
            description: "Capture bags sold and pricing for revenue tracking.",
            done: onboardingStatus.sales,
            actionLabel: "Open Sales",
            onAction: () => setActiveTab("sales"),
          } satisfies OnboardingStep,
        ]
      : []),
  ]
  const onboardingCompletedCount = onboardingSteps.filter((step) => step.done).length
  const onboardingTotalCount = onboardingSteps.length
  const showOnboarding = onboardingTotalCount > 0 && !isOnboardingLoading && onboardingCompletedCount === 0
  const recordMovementPanel = (
    <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">Record Inventory Movement</h3>
          <p className="text-xs text-neutral-500">
            Keep estate lots traceable from harvest through storage.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setIsMovementDrawerOpen(false)}>
          Close
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Badge variant="outline" className="border-black/5 bg-neutral-50 text-neutral-600">
          Harvest & processing
        </Badge>
        <Badge variant="outline" className="border-black/5 bg-neutral-50 text-neutral-600">
          Restock or deplete
        </Badge>
      </div>
      <div className="mt-6 space-y-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-neutral-700">Item Type</label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Item type help"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Select the coffee or inventory item being adjusted.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Select
            value={newTransaction?.item_type || ""}
            onValueChange={(value) => {
              handleFieldChange("item_type", value)
              const u = inventory.find((i) => i.name === value)?.unit || "kg"
              handleFieldChange("unit", u)
            }}
          >
            <SelectTrigger className="w-full h-11 rounded-xl border-black/5 bg-white focus-visible:ring-2 focus-visible:ring-emerald-200">
              <SelectValue placeholder="Select item type" />
            </SelectTrigger>
            <SelectContent className="max-h-[40vh] overflow-y-auto">
              {allItemTypesForDropdown.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-neutral-700">Location</label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Location help"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Tag by estate block for traceability and yield accuracy.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Select value={transactionLocationId} onValueChange={setTransactionLocationId}>
            <SelectTrigger className="w-full h-11 rounded-xl border-black/5 bg-white focus-visible:ring-2 focus-visible:ring-emerald-200">
              <SelectValue placeholder={locations.length ? "Select location" : "No locations yet"} />
            </SelectTrigger>
            <SelectContent className="max-h-[40vh] overflow-y-auto">
              <SelectItem value={LOCATION_UNASSIGNED}>{UNASSIGNED_LABEL}</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.name || loc.code || "Unnamed location"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-neutral-500">
            Tag transactions to a location for accurate inventory usage.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-neutral-700">Quantity</label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Quantity help"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Enter the exact kg or unit amount for the lot.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="relative">
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="Enter quantity"
              value={newTransaction?.quantity ?? ""}
              onKeyDown={preventNegativeKey}
              onChange={(e) => {
                const nextValue = coerceNonNegativeNumber(e.target.value)
                if (nextValue === null) return
                handleFieldChange("quantity", nextValue)
              }}
              className="h-11 rounded-xl border-black/5 bg-white pr-12 focus-visible:ring-2 focus-visible:ring-emerald-200"
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-neutral-500 text-sm">
              {newTransaction?.unit || "kg"}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-neutral-700">Transaction Type</label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Transaction type help"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Restocking adds inventory, depleting records usage.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <RadioGroup
            value={newTransaction?.transaction_type === "restock" ? "Restocking" : "Depleting"}
            onValueChange={(value: "Depleting" | "Restocking") =>
              handleFieldChange("transaction_type", value === "Restocking" ? "restock" : "deplete")
            }
            className="flex flex-col gap-3 rounded-xl border border-black/5 bg-neutral-50/70 p-3 sm:flex-row sm:items-center"
          >
            <div className="flex items-center space-x-3">
              <RadioGroupItem value="Depleting" id="depleting" className="h-5 w-5" />
              <Label htmlFor="depleting" className="text-sm">
                Depleting
              </Label>
            </div>
            <div className="flex items-center space-x-3">
              <RadioGroupItem value="Restocking" id="restocking" className="h-5 w-5" />
              <Label htmlFor="restocking" className="text-sm">
                Restocking
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-neutral-700">Notes (Optional)</label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Notes help"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Use notes for lot IDs, processing stage, or buyer references.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Textarea
            placeholder="Add any additional details"
            value={newTransaction?.notes ?? ""}
            onChange={(e) => handleFieldChange("notes", e.target.value)}
            className="min-h-[110px] rounded-xl border-black/5 bg-white focus-visible:ring-2 focus-visible:ring-emerald-200"
          />
        </div>

        <Button
          onClick={handleRecordTransaction}
          className="w-full h-11 text-base bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm"
        >
          <Check className="mr-2 h-5 w-5" /> Record Transaction
        </Button>
      </div>
    </div>
  )

  return (
    <div className="relative w-full px-4 py-8 mx-auto">
      <div className="relative max-w-7xl mx-auto">
        <div className="pointer-events-none absolute -top-20 left-[-6%] h-[220px] w-[220px] rounded-full bg-[radial-gradient(circle_at_center,rgba(120,82,46,0.25),transparent_70%)] blur-[110px]" />
        <div className="pointer-events-none absolute -top-16 right-[5%] h-[200px] w-[200px] rounded-full bg-[radial-gradient(circle_at_center,rgba(69,111,96,0.25),transparent_70%)] blur-[110px]" />

        <header className="relative mb-6 overflow-hidden rounded-2xl border border-black/5 bg-white/70 p-6 shadow-sm backdrop-blur">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500 via-amber-300 to-emerald-600" />
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Image
                  src="/brand-logo.svg"
                  alt="FarmFlow"
                  width={220}
                  height={86}
                  className="h-11 w-auto rounded-xl border border-emerald-100/80 bg-white/90 px-2 py-1 shadow-sm"
                />
                <div>
                  <h1 className="text-2xl font-display font-semibold text-[color:var(--foreground)]">
                    Inventory Command
                  </h1>
                </div>
                <Badge className="bg-white/90 text-emerald-700 border-emerald-200">Inventory System</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white/80 px-3 py-1 text-xs text-emerald-700">
                  <Leaf className="h-3.5 w-3.5" />
                  {tenantLabel}
                </span>
                <span className="text-xs text-emerald-700/70">Live operations with traceability</span>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 rounded-full border border-emerald-100 bg-white/80 px-3 py-2">
                <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  {roleBadgeLabel}
                </Badge>
                <span className="text-sm text-slate-700">{user.username}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {isOwner && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        Platform Owner
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Platform Console</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href="/settings">
                          <Settings className="h-4 w-4 mr-2" />
                          Platform Settings
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/admin/init-pepper-tables">
                          <Leaf className="h-4 w-4 mr-2" />
                          Initialize Pepper Tables
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/admin/init-processing-table">
                          <Factory className="h-4 w-4 mr-2" />
                          Initialize Processing Tables
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/admin/tenants">
                          <Users className="h-4 w-4 mr-2" />
                          Manage Tenants
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/admin/inspect-databases">
                          <Settings className="h-4 w-4 mr-2" />
                          Inspect Databases
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {isAdmin && !isOwner && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/settings">
                      <Settings className="h-4 w-4 mr-2" />
                      Settings
                    </Link>
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="h-4 w-4 mr-2" /> Logout
                </Button>
              </div>
            </div>
          </div>
        </header>

        {isPreviewMode && (
          <Card className="mb-6 border-amber-200 bg-amber-50/70">
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Tenant Preview Mode</CardTitle>
                <CardDescription>
                  Showing tab access for {tenantLabel} as {roleLabel(effectiveRole)}. This is for UI/module preview without re-login.
                </CardDescription>
              </div>
              <Badge variant="outline" className="border-amber-300 bg-white text-amber-700">
                Preview
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2 text-sm text-amber-900">
              <span>Use this to validate what new tenants will see in navigation and module visibility.</span>
              <Button size="sm" variant="outline" className="bg-white" onClick={exitPreviewMode}>
                Exit preview
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link href="/admin/tenants">Back to Owner Console</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {showWelcome && (
          <Card className="mb-6 border-emerald-100 bg-emerald-50/70">
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Welcome to your estate workspace</CardTitle>
                <CardDescription>
                  Start by adding locations and logging your first processing output. Everything else builds on those
                  records.
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-white text-emerald-700 border-emerald-200">
                First login
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                Use the checklist below to get to a live, traceable setup in under 10 minutes.
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setActiveTab("inventory")}>Start setup</Button>
                {isAdmin && (
                  <Button asChild variant="outline" className="bg-transparent">
                    <Link href="/settings">Manage users</Link>
                  </Button>
                )}
                {canShowResources && (
                  <Button variant="outline" className="bg-transparent" onClick={() => setActiveTab("resources")}>
                    Open resources
                  </Button>
                )}
                <Button variant="ghost" onClick={dismissWelcome}>
                  Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="relative mb-6 overflow-hidden rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
            <div className="space-y-2 max-w-xl">
              <Badge className="bg-emerald-600 text-white border-emerald-600 shadow-sm">
                {visibleHeroContent.badge}
              </Badge>
              <h2 className="font-display text-2xl text-[color:var(--foreground)]">
                {visibleHeroContent.title}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
                {visibleHeroContent.description}
              </p>
              {visibleHeroContent.chips.length > 0 && (
                <p className="text-xs text-neutral-500">
                  {visibleHeroContent.chips
                    .slice(0, 3)
                    .map((chip) => chip.label)
                    .join(" · ")}
                </p>
              )}
            </div>
            <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-3 lg:flex-1">
              {visibleHeroContent.stats.slice(0, 3).map((stat) => (
                <div
                  key={stat.label}
                  className="min-w-0 rounded-2xl border border-black/5 bg-white p-4 shadow-sm flex flex-col gap-2"
                >
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-neutral-500">
                    {stat.label}
                  </p>
                  <p className="text-2xl font-semibold leading-tight text-neutral-900 tabular-nums">
                    {stat.value}
                  </p>
                  {stat.subValue && (
                    <p className="text-xs text-muted-foreground">{stat.subValue}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {visibleCommandStripItems.length > 0 && (
          <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {visibleCommandStripItems.map((item) => {
              const isActive = activeTab === item.tab
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.tab)}
                  className={cn(
                    "rounded-2xl border bg-white p-4 text-left transition",
                    isActive
                      ? "border-emerald-300 shadow-sm ring-2 ring-emerald-100"
                      : "border-black/5 hover:border-emerald-200 hover:shadow-sm",
                  )}
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">{item.label}</p>
                  <p className="mt-2 text-xl font-semibold text-neutral-900 tabular-nums">{item.value}</p>
                  <p className="mt-1 text-xs text-neutral-500">{item.subValue}</p>
                </button>
              )
            })}
          </div>
        )}

        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-xs text-slate-600">
            {syncError ? (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                <span className="text-rose-600">{syncError}</span>
              </>
            ) : lastSync ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 text-emerald-700" />
                <span>Synced {lastSync.toLocaleTimeString()}</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-700" />
                <span>Syncing data...</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && canShowSeason && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("season")}
                className="bg-white"
              >
                <BarChart3 className="h-3 w-3 mr-1" />
                Season View
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={() => { setIsSyncing(true); refreshData(true).finally(() => setIsSyncing(false)) }}
              disabled={isSyncing}
              className="flex items-center gap-1"
            >
              <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Syncing..." : "Sync"}
            </Button>
          </div>
        </div>

        {isOwner && (
          <Card className="border-2 border-muted bg-white/90">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Platform Console</CardTitle>
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  Platform Owner
                </Badge>
              </div>
              <CardDescription>Company-wide controls for tenants, access, and data health.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col lg:flex-row gap-6 lg:items-start">
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="text-sm">Use this console to keep tenant access clean and onboarding smooth.</p>
                <ul className="list-disc ml-4 space-y-1">
                  <li>Create tenants and users for new estates.</li>
                  <li>Enable/disable modules per tenant.</li>
                  <li>Seed demo data for trials and onboarding.</li>
                  <li>Inspect database health and table sizes.</li>
                </ul>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button asChild variant="outline" className="bg-transparent">
                  <Link href="/admin/tenants">
                    <Users className="h-4 w-4 mr-2" />
                    Manage Tenants
                  </Link>
                </Button>
                <Button asChild variant="outline" className="bg-transparent">
                  <Link href="/admin/inspect-databases">
                    <Settings className="h-4 w-4 mr-2" />
                    Inspect Databases
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        {showOnboarding && (
          <div className="mb-6">
            <OnboardingChecklist
              isVisible={showOnboarding}
              isLoading={isOnboardingLoading}
              error={onboardingError}
              completedCount={onboardingCompletedCount}
              totalCount={onboardingTotalCount}
              steps={onboardingSteps}
              canCreateLocation={isAdmin && !isPreviewMode}
              locationName={newLocationName}
              locationCode={newLocationCode}
              onLocationNameChange={setNewLocationName}
              onLocationCodeChange={setNewLocationCode}
              onCreateLocation={handleCreateLocation}
              isCreatingLocation={isCreatingLocation}
              onRefresh={loadOnboardingStatus}
            />
          </div>
        )}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
          <TabsList className="sticky top-2 z-20 flex h-auto w-full flex-wrap items-start gap-3 rounded-2xl border border-black/5 bg-white/85 p-3 shadow-sm backdrop-blur">
            <div className="flex items-center gap-2">
              <TabsTrigger value="home">
                <Home className="h-3.5 w-3.5 mr-1.5" />
                Home
              </TabsTrigger>
            </div>
            {(showOperationsTabs || showFinanceTabs || showInsightsTabs) && (
              <div aria-hidden className="h-px w-full bg-black/10 lg:h-7 lg:w-px lg:self-center" />
            )}
            {showOperationsTabs && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-black/5 bg-neutral-100/70 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.22em] text-neutral-500">
                  Operations
                </span>
                {canShowInventory && <TabsTrigger value="inventory">Inventory</TabsTrigger>}
                {canShowProcessing && (
                  <TabsTrigger value="processing">
                    <Factory className="h-3.5 w-3.5 mr-1.5" />
                    Processing
                  </TabsTrigger>
                )}
                {canShowCuring && (
                  <TabsTrigger value="curing">
                    <Factory className="h-3.5 w-3.5 mr-1.5" />
                    Curing
                  </TabsTrigger>
                )}
                {canShowQuality && (
                  <TabsTrigger value="quality">
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    Quality
                  </TabsTrigger>
                )}
                {canShowDispatch && (
                  <TabsTrigger value="dispatch">
                    <Truck className="h-3.5 w-3.5 mr-1.5" />
                    Dispatch
                  </TabsTrigger>
                )}
                {canShowSales && (
                  <TabsTrigger value="sales">
                    <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                    Sales
                  </TabsTrigger>
                )}
                {canShowOtherSales && (
                  <TabsTrigger value="other-sales">
                    <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                    Other Sales
                  </TabsTrigger>
                )}
                {canShowPepper && (
                  <TabsTrigger value="pepper" className="flex items-center gap-2">
                    <Leaf className="h-3.5 w-3.5" />
                    Pepper
                  </TabsTrigger>
                )}
              </div>
            )}
            {showOperationsTabs && (showFinanceTabs || showInsightsTabs) && (
              <div aria-hidden className="h-px w-full bg-black/10 lg:h-7 lg:w-px lg:self-center" />
            )}
            {showFinanceTabs && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-black/5 bg-neutral-100/70 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.22em] text-neutral-500">
                  Finance
                </span>
                {canShowAccounts && (
                  <TabsTrigger value="accounts">
                    <Users className="h-3.5 w-3.5 mr-1.5" />
                    Accounts
                  </TabsTrigger>
                )}
                {canShowBalanceSheet && (
                  <TabsTrigger value="balance-sheet">
                    <Scale className="h-3.5 w-3.5 mr-1.5" />
                    Balance Sheet
                  </TabsTrigger>
                )}
                {showTransactionHistory && <TabsTrigger value="transactions">Transaction History</TabsTrigger>}
                {canShowReceivables && <TabsTrigger value="receivables">Receivables</TabsTrigger>}
                {canShowBilling && (
                  <TabsTrigger value="billing">
                    <Receipt className="h-3.5 w-3.5 mr-1.5" />
                    Billing
                  </TabsTrigger>
                )}
              </div>
            )}
            {showFinanceTabs && showInsightsTabs && (
              <div aria-hidden className="h-px w-full bg-black/10 lg:h-7 lg:w-px lg:self-center" />
            )}
            {showInsightsTabs && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-black/5 bg-neutral-100/70 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.22em] text-neutral-500">
                  Insights
                </span>
                {canShowSeason && <TabsTrigger value="season">Season View</TabsTrigger>}
                {canShowYieldForecast && (
                  <TabsTrigger value="yield-forecast">
                    <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                    Yield Forecast
                  </TabsTrigger>
                )}
                {canShowActivityLog && (
                  <TabsTrigger value="activity-log">
                    <History className="h-3.5 w-3.5 mr-1.5" />
                    Activity Log
                  </TabsTrigger>
                )}
                {canShowRainfallSection && (
                  <TabsTrigger value="rainfall">
                    <CloudRain className="h-3.5 w-3.5 mr-1.5" />
                    Rainfall
                  </TabsTrigger>
                )}
                {canShowJournal && (
                  <TabsTrigger value="journal" className="flex items-center gap-2">
                    <NotebookPen className="h-3.5 w-3.5" />
                    Journal
                  </TabsTrigger>
                )}
                {canShowResources && (
                  <TabsTrigger value="resources" className="flex items-center gap-2">
                    <BookOpen className="h-3.5 w-3.5" />
                    Resources
                  </TabsTrigger>
                )}
                {canShowAiAnalysis && (
                  <TabsTrigger value="ai-analysis">
                    <Brain className="h-3.5 w-3.5 mr-1.5" />
                    AI Analysis
                  </TabsTrigger>
                )}
                {canShowNews && (
                  <TabsTrigger value="news">
                    <Newspaper className="h-3.5 w-3.5 mr-1.5" />
                    News
                  </TabsTrigger>
                )}
              </div>
            )}
          </TabsList>

          <TabsContent value="home" className="space-y-6">
            <div
              className={cn(
                "grid grid-cols-1 gap-4 sm:grid-cols-2",
                showFinancialHomeCards ? "xl:grid-cols-4 2xl:grid-cols-6" : "xl:grid-cols-4",
              )}
            >
              <Card className="border-black/5 bg-white/90">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-neutral-600">Processing Output</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums text-neutral-900">
                    {formatNumber(processingTotals.arabicaKg + processingTotals.robustaKg, 0)} kg
                  </p>
                  <p className="text-xs text-muted-foreground">{currentFiscalYear.label}</p>
                </CardContent>
              </Card>
              <Card className="border-black/5 bg-white/90">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-neutral-600">Dispatch Received</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums text-neutral-900">
                    {formatNumber(dispatchReceivedKgsTotal, 0)} kg
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(dispatchHeroTotals.arabicaBags + dispatchHeroTotals.robustaBags, 0)} bags in{" "}
                    {formatCount(dispatchHeroTotals.totalDispatches)} records
                  </p>
                </CardContent>
              </Card>
              {canShowSales && (
                <>
                  <Card className="border-black/5 bg-white/90">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-neutral-600">Sales Sold</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold tabular-nums text-neutral-900">{formatNumber(salesSoldKgsTotal, 0)} kg</p>
                      <p className="text-xs text-muted-foreground">{formatCount(salesHeroTotals.totalSales)} sales entries</p>
                    </CardContent>
                  </Card>
                  <Card className="border-black/5 bg-white/90">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-neutral-600">Saleable Coffee</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p
                        className={cn("text-2xl font-semibold tabular-nums", overdrawnCoffeeKgs > 0 ? "text-rose-700" : "text-neutral-900")}
                      >
                        {formatNumber(overdrawnCoffeeKgs > 0 ? overdrawnCoffeeKgs : saleableCoffeeKgs, 0)} kg
                      </p>
                      <p className={cn("text-xs", overdrawnCoffeeKgs > 0 ? "text-rose-700" : "text-muted-foreground")}>
                        {overdrawnCoffeeKgs > 0 ? "Overdrawn (sold exceeds received)" : "Dispatch received minus sold"}
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}
              {showFinancialHomeCards && (
                <>
                  <Card className="border-black/5 bg-white/90">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-neutral-600">Sales Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold tabular-nums text-neutral-900">{formatCurrency(salesHeroTotals.totalRevenue, 0)}</p>
                      <p className="text-xs text-muted-foreground">{formatCount(salesHeroTotals.totalSales)} sales entries</p>
                    </CardContent>
                  </Card>
                  <Card className="border-black/5 bg-white/90">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-neutral-600">Live Position</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold tabular-nums text-neutral-900">
                        {formatCurrency(salesHeroTotals.totalRevenue - accountsTotals.grandTotal + receivablesHeroTotals.totalOutstanding, 0)}
                      </p>
                      <p className="text-xs text-muted-foreground">Booked net + receivables</p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            <div className={cn("grid grid-cols-1 gap-4", canShowSales && "xl:grid-cols-2")}>
              <Card className="border-black/5 bg-white/90">
                <CardHeader>
                  <CardTitle>Estate Snapshot</CardTitle>
                  <CardDescription>Live operational context for this tenant.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-black/5 bg-white p-3">
                      <div className="flex items-center gap-1">
                        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Active Locations</p>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label="Active locations help"
                                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700"
                              >
                                <Info className="h-2.5 w-2.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Count of configured estate locations available for records.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">{formatCount(estateMetrics.locationCount)}</p>
                    </div>
                    <div className="rounded-xl border border-black/5 bg-white p-3">
                      <div className="flex items-center gap-1">
                        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">24h Activity</p>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label="24h activity help"
                                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700"
                              >
                                <Info className="h-2.5 w-2.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Inventory transactions recorded in the last 24 hours.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">{formatCount(estateMetrics.recentActivity)}</p>
                    </div>
                    <div className="rounded-xl border border-black/5 bg-white p-3">
                      <div className="flex items-center gap-1">
                        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Open Alerts</p>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label="Open alerts help"
                                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-black/10 text-neutral-500 hover:text-neutral-700"
                              >
                                <Info className="h-2.5 w-2.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Active season exceptions requiring review or action.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">{formatCount(exceptionsSummary.count)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {canShowSales && (
                <Card className="border-black/5 bg-gradient-to-br from-emerald-50/60 to-white">
                  <CardHeader>
                    <CardTitle>Operational Confidence</CardTitle>
                    <CardDescription>Single source logic used in cards, Dispatch, and Sales guardrails.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium", reconciliationStatusTone)}>
                      Reconciliation: {reconciliationStatusLabel}
                    </div>
                    <div className="rounded-xl border border-black/5 bg-white/90 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Formula</p>
                      <p className="mt-1 text-sm text-neutral-700">
                        Saleable KGs = Dispatch Received KGs - Sales Sold KGs
                      </p>
                      <p className="mt-2 text-sm text-neutral-700">
                        {formatNumber(dispatchReceivedKgsTotal, 0)} - {formatNumber(salesSoldKgsTotal, 0)} ={" "}
                        <span className={cn("font-semibold", overdrawnCoffeeKgs > 0 ? "text-rose-700" : "text-emerald-700")}>
                          {overdrawnCoffeeKgs > 0 ? `-${formatNumber(overdrawnCoffeeKgs, 0)}` : formatNumber(saleableCoffeeKgs, 0)} kg
                        </span>
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sales validation checks coffee type + bag type stock first. Location is retained for traceability.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {canShowDispatch && (
                        <Button size="sm" variant="outline" onClick={() => setActiveTab("dispatch")} className="bg-white">
                          Reconcile Dispatch
                        </Button>
                      )}
                      {canShowSales && (
                        <Button size="sm" variant="outline" onClick={() => setActiveTab("sales")} className="bg-white">
                          Review Sales Guardrails
                        </Button>
                      )}
                      {canShowActivityLog && (
                        <Button size="sm" variant="outline" onClick={() => setActiveTab("activity-log")} className="bg-white">
                          Open Activity Log
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {!isScopedUser && (
              <Card className="border-black/5 bg-white/90">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Today&apos;s Brief</CardTitle>
                    <CardDescription>Pattern-aware summary from operations and accounts signals.</CardDescription>
                  </div>
                  <Badge variant="outline" className="w-fit bg-emerald-50 text-emerald-700 border-emerald-200">
                    Smart Layer
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  {intelligenceLoading ? (
                    <div className="flex items-center gap-2 text-sm text-neutral-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Building daily brief...
                    </div>
                  ) : intelligenceError ? (
                    <p className="text-sm text-rose-600">{intelligenceError}</p>
                  ) : intelligenceHighlights.length > 0 ? (
                    <>
                      <div className="grid gap-2 md:grid-cols-2">
                        {intelligenceHighlights.slice(0, 4).map((highlight, index) => (
                          <div key={`${highlight}-${index}`} className="rounded-xl border border-black/5 bg-white p-3">
                            <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">Insight {index + 1}</p>
                            <p className="mt-1 text-sm text-neutral-800">{highlight}</p>
                          </div>
                        ))}
                      </div>
                      {(intelligenceTopCostCode || intelligenceTopFrequencyCode) && (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          {intelligenceTopCostCode && (
                            <div className="rounded-xl border border-black/5 bg-white p-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Highest Cost Code</p>
                              <p className="mt-1 text-sm font-semibold text-neutral-900">
                                {intelligenceTopCostCode.code} · {intelligenceTopCostCode.reference}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                ₹{formatNumber(intelligenceTopCostCode.totalAmount, 0)} across{" "}
                                {formatCount(intelligenceTopCostCode.entryCount)} entries
                              </p>
                            </div>
                          )}
                          {intelligenceTopFrequencyCode && (
                            <div className="rounded-xl border border-black/5 bg-white p-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Most Frequent Code</p>
                              <p className="mt-1 text-sm font-semibold text-neutral-900">
                                {intelligenceTopFrequencyCode.code} · {intelligenceTopFrequencyCode.reference}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatCount(intelligenceTopFrequencyCode.entryCount)} entries · ₹
                                {formatNumber(intelligenceTopFrequencyCode.totalAmount, 0)}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      {intelligenceActions.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {intelligenceActions
                            .filter((action) => visibleTabs.includes(action.tab))
                            .map((action) => (
                              <Button
                                key={`${action.tab}-${action.label}`}
                                size="sm"
                                variant="outline"
                                onClick={() => setActiveTab(action.tab)}
                                className="bg-white"
                              >
                                {action.label}
                              </Button>
                            ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No insights yet. Add more operations data to activate the daily brief.</p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="border-black/5 bg-white/90">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Priority Alerts</CardTitle>
                  <CardDescription>High-signal issues to clear before day-end close.</CardDescription>
                </div>
                {canShowSeason && (
                  <Button size="sm" variant="outline" onClick={() => setActiveTab("season")} className="bg-white">
                    Open Season Alerts
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {exceptionsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-neutral-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading alerts...
                  </div>
                ) : exceptionsError ? (
                  <p className="text-sm text-rose-600">{exceptionsError}</p>
                ) : exceptionsSummary.count === 0 ? (
                  <p className="text-sm text-emerald-700">No active alerts right now.</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-3">
                    {(exceptionsSummary.highlights || []).slice(0, 3).map((item, index) => (
                      <div key={`${item}-${index}`} className="rounded-xl border border-amber-100 bg-amber-50/70 p-3">
                        <p className="text-xs uppercase tracking-[0.16em] text-amber-700">Alert {index + 1}</p>
                        <p className="mt-1 text-sm text-amber-900">{item}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {canShowInventory && (
            <TabsContent value="inventory" className="space-y-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="space-y-6 lg:col-span-8">
                  {canShowSeason && (
                    <Card className="rounded-2xl border border-black/5 bg-white shadow-sm">
                      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2 text-neutral-900">
                            <AlertTriangle className="h-5 w-5 text-emerald-600" />
                            System status
                          </CardTitle>
                          <CardDescription className="text-sm text-neutral-500">
                            Monitor operational risks across inventory, processing, and dispatch.
                          </CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setActiveTab("season")}>
                          Open Season View
                        </Button>
                      </CardHeader>
                      <CardContent>
                        {exceptionsLoading ? (
                          <div className="flex items-center gap-2 text-sm text-neutral-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading system status...
                          </div>
                        ) : exceptionsError ? (
                          <div className="text-sm text-rose-600">{exceptionsError}</div>
                        ) : exceptionsSummary.count === 0 ? (
                          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                              <CheckCircle2 className="h-4 w-4" />
                              All clear
                            </div>
                            <p className="mt-1 text-xs text-emerald-700/70">
                              No anomalies detected in the last 7 days.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="text-sm font-medium text-amber-800">
                              {exceptionsSummary.count} active alert{exceptionsSummary.count === 1 ? "" : "s"}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                              {(exceptionsSummary.highlights || []).slice(0, 3).map((item, index) => (
                                <div
                                  key={`${item}-${index}`}
                                  className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3"
                                >
                                  <p className="text-xs uppercase tracking-[0.16em] text-amber-700">
                                    Alert {index + 1}
                                  </p>
                                  <p className="mt-2 text-sm text-amber-900">{item}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
                    <div className="mb-6 flex flex-col gap-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <h2 className="text-base font-semibold text-neutral-900 flex items-center">
                            <List className="mr-2 h-5 w-5 text-emerald-600" /> Current Inventory Levels
                          </h2>
                          <p className="text-xs text-neutral-500">Totals for {selectedLocationLabel}.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={exportInventoryToCSV} className="h-10 bg-transparent">
                            <Download className="mr-2 h-4 w-4" /> Export
                          </Button>
                          <Button
                            size="sm"
                            onClick={openNewItemDialog}
                            className="bg-emerald-700 hover:bg-emerald-800 h-10 text-white shadow-sm"
                          >
                            <Plus className="mr-2 h-4 w-4" /> Add New Item
                          </Button>
                        </div>
                      </div>
                      <div className="text-xs text-neutral-500">
                        <span className="font-medium text-neutral-700 tabular-nums">
                          {formatNumber(filteredInventoryTotals.itemCount)}
                        </span>{" "}
                        items ·{" "}
                        <span className="font-medium text-neutral-700 tabular-nums">
                          {formatNumber(filteredInventoryTotals.totalQuantity)} {filteredInventoryTotals.unitLabel}
                        </span>{" "}
                        total ·{" "}
                        <span className="font-medium text-amber-700 tabular-nums">
                          {formatCurrency(filteredInventoryTotals.totalValue)}
                        </span>{" "}
                        value
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 mb-5">
                      <div className="relative flex-grow">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
                        <Input
                          placeholder="Search inventory..."
                          value={inventorySearchTerm}
                          onChange={(e) => setInventorySearchTerm(e.target.value)}
                          className="pl-10 h-11 rounded-xl border-black/5 bg-white focus-visible:ring-2 focus-visible:ring-emerald-200"
                        />
                      </div>
                      <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                        <SelectTrigger className="w-full sm:w-52 h-11 rounded-xl border-black/5 bg-white focus-visible:ring-2 focus-visible:ring-emerald-200">
                          <SelectValue placeholder="All locations" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[40vh] overflow-y-auto">
                          <SelectItem value={LOCATION_ALL}>All locations</SelectItem>
                          <SelectItem value={LOCATION_UNASSIGNED}>{UNASSIGNED_LABEL}</SelectItem>
                          {locations.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id}>
                              {loc.name || loc.code || "Unnamed location"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={toggleInventorySort}
                        className="flex items-center gap-1 h-11 whitespace-nowrap bg-white"
                      >
                        {inventorySortOrder === "asc" ? (
                          <>
                            <SortAsc className="h-4 w-4 mr-1" /> Sort A-Z
                          </>
                        ) : inventorySortOrder === "desc" ? (
                          <>
                            <SortDesc className="h-4 w-4 mr-1" /> Sort Z-A
                          </>
                        ) : (
                          <>
                            <SortAsc className="h-4 w-4 mr-1" /> Sort
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {filteredAndSortedInventory.map((item, index) => {
                        const valueInfo = resolveItemValue(item)
                        const itemValue = valueInfo.totalValue || 0
                        const avgPrice = valueInfo.avgPrice || 0
                        const itemInitial = item.name?.charAt(0)?.toUpperCase() || "I"
                        const isSelectedForDrilldown = item.name === inventoryDrilldownItemName
                        return (
                          <div
                            key={`${item.name}-${index}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => setInventoryDrilldownItemName(item.name)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault()
                                setInventoryDrilldownItemName(item.name)
                              }
                            }}
                            className={cn(
                              "group rounded-2xl border border-black/5 bg-white p-4 shadow-sm transition-colors hover:bg-emerald-50/40",
                              "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200",
                              isSelectedForDrilldown && "border-emerald-200 bg-emerald-50/60",
                            )}
                            aria-label={`Open drill-down for ${item.name}`}
                          >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 text-sm font-semibold">
                                  {itemInitial}
                                </div>
                                <div>
                                  <div className="text-base font-semibold text-neutral-900">{item.name}</div>
                                  <div className="text-xs text-neutral-500">
                                    {avgPrice > 0
                                      ? `Avg ${formatCurrency(avgPrice)}/${item.unit || "unit"}`
                                      : "Pricing not yet recorded"}
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-4 sm:justify-end">
                                <div className="text-left sm:text-right">
                                  <p className="text-xs uppercase tracking-[0.18em] text-neutral-400">Qty</p>
                                  <p className="text-sm font-semibold text-neutral-800 tabular-nums">
                                    {formatNumber(Number(item.quantity) || 0)} {item.unit}
                                  </p>
                                </div>
                                <div className="text-left sm:text-right">
                                  <p className="text-xs uppercase tracking-[0.18em] text-neutral-400">Value</p>
                                  <p className="text-sm font-semibold text-amber-700 tabular-nums">
                                    {formatCurrency(itemValue)}
                                  </p>
                                </div>
                                {canManageData && (
                                  <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={(event) => {
                                                event.stopPropagation()
                                                handleOpenInventoryEdit(item)
                                              }}
                                              disabled={selectedLocationId === LOCATION_ALL}
                                              className="text-amber-600 p-2 h-auto"
                                            >
                                              <Edit className="h-4 w-4" />
                                            </Button>
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {selectedLocationId === LOCATION_ALL
                                            ? "Select a specific location to edit quantities."
                                            : "Edit inventory item"}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        handleDeleteInventoryItem(item)
                                      }}
                                      className="text-red-600 p-2 h-auto"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {filteredAndSortedInventory.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        {inventorySearchTerm ? "No items match your search." : "Inventory is empty or not yet loaded."}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-6 lg:col-span-4">
                  <Card className="rounded-2xl border border-black/5 bg-white shadow-sm">
                    <CardHeader className="space-y-1">
                      <CardTitle className="text-base font-semibold text-neutral-900">Item Drill-Down</CardTitle>
                      <CardDescription className="text-xs text-neutral-500">
                        Click an inventory item to view recent stock movements.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {!selectedInventoryDrilldownItem ? (
                        <div className="rounded-xl border border-dashed border-black/10 bg-neutral-50/70 px-4 py-5 text-sm text-neutral-600">
                          Select an inventory item to open its recent transaction timeline.
                        </div>
                      ) : (
                        <>
                          <div className="rounded-xl border border-black/10 bg-neutral-50/60 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-neutral-900">{selectedInventoryDrilldownItem.name}</p>
                                <p className="text-xs text-neutral-500">
                                  {formatNumber(Number(selectedInventoryDrilldownItem.quantity) || 0)}{" "}
                                  {selectedInventoryDrilldownItem.unit || "unit"} on hand
                                </p>
                              </div>
                              <Badge variant="outline" className="text-xs uppercase tracking-[0.1em]">
                                {selectedLocationLabel}
                              </Badge>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                              <div className="rounded-lg bg-white px-3 py-2">
                                <p className="text-neutral-500">Avg cost</p>
                                <p className="font-semibold text-neutral-900 tabular-nums">
                                  {formatCurrency(selectedInventoryDrilldownValue?.avgPrice || 0)}
                                </p>
                              </div>
                              <div className="rounded-lg bg-white px-3 py-2">
                                <p className="text-neutral-500">Total value</p>
                                <p className="font-semibold text-amber-700 tabular-nums">
                                  {formatCurrency(selectedInventoryDrilldownValue?.totalValue || 0)}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Recent Transactions</p>
                              <Button
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-emerald-700"
                                onClick={handleOpenItemDrilldownHistory}
                              >
                                View full history
                              </Button>
                            </div>
                            {recentDrilldownTransactions.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-black/10 bg-white px-3 py-4 text-xs text-neutral-500">
                                No transactions found for this item in the current location filter.
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {recentDrilldownTransactions.map((transaction) => {
                                  const txType = String(transaction.transaction_type || "").toLowerCase()
                                  const isDepleting = txType.includes("deplet")
                                  return (
                                    <div
                                      key={`drilldown-${transaction.id ?? `${transaction.item_type}-${transaction.transaction_date}`}`}
                                      className="rounded-xl border border-black/5 bg-white px-3 py-2"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs text-neutral-500">{formatDate(transaction.transaction_date)}</p>
                                        <Badge
                                          variant="outline"
                                          className={isDepleting ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}
                                        >
                                          {isDepleting ? "Deplete" : "Restock"}
                                        </Badge>
                                      </div>
                                      <p className="mt-1 text-sm font-semibold text-neutral-900 tabular-nums">
                                        {isDepleting ? "-" : "+"}
                                        {formatNumber(Number(transaction.quantity) || 0)} {transaction.unit || selectedInventoryDrilldownItem.unit || "unit"}
                                      </p>
                                      <p className="text-xs text-neutral-500">
                                        {resolveLocationLabel(transaction.location_id, transaction.location_name || transaction.location_code)}
                                      </p>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border border-black/5 bg-white shadow-sm">
                    <CardHeader className="space-y-1">
                      <CardTitle className="text-base font-semibold text-neutral-900">Actions</CardTitle>
                      <CardDescription className="text-xs text-neutral-500">
                        Quick shortcuts for inventory work.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setIsMovementDrawerOpen(true)}
                        className="flex w-full items-center justify-between rounded-xl border border-black/5 bg-white px-4 py-3 text-sm text-neutral-800 transition-colors hover:bg-neutral-50"
                      >
                        <span className="flex items-center gap-2">
                          <Plus className="h-4 w-4 text-emerald-600" />
                          Record movement
                        </span>
                        <span className="text-xs text-neutral-400">Form</span>
                      </button>
                      <button
                        type="button"
                        onClick={openNewItemDialog}
                        className="flex w-full items-center justify-between rounded-xl border border-black/5 bg-white px-4 py-3 text-sm text-neutral-800 transition-colors hover:bg-neutral-50"
                      >
                        <span className="flex items-center gap-2">
                          <Plus className="h-4 w-4 text-emerald-600" />
                          Add new item
                        </span>
                        <span className="text-xs text-neutral-400">Inventory</span>
                      </button>
                      <button
                        type="button"
                        onClick={exportInventoryToCSV}
                        className="flex w-full items-center justify-between rounded-xl border border-black/5 bg-white px-4 py-3 text-sm text-neutral-800 transition-colors hover:bg-neutral-50"
                      >
                        <span className="flex items-center gap-2">
                          <Download className="h-4 w-4 text-emerald-600" />
                          Export inventory
                        </span>
                        <span className="text-xs text-neutral-400">CSV</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("transactions")}
                        className="flex w-full items-center justify-between rounded-xl border border-black/5 bg-white px-4 py-3 text-sm text-neutral-800 transition-colors hover:bg-neutral-50"
                      >
                        <span className="flex items-center gap-2">
                          <History className="h-4 w-4 text-emerald-600" />
                          View transactions
                        </span>
                        <span className="text-xs text-neutral-400">History</span>
                      </button>
                      <div className="rounded-xl border border-black/5 bg-neutral-50/70 px-4 py-3 text-xs text-neutral-600 space-y-2">
                        <div className="flex items-center justify-between">
                          <span>Default location</span>
                          <span className="text-neutral-900">{selectedLocationLabel}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Transaction type</span>
                          <span className="text-neutral-900">Restock / Deplete</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Units</span>
                          <span className="text-neutral-900">{newTransaction?.unit || "kg"}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          )}

          {showTransactionHistory && (
            <TabsContent value="transactions" className="space-y-6">
              {/* Transactions UI (search, filter, table) */}
              <div className="rounded-2xl border border-black/5 bg-white/85 p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
                  <div>
                    <h2 className="text-lg font-semibold text-emerald-700 flex items-center">
                      <History className="mr-2 h-5 w-5" /> Transaction History
                    </h2>
                    <p className="text-xs text-muted-foreground">Inventory adjustments and usage across the estate.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={exportToCSV} className="h-10 bg-transparent"><Download className="mr-2 h-4 w-4" /> Export</Button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-between mb-5 gap-4">
                  <div className="flex flex-col sm:flex-row gap-3 flex-grow">
                    <div className="relative flex-grow">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/70" />
                      <Input
                        placeholder="Search transactions..."
                        value={transactionSearchTerm}
                        onChange={(e) => setTransactionSearchTerm(e.target.value)}
                        className="pl-10 h-10"
                      />
                    </div>
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger className="w-full sm:w-40 h-10 border-border/70 bg-white/80">
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[40vh] overflow-y-auto">
                        <SelectItem value="All Types">All Types</SelectItem>
                        {allItemTypesForDropdown.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                      <SelectTrigger className="w-full sm:w-48 h-10 border-border/70 bg-white/80">
                        <SelectValue placeholder="All locations" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[40vh] overflow-y-auto">
                        <SelectItem value={LOCATION_ALL}>All locations</SelectItem>
                        <SelectItem value={LOCATION_UNASSIGNED}>{UNASSIGNED_LABEL}</SelectItem>
                        {locations.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id}>
                            {loc.name || loc.code || "Unnamed location"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button variant="outline" size="sm" onClick={toggleTransactionSort} className="flex items-center gap-1 h-10 whitespace-nowrap bg-transparent">
                    {transactionSortOrder === "desc" ? (<><SortDesc className="h-4 w-4 mr-1" /> Date: Newest First</>) : (<><SortAsc className="h-4 w-4 mr-1" /> Date: Oldest First</>)}
                  </Button>
                </div>
                {hasLegacyUnassignedTransactions && selectedLocationId !== LOCATION_UNASSIGNED && (
                  <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-emerald-700/80">
                    <span>Legacy transactions without location live under {UNASSIGNED_LABEL}.</span>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => setSelectedLocationId(LOCATION_UNASSIGNED)}
                      className="h-auto p-0 text-emerald-700"
                    >
                      View unassigned
                    </Button>
                  </div>
                )}

                <div className="border border-border/60 rounded-lg overflow-x-auto bg-white/80">
                  <table className="min-w-full">
                    <thead>
                      <tr className="bg-muted/60 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/80 border-b sticky top-0 backdrop-blur">
                        <th className="py-4 px-4 text-left">Date</th>
                        <th className="py-4 px-4 text-left">Location</th>
                        <th className="py-4 px-4 text-left">Item Type</th>
                        <th className="py-4 px-4 text-left">Quantity</th>
                        <th className="py-4 px-4 text-left">Transaction</th>
                        {!isMobile && (
                          <>
                            <th className="py-4 px-4 text-left">Price</th>
                            <th className="py-4 px-4 text-left">Notes</th>
                            <th className="py-4 px-4 text-left">User</th>
                          </>
                        )}
                        <th className="py-4 px-4 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentTransactions.map((transaction, index) => {
                        const typeValue = String(transaction.transaction_type ?? "").toLowerCase()
                        const isDepleting = typeValue.includes("deplet")
                        const isRestocking = typeValue.includes("restock")
                        const typeLabel = isDepleting ? "Depleting" : isRestocking ? "Restocking" : transaction.transaction_type
                        const typeClass = isDepleting
                          ? "bg-red-100 text-red-700 border-red-200"
                          : isRestocking
                            ? "bg-green-100 text-green-700 border-green-200"
                            : "bg-blue-100 text-blue-700 border-blue-200"

                        return (
                        <tr
                          key={transaction.id ?? `${transaction.item_type}-${transaction.transaction_date}`}
                          className={`border-b last:border-0 hover:bg-muted/30 ${index % 2 === 0 ? "bg-white/90" : "bg-muted/10"}`}
                        >
                          <td className="py-4 px-4">{formatDate(transaction.transaction_date)}</td>
                          <td className="py-4 px-4">{resolveLocationLabel(transaction.location_id, transaction.location_name || transaction.location_code)}</td>
                          <td className="py-4 px-4">{transaction.item_type}</td>
                          <td className="py-4 px-4">
                            {formatNumber(Number(transaction.quantity) || 0)} {transaction.unit}
                          </td>
                          <td className="py-4 px-4">
                            <Badge variant="outline" className={typeClass}>{typeLabel}</Badge>
                          </td>
                          {!isMobile && (<>
                            <td className="py-4 px-4">{transaction.price ? formatCurrency(Number(transaction.price) || 0) : "-"}</td>
                            <td className="py-4 px-4 max-w-xs truncate" title={transaction.notes}>{transaction.notes}</td>
                            <td className="py-4 px-4">{transaction.user_id}</td>
                          </>)}
                          <td className="py-4 px-4">
                            <div className="flex gap-2">
                              <Button size="sm" variant="ghost" onClick={() => handleEditTransaction(transaction)} className="text-amber-600 p-2 h-auto"><Edit className="h-4 w-4" /></Button>
                              {canManageData && (
                                <Button size="sm" variant="ghost" onClick={() => handleDeleteConfirm(transaction.id)} className="text-red-600 p-2 h-auto"><Trash2 className="h-4 w-4" /></Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                  {transactions.length === 0 && (
                    <div className="text-center py-10 text-muted-foreground">No transactions recorded yet.</div>
                  )}
                  {transactions.length > 0 && filteredTransactions.length === 0 && (
                    <div className="text-center py-10 text-muted-foreground">
                      No transactions found matching your current filters.
                    </div>
                  )}
                </div>

                {filteredTransactions.length > 0 && (
                  <div className="flex justify-between items-center mt-4">
                    <div className="text-sm text-muted-foreground">
                      Showing {Math.min(startIndex + 1, filteredTransactions.length)} to {endIndex} of {filteredTransactions.length} transactions
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} disabled={currentPage === 1}>Previous</Button>
                      <Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages || totalPages === 0}>Next</Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          )}

          {canShowAccounts && (
            <TabsContent value="accounts" className="space-y-6">
              <AccountsPage />
            </TabsContent>
          )}

          {canShowBalanceSheet && (
            <TabsContent value="balance-sheet" className="space-y-6">
              <BalanceSheetTab />
            </TabsContent>
          )}

          {canShowReceivables && (
            <TabsContent value="receivables" className="space-y-6">
              <ReceivablesTab />
            </TabsContent>
          )}

          {canShowProcessing && (
            <TabsContent value="processing" className="space-y-6">
              <ProcessingTab />
            </TabsContent>
          )}
          {canShowDispatch && (
            <TabsContent value="dispatch" className="space-y-6">
              <DispatchTab />
            </TabsContent>
          )}
          {canShowSales && (
            <TabsContent value="sales" className="space-y-6">
              <SalesTab />
            </TabsContent>
          )}
          {canShowOtherSales && (
            <TabsContent value="other-sales" className="space-y-6">
              <OtherSalesTab />
            </TabsContent>
          )}
          {canShowCuring && (
            <TabsContent value="curing" className="space-y-6">
              <CuringTab />
            </TabsContent>
          )}
          {canShowQuality && (
            <TabsContent value="quality" className="space-y-6">
              <QualityGradingTab />
            </TabsContent>
          )}
          {canShowSeason && (
            <TabsContent value="season" className="space-y-6">
              <SeasonDashboard />
            </TabsContent>
          )}
          {canShowYieldForecast && (
            <TabsContent value="yield-forecast" className="space-y-6">
              <YieldForecastTab />
            </TabsContent>
          )}
          {canShowActivityLog && (
            <TabsContent value="activity-log" className="space-y-6">
              <ActivityLogTab tenantId={activityTenantId} />
            </TabsContent>
          )}
          {canShowRainfallSection && (
            <TabsContent value="rainfall" className="space-y-6">
              <RainfallWeatherTab
                username={user?.username || "system"}
                showRainfall={canShowRainfall}
                showWeather={canShowWeather}
              />
            </TabsContent>
          )}
          {canShowPepper && (
            <TabsContent value="pepper" className="space-y-6">
              <PepperTab />
            </TabsContent>
          )}
          {canShowJournal && (
            <TabsContent value="journal" className="space-y-6">
              <JournalTab />
            </TabsContent>
          )}
          {canShowResources && (
            <TabsContent value="resources" className="space-y-6">
              <ResourcesTab />
            </TabsContent>
          )}
          {canShowAiAnalysis && (
            <TabsContent value="ai-analysis" className="space-y-6">
              <AiAnalysisCharts inventory={inventory} transactions={transactions} />

              <Card className="border-border/70 bg-white/85">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-emerald-700" />
                      AI Inventory Analysis
                    </CardTitle>
                    <CardDescription>Get AI-powered insights about your inventory patterns and usage trends.</CardDescription>
                  </div>
                  <Button onClick={generateAIAnalysis} disabled={isAnalyzing} className="bg-emerald-700 hover:bg-emerald-800">
                    {isAnalyzing ? "Analyzing..." : "Generate Analysis"}
                  </Button>
                </CardHeader>
                <CardContent>
                  {analysisError && <div className="text-sm text-red-600 mb-3">{analysisError}</div>}
                  {aiAnalysis ? (
                    <div className="whitespace-pre-line text-sm text-foreground">{aiAnalysis}</div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Run the AI analysis to see insights and recommendations.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
          {canShowNews && (
            <TabsContent value="news" className="space-y-6">
              <NewsTab />
            </TabsContent>
          )}
          {canShowBilling && (
            <TabsContent value="billing" className="space-y-6">
              <BillingTab />
            </TabsContent>
          )}
            </Tabs>
        {isMovementDrawerOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => setIsMovementDrawerOpen(false)}
          >
            <div
              className="absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto p-4 sm:p-6"
              onClick={(event) => event.stopPropagation()}
            >
              {recordMovementPanel}
            </div>
          </div>
        )}
        {isNewItemDialogOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => {
              setIsNewItemDialogOpen(false)
              resetNewItemForm()
            }}
          >
            <div
              className="w-full max-w-xl rounded-lg bg-white p-6 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Add Inventory Item</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsNewItemDialogOpen(false)
                    resetNewItemForm()
                  }}
                >
                  Close
                </Button>
              </div>
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="new-item-name">Item Name</Label>
                    <Input
                      id="new-item-name"
                      value={newItemForm.name}
                      placeholder="e.g., MOP, Urea, Parchment bags"
                      onChange={(event) => setNewItemForm((prev) => ({ ...prev, name: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-item-unit">Unit</Label>
                    <Select
                      value={newItemForm.unit}
                      onValueChange={(value) => setNewItemForm((prev) => ({ ...prev, unit: value }))}
                    >
                      <SelectTrigger id="new-item-unit" className="w-full">
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="bags">bags</SelectItem>
                        <SelectItem value="L">L</SelectItem>
                        <SelectItem value="units">units</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-item-location">Location</Label>
                  <Select
                    value={newItemForm.locationId}
                    onValueChange={(value) => setNewItemForm((prev) => ({ ...prev, locationId: value }))}
                  >
                    <SelectTrigger id="new-item-location" className="w-full">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[40vh] overflow-y-auto">
                      <SelectItem value={LOCATION_UNASSIGNED}>{UNASSIGNED_LABEL}</SelectItem>
                      {locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name || loc.code || "Unnamed location"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Choose where this item is stored.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="new-item-qty">Initial Quantity (optional)</Label>
                    <Input
                      id="new-item-qty"
                      type="number"
                      min={0}
                      step="0.01"
                      value={newItemForm.quantity}
                      onKeyDown={preventNegativeKey}
                      onChange={(event) =>
                        setNewItemForm((prev) => ({ ...prev, quantity: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-item-price">Unit Price (optional)</Label>
                    <Input
                      id="new-item-price"
                      type="number"
                      min={0}
                      step="0.01"
                      value={newItemForm.price}
                      onKeyDown={preventNegativeKey}
                      onChange={(event) =>
                        setNewItemForm((prev) => ({ ...prev, price: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-item-notes">Notes (optional)</Label>
                  <Textarea
                    id="new-item-notes"
                    value={newItemForm.notes}
                    placeholder="Supplier, batch number, or usage notes"
                    onChange={(event) => setNewItemForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsNewItemDialogOpen(false)
                    resetNewItemForm()
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreateNewItem} disabled={isSavingNewItem}>
                  {isSavingNewItem ? "Saving..." : "Add Item"}
                </Button>
              </div>
            </div>
          </div>
        )}
        {isEditDialogOpen && editingTransaction && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => {
              setIsEditDialogOpen(false)
              setEditingTransaction(null)
            }}
          >
            <div
              className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Edit Transaction</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsEditDialogOpen(false)
                    setEditingTransaction(null)
                  }}
                >
                  Close
                </Button>
              </div>
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="edit-transaction-item">Item Type</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Edit item type help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Choose the inventory item tied to this transaction.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="edit-transaction-item"
                      value={editingTransaction.item_type}
                      onChange={(event) => handleEditTransactionChange("item_type", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="edit-transaction-type">Transaction Type</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Edit transaction type help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Restocking adds stock, depleting reduces it.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Select
                      value={editingTransaction.transaction_type}
                      onValueChange={(value) => handleEditTransactionChange("transaction_type", value)}
                    >
                      <SelectTrigger id="edit-transaction-type" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="restock">Restocking</SelectItem>
                        <SelectItem value="deplete">Depleting</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="edit-transaction-location">Location</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Edit location help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Location ties the transaction to an estate block.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Select
                    value={editingTransaction.location_id ?? LOCATION_UNASSIGNED}
                    onValueChange={(value) =>
                      handleEditTransactionChange("location_id", value === LOCATION_UNASSIGNED ? null : value)
                    }
                  >
                    <SelectTrigger id="edit-transaction-location" className="w-full">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[40vh] overflow-y-auto">
                      <SelectItem value={LOCATION_UNASSIGNED}>{UNASSIGNED_LABEL}</SelectItem>
                      {locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name || loc.code || "Unnamed location"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!editingTransaction.location_id && (
                    <p className="text-xs text-muted-foreground">
                      Legacy transaction (no location). Keep Unassigned (legacy) or assign a location.
                    </p>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="edit-transaction-qty">Quantity</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Edit quantity help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Adjusting quantity will recalc inventory totals.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="edit-transaction-qty"
                      type="number"
                      min={0}
                      step="0.01"
                      value={editingTransaction.quantity ?? ""}
                      onKeyDown={preventNegativeKey}
                      onChange={(event) => {
                        const nextValue = coerceNonNegativeNumber(event.target.value)
                        if (nextValue === null) return
                        handleEditTransactionChange("quantity", nextValue)
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="edit-transaction-price">Unit Price</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Edit unit price help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Used to compute total cost for this transaction.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="edit-transaction-price"
                      type="number"
                      value={editingTransaction.price ?? ""}
                      onChange={(event) => handleEditTransactionChange("price", Number(event.target.value))}
                    />
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  Total Cost: {formatCurrency(Number(editingTransaction.total_cost || 0))}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="edit-transaction-notes">Notes</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Edit notes help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Capture lot IDs, buyer refs, or processing notes.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Textarea
                    id="edit-transaction-notes"
                    value={editingTransaction.notes ?? ""}
                    onChange={(event) => handleEditTransactionChange("notes", event.target.value)}
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditDialogOpen(false)
                    setEditingTransaction(null)
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleUpdateTransaction} disabled={isSavingTransactionEdit}>
                  {isSavingTransactionEdit ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </div>
          </div>
        )}
        {isInventoryEditDialogOpen && editingInventoryItem && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => {
              setIsInventoryEditDialogOpen(false)
              setEditingInventoryItem(null)
            }}
          >
            <div
              className="w-full max-w-xl rounded-lg bg-white p-6 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Edit Inventory Item</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsInventoryEditDialogOpen(false)
                    setEditingInventoryItem(null)
                  }}
                >
                  Close
                </Button>
              </div>
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="edit-item-name">Item Name</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Item name help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Use clear names (e.g., Arabica Cherry, Dry Parch).</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="edit-item-name"
                      value={inventoryEditForm.name}
                      onChange={(event) =>
                        setInventoryEditForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="edit-item-unit">Unit</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Unit help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Common units are kg, bags, or liters.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="edit-item-unit"
                      value={inventoryEditForm.unit}
                      onChange={(event) =>
                        setInventoryEditForm((prev) => ({ ...prev, unit: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="edit-item-location">Adjustment Location</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Adjustment location help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Choose where the correction should be applied.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Select value={inventoryEditLocationId} onValueChange={setInventoryEditLocationId}>
                    <SelectTrigger id="edit-item-location" className="w-full">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[40vh] overflow-y-auto">
                      <SelectItem value={LOCATION_UNASSIGNED}>{UNASSIGNED_LABEL}</SelectItem>
                      {locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name || loc.code || "Unnamed location"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Inventory adjustments are recorded against this location.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="edit-item-qty">Quantity</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Adjustment quantity help"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-700"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Updating quantity adds a correction transaction.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="edit-item-qty"
                    type="number"
                    min={0}
                    step="0.01"
                    value={inventoryEditForm.quantity}
                    onKeyDown={preventNegativeKey}
                    onChange={(event) => {
                      const nextValue = event.target.value
                      const numeric = coerceNonNegativeNumber(nextValue)
                      if (numeric === null && nextValue !== "") return
                      setInventoryEditForm((prev) => ({ ...prev, quantity: nextValue }))
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Changing quantity adds a correction transaction to keep history consistent.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsInventoryEditDialogOpen(false)
                    setEditingInventoryItem(null)
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveInventoryEdit} disabled={isSavingInventoryEdit}>
                  {isSavingInventoryEdit ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </div>
          </div>
        )}
        {deleteConfirmDialogOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => {
              setDeleteConfirmDialogOpen(false)
              setTransactionToDelete(null)
            }}
          >
            <div
              className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="text-lg font-semibold">Delete transaction?</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                This will remove the transaction and recalculate inventory totals.
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDeleteConfirmDialogOpen(false)
                    setTransactionToDelete(null)
                  }}
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDeleteTransaction}>
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
