"use client"

import React, { useEffect, useState, useCallback, useMemo } from "react"
import {
  Check,
  Download,
  List,
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
  Cloudy,
  Factory,
  Leaf,
  NotebookPen,
  Receipt,
  Settings,
  Info,
  BookOpen,
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
import { useTenantSettings } from "@/hooks/use-tenant-settings"
import { useRouter, useSearchParams } from "next/navigation"
import InventoryValueSummary from "@/components/inventory-value-summary"
import AiAnalysisCharts from "@/components/ai-analysis-charts"
import AccountsPage from "@/components/accounts-page"
import DispatchTab from "@/components/dispatch-tab"
import ProcessingTab from "@/components/processing-tab"
import RainfallTab from "@/components/rainfall-tab"
import SalesTab from "@/components/sales-tab"
import NewsTab from "@/components/news-tab"
import WeatherTab from "@/components/weather-tab"
import SeasonDashboard from "@/components/season-dashboard"
import CuringTab from "@/components/curing-tab"
import QualityGradingTab from "@/components/quality-grading-tab"
import BillingTab from "@/components/billing-tab"
import JournalTab from "@/components/journal-tab"
import ResourcesTab from "@/components/resources-tab"
import { PepperTab } from "./pepper-tab"
import OnboardingChecklist, { type OnboardingStep } from "@/components/onboarding-checklist"
import Link from "next/link"
import { formatDateForDisplay, generateTimestamp, isWithinLast24Hours } from "@/lib/date-utils"
import { formatCurrency, formatNumber } from "@/lib/format"
import { getCurrentFiscalYear } from "@/lib/fiscal-year-utils"
import { getModuleDefaultEnabled } from "@/lib/modules"
import type { InventoryItem, Transaction } from "@/lib/inventory-types"
import { toast } from "@/components/ui/use-toast"
import { roleLabel } from "@/lib/roles"

// API endpoints (adjust if your routes are different)
const API_TRANSACTIONS = "/api/transactions-neon"
const API_INVENTORY = "/api/inventory-neon"

const LOCATION_ALL = "all"
const LOCATION_UNASSIGNED = "unassigned"
const UNASSIGNED_LABEL = "Unassigned (legacy)"

interface LocationOption {
  id: string
  name: string
  code?: string | null
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
  const [activeTab, setActiveTab] = useState("inventory")
  const [enabledModules, setEnabledModules] = useState<string[] | null>(null)
  const [isModulesLoading, setIsModulesLoading] = useState(false)

  // data & states
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [laborDeployments, setLaborDeployments] = useState<any[]>([])
  const [summary, setSummary] = useState({ total_inventory_value: 0, total_items: 0, total_quantity: 0 })
  const [accountsTotals, setAccountsTotals] = useState({ laborTotal: 0, otherTotal: 0, grandTotal: 0 })
  const [accountsTotalsLoading, setAccountsTotalsLoading] = useState(false)
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
  const [inventorySortOrder, setInventorySortOrder] = useState<"asc" | "desc" | null>(null)
  const [transactionSortOrder, setTransactionSortOrder] = useState<"asc" | "desc">("desc")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState("")
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [showWelcome, setShowWelcome] = useState(false)
  const [exceptionsSummary, setExceptionsSummary] = useState<{ count: number; highlights: string[] }>({
    count: 0,
    highlights: [],
  })
  const [exceptionsLoading, setExceptionsLoading] = useState(false)
  const [exceptionsError, setExceptionsError] = useState<string | null>(null)
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
  const { settings: tenantSettings } = useTenantSettings()
  const tenantId = user?.tenantId || null
  const isAdmin = !!user?.role && user.role.toLowerCase() === "admin"
  const isOwner = !!user?.role && user.role.toLowerCase() === "owner"
  const canManageData = isAdmin || isOwner
  const isTenantLoading = status === "loading"
  const router = useRouter()
  const searchParams = useSearchParams()
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
      if (isOwner) {
        return true
      }
      if (!enabledModules) {
        return getModuleDefaultEnabled(moduleId)
      }
      return enabledModules.includes(moduleId)
    },
    [enabledModules, isOwner],
  )

  // helpers
  const isMobile = useMediaQuery("(max-width: 768px)")
  const currentFiscalYear = useMemo(() => getCurrentFiscalYear(), [])
  const estateMetrics = useMemo(() => {
    const inventoryCount = inventory.length
    const locationCount = locations.length
    const recentActivity = transactions.filter((t) => isWithinLast24Hours(t.transaction_date)).length
    const traceableCount = transactions.filter((t) => Boolean(t.location_id)).length
    const traceabilityCoverage = transactions.length
      ? Math.round((traceableCount / transactions.length) * 100)
      : 0

    return {
      inventoryCount,
      locationCount,
      recentActivity,
      traceabilityCoverage,
      inventoryValue: summary.total_inventory_value,
    }
  }, [inventory.length, locations.length, summary.total_inventory_value, transactions])

  useEffect(() => {
    if (!user) {
      // If auth removed, push to homepage
      router.push("/")
    }
  }, [user, router])

  const loadTenantModules = useCallback(async () => {
    if (!tenantId || isOwner) {
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
  }, [isOwner, tenantId])

  useEffect(() => {
    loadTenantModules()
  }, [loadTenantModules])

  const loadLocations = useCallback(async () => {
    if (!tenantId) return
    try {
      const response = await fetch("/api/locations")
      const data = await response.json()
      const loaded = Array.isArray(data.locations) ? data.locations : []
      setLocations(loaded)
    } catch (error) {
      console.error("Failed to load locations:", error)
    }
  }, [tenantId])

  useEffect(() => {
    loadLocations()
  }, [loadLocations])

  useEffect(() => {
    if (!tenantId) return
    if (activeTab !== "accounts" && activeTab !== "billing") {
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
      const results = await Promise.allSettled([
        fetch("/api/locations"),
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
  }, [tenantId, isOwner])

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

  const inventorySummary = useMemo(
    () => ({
      ...summary,
      total_inventory_value: resolvedInventoryValue,
    }),
    [resolvedInventoryValue, summary],
  )

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

  const pricedItemCount = useMemo(
    () => filteredAndSortedInventory.filter((item) => resolveItemValue(item).avgPrice > 0).length,
    [filteredAndSortedInventory, resolveItemValue],
  )
  const formatCount = useCallback((value: number) => formatNumber(value, 0), [])
  const totalTransactions = transactions.length
  const unassignedTransactions = transactions.filter((t) => !t.location_id).length
  const pricedItemsLabel = `Priced items: ${formatCount(pricedItemCount)}`
  const unassignedLabel = `Unassigned moves: ${formatCount(unassignedTransactions)}`
  const bagWeightLabel = `Standard bag weight: ${formatNumber(tenantSettings.bagWeightKg || 50)} kg`
  const traceabilityLabel = `Traceability coverage: ${estateMetrics.traceabilityCoverage}%`
  const recentActivityLabel = `24h activity: ${formatCount(estateMetrics.recentActivity)}`

  type HeroChip = { icon: React.ElementType; label: string }
  type HeroStat = { label: string; value: string }
  type HeroContent = {
    badge: string
    title: string
    description: string
    chips: HeroChip[]
    stats: HeroStat[]
  }

  const heroContent: HeroContent = useMemo(() => {
    const inventoryStats: HeroStat[] = [
      { label: "Items tracked", value: formatCount(estateMetrics.inventoryCount) },
      { label: "Active locations", value: formatCount(estateMetrics.locationCount) },
      { label: "24h activity", value: formatCount(estateMetrics.recentActivity) },
      { label: "Inventory value", value: formatCurrency(resolvedInventoryValue) },
    ]

    const transactionStats: HeroStat[] = [
      { label: "Total transactions", value: formatCount(totalTransactions) },
      { label: "Unassigned moves", value: formatCount(unassignedTransactions) },
      { label: "Priced items", value: formatCount(pricedItemCount) },
      { label: "24h activity", value: formatCount(estateMetrics.recentActivity) },
    ]

    const salesStats: HeroStat[] = [
      { label: "Priced items", value: formatCount(pricedItemCount) },
      { label: "Active locations", value: formatCount(estateMetrics.locationCount) },
      { label: "24h activity", value: formatCount(estateMetrics.recentActivity) },
      { label: "Inventory value", value: formatCurrency(resolvedInventoryValue) },
    ]

    const processingStats: HeroStat[] = [
      { label: "Active locations", value: formatCount(estateMetrics.locationCount) },
      { label: "Items tracked", value: formatCount(estateMetrics.inventoryCount) },
      { label: "24h activity", value: formatCount(estateMetrics.recentActivity) },
      { label: "Inventory value", value: formatCurrency(resolvedInventoryValue) },
    ]

    const dispatchStats: HeroStat[] = [
      { label: "Active locations", value: formatCount(estateMetrics.locationCount) },
      { label: "Unassigned moves", value: formatCount(unassignedTransactions) },
      { label: "24h activity", value: formatCount(estateMetrics.recentActivity) },
      { label: "Inventory value", value: formatCurrency(resolvedInventoryValue) },
    ]

    const accountsStats: HeroStat[] = [
      {
        label: "FY labor spend",
        value: accountsTotalsLoading ? "Loading..." : formatCurrency(accountsTotals.laborTotal),
      },
      {
        label: "FY other expenses",
        value: accountsTotalsLoading ? "Loading..." : formatCurrency(accountsTotals.otherTotal),
      },
      {
        label: "FY total spend",
        value: accountsTotalsLoading ? "Loading..." : formatCurrency(accountsTotals.grandTotal),
      },
      { label: "Fiscal year", value: currentFiscalYear.label },
    ]

    const chipsInventory: HeroChip[] = [
      { icon: Leaf, label: bagWeightLabel },
      { icon: CheckCircle2, label: traceabilityLabel },
      { icon: CloudRain, label: "Rainfall + drying context in one view" },
    ]

    const chipsTransactions: HeroChip[] = [
      { icon: History, label: recentActivityLabel },
      { icon: CheckCircle2, label: pricedItemsLabel },
      { icon: AlertTriangle, label: unassignedLabel },
    ]

    const chipsSales: HeroChip[] = [
      { icon: TrendingUp, label: pricedItemsLabel },
      { icon: CheckCircle2, label: traceabilityLabel },
      { icon: Leaf, label: bagWeightLabel },
    ]

    const chipsProcessing: HeroChip[] = [
      { icon: Factory, label: "Daily processing keeps yields honest" },
      { icon: Leaf, label: bagWeightLabel },
      { icon: CheckCircle2, label: traceabilityLabel },
    ]

    const chipsDispatch: HeroChip[] = [
      { icon: Truck, label: "Dispatch reconciles processing output" },
      { icon: CheckCircle2, label: traceabilityLabel },
      { icon: AlertTriangle, label: unassignedLabel },
    ]

    const chipsAccounts: HeroChip[] = [
      { icon: Users, label: "Labor & expense logs stay audit-ready" },
      { icon: Receipt, label: "Weekly summaries keep spend visible" },
      { icon: CheckCircle2, label: `Tracking ${currentFiscalYear.label}` },
    ]

    const journalStats: HeroStat[] = [
      { label: "Active locations", value: formatCount(estateMetrics.locationCount) },
      { label: "Items tracked", value: formatCount(estateMetrics.inventoryCount) },
      { label: "24h activity", value: formatCount(estateMetrics.recentActivity) },
      { label: "Inventory value", value: formatCurrency(resolvedInventoryValue) },
    ]

    const chipsJournal: HeroChip[] = [
      { icon: NotebookPen, label: "Daily notes, fertilizers, sprays" },
      { icon: Leaf, label: "Irrigation history stays searchable" },
      { icon: CheckCircle2, label: "Filter by date & plot" },
    ]

    switch (activeTab) {
      case "transactions":
        return {
          badge: "Traceability Log",
          title: "Every movement captured for audit-ready traceability",
          description: "Review stock movements, pricing, and who touched each transaction.",
          chips: chipsTransactions,
          stats: transactionStats,
        }
      case "processing":
        return {
          badge: "Processing Flow",
          title: "From cherry to parchment, keep yields visible",
          description: "Daily processing data keeps dispatch and sales aligned.",
          chips: chipsProcessing,
          stats: processingStats,
        }
      case "dispatch":
        return {
          badge: "Dispatch Highlights",
          title: "Outbound bags and reconciliations in one view",
          description: "Track what leaves the estate and match it to sales.",
          chips: chipsDispatch,
          stats: dispatchStats,
        }
      case "sales":
        return {
          badge: "Sales Highlights",
          title: "Revenue and buyer activity at a glance",
          description: "Stay on top of pricing, buyers, and inventory still available to sell.",
          chips: chipsSales,
          stats: salesStats,
        }
      case "curing":
        return {
          badge: "Curing & Drying",
          title: "Moisture drop, loss, and outturn in focus",
          description: "Track drying progress and protect quality through curing.",
          chips: chipsProcessing,
          stats: processingStats,
        }
      case "quality":
        return {
          badge: "Quality Checks",
          title: "Grading and defects that shape buyer confidence",
          description: "Keep quality scores tied to each lot and estate.",
          chips: chipsProcessing,
          stats: processingStats,
        }
      case "rainfall":
        return {
          badge: "Rainfall Signals",
          title: "Weather context that explains yield swings",
          description: "Link rainfall patterns to processing and drying outcomes.",
          chips: chipsInventory,
          stats: processingStats,
        }
      case "pepper":
        return {
          badge: "Pepper Notes",
          title: "Pepper harvest flow and conversion insights",
          description: "Track green-to-dry conversion with location context.",
          chips: chipsInventory,
          stats: processingStats,
        }
      case "journal":
        return {
          badge: "Estate Journal",
          title: "Daily notes you can search months later",
          description: "Log fertilizer mixes, spray compositions, irrigation, and field observations.",
          chips: chipsJournal,
          stats: journalStats,
        }
      case "accounts":
        return {
          badge: "Accounts Overview",
          title: "Labor and expense logging with weekly clarity",
          description: "Keep cost tracking tight and audit-ready.",
          chips: chipsAccounts,
          stats: accountsStats,
        }
      case "ai-analysis":
        return {
          badge: "AI Highlights",
          title: "Patterns and insights from your estate data",
          description: "Run AI summaries to spot drift, waste, and revenue opportunities.",
          chips: chipsTransactions,
          stats: transactionStats,
        }
      case "news":
        return {
          badge: "Market Watch",
          title: "Coffee market and policy signals in view",
          description: "Stay aware of pricing and demand shifts.",
          chips: chipsSales,
          stats: salesStats,
        }
      case "weather":
        return {
          badge: "Weather Context",
          title: "Rainfall, drying, and estate readiness",
          description: "Daily weather signals that impact operations.",
          chips: chipsInventory,
          stats: processingStats,
        }
      case "billing":
        return {
          badge: "Billing Snapshot",
          title: "Keep invoices and GST-ready billing aligned",
          description: "Track billing readiness and revenue documentation.",
          chips: chipsAccounts,
          stats: accountsStats,
        }
      default:
        return {
          badge: "Farmer-first Estate Pulse",
          title: "Farmer-first operations, traceability, and yield at a glance",
          description:
            "Track yield, inventory, and reconciliation while documenting the processing and quality choices that protect farmer value.",
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
    currentFiscalYear.label,
    estateMetrics.inventoryCount,
    estateMetrics.locationCount,
    estateMetrics.recentActivity,
    formatCount,
    pricedItemCount,
    pricedItemsLabel,
    recentActivityLabel,
    resolvedInventoryValue,
    totalTransactions,
    traceabilityLabel,
    unassignedLabel,
    unassignedTransactions,
  ])

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
  const canShowProcessing = isModuleEnabled("processing")
  const canShowDispatch = isModuleEnabled("dispatch")
  const canShowSales = isModuleEnabled("sales")
  const canShowCuring = isModuleEnabled("curing")
  const canShowQuality = isModuleEnabled("quality")
  const canShowRainfall = isModuleEnabled("rainfall")
  const canShowPepper = isModuleEnabled("pepper")
  const canShowAiAnalysis = isModuleEnabled("ai-analysis")
  const canShowNews = isModuleEnabled("news")
  const canShowWeather = isModuleEnabled("weather")
  const canShowSeason = isModuleEnabled("season")
  const canShowBilling = isModuleEnabled("billing")
  const canShowJournal = isModuleEnabled("journal")
  const canShowResources = isModuleEnabled("resources")
  const visibleTabs = useMemo(() => {
    const tabs: string[] = []
    if (canShowInventory) tabs.push("inventory")
    if (showTransactionHistory) tabs.push("transactions")
    if (canShowAccounts) tabs.push("accounts")
    if (canShowProcessing) tabs.push("processing")
    if (canShowDispatch) tabs.push("dispatch")
    if (canShowSales) tabs.push("sales")
    if (canShowCuring) tabs.push("curing")
    if (canShowQuality) tabs.push("quality")
    if (canShowSeason) tabs.push("season")
    if (canShowRainfall) tabs.push("rainfall")
    if (canShowPepper) tabs.push("pepper")
    if (canShowJournal) tabs.push("journal")
    if (canShowResources) tabs.push("resources")
    if (canShowAiAnalysis) tabs.push("ai-analysis")
    if (canShowNews) tabs.push("news")
    if (canShowWeather) tabs.push("weather")
    if (canShowBilling) tabs.push("billing")
    return tabs
  }, [
    canShowAccounts,
    canShowAiAnalysis,
    canShowBilling,
    canShowDispatch,
    canShowInventory,
    canShowJournal,
    canShowResources,
    canShowNews,
    canShowPepper,
    canShowProcessing,
    canShowCuring,
    canShowQuality,
    canShowRainfall,
    canShowSales,
    canShowSeason,
    canShowWeather,
    showTransactionHistory,
  ])

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
      setActiveTab(visibleTabs[0])
    }
  }, [activeTab, isModulesLoading, visibleTabs])

  useEffect(() => {
    if (!tabParam) return
    if (visibleTabs.includes(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam)
    }
  }, [activeTab, tabParam, visibleTabs])

  useEffect(() => {
    if (!user || !tenantId || isOwner) return
    const key = `farmflow_welcome_seen:${tenantId}:${user.username}`
    try {
      const hasSeen = window.localStorage.getItem(key) === "true"
      if (!hasSeen) {
        setShowWelcome(true)
      }
    } catch (error) {
      console.warn("Unable to read welcome flag", error)
    }
  }, [isOwner, tenantId, user])

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

  // UI render: simplified, mirrors your original layout and components
  if (!user) return null

  if (isTenantLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-700 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading tenant context...</p>
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
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-700 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading inventory data...</p>
        </div>
      </div>
    )
  }

  const onboardingCompletedCount = Object.values(onboardingStatus).filter(Boolean).length
  const onboardingTotalCount = Object.keys(onboardingStatus).length
  const showOnboarding = !isOnboardingLoading && onboardingCompletedCount === 0
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
    {
      key: "sales",
      title: "Record your first sale",
      description: "Capture bags sold and pricing for revenue tracking.",
      done: onboardingStatus.sales,
      actionLabel: "Open Sales",
      onAction: () => setActiveTab("sales"),
    },
  ]

  return (
    <div className="relative w-full px-4 py-8 mx-auto">
      <div className="relative max-w-7xl mx-auto">
        <div className="pointer-events-none absolute -top-20 left-[-6%] h-[220px] w-[220px] rounded-full bg-[radial-gradient(circle_at_center,rgba(120,82,46,0.25),transparent_70%)] blur-[110px]" />
        <div className="pointer-events-none absolute -top-16 right-[5%] h-[200px] w-[200px] rounded-full bg-[radial-gradient(circle_at_center,rgba(69,111,96,0.25),transparent_70%)] blur-[110px]" />

        <header className="relative mb-8 overflow-hidden rounded-3xl border border-white/70 bg-white/85 p-6 shadow-[0_30px_70px_-40px_rgba(15,23,42,0.7)] backdrop-blur-xl">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-amber-400 to-emerald-600" />
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-[0_16px_30px_-18px_rgba(16,185,129,0.6)]">
                  <Leaf className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-emerald-700/80">FarmFlow</p>
                  <h1 className="text-2xl font-display font-semibold text-[color:var(--foreground)]">
                    Inventory Command
                  </h1>
                </div>
                <Badge className="bg-white/90 text-emerald-700 border-emerald-200">Inventory System</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white/80 px-3 py-1 text-xs text-emerald-700">
                  <Leaf className="h-3.5 w-3.5" />
                  {tenantSettings.estateName ? `Estate: ${tenantSettings.estateName}` : "Estate: add a name in Settings"}
                </span>
                <span className="text-xs text-emerald-700/70">Live operations with traceability</span>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 rounded-full border border-emerald-100 bg-white/80 px-3 py-2">
                <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  {roleLabel(user.role)}
                </Badge>
                <span className="text-sm text-slate-700">{user.username}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {isOwner && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        Super Admin
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Super Admin Tools</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href="/settings">
                          <Settings className="h-4 w-4 mr-2" />
                          Tenant Settings
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
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/settings">
                      <Settings className="h-4 w-4 mr-2" />
                      Settings
                    </Link>
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  <LogOut className="h-4 w-4 mr-2" /> Logout
                </Button>
              </div>
            </div>
          </div>
        </header>

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

        <div className="relative mb-8 overflow-hidden rounded-3xl border border-amber-200/70 bg-gradient-to-br from-white via-amber-50/70 to-emerald-100/60 p-7 shadow-[0_28px_70px_-40px_rgba(75,42,15,0.45)] grain sheen">
          <div className="pointer-events-none absolute -right-10 top-8 h-40 w-40 rounded-full bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.22),transparent_70%)] blur-[80px]" />
          <div className="pointer-events-none absolute bottom-[-30%] left-10 h-48 w-48 rounded-full bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.22),transparent_70%)] blur-[90px]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
            <div className="space-y-2 max-w-xl">
              <Badge className="bg-emerald-600 text-white border-emerald-700 shadow-[0_12px_24px_-18px_rgba(16,185,129,0.6)]">
                {heroContent.badge}
              </Badge>
              <h2 className="font-display text-2xl text-[color:var(--foreground)]">
                {heroContent.title}
              </h2>
              <p className="text-sm text-muted-foreground">{heroContent.description}</p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-emerald-700">
                {heroContent.chips.map((chip, index) => {
                  const Icon = chip.icon
                  return (
                    <span key={`${chip.label}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1">
                      <Icon className="h-3.5 w-3.5" />
                      {chip.label}
                    </span>
                  )
                })}
              </div>
            </div>
            <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-4 lg:flex-1">
              {heroContent.stats.map((stat) => (
                <div
                  key={stat.label}
                  className="min-w-0 rounded-2xl border border-amber-100/80 bg-white/95 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <p className="text-[10px] uppercase tracking-[0.3em] text-emerald-700/70">{stat.label}</p>
                  <p className="font-display text-[clamp(1.15rem,2.2vw,1.6rem)] leading-tight text-slate-900 break-words tabular-nums">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 rounded-2xl border border-white/70 bg-white/80 p-4 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)]">
          <div className="text-sm text-slate-600">
            {syncError ? (
              <span className="text-red-500 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" /> {syncError}
              </span>
            ) : lastSync ? (
              <span>Last synced: {lastSync.toLocaleTimeString()}</span>
            ) : (
              <span>Syncing data...</span>
            )}
          </div>
          <div className="flex gap-2">
            {isAdmin && canShowSeason && (
              <Button
                variant={activeTab === "season" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTab("season")}
                className={activeTab === "season" ? "" : "bg-transparent"}
              >
                <BarChart3 className="h-3 w-3 mr-1" />
                Season View
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setIsSyncing(true); refreshData(true).finally(() => setIsSyncing(false)) }}
              disabled={isSyncing}
              className="flex items-center gap-1 bg-white/80"
            >
              <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Syncing..." : "Sync Now"}
            </Button>
          </div>
        </div>

        {isOwner && (
          <Card className="border-2 border-muted bg-white/90">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Owner Console</CardTitle>
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  Owner Only
                </Badge>
              </div>
              <CardDescription>Estate provisioning, access control, and data health tools.</CardDescription>
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
              canCreateLocation={isAdmin}
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
            <TabsList className="flex w-full flex-wrap items-start gap-2 rounded-2xl border border-white/80 bg-white/85 p-2 shadow-[0_16px_30px_-20px_rgba(15,23,42,0.5)] h-auto overflow-visible sm:justify-center">
              {canShowInventory && <TabsTrigger value="inventory">Inventory</TabsTrigger>}
              {showTransactionHistory && <TabsTrigger value="transactions">Transaction History</TabsTrigger>}
              {canShowAccounts && (
                <TabsTrigger value="accounts">
                  <Users className="h-4 w-4 mr-2" />
                  Accounts
                </TabsTrigger>
              )}
              {canShowProcessing && (
                <TabsTrigger value="processing">
                  <Factory className="h-4 w-4 mr-2" />
                  Processing
                </TabsTrigger>
              )}
              {canShowDispatch && (
                <TabsTrigger value="dispatch">
                  <Truck className="h-4 w-4 mr-2" />
                  Dispatch
                </TabsTrigger>
              )}
              {canShowSales && (
                <TabsTrigger value="sales">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Sales
                </TabsTrigger>
              )}
              {canShowCuring && (
                <TabsTrigger value="curing">
                  <Factory className="h-4 w-4 mr-2" />
                  Curing
                </TabsTrigger>
              )}
              {canShowQuality && (
                <TabsTrigger value="quality">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Quality
                </TabsTrigger>
              )}
              {canShowRainfall && (
                <TabsTrigger value="rainfall">
                  <CloudRain className="h-4 w-4 mr-2" />
                  Rainfall
                </TabsTrigger>
              )}
              {canShowPepper && (
                <TabsTrigger value="pepper" className="flex items-center gap-2">
                  <Leaf className="h-4 w-4" />
                  Pepper
                </TabsTrigger>
              )}
              {canShowJournal && (
                <TabsTrigger value="journal" className="flex items-center gap-2">
                  <NotebookPen className="h-4 w-4" />
                  Journal
                </TabsTrigger>
              )}
              {canShowResources && (
                <TabsTrigger value="resources" className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Resources
                </TabsTrigger>
              )}
              {canShowAiAnalysis && (
                <TabsTrigger value="ai-analysis">
                  <Brain className="h-4 w-4 mr-2" />
                  AI Analysis
                </TabsTrigger>
              )}
              {canShowNews && (
                <TabsTrigger value="news">
                  <Newspaper className="h-4 w-4 mr-2" />
                  News
                </TabsTrigger>
              )}
              {canShowWeather && (
                <TabsTrigger value="weather">
                  <Cloudy className="h-4 w-4 mr-2" />
                  Weather
                </TabsTrigger>
              )}
              {canShowBilling && (
                <TabsTrigger value="billing">
                  <Receipt className="h-4 w-4 mr-2" />
                  Billing
                </TabsTrigger>
              )}
            </TabsList>

          {canShowInventory && (
            <TabsContent value="inventory" className="space-y-8">
            {canShowSeason && (
              <Card className="border-amber-100 bg-amber-50/40">
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-amber-700">
                      <AlertTriangle className="h-5 w-5" />
                      Exceptions snapshot
                    </CardTitle>
                    <CardDescription>
                      Rolling 7-day alerts for float rate spikes, yield drops, and inventory mismatches.
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab("season")}>
                    Open Season View
                  </Button>
                </CardHeader>
                <CardContent>
                  {exceptionsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading exception alerts...
                    </div>
                  ) : exceptionsError ? (
                    <div className="text-sm text-rose-600">{exceptionsError}</div>
                  ) : exceptionsSummary.count === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      No exceptions detected this week.
                    </div>
                  ) : (
                    <div className="space-y-2 text-sm text-slate-700">
                      <div className="font-medium text-amber-800">
                        ⚠️ {exceptionsSummary.count} exception{exceptionsSummary.count === 1 ? "" : "s"} flagged
                      </div>
                      <ul className="list-disc pl-5">
                        {exceptionsSummary.highlights.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            <InventoryValueSummary inventory={inventory} transactions={transactions} summary={inventorySummary} />
            <div className="grid md:grid-cols-2 gap-8">
              {/* New Transaction / Add Item panel */}
              <div className="relative overflow-hidden rounded-3xl border border-emerald-100/80 bg-white/95 p-6 shadow-[0_22px_60px_-34px_rgba(15,23,42,0.45)]">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-amber-400 to-emerald-600" />
                <div className="mb-6 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-[0_12px_24px_-16px_rgba(16,185,129,0.5)]">
                      <Plus className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-emerald-800">Record Inventory Movement</h2>
                      <p className="text-xs text-emerald-700/70">
                        Keep estate lots traceable from harvest through storage.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                      Harvest & processing
                    </Badge>
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                      Restock or deplete
                    </Badge>
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-100/70 bg-white/90 p-5 shadow-sm">
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-2">
                      <label className="block text-slate-700">Item Type</label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Item type help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-200/70 text-emerald-700/70 hover:text-emerald-800"
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
                        // set unit from inventory if possible
                        const u = inventory.find((i) => i.name === value)?.unit || "kg"
                        handleFieldChange("unit", u)
                      }}
                    >
                      <SelectTrigger className="w-full h-12 rounded-xl border-emerald-100 bg-white/95 focus-visible:ring-2 focus-visible:ring-emerald-200">
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

                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-2">
                      <label className="block text-slate-700">Location</label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Location help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-200/70 text-emerald-700/70 hover:text-emerald-800"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Tag by estate block for traceability and yield accuracy.</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Select value={transactionLocationId} onValueChange={setTransactionLocationId}>
                      <SelectTrigger className="w-full h-12 rounded-xl border-emerald-100 bg-white/95 focus-visible:ring-2 focus-visible:ring-emerald-200">
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
                    <p className="text-xs text-emerald-700/70 mt-1">
                      Tag transactions to a location for accurate inventory usage.
                    </p>
                  </div>

                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-2">
                      <label className="block text-slate-700">Quantity</label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Quantity help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-200/70 text-emerald-700/70 hover:text-emerald-800"
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
                        className="h-12 rounded-xl border-emerald-100 bg-white/95 pr-12 focus-visible:ring-2 focus-visible:ring-emerald-200"
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-emerald-700/70">
                        {newTransaction?.unit || "kg"}
                      </div>
                    </div>
                  </div>

                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-2">
                      <label className="block text-slate-700">Transaction Type</label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Transaction type help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-200/70 text-emerald-700/70 hover:text-emerald-800"
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
                      className="flex flex-col gap-3 rounded-2xl border border-emerald-100/70 bg-white/80 p-3 sm:flex-row sm:items-center"
                    >
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value="Depleting" id="depleting" className="h-5 w-5" />
                        <Label htmlFor="depleting" className="text-base">
                          Depleting
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value="Restocking" id="restocking" className="h-5 w-5" />
                        <Label htmlFor="restocking" className="text-base">
                          Restocking
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-2">
                      <label className="block text-slate-700">Notes (Optional)</label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label="Notes help"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-200/70 text-emerald-700/70 hover:text-emerald-800"
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
                      className="min-h-[110px] rounded-xl border-emerald-100 bg-white/95 focus-visible:ring-2 focus-visible:ring-emerald-200"
                    />
                  </div>

                  <Button
                    onClick={handleRecordTransaction}
                    className="w-full h-12 text-base bg-emerald-700 hover:bg-emerald-800 text-white shadow-[0_16px_30px_-18px_rgba(16,185,129,0.6)]"
                  >
                    <Check className="mr-2 h-5 w-5" /> Record Transaction
                  </Button>
                </div>
              </div>

              {/* Inventory list */}
              <div className="relative overflow-hidden rounded-3xl border border-emerald-100/80 bg-white/95 p-6 shadow-[0_22px_60px_-34px_rgba(15,23,42,0.45)]">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-amber-400 to-emerald-600" />
                <div className="mb-6 flex flex-col gap-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <h2 className="text-lg font-semibold text-emerald-800 flex items-center">
                        <List className="mr-2 h-5 w-5" /> Current Inventory Levels
                      </h2>
                      <p className="text-xs text-emerald-700/70">Totals for {selectedLocationLabel}.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={exportInventoryToCSV} className="h-10 bg-transparent">
                        <Download className="mr-2 h-4 w-4" /> Export
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setIsNewItemDialogOpen(true)}
                        className="bg-emerald-700 hover:bg-emerald-800 h-10 shadow-[0_14px_26px_-16px_rgba(16,185,129,0.55)]"
                      >
                        <Plus className="mr-2 h-4 w-4" /> Add New Item
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                      Items: {formatNumber(filteredInventoryTotals.itemCount)}
                    </Badge>
                    <Badge variant="outline" className="border-emerald-200 bg-white/90 text-emerald-700">
                      Quantity: {formatNumber(filteredInventoryTotals.totalQuantity)} {filteredInventoryTotals.unitLabel}
                    </Badge>
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                      Value: {formatCurrency(filteredInventoryTotals.totalValue)}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mb-5">
                  <div className="relative flex-grow">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-emerald-400" />
                    <Input
                      placeholder="Search inventory..."
                      value={inventorySearchTerm}
                      onChange={(e) => setInventorySearchTerm(e.target.value)}
                      className="pl-10 h-11 rounded-xl border-emerald-100 bg-white/95 focus-visible:ring-2 focus-visible:ring-emerald-200"
                    />
                  </div>
                  <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                    <SelectTrigger className="w-full sm:w-52 h-11 rounded-xl border-emerald-100 bg-white/95 focus-visible:ring-2 focus-visible:ring-emerald-200">
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
                    className="flex items-center gap-1 h-11 whitespace-nowrap bg-white/90"
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
                    return (
                      <div
                        key={`${item.name}-${index}`}
                        className="group relative overflow-hidden rounded-2xl border border-emerald-100/70 bg-white/95 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-emerald-50/60 via-transparent to-amber-50/60 opacity-0 transition-opacity group-hover:opacity-100" />
                        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 text-sm font-semibold">
                              {itemInitial}
                            </div>
                            <div>
                              <div className="text-base font-semibold text-slate-900">{item.name}</div>
                              <div className="text-xs text-emerald-700/70">
                                {avgPrice > 0
                                  ? `Avg ${formatCurrency(avgPrice)}/${item.unit || "unit"}`
                                  : "Pricing not yet recorded"}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                            <div className="rounded-full border border-emerald-100 bg-white/80 px-3 py-1 text-sm text-slate-700">
                              {formatNumber(Number(item.quantity) || 0)} {item.unit}
                            </div>
                            <div className="rounded-full border border-amber-100 bg-amber-50/70 px-3 py-1 text-sm text-amber-800">
                              {formatCurrency(itemValue)}
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
                                          onClick={() => handleOpenInventoryEdit(item)}
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
                                  onClick={() => {
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
                  <div className="text-center py-8 text-gray-500">
                    {inventorySearchTerm ? "No items match your search." : "Inventory is empty or not yet loaded."}
                  </div>
                )}
              </div>
            </div>
            </TabsContent>
          )}

          {showTransactionHistory && (
            <TabsContent value="transactions" className="space-y-6">
              {/* Transactions UI (search, filter, table) */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-lg font-medium text-green-700 flex items-center"><History className="mr-2 h-5 w-5" /> Transaction History</h2>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={exportToCSV} className="h-10 bg-transparent"><Download className="mr-2 h-4 w-4" /> Export</Button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-between mb-5 gap-4">
                  <div className="flex flex-col sm:flex-row gap-3 flex-grow">
                    <div className="relative flex-grow">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input placeholder="Search transactions..." value={transactionSearchTerm} onChange={(e) => setTransactionSearchTerm(e.target.value)} className="pl-10 h-10" />
                    </div>
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger className="w-full sm:w-40 h-10 border-gray-300"><SelectValue placeholder="All Types" /></SelectTrigger>
                      <SelectContent className="max-h-[40vh] overflow-y-auto">
                        <SelectItem value="All Types">All Types</SelectItem>
                        {allItemTypesForDropdown.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                      <SelectTrigger className="w-full sm:w-48 h-10 border-gray-300">
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

                <div className="border rounded-md overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="bg-gray-50/80 text-sm font-medium text-gray-500 border-b sticky top-0 backdrop-blur">
                        <th className="py-4 px-4 text-left">DATE</th>
                        <th className="py-4 px-4 text-left">LOCATION</th>
                        <th className="py-4 px-4 text-left">ITEM TYPE</th>
                        <th className="py-4 px-4 text-left">QUANTITY</th>
                        <th className="py-4 px-4 text-left">TRANSACTION</th>
                        {!isMobile && (
                          <>
                            <th className="py-4 px-4 text-left">PRICE</th>
                            <th className="py-4 px-4 text-left">NOTES</th>
                            <th className="py-4 px-4 text-left">USER</th>
                          </>
                        )}
                        <th className="py-4 px-4 text-left">ACTIONS</th>
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
                          className={`border-b last:border-0 hover:bg-gray-50 ${index % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
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
                  {transactions.length === 0 && (<div className="text-center py-10 text-gray-500">No transactions recorded yet.</div>)}
                  {transactions.length > 0 && filteredTransactions.length === 0 && (<div className="text-center py-10 text-gray-500">No transactions found matching your current filters.</div>)}
                </div>

                {filteredTransactions.length > 0 && (
                  <div className="flex justify-between items-center mt-4">
                    <div className="text-sm text-gray-500">Showing {Math.min(startIndex + 1, filteredTransactions.length)} to {endIndex} of {filteredTransactions.length} transactions</div>
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
          {canShowRainfall && (
            <TabsContent value="rainfall" className="space-y-6">
              <RainfallTab username={user?.username || "system"} />
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

              <Card>
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-green-700" />
                      AI Inventory Analysis
                    </CardTitle>
                    <CardDescription>Get AI-powered insights about your inventory patterns and usage trends.</CardDescription>
                  </div>
                  <Button onClick={generateAIAnalysis} disabled={isAnalyzing} className="bg-green-700 hover:bg-green-800">
                    {isAnalyzing ? "Analyzing..." : "Generate Analysis"}
                  </Button>
                </CardHeader>
                <CardContent>
                  {analysisError && <div className="text-sm text-red-600 mb-3">{analysisError}</div>}
                  {aiAnalysis ? (
                    <div className="whitespace-pre-line text-sm text-gray-700">{aiAnalysis}</div>
                  ) : (
                    <div className="text-sm text-gray-500">Run the AI analysis to see insights and recommendations.</div>
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
          {canShowWeather && (
            <TabsContent value="weather" className="space-y-6">
              <WeatherTab />
            </TabsContent>
          )}
          {canShowBilling && (
            <TabsContent value="billing" className="space-y-6">
              <BillingTab />
            </TabsContent>
          )}
            </Tabs>
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
