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
  Settings,
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
import { PepperTab } from "./pepper-tab"
import CoffeeResourcesTab from "@/components/coffee-resources-tab"
import OnboardingChecklist, { type OnboardingStep } from "@/components/onboarding-checklist"
import Link from "next/link"
import { formatDateForDisplay, generateTimestamp, isWithinLast24Hours } from "@/lib/date-utils"
import { formatCurrency, formatNumber } from "@/lib/format"
import { getModuleDefaultEnabled } from "@/lib/modules"
import type { InventoryItem, Transaction } from "@/lib/inventory-types"
import { toast } from "@/components/ui/use-toast"

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
  const [itemValues, setItemValues] = useState<Record<string, any>>({})
  const [summary, setSummary] = useState({ total_inventory_value: 0, total_items: 0, total_quantity: 0 })
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
    if (!transactionToDelete) return
    try {
      const res = await fetch(`${API_TRANSACTIONS}/${transactionToDelete}`, { method: "DELETE" })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || "Delete failed")
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
    if (selectedLocationId === LOCATION_ALL) {
      toast({
        title: "Select a location",
        description: "Choose a specific location before deleting inventory.",
        variant: "destructive",
      })
      return
    }
    if (!confirm(`Delete "${itemToDelete.name}"? This will log a deplete transaction and hide the item.`)) return
    const deleteLocationId = selectedLocationId !== LOCATION_ALL ? selectedLocationId : null
    const tx = {
      item_type: itemToDelete.name,
      quantity: itemToDelete.quantity,
      transaction_type: "deplete",
      notes: `Item "${itemToDelete.name}" permanently deleted from inventory.`,
      user_id: user?.username || "system",
      price: 0,
      location_id: deleteLocationId,
    }
    try {
      const res = await fetch("/api/transactions-neon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tx),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || "Failed")
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
      const valueInfo = itemValues[item.name] || {}
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
    if (canShowAiAnalysis) tabs.push("ai-analysis")
    if (canShowNews) tabs.push("news")
    if (canShowWeather) tabs.push("weather")
    return tabs
  }, [
    canShowAccounts,
    canShowAiAnalysis,
    canShowDispatch,
    canShowInventory,
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
    if (isOwner || isModulesLoading) {
      return
    }
    if (visibleTabs.length && !visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0])
    }
  }, [activeTab, isModulesLoading, isOwner, visibleTabs])

  useEffect(() => {
    if (!tabParam) return
    if (visibleTabs.includes(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam)
    }
  }, [activeTab, tabParam, visibleTabs])

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
    <div className="w-full px-4 py-6 mx-auto">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className="text-2xl font-medium text-green-700">FarmFlow</h1>
              <span className="text-[11px] uppercase tracking-[0.35em] text-emerald-700/70">Inventory System</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {tenantSettings.estateName ? `Estate: ${tenantSettings.estateName}` : "Estate: add a name in Settings"}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex items-center gap-4">
              <div className="flex items-center">
                <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 mr-2">
                  {user.role}
                </Badge>
                <span className="text-gray-700">{user.username}</span>
              </div>
              {isOwner && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Owner
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Owner Tools</DropdownMenuLabel>
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
        </header>

        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="text-sm text-gray-500">
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
              className="flex items-center gap-1 bg-transparent"
            >
              <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Syncing..." : "Sync Now"}
            </Button>
          </div>
        </div>

        {isOwner ? (
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
        ) : (
          <>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="flex w-full overflow-x-auto border-b sm:justify-center">
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
  <TabsTrigger value="resources">
  <Coffee className="h-4 w-4 mr-2" />
  Resources
  </TabsTrigger>
  </TabsList>

          {canShowInventory && (
            <TabsContent value="inventory" className="space-y-8">
            {showOnboarding && (
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
            )}
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
            <InventoryValueSummary inventory={inventory} transactions={transactions} summary={summary} />
            <div className="grid md:grid-cols-2 gap-8">
              {/* New Transaction / Add Item panel */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
                <h2 className="text-lg font-medium text-green-700 flex items-center mb-5">
                  <span className="mr-2">+</span> New Inventory Transaction
                </h2>
                <div className="border-t border-gray-200 pt-5">
                  <div className="mb-5">
                    <label className="block text-gray-700 mb-2">Item Type</label>
                    <Select
                      value={newTransaction?.item_type || ""}
                      onValueChange={(value) => {
                        handleFieldChange("item_type", value)
                        // set unit from inventory if possible
                        const u = inventory.find((i) => i.name === value)?.unit || "kg"
                        handleFieldChange("unit", u)
                      }}
                    >
                      <SelectTrigger className="w-full border-gray-300 h-12">
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
                    <label className="block text-gray-700 mb-2">Location</label>
                    <Select value={transactionLocationId} onValueChange={setTransactionLocationId}>
                      <SelectTrigger className="w-full border-gray-300 h-12">
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
                    <p className="text-xs text-muted-foreground mt-1">
                      Tag transactions to a location for accurate inventory usage.
                    </p>
                  </div>

                  <div className="mb-5">
                    <label className="block text-gray-700 mb-2">Quantity</label>
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder="Enter quantity"
                        value={newTransaction?.quantity ?? ""}
                        onChange={(e) => handleFieldChange("quantity", Number(e.target.value))}
                        className="border-gray-300 pr-12 h-12"
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-500">
                        {newTransaction?.unit || "kg"}
                      </div>
                    </div>
                  </div>

                  <div className="mb-5">
                    <label className="block text-gray-700 mb-2">Transaction Type</label>
                    <RadioGroup
                      value={newTransaction?.transaction_type === "restock" ? "Restocking" : "Depleting"}
                      onValueChange={(value: "Depleting" | "Restocking") =>
                        handleFieldChange("transaction_type", value === "Restocking" ? "restock" : "deplete")
                      }
                      className="flex flex-col sm:flex-row gap-4"
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
                    <label className="block text-gray-700 mb-2">Notes (Optional)</label>
                    <Textarea
                      placeholder="Add any additional details"
                      value={newTransaction?.notes ?? ""}
                      onChange={(e) => handleFieldChange("notes", e.target.value)}
                      className="border-gray-300 min-h-[100px]"
                    />
                  </div>

                  <Button onClick={handleRecordTransaction} className="w-full bg-green-700 hover:bg-green-800 text-white h-12 text-base">
                    <Check className="mr-2 h-5 w-5" /> Record Transaction
                  </Button>
                </div>
              </div>

              {/* Inventory list */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
                <div className="flex justify-between items-center mb-5">
                  <div>
                    <h2 className="text-lg font-medium text-green-700 flex items-center">
                      <List className="mr-2 h-5 w-5" /> Current Inventory Levels
                    </h2>
                    <p className="text-xs text-muted-foreground">Totals for {selectedLocationLabel}.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={exportInventoryToCSV} className="h-10 bg-transparent">
                      <Download className="mr-2 h-4 w-4" /> Export
                    </Button>
                    <Button size="sm" onClick={() => setIsNewItemDialogOpen(true)} className="bg-green-700 hover:bg-green-800 h-10">
                      <Plus className="mr-2 h-4 w-4" /> Add New Item
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="relative flex-grow">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input placeholder="Search inventory..." value={inventorySearchTerm} onChange={(e) => setInventorySearchTerm(e.target.value)} className="pl-10 h-10" />
                  </div>
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
                  <Button variant="outline" size="sm" onClick={toggleInventorySort} className="flex items-center gap-1 h-10 whitespace-nowrap bg-transparent">
                    {inventorySortOrder === "asc" ? (<><SortAsc className="h-4 w-4 mr-1" /> Sort A-Z</>) : inventorySortOrder === "desc" ? (<><SortDesc className="h-4 w-4 mr-1" /> Sort Z-A</>) : (<><SortAsc className="h-4 w-4 mr-1" /> Sort</>)}
                  </Button>
                </div>

                <div className="border-t border-gray-200 pt-5">
                  <div className="grid grid-cols-1 gap-4">
                    {filteredAndSortedInventory.map((item, index) => {
                      const valueInfo = itemValues[item.name] || {}
                      const itemValue = valueInfo.totalValue || 0
                      const avgPrice = valueInfo.avgPrice || 0
                      return (
                        <div key={`${item.name}-${index}`} className="flex justify-between items-center py-4 border-b last:border-0 px-2 hover:bg-gray-50 rounded">
                          <div className="font-medium text-base">{item.name}</div>
                          <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-base">
                              {formatNumber(Number(item.quantity) || 0)} {item.unit}
                            </div>
                            <div className="text-sm text-gray-600">
                              {formatCurrency(itemValue)}
                              {avgPrice > 0 && ` (avg: ${formatCurrency(avgPrice)}/${item.unit || "unit"})`}
                            </div>
                          </div>
                            {canManageData && (
                              <>
                                <Button size="sm" variant="ghost" onClick={() => handleOpenInventoryEdit(item)} className="text-amber-600 p-2 h-auto"><Edit className="h-4 w-4" /></Button>
                                <Button size="sm" variant="ghost" onClick={() => { handleDeleteInventoryItem(item) }} className="text-red-600 p-2 h-auto"><Trash2 className="h-4 w-4" /></Button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {filteredAndSortedInventory.length === 0 && (
                    <div className="text-center py-8 text-gray-500">{inventorySearchTerm ? "No items match your search." : "Inventory is empty or not yet loaded."}</div>
                  )}
                </div>
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
  <TabsContent value="resources" className="space-y-6">
  <CoffeeResourcesTab />
  </TabsContent>
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
                    <Label htmlFor="edit-transaction-item">Item Type</Label>
                    <Input
                      id="edit-transaction-item"
                      value={editingTransaction.item_type}
                      onChange={(event) => handleEditTransactionChange("item_type", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-transaction-type">Transaction Type</Label>
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
                  <Label htmlFor="edit-transaction-location">Location</Label>
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
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-transaction-qty">Quantity</Label>
                    <Input
                      id="edit-transaction-qty"
                      type="number"
                      value={editingTransaction.quantity ?? ""}
                      onChange={(event) => handleEditTransactionChange("quantity", Number(event.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-transaction-price">Unit Price</Label>
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
                  <Label htmlFor="edit-transaction-notes">Notes</Label>
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
                    <Label htmlFor="edit-item-name">Item Name</Label>
                    <Input
                      id="edit-item-name"
                      value={inventoryEditForm.name}
                      onChange={(event) =>
                        setInventoryEditForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-item-unit">Unit</Label>
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
                  <Label htmlFor="edit-item-location">Adjustment Location</Label>
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
                  <Label htmlFor="edit-item-qty">Quantity</Label>
                  <Input
                    id="edit-item-qty"
                    type="number"
                    value={inventoryEditForm.quantity}
                    onChange={(event) =>
                      setInventoryEditForm((prev) => ({ ...prev, quantity: event.target.value }))
                    }
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
          </>
        )}
      </div>
    </div>
  )
}
