"use client"

import { useState, useEffect, useCallback, useMemo, useRef, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FieldLabel } from "@/components/ui/field-label"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CalendarIcon, Loader2, Save, Trash2, Download, IndianRupee, TrendingUp, Pencil } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DEFAULT_COFFEE_VARIETIES } from "@/lib/crop-config"
import { useAuth } from "@/hooks/use-auth"
import { useTenantSettings } from "@/hooks/use-tenant-settings"
import { formatDateOnly } from "@/lib/date-utils"
import { formatCurrency, formatNumber } from "@/lib/format"
import { canAcceptNonNegative, isBlockedNumericKey } from "@/lib/number-input"
import { buildSalesCsv } from "@/lib/sales-export"
import { resolveDispatchReceivedKgs as resolveDispatchReceivedKgsValue, resolveSalesKgs } from "@/lib/sales-math"
import OtherSalesTab from "@/components/other-sales-tab"
import TaskGuideCard from "@/components/task-guide-card"
import WorkflowEmptyState from "@/components/workflow-empty-state"
import WorkspacePageShell from "@/components/workspace-page-shell"
import { useMediaQuery } from "@/hooks/use-media-query"
import posthog from "posthog-js"

interface SalesRecord {
  id?: number
  sale_date: string
  batch_no: string
  location_id?: string | null
  location_name?: string | null
  location_code?: string | null
  estate?: string | null
  lot_id?: string | null
  coffee_type: string | null
  bag_type: string | null
  buyer_name?: string | null
  bags_sold: number
  price_per_bag: number
  revenue: number
  kgs_received?: number | null
  kgs?: number | null
  weight_kgs?: number | null
  kgs_sent?: number | null
  bank_account: string | null
  notes: string | null
}

interface DispatchSummaryRow {
  coffee_type: string
  bag_type: string
  bags_dispatched: number
  kgs_received: number
}

interface SalesSummaryRow {
  coffee_type: string
  bag_type: string
  bags_sold: number
  kgs_sold?: number
  revenue: number
}

interface LocationOption {
  id: string
  name: string
  code: string
}

type LocationScope = "all" | "location" | "legacy_pool"
type SalesTotals = { totalBagsSold: number; totalKgsSold: number; totalRevenue: number }

type InventoryTotals = { bags: number; kgs: number }
type InventoryBreakdown = { cherry: InventoryTotals; parchment: InventoryTotals; total: InventoryTotals }

const COFFEE_TYPES = DEFAULT_COFFEE_VARIETIES
const BAG_TYPES = ["Dry Parchment", "Dry Cherry"]
const LOCATION_ALL = "all"
const STOCK_EPSILON = 0.0001
const normalizeBagType = (value: string | null | undefined) =>
  String(value || "").toLowerCase().includes("cherry") ? "cherry" : "parchment"
const formatBagTypeLabel = (value: string | null | undefined) =>
  normalizeBagType(value) === "cherry" ? "Dry Cherry" : "Dry Parchment"
const normalizeCoffeeType = (value: string | null | undefined) => {
  const normalized = String(value || "").toLowerCase()
  if (normalized.includes("arabica")) return "arabica"
  if (normalized.includes("robusta")) return "robusta"
  return "other"
}
const ARABICA_LABEL = COFFEE_TYPES.find((type) => String(type || "").toLowerCase().includes("arabica")) || "Arabica"
const ROBUSTA_LABEL = COFFEE_TYPES.find((type) => String(type || "").toLowerCase().includes("robusta")) || "Robusta"
const toCanonicalCoffeeLabel = (value: string | null | undefined) => {
  const normalized = normalizeCoffeeType(value)
  if (normalized === "arabica") return ARABICA_LABEL
  if (normalized === "robusta") return ROBUSTA_LABEL
  const raw = String(value || "").trim()
  return raw || "Unknown"
}

const resolveDispatchReceivedKgs = (
  row: Pick<DispatchSummaryRow, "kgs_received" | "bags_dispatched">,
  bagWeightKg: number,
) => resolveDispatchReceivedKgsValue(row, bagWeightKg)

const resolveSalesRecordKgs = (
  record: Pick<SalesRecord, "kgs" | "kgs_received" | "weight_kgs" | "kgs_sent" | "bags_sold">,
  bagWeightKg: number,
) => resolveSalesKgs(record, bagWeightKg)

type SalesTabProps = {
  showDataToolsControls?: boolean
  coffeeSalesEnabled?: boolean
  otherSalesEnabled?: boolean
  activeWorkspaceView?: SalesWorkspaceView
  onWorkspaceViewChange?: (view: SalesWorkspaceView) => void
}

type SalesWorkspaceView = "coffee" | "other-sales"
type OtherSalesTotals = { totalRevenue: number; totalCount: number }

export default function SalesTab({
  showDataToolsControls = false,
  coffeeSalesEnabled = true,
  otherSalesEnabled = false,
  activeWorkspaceView,
  onWorkspaceViewChange,
}: SalesTabProps) {
  const { user } = useAuth()
  const { settings } = useTenantSettings()
  const bagWeightKg = Number(settings.bagWeightKg) || 50
  const canDelete = user?.role === "admin" || user?.role === "owner" || user?.role === "user"
  const isMobile = useMediaQuery("(max-width: 768px)")

  const [locations, setLocations] = useState<LocationOption[]>([])
  const [date, setDate] = useState<Date>(new Date())
  const [batchNo, setBatchNo] = useState<string>("")
  const [selectedLocationId, setSelectedLocationId] = useState<string>("")
  const [salesFilterLocationId, setSalesFilterLocationId] = useState<string>(LOCATION_ALL)
  const [coffeeType, setCoffeeType] = useState<string>("Arabica")
  const [bagType, setBagType] = useState<string>("Dry Parchment")
  const [kgsSold, setKgsSold] = useState<string>("")
  const [pricePerBag, setPricePerBag] = useState<string>("")
  const [buyerName, setBuyerName] = useState<string>("")
  const [bankAccount, setBankAccount] = useState<string>("")
  const [notes, setNotes] = useState<string>("")
  const [buyerSuggestions, setBuyerSuggestions] = useState<string[]>([])
  
  const kgsSoldValue = Number(kgsSold) || 0
  const pricePerBagValue = Number(pricePerBag) || 0
  const bagsSoldValue = Number((kgsSoldValue / bagWeightKg).toFixed(2))
  const calculatedRevenue = Number((bagsSoldValue * pricePerBagValue).toFixed(2))
  
  const [salesRecords, setSalesRecords] = useState<SalesRecord[]>([])
  const [dispatchSummary, setDispatchSummary] = useState<DispatchSummaryRow[]>([])
  const [overviewDispatchSummary, setOverviewDispatchSummary] = useState<DispatchSummaryRow[]>([])
  const [overviewSalesSummary, setOverviewSalesSummary] = useState<SalesSummaryRow[]>([])
  const [salesSummary, setSalesSummary] = useState<SalesSummaryRow[]>([])
  const [salesTotalCount, setSalesTotalCount] = useState(0)
  const [salesTotals, setSalesTotals] = useState<SalesTotals | null>(null)
  const [otherSalesTotals, setOtherSalesTotals] = useState<OtherSalesTotals>({ totalRevenue: 0, totalCount: 0 })
  const [dispatchSummaryScope, setDispatchSummaryScope] = useState<LocationScope>("location")
  const [salesSummaryScope, setSalesSummaryScope] = useState<LocationScope>("location")
  const [salesPage, setSalesPage] = useState(0)
  const [salesHasMore, setSalesHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [selectedSalesRecord, setSelectedSalesRecord] = useState<SalesRecord | null>(null)
  const [editingRecord, setEditingRecord] = useState<SalesRecord | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [internalWorkspaceView, setInternalWorkspaceView] = useState<SalesWorkspaceView>("coffee")
  const salesSaveStateRef = useRef({ canSubmitSale: false, isSaving: false })
  const salesSaveHandlerRef = useRef<(() => Promise<void> | void) | null>(null)
  const [saveFeedback, setSaveFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const { toast } = useToast()
  const salesPageSize = 25
  const currentWorkspaceView = otherSalesEnabled ? activeWorkspaceView || internalWorkspaceView : "coffee"
  const resolvedWorkspaceView: SalesWorkspaceView =
    !coffeeSalesEnabled && otherSalesEnabled ? "other-sales" : currentWorkspaceView
  const setCurrentWorkspaceView = useCallback(
    (view: SalesWorkspaceView) => {
      if (!coffeeSalesEnabled && view === "coffee") return
      if (!otherSalesEnabled && view === "other-sales") return
      if (onWorkspaceViewChange) {
        onWorkspaceViewChange(view)
        return
      }
      setInternalWorkspaceView(view)
    },
    [coffeeSalesEnabled, onWorkspaceViewChange, otherSalesEnabled],
  )
  const blockInvalidNumberKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (isBlockedNumericKey(event.key)) {
      event.preventDefault()
    }
  }
  const handleNonNegativeChange = (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value
    if (!canAcceptNonNegative(nextValue)) return
    setter(nextValue)
  }

  const selectedLocation = useMemo(
    () => locations.find((loc) => loc.id === selectedLocationId) || null,
    [locations, selectedLocationId],
  )

  const loadLocations = useCallback(async () => {
    try {
      const response = await fetch("/api/locations", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok || !data.success) {
        return
      }
      const loaded = Array.isArray(data.locations) ? data.locations : []
      setLocations(loaded)
      if (!selectedLocationId && loaded.length > 0) {
        setSelectedLocationId(loaded[0].id)
      }
    } catch (error) {
      console.error("Error loading locations:", error)
    }
  }, [selectedLocationId])

  const resolveLocationIdFromLabel = useCallback(
    (label?: string | null) => {
      const value = String(label || "").trim()
      if (!value) return ""
      const normalized = value.toLowerCase()
      const token = normalized.split(" ")[0] || normalized
      const match = locations.find((loc) => {
        const name = String(loc.name || "").toLowerCase()
        const code = String(loc.code || "").toLowerCase()
        return name === normalized || code === normalized || name === token || code === token
      })
      return match?.id || ""
    },
    [locations],
  )

  const getLocationLabel = useCallback(
    (record: SalesRecord) => {
      if (record.location_id) {
        const match = locations.find((loc) => loc.id === record.location_id)
        if (match) return match.name || match.code
      }
      const fallback = record.location_name || record.location_code || record.estate
      if (fallback) return fallback
      return "Unknown"
    },
    [locations],
  )

  const loadBuyerSuggestions = useCallback(async () => {
    try {
      const response = await fetch("/api/sales?buyers=true", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok || !data.success) return
      const buyers = Array.isArray(data.buyers) ? data.buyers : []
      setBuyerSuggestions(buyers.filter((name: string) => name && typeof name === "string"))
    } catch (error) {
      console.error("Error loading buyers:", error)
    }
  }, [])

  const calculateTotals = useCallback(() => {
    const totals = {
      totalBagsSold: 0,
      totalKgsSold: 0,
      totalRevenue: 0,
    }

    salesRecords.forEach((record) => {
      const bagsSoldCount = Number(record.bags_sold) || 0
      totals.totalBagsSold += bagsSoldCount
      totals.totalKgsSold += resolveSalesRecordKgs(record, bagWeightKg)
      totals.totalRevenue += Number(record.revenue) || 0
    })

    return totals
  }, [bagWeightKg, salesRecords])

  // Fetch sales records
  const fetchSalesRecords = useCallback(async (pageIndex = 0, append = false) => {
    if (!coffeeSalesEnabled) {
      setSalesRecords([])
      setSalesTotals({ totalBagsSold: 0, totalKgsSold: 0, totalRevenue: 0 })
      setSalesTotalCount(0)
      setSalesHasMore(false)
      setSalesPage(0)
      return
    }
    if (append) {
      setIsLoadingMore(true)
    } else {
      setIsLoading(true)
    }
    try {
      const params = new URLSearchParams({
        limit: salesPageSize.toString(),
        offset: String(pageIndex * salesPageSize),
      })
      if (salesFilterLocationId && salesFilterLocationId !== LOCATION_ALL) {
        params.set("locationId", salesFilterLocationId)
      }
      const response = await fetch(`/api/sales?${params.toString()}`, { cache: "no-store" })
      const data = await response.json()
      
      if (data.success) {
        const nextRecords = Array.isArray(data.records) ? data.records : []
        const nextTotalCount = Number(data.totalCount) || 0
        setSalesRecords((prev) => (append ? [...prev, ...nextRecords] : nextRecords))
        setSalesTotals({
          totalBagsSold: Number(data.totalBagsSold) || 0,
          totalKgsSold: Number(data.totalKgsSold) || 0,
          totalRevenue: Number(data.totalRevenue) || 0,
        })
        setSalesTotalCount(nextTotalCount)
        const resolvedCount = append ? pageIndex * salesPageSize + nextRecords.length : nextRecords.length
        setSalesHasMore(nextTotalCount ? resolvedCount < nextTotalCount : nextRecords.length === salesPageSize)
        setSalesPage(pageIndex)
      } else {
        console.error("Error fetching sales records:", data.error)
      }
    } catch (error) {
      console.error("Error fetching sales records:", error)
    } finally {
      if (append) {
        setIsLoadingMore(false)
      } else {
        setIsLoading(false)
      }
    }
  }, [coffeeSalesEnabled, salesFilterLocationId, salesPageSize])

  const fetchDispatchSummary = useCallback(async () => {
    if (!coffeeSalesEnabled) {
      setDispatchSummary([])
      setDispatchSummaryScope("all")
      return
    }
    try {
      const params = new URLSearchParams({
        summaryOnly: "true",
      })
      const response = await fetch(`/api/dispatch?${params.toString()}`, { cache: "no-store" })
      const data = await response.json()

      if (data.success) {
        setDispatchSummary(Array.isArray(data.totalsByType) ? data.totalsByType : [])
        const scope = data.locationScope === "legacy_pool" ? "legacy_pool" : "all"
        setDispatchSummaryScope(scope)
      } else {
        setDispatchSummary([])
        setDispatchSummaryScope("all")
      }
    } catch (error) {
      console.error("Error fetching dispatch records:", error)
      setDispatchSummary([])
      setDispatchSummaryScope("all")
    }
  }, [coffeeSalesEnabled])

  const fetchSalesSummary = useCallback(async () => {
    if (!coffeeSalesEnabled) {
      setSalesSummary([])
      setSalesSummaryScope("all")
      return
    }
    try {
      const params = new URLSearchParams({
        summaryOnly: "true",
      })
      const response = await fetch(`/api/sales?${params.toString()}`, { cache: "no-store" })
      const data = await response.json()

      if (data.success) {
        setSalesSummary(Array.isArray(data.totalsByType) ? data.totalsByType : [])
        setSalesSummaryScope(data.locationScope === "legacy_pool" ? "legacy_pool" : "all")
      } else {
        setSalesSummary([])
        setSalesSummaryScope("all")
      }
    } catch (error) {
      console.error("Error fetching sales summary:", error)
      setSalesSummary([])
      setSalesSummaryScope("all")
    }
  }, [coffeeSalesEnabled])

  const fetchOverviewDispatchSummary = useCallback(async () => {
    if (!coffeeSalesEnabled) {
      setOverviewDispatchSummary([])
      return
    }
    try {
      const params = new URLSearchParams({
        summaryOnly: "true",
      })
      const response = await fetch(`/api/dispatch?${params.toString()}`, { cache: "no-store" })
      const data = await response.json()

      if (data.success) {
        setOverviewDispatchSummary(Array.isArray(data.totalsByType) ? data.totalsByType : [])
      } else {
        setOverviewDispatchSummary([])
      }
    } catch (error) {
      console.error("Error fetching dispatch summary:", error)
      setOverviewDispatchSummary([])
    }
  }, [coffeeSalesEnabled])

  const fetchOverviewSalesSummary = useCallback(async () => {
    if (!coffeeSalesEnabled) {
      setOverviewSalesSummary([])
      return
    }
    try {
      const params = new URLSearchParams({
        summaryOnly: "true",
      })
      const response = await fetch(`/api/sales?${params.toString()}`, { cache: "no-store" })
      const data = await response.json()

      if (data.success) {
        setOverviewSalesSummary(Array.isArray(data.totalsByType) ? data.totalsByType : [])
      } else {
        setOverviewSalesSummary([])
      }
    } catch (error) {
      console.error("Error fetching sales overview:", error)
      setOverviewSalesSummary([])
    }
  }, [coffeeSalesEnabled])

  useEffect(() => {
    loadLocations()
    loadBuyerSuggestions()
  }, [loadBuyerSuggestions, loadLocations])

  useEffect(() => {
    if (!otherSalesEnabled) {
      setOtherSalesTotals({ totalRevenue: 0, totalCount: 0 })
      return
    }

    let ignore = false
    const params = new URLSearchParams({
      all: "true",
    })
    if (salesFilterLocationId && salesFilterLocationId !== LOCATION_ALL) {
      params.set("locationId", salesFilterLocationId)
    }

    const loadOtherSalesTotals = async () => {
      try {
        const response = await fetch(`/api/other-sales?${params.toString()}`, { cache: "no-store" })
        const data = await response.json()
        if (ignore) return
        if (!response.ok || !data.success) {
          setOtherSalesTotals({ totalRevenue: 0, totalCount: 0 })
          return
        }
        setOtherSalesTotals({
          totalRevenue: Number(data.totals?.totalRevenue) || 0,
          totalCount: Number(data.totalCount) || 0,
        })
      } catch (error) {
        if (!ignore) {
          setOtherSalesTotals({ totalRevenue: 0, totalCount: 0 })
        }
      }
    }

    void loadOtherSalesTotals()
    return () => {
      ignore = true
    }
  }, [otherSalesEnabled, salesFilterLocationId])

  useEffect(() => {
    fetchSalesRecords(0, false)
  }, [fetchSalesRecords])

  useEffect(() => {
    if (!salesRecords.length) {
      setSelectedSalesRecord(null)
      return
    }
    setSelectedSalesRecord((prev) => {
      if (!prev) return salesRecords[0]
      return salesRecords.find((record) => record.id === prev.id) || salesRecords[0]
    })
  }, [salesRecords])

  useEffect(() => {
    fetchDispatchSummary()
  }, [fetchDispatchSummary])

  useEffect(() => {
    fetchSalesSummary()
  }, [fetchSalesSummary])

  useEffect(() => {
    fetchOverviewDispatchSummary()
    fetchOverviewSalesSummary()
  }, [fetchOverviewDispatchSummary, fetchOverviewSalesSummary])

  const buildAvailability = useCallback(
    (dispatchRows: DispatchSummaryRow[], salesRows: SalesSummaryRow[]) => {
      const createBreakdown = (): InventoryBreakdown => ({
        cherry: { bags: 0, kgs: 0 },
        parchment: { bags: 0, kgs: 0 },
        total: { bags: 0, kgs: 0 },
      })

      const receivedTotals = COFFEE_TYPES.reduce(
        (acc, type) => {
          acc[type] = createBreakdown()
          return acc
        },
        {} as Record<string, InventoryBreakdown>,
      )

      const soldTotals = COFFEE_TYPES.reduce(
        (acc, type) => {
          acc[type] = createBreakdown()
          return acc
        },
        {} as Record<string, InventoryBreakdown>,
      )

      dispatchRows.forEach((record) => {
        const type = toCanonicalCoffeeLabel(record.coffee_type)
        if (!receivedTotals[type]) {
          receivedTotals[type] = createBreakdown()
        }
        const kgsReceived = resolveDispatchReceivedKgs(record, bagWeightKg)
        const bagsReceived = kgsReceived / bagWeightKg
        const bagType = normalizeBagType(record.bag_type)
        receivedTotals[type][bagType].bags += bagsReceived
        receivedTotals[type][bagType].kgs += kgsReceived
        receivedTotals[type].total.bags += bagsReceived
        receivedTotals[type].total.kgs += kgsReceived
      })

      salesRows.forEach((record) => {
        const type = toCanonicalCoffeeLabel(record.coffee_type)
        if (!soldTotals[type]) {
          soldTotals[type] = createBreakdown()
        }
        const bagsSoldCount = Number(record.bags_sold) || 0
        const kgsSoldCountRaw = Number(record.kgs_sold) || 0
        const kgsSoldCount = kgsSoldCountRaw > 0 ? kgsSoldCountRaw : bagsSoldCount * bagWeightKg
        const bagType = normalizeBagType(record.bag_type)
        soldTotals[type][bagType].bags += bagsSoldCount
        soldTotals[type][bagType].kgs += kgsSoldCount
        soldTotals[type].total.bags += bagsSoldCount
        soldTotals[type].total.kgs += kgsSoldCount
      })

      const allCoffeeTypes = Array.from(new Set([...Object.keys(receivedTotals), ...Object.keys(soldTotals)]))
      allCoffeeTypes.forEach((type) => {
        if (!receivedTotals[type]) {
          receivedTotals[type] = createBreakdown()
        }
        if (!soldTotals[type]) {
          soldTotals[type] = createBreakdown()
        }
      })

      const availableTotals = allCoffeeTypes.reduce((acc, type) => {
        acc[type] = createBreakdown()
        const cherryNetBags = receivedTotals[type].cherry.bags - (soldTotals[type]?.cherry.bags || 0)
        const cherryNetKgs = receivedTotals[type].cherry.kgs - (soldTotals[type]?.cherry.kgs || 0)
        const parchmentNetBags = receivedTotals[type].parchment.bags - (soldTotals[type]?.parchment.bags || 0)
        const parchmentNetKgs = receivedTotals[type].parchment.kgs - (soldTotals[type]?.parchment.kgs || 0)
        acc[type].cherry.bags = Math.max(0, cherryNetBags)
        acc[type].cherry.kgs = Math.max(0, cherryNetKgs)
        acc[type].parchment.bags = Math.max(0, parchmentNetBags)
        acc[type].parchment.kgs = Math.max(0, parchmentNetKgs)
        // Keep slot math strict: type total is the sum of positive bag-type availability, not cross-offset net.
        acc[type].total.bags = acc[type].cherry.bags + acc[type].parchment.bags
        acc[type].total.kgs = acc[type].cherry.kgs + acc[type].parchment.kgs
        return acc
      }, {} as Record<string, InventoryBreakdown>)

      const totalReceived = allCoffeeTypes.reduce((sum, type) => sum + (receivedTotals[type]?.total.kgs || 0), 0)
      const totalReceivedBags = allCoffeeTypes.reduce((sum, type) => sum + (receivedTotals[type]?.total.bags || 0), 0)
      const totalSold = allCoffeeTypes.reduce((sum, type) => sum + (soldTotals[type]?.total.kgs || 0), 0)
      const totalSoldBags = allCoffeeTypes.reduce((sum, type) => sum + (soldTotals[type]?.total.bags || 0), 0)
      const totalAvailable = allCoffeeTypes.reduce((sum, type) => sum + (availableTotals[type]?.total.kgs || 0), 0)
      const totalAvailableBags = allCoffeeTypes.reduce((sum, type) => sum + (availableTotals[type]?.total.bags || 0), 0)
      const totalOverdrawn = allCoffeeTypes.reduce((sum, type) => {
        const cherryNet = (receivedTotals[type]?.cherry.kgs || 0) - (soldTotals[type]?.cherry.kgs || 0)
        const parchmentNet = (receivedTotals[type]?.parchment.kgs || 0) - (soldTotals[type]?.parchment.kgs || 0)
        return sum + Math.max(0, -cherryNet) + Math.max(0, -parchmentNet)
      }, 0)
      const totalOverdrawnBags = allCoffeeTypes.reduce((sum, type) => {
        const cherryNet = (receivedTotals[type]?.cherry.bags || 0) - (soldTotals[type]?.cherry.bags || 0)
        const parchmentNet = (receivedTotals[type]?.parchment.bags || 0) - (soldTotals[type]?.parchment.bags || 0)
        return sum + Math.max(0, -cherryNet) + Math.max(0, -parchmentNet)
      }, 0)

      return {
        receivedTotals,
        soldTotals,
        availableTotals,
        totalReceived,
        totalReceivedBags,
        totalSold,
        totalSoldBags,
        totalAvailable,
        totalAvailableBags,
        totalOverdrawn,
        totalOverdrawnBags,
      }
    },
    [bagWeightKg],
  )

  const overviewAvailabilityTotals = useMemo(
    () => buildAvailability(overviewDispatchSummary, overviewSalesSummary),
    [buildAvailability, overviewDispatchSummary, overviewSalesSummary],
  )
  const selectionScopeAvailabilityTotals = useMemo(
    () => buildAvailability(dispatchSummary, salesSummary),
    [buildAvailability, dispatchSummary, salesSummary],
  )

  const getAvailableForSelection = () => {
    const normalizedCoffee = normalizeCoffeeType(coffeeType)
    const normalizedBag = normalizeBagType(bagType)
    let receivedKgs = 0
    let soldKgs = 0

    dispatchSummary.forEach((row) => {
      const recordCoffee = normalizeCoffeeType(row.coffee_type)
      if (recordCoffee !== normalizedCoffee) return
      if (normalizeBagType(row.bag_type) !== normalizedBag) return
      receivedKgs += resolveDispatchReceivedKgs(row, bagWeightKg)
    })

    salesSummary.forEach((row) => {
      const recordCoffee = normalizeCoffeeType(row.coffee_type)
      if (recordCoffee !== normalizedCoffee) return
      if (normalizeBagType(row.bag_type) !== normalizedBag) return
      const bagsSoldCount = Number(row.bags_sold) || 0
      const kgsSoldCountRaw = Number(row.kgs_sold) || 0
      soldKgs += kgsSoldCountRaw > 0 ? kgsSoldCountRaw : bagsSoldCount * bagWeightKg
    })

    const netKgs = receivedKgs - soldKgs
    const availableKgs = Math.max(0, netKgs)
    const availableBags = availableKgs / bagWeightKg
    const overdrawnKgs = Math.max(0, -netKgs)
    const overdrawnBags = overdrawnKgs / bagWeightKg
    return { receivedKgs, soldKgs, availableKgs, availableBags, overdrawnKgs, overdrawnBags }
  }

  const isLegacyPooledAvailability = dispatchSummaryScope === "legacy_pool" || salesSummaryScope === "legacy_pool"

  const editAllowance = useMemo(() => {
    if (!editingRecord) {
      return { allowanceKgs: 0, matchesSelection: false }
    }
    const matchesCoffee = normalizeCoffeeType(editingRecord.coffee_type) === normalizeCoffeeType(coffeeType)
    const matchesBag = normalizeBagType(editingRecord.bag_type) === normalizeBagType(bagType)
    if (matchesCoffee && matchesBag) {
      return {
        allowanceKgs: resolveSalesRecordKgs(editingRecord, bagWeightKg),
        matchesSelection: true,
      }
    }
    return { allowanceKgs: 0, matchesSelection: false }
  }, [bagType, bagWeightKg, coffeeType, editingRecord])

  const handleSave = async () => {
    const wasEditing = Boolean(editingRecord)
    const editingRecordId = editingRecord?.id
    const editingId = editingRecord?.id != null ? Number(editingRecord.id) : null
    if (editingRecord && (!Number.isFinite(editingId) || (editingId ?? 0) <= 0)) {
      toast({
        title: "Invalid record",
        description: "This sale record is missing a valid ID. Refresh and try again.",
        variant: "destructive",
      })
      return
    }
    if (!selectedLocationId) {
      toast({
        title: "Location required",
        description: "Select a location before recording a sale.",
        variant: "destructive",
      })
      return
    }
    const kgsValue = Number(kgsSold)
    if (!Number.isFinite(kgsValue) || kgsValue <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid KGs sold amount",
        variant: "destructive",
      })
      return
    }

    const priceValue = Number(pricePerBag)
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid price per bag",
        variant: "destructive",
      })
      return
    }

    const { availableKgs } = getAvailableForSelection()
    const currentRecordKgs = editingRecord ? resolveSalesRecordKgs(editingRecord, bagWeightKg) : 0
    const isEditWithoutInventoryChange =
      Boolean(editingRecord) &&
      editAllowance.matchesSelection &&
      Math.abs(currentRecordKgs - kgsValue) < 0.0001
    const effectiveAvailableKgs = availableKgs + editAllowance.allowanceKgs
    if (!isEditWithoutInventoryChange && kgsValue > effectiveAvailableKgs + STOCK_EPSILON) {
      toast({
        title: "Insufficient Inventory",
        description: `Only ${effectiveAvailableKgs.toFixed(2)} KGs of ${coffeeType} ${bagType} available based on received inventory.`,
        variant: "destructive",
      })
      return
    }

    setSaveFeedback(null)
    setIsSaving(true)
    try {
      const locationLabel = selectedLocation?.name || selectedLocation?.code || ""
      const method = editingRecord ? "PUT" : "POST"
      const response = await fetch("/api/sales", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          sale_date: format(date, "yyyy-MM-dd"),
          batch_no: batchNo || null,
          lot_id: null,
          locationId: selectedLocationId,
          estate: locationLabel || null,
          coffee_type: coffeeType,
          bag_type: bagType,
          buyer_name: buyerName || null,
          bags_sold: bagsSoldValue,
          kgs_sold: kgsValue,
          price_per_bag: priceValue,
          bank_account: bankAccount || null,
          notes: notes || null,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (response.ok && data.success) {
        const updatedRecord = data.record as SalesRecord | undefined
        if (updatedRecord && updatedRecord.id != null) {
          setSalesRecords((prev) => {
            if (wasEditing) {
              return prev.map((record) =>
                String(record.id) === String(updatedRecord.id) ? { ...record, ...updatedRecord } : record,
              )
            }
            return [updatedRecord, ...prev]
          })
          setSelectedSalesRecord((prev) => {
            if (String(prev?.id || "") === String(updatedRecord.id) || !prev) return updatedRecord
            return prev
          })
        } else if (wasEditing && editingRecordId != null) {
          // Fallback in case API omits RETURNING payload.
          fetchSalesRecords(0, false)
        }
        toast({
          title: "Success",
          description: editingRecord ? "Sales record updated successfully" : "Sales record saved successfully",
        })
        setSaveFeedback({
          type: "success",
          message: `Saved ${formatNumber(kgsValue)} KGs at ${formatCurrency(priceValue)} per bag.`,
        })
        posthog.capture(wasEditing ? "sale_updated" : "sale_recorded", {
          coffee_type: coffeeType,
          bag_type: bagType,
          kgs_sold: kgsValue,
          bags_sold: bagsSoldValue,
          price_per_bag: priceValue,
          revenue: calculatedRevenue,
          buyer_name: buyerName || null,
          location_id: selectedLocationId,
        })
        if (buyerName.trim()) {
          setBuyerSuggestions((prev) => Array.from(new Set([buyerName.trim(), ...prev])))
        }
        // Reset form
        resetForm()
        // Keep local edit result immediately; perform delayed sync to avoid stale read overwrite.
        if (!wasEditing) {
          fetchSalesRecords(0, false)
        } else {
          window.setTimeout(() => {
            fetchSalesRecords(0, false)
          }, 1200)
        }
        fetchDispatchSummary()
        fetchSalesSummary()
      } else {
        setSaveFeedback({
          type: "error",
          message: data.error || `Failed to save sales record (HTTP ${response.status})`,
        })
        toast({
          title: "Error",
          description: data.error || `Failed to save sales record (HTTP ${response.status})`,
          variant: "destructive",
        })
      }
    } catch (error) {
      setSaveFeedback({
        type: "error",
        message: "Failed to save sales record",
      })
      toast({
        title: "Error",
        description: "Failed to save sales record",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const resetForm = () => {
    setBatchNo("")
    setCoffeeType("Arabica")
    setBagType("Dry Parchment")
    setKgsSold("")
    setPricePerBag("")
    setBuyerName("")
    setBankAccount("")
    setNotes("")
    setEditingRecord(null)
  }

  const handleEdit = (record: SalesRecord) => {
    setEditingRecord(record)
    setDate(new Date(record.sale_date))
    setBatchNo(record.batch_no || "")
    const resolvedLocationId =
      record.location_id || resolveLocationIdFromLabel(record.location_name || record.location_code || record.estate)
    if (resolvedLocationId) {
      setSelectedLocationId(resolvedLocationId)
    }
    setCoffeeType(record.coffee_type || "Arabica")
    setBagType(formatBagTypeLabel(record.bag_type))
    const kgsValue = resolveSalesRecordKgs(record, bagWeightKg)
    setKgsSold(kgsValue ? kgsValue.toFixed(2) : "")
    setPricePerBag(record.price_per_bag.toString())
    setBuyerName(record.buyer_name || "")
    setBankAccount(record.bank_account || "")
    setNotes(record.notes || "")
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this record?")) return

    try {
      const response = await fetch(`/api/sales?id=${id}`, {
        method: "DELETE",
              })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Success",
          description: "Record deleted successfully",
        })
        posthog.capture("sale_deleted", { sale_id: id })
        fetchSalesRecords(0, false)
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to delete record",
          variant: "destructive",
        })
      }
    } catch (error) {
      posthog.captureException(error)
      toast({
        title: "Error",
        description: "Failed to delete record",
        variant: "destructive",
      })
    }
  }

  const exportToCSV = () => {
    const runExport = async () => {
      const params = new URLSearchParams({
        all: "true",
      })
      if (salesFilterLocationId && salesFilterLocationId !== LOCATION_ALL) {
        params.set("locationId", salesFilterLocationId)
      }
      const response = await fetch(`/api/sales?${params.toString()}`, {
        cache: "no-store",
      })
      const data = await response.json()

      if (!data.success || !Array.isArray(data.records)) {
        throw new Error(data.error || "Failed to load sales records for export")
      }

      const records = data.records as SalesRecord[]
      const csvContent = buildSalesCsv(records, bagWeightKg)

      const blob = new Blob([csvContent], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "sales_records.csv"
      a.click()
      URL.revokeObjectURL(url)
      posthog.capture("sales_csv_exported", {
        record_count: records.length,
        location_filter: salesFilterLocationId !== LOCATION_ALL ? salesFilterLocationId : null,
      })
    }

    runExport().catch((error) => {
      posthog.captureException(error)
      console.error("Error exporting sales records:", error)
      toast({
        title: "Error",
        description: "Failed to export sales records",
        variant: "destructive",
      })
    })
  }

  const fallbackTotals = calculateTotals()
  const totalBagsSold = salesTotals?.totalBagsSold ?? fallbackTotals.totalBagsSold
  const totalKgsSold = salesTotals?.totalKgsSold ?? fallbackTotals.totalKgsSold
  const totalCoffeeRevenue = salesTotals?.totalRevenue ?? fallbackTotals.totalRevenue
  const totals = {
    totalBagsSold,
    totalKgsSold,
    totalRevenue: totalCoffeeRevenue,
  }
  const pricePerBagByType = useMemo(() => {
    const totalsByKey: Record<string, { revenue: number; bags: number }> = {}
    overviewSalesSummary.forEach((row) => {
      const coffee = normalizeCoffeeType(row.coffee_type)
      const bagType = normalizeBagType(row.bag_type)
      if (coffee !== "arabica" && coffee !== "robusta") return
      const key = `${coffee}_${bagType}`
      if (!totalsByKey[key]) {
        totalsByKey[key] = { revenue: 0, bags: 0 }
      }
      totalsByKey[key].revenue += Number(row.revenue) || 0
      totalsByKey[key].bags += Number(row.bags_sold) || 0
    })

    const getPrice = (key: string) => {
      const entry = totalsByKey[key]
      if (!entry || entry.bags <= 0) return 0
      return entry.revenue / entry.bags
    }

    return {
      arabicaParchment: getPrice("arabica_parchment"),
      arabicaCherry: getPrice("arabica_cherry"),
      robustaParchment: getPrice("robusta_parchment"),
      robustaCherry: getPrice("robusta_cherry"),
    }
  }, [overviewSalesSummary])
  const resolvedSalesCount = salesTotalCount || salesRecords.length
  const resolvedSalesCountLabel =
    salesTotalCount > salesRecords.length
      ? `Showing ${salesRecords.length} of ${salesTotalCount}`
      : `${salesRecords.length} record(s)`
  const baseSelectionAvailability = getAvailableForSelection()
  const netSelectionOverdrawnKgs = Math.max(0, baseSelectionAvailability.overdrawnKgs - editAllowance.allowanceKgs)
  const netSelectionOverdrawnBags = netSelectionOverdrawnKgs / bagWeightKg
  const selectionAvailability = {
    availableKgs: baseSelectionAvailability.availableKgs + editAllowance.allowanceKgs,
    availableBags: (baseSelectionAvailability.availableKgs + editAllowance.allowanceKgs) / bagWeightKg,
  }
  const selectionScopeLabel = "estate-wide scope"
  const hasOtherTypeAvailability =
    selectionAvailability.availableKgs <= 0 && selectionScopeAvailabilityTotals.totalAvailable > 0
  const exceedsAvailability = kgsSoldValue > selectionAvailability.availableKgs + STOCK_EPSILON
  const excessKgs = Math.max(0, kgsSoldValue - selectionAvailability.availableKgs)
  const projectedRemainingKgs = Math.max(0, selectionAvailability.availableKgs - kgsSoldValue)
  const projectedRemainingBags = projectedRemainingKgs / bagWeightKg
  const entryUsagePct =
    selectionAvailability.availableKgs > 0
      ? Math.min(100, (kgsSoldValue / selectionAvailability.availableKgs) * 100)
      : 0
  const selectionShareOfScopePct =
    selectionScopeAvailabilityTotals.totalAvailable > 0
      ? (selectionAvailability.availableKgs / selectionScopeAvailabilityTotals.totalAvailable) * 100
      : 0
  const contextGapKgs = Math.max(0, selectionScopeAvailabilityTotals.totalAvailable - selectionAvailability.availableKgs)
  const contextGapBags = contextGapKgs / bagWeightKg
  const saveBlockers: string[] = []
  if (!selectedLocationId) saveBlockers.push("Select a location.")
  if (!(kgsSoldValue > 0)) saveBlockers.push("Enter KGs sold greater than 0.")
  if (!(pricePerBagValue > 0)) saveBlockers.push("Enter price per bag greater than 0.")
  if (exceedsAvailability) {
    saveBlockers.push(`KGs sold exceeds available stock by ${formatNumber(excessKgs)} KGs.`)
  }
  if (isSaving) saveBlockers.push("Saving in progress.")
  const canSubmitSale = saveBlockers.length === 0
  salesSaveStateRef.current = { canSubmitSale, isSaving }
  salesSaveHandlerRef.current = handleSave

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() !== "s") return
      event.preventDefault()
      if (salesSaveStateRef.current.canSubmitSale && !salesSaveStateRef.current.isSaving) {
        void salesSaveHandlerRef.current?.()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const overviewScopeLabel = "all locations"
  const selectedSalesKgs = selectedSalesRecord ? resolveSalesRecordKgs(selectedSalesRecord, bagWeightKg) : 0
  const selectedSalesBags = Number(selectedSalesRecord?.bags_sold) || 0
  const selectedSalesPricePerBag = Number(selectedSalesRecord?.price_per_bag) || 0
  const selectedSalesPricePerKg = selectedSalesKgs > 0 ? (selectedSalesPricePerBag * selectedSalesBags) / selectedSalesKgs : 0
  const selectedSalesRevenue = Number(selectedSalesRecord?.revenue) || 0
  const coffeeRevenue = totals.totalRevenue
  const otherRevenue = otherSalesTotals.totalRevenue
  const combinedRevenue = coffeeRevenue + otherRevenue
  const salesShellStats = [
    {
      label: "Coffee Revenue",
      value: formatCurrency(coffeeRevenue, 0),
      detail: `${formatNumber(totalKgsSold, 0)} KGs sold to date`,
      tone: "positive" as const,
      tooltip: "Total revenue from confirmed coffee sales records. Includes all coffee types sold this season.",
    },
    ...(otherSalesEnabled ? [{
      label: "Other Revenue",
      value: formatCurrency(otherRevenue, 0),
      detail: `${formatNumber(otherSalesTotals.totalCount, 0)} other-sales records`,
      tooltip: "Revenue from non-coffee estate products — pepper, timber, services, etc.",
    }] : []),
    {
      label: "Available To Sell",
      value: `${formatNumber(selectionScopeAvailabilityTotals.totalAvailable, 0)} KGs`,
      detail: "Confirmed dispatch-received stock",
      tone:
        selectionScopeAvailabilityTotals.totalAvailable > 0 ? ("default" as const) : ("warning" as const),
      tooltip: selectionScopeAvailabilityTotals.totalAvailable <= 0
        ? "No unsold stock available for the selected type and scope. All confirmed receipts have been recorded as sold."
        : "Confirmed dispatch-received KGs that haven't been recorded as sold yet. Sell against this to keep records accurate.",
    },
    {
      label: "Sales Records",
      value: formatNumber(salesTotalCount || salesRecords.length, 0),
      detail: buyerSuggestions.length > 0 ? `${buyerSuggestions.length} buyer suggestions saved` : "Build buyer history as you go",
      tooltip: "Total number of individual sale transactions recorded. Buyer names are saved as suggestions for faster future entry.",
    },
  ]
  const scrollToEntryForm = useCallback(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }, [])

  return (
    <WorkspacePageShell
      badge="Revenue workspace"
      title="Sales"
      description="Track coffee sales and other estate revenue."
      accent="amber"
      className="space-y-0"
      stats={salesShellStats}
      supportingContent={
        <p>
          Sales should stay tied to confirmed dispatch-received stock, real buyers, and agreed prices. Keep the record easy to explain later.
        </p>
      }
    >
      <TaskGuideCard
        eyebrow="Sales guide"
        title="Record a sale after buyer, quantity, and price are confirmed"
        description="Record each sale once the buyer, quantity, and price are confirmed. Keep it simple: who bought, what was sold, how much, and at what price."
        bullets={[
          "Choose the correct location so sold stock matches dispatch and inventory.",
          "Enter buyer and price only after they are confirmed, not as a rough guess.",
          "If coffee sales are not final yet, use notes or wait instead of creating a fake sale.",
        ]}
        tip="A good sales record should be easy to explain to the owner, the buyer, and the accountant using the same numbers."
        tone="operations"
        actions={
          <>
            <Button variant="outline" className="bg-white" onClick={scrollToEntryForm}>
              Go to form
            </Button>
            <Button asChild variant="outline" className="bg-white">
              <Link href="/manuals">Manuals</Link>
            </Button>
          </>
        }
      />

      <Card className="border-border/70 bg-white/90">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Revenue summary</CardTitle>
          <CardDescription>
            {salesFilterLocationId !== LOCATION_ALL ? "Filtered to one location." : "Across all locations."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-2">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Coffee Revenue</p>
              <p className="text-2xl font-semibold text-emerald-700">{formatCurrency(coffeeRevenue, 0)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Other Revenue</p>
              <p className="text-lg font-semibold text-amber-700">{formatCurrency(otherRevenue, 0)}</p>
            </div>
            <div className="border-t border-border/60 pt-2">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Total Revenue</p>
              <p className="text-xl font-semibold text-foreground">{formatCurrency(combinedRevenue, 0)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Coffee entries: {resolvedSalesCount}
                {otherSalesEnabled ? ` · Other sales: ${otherSalesTotals.totalCount}` : ""}
              </p>
            </div>
          </div>
          {otherSalesEnabled ? (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Sales Workspace</p>
              <div className={cn("mt-3 grid gap-2", coffeeSalesEnabled ? "grid-cols-2" : "grid-cols-1")}>
                {coffeeSalesEnabled ? (
                  <Button
                    type="button"
                    variant={resolvedWorkspaceView === "coffee" ? "default" : "outline"}
                    className={cn(resolvedWorkspaceView === "coffee" ? "bg-emerald-700 hover:bg-emerald-800" : "bg-white")}
                    onClick={() => setCurrentWorkspaceView("coffee")}
                  >
                    Coffee Sales
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant={resolvedWorkspaceView === "other-sales" ? "default" : "outline"}
                  className={cn(resolvedWorkspaceView === "other-sales" ? "bg-emerald-700 hover:bg-emerald-800" : "bg-white")}
                  onClick={() => setCurrentWorkspaceView("other-sales")}
                >
                  Other Sales
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {resolvedWorkspaceView === "coffee" ? (
        <>
      <Card
        className={cn(
          "order-2 bg-white/90",
          exceedsAvailability ? "border-rose-200/80" : "border-emerald-200/80",
        )}
      >
        <CardHeader className="pb-3">
          <CardTitle className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Before you save</CardTitle>
          <CardDescription>
            This checks the exact stock line you selected: coffee type plus bag type.
          </CardDescription>
          <p className="text-xs text-muted-foreground">
            Selection: {selectionScopeLabel} · {coffeeType} · {bagType}
          </p>
          <p className="text-xs text-muted-foreground">
            Only confirmed received stock is sellable here. Unconfirmed dispatch does not count yet.
          </p>
          {isLegacyPooledAvailability && (
            <p className="text-xs font-medium text-amber-700">
              Legacy pooled stock mode is active, so availability is checked estate-wide to preserve old history.
            </p>
          )}
          {editAllowance.matchesSelection && (
            <p className="text-xs text-muted-foreground">
              Editing credit: {formatNumber(editAllowance.allowanceKgs)} KGs from this record.
            </p>
          )}
          {hasOtherTypeAvailability && (
            <p className="text-xs font-medium text-amber-700">
              No stock is available for this exact selection. Other coffee or bag types in this scope still have
              {" "}{formatNumber(selectionScopeAvailabilityTotals.totalAvailable)} KGs available.
            </p>
          )}
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-lg border border-border/60 bg-white/80 p-3">
            <p className="text-xs text-muted-foreground">Check scope</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{selectionScopeLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">{coffeeType} · {bagType}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-white/80 p-3">
            <p className="text-xs text-muted-foreground">Available now</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {formatNumber(selectionAvailability.availableKgs)} KGs
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{formatNumber(selectionAvailability.availableBags)} bags</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Received {formatNumber(baseSelectionAvailability.receivedKgs)} - Sold {formatNumber(baseSelectionAvailability.soldKgs)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatNumber(selectionShareOfScopePct, 0)}% of all coffee currently available in this scope
            </p>
            {netSelectionOverdrawnKgs > 0 && (
              <p className="mt-1 text-xs text-rose-600">
                Overdrawn: {formatNumber(netSelectionOverdrawnKgs)} KGs ({formatNumber(netSelectionOverdrawnBags)} bags)
              </p>
            )}
          </div>
          <div className="rounded-lg border border-border/60 bg-white/80 p-3">
            <p className="text-xs text-muted-foreground">This entry</p>
            <p className={cn("mt-1 text-sm font-semibold", exceedsAvailability ? "text-rose-700" : "text-foreground")}>
              {formatNumber(kgsSoldValue)} KGs
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{formatNumber(bagsSoldValue)} bags</p>
            {selectionAvailability.availableKgs > 0 && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full transition-all", exceedsAvailability ? "bg-rose-500" : "bg-emerald-600")}
                  style={{ width: `${Math.min(100, entryUsagePct)}%` }}
                />
              </div>
            )}
          </div>
          <div className="rounded-lg border border-border/60 bg-white/80 p-3">
            <p className="text-xs text-muted-foreground">Left after this sale</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{formatNumber(projectedRemainingKgs)} KGs</p>
            <p className="mt-1 text-xs text-muted-foreground">{formatNumber(projectedRemainingBags)} bags</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-white/80 p-3">
            <p className="text-xs text-muted-foreground">Estimated revenue</p>
            <p className="mt-1 text-sm font-semibold text-emerald-700">{formatCurrency(calculatedRevenue)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Price: {formatCurrency(pricePerBagValue)}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-white/80 p-3">
            <p className="text-xs text-muted-foreground">Other stock in this scope</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {formatNumber(selectionScopeAvailabilityTotals.totalAvailable)} KGs
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatNumber(selectionScopeAvailabilityTotals.totalAvailableBags)} bags
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Outside this exact selection: {formatNumber(contextGapKgs)} KGs ({formatNumber(contextGapBags)} bags)
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="order-3 border-border/70 bg-white/85">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Available stock
          </CardTitle>
          <CardDescription>
            Scope: {overviewScopeLabel}. Based only on confirmed received KGs.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {COFFEE_TYPES.map((type) => {
            const totals = overviewAvailabilityTotals.availableTotals[type]
            return (
              <div key={type} className="space-y-3">
                <div className="text-sm font-semibold text-foreground">{type}</div>
                <div className="rounded-lg border border-border/60 bg-white/80 p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Cherry</div>
                  <div className="text-lg font-semibold">{formatNumber(totals.cherry.kgs)} KGs</div>
                  <div className="text-xs text-muted-foreground">{formatNumber(totals.cherry.bags)} Bags</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-white/80 p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Parchment</div>
                  <div className="text-lg font-semibold">{formatNumber(totals.parchment.kgs)} KGs</div>
                  <div className="text-xs text-muted-foreground">{formatNumber(totals.parchment.bags)} Bags</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-white/80 p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Total {type}</div>
                  <div className="text-lg font-semibold">{formatNumber(totals.total.kgs)} KGs</div>
                  <div className="text-xs text-muted-foreground">{formatNumber(totals.total.bags)} Bags</div>
                </div>
              </div>
            )
          })}
            <div className="space-y-3">
            <div className="text-sm font-semibold text-foreground">Summary</div>
            <div className="rounded-lg border border-border/60 bg-white/80 p-3 space-y-1">
              <div className="text-xs text-muted-foreground">Total Received</div>
              <div className="text-lg font-semibold">{formatNumber(overviewAvailabilityTotals.totalReceived)} KGs</div>
              <div className="text-xs text-muted-foreground">{formatNumber(overviewAvailabilityTotals.totalReceivedBags)} Bags</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-white/80 p-3 space-y-1">
              <div className="text-xs text-muted-foreground">Total Sold</div>
              <div className="text-lg font-semibold">{formatNumber(overviewAvailabilityTotals.totalSold)} KGs</div>
              <div className="text-xs text-muted-foreground">{formatNumber(overviewAvailabilityTotals.totalSoldBags)} Bags</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-white/80 p-3 space-y-1">
              <div className="text-xs text-muted-foreground">Total Available</div>
              <div className="text-lg font-semibold">{formatNumber(overviewAvailabilityTotals.totalAvailable)} KGs</div>
              <div className="text-xs text-muted-foreground">{formatNumber(overviewAvailabilityTotals.totalAvailableBags)} Bags</div>
            </div>
            {overviewAvailabilityTotals.totalOverdrawn > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-3 space-y-1">
                <div className="text-xs text-rose-700">Historical Overdrawn</div>
                <div className="text-lg font-semibold text-rose-700">
                  {formatNumber(overviewAvailabilityTotals.totalOverdrawn)} KGs
                </div>
                <div className="text-xs text-rose-700">{formatNumber(overviewAvailabilityTotals.totalOverdrawnBags)} Bags</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="order-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Coffee Revenue */}
        <Card className="border-border/60 bg-white/85">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Coffee Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-emerald-700">{formatCurrency(coffeeRevenue, 0)}</div>
            <div className="text-sm text-muted-foreground mt-1">
              {resolvedSalesCount} sales recorded
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Combined total is shown above with other sales
            </div>
          </CardContent>
        </Card>

        {/* Total Bags Sold */}
        <Card className="border-border/60 bg-white/85">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Bags Sold (Logistics)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">{formatNumber(totals.totalBagsSold)}</div>
            <div className="text-sm text-muted-foreground mt-1">
              KGs Sold: {formatNumber(totals.totalKgsSold)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Bags are shipment units, not moisture-adjusted weight.</div>
          </CardContent>
        </Card>

        {/* Total KGs Sold */}
        <Card className="border-border/60 bg-white/85">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-[0.2em] text-muted-foreground">KGs Sold (Sales Basis)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">{formatNumber(totals.totalKgsSold)}</div>
            <div className="text-sm text-muted-foreground mt-1">
              Bags Sold: {formatNumber(totals.totalBagsSold)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Validated against dispatch received KGs.</div>
          </CardContent>
        </Card>

        {/* Price per bag by coffee + form */}
        <Card className="border-border/60 bg-white/85">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Average Price Per Bag
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-border/60 bg-white/80 p-2">
                <div className="text-xs text-muted-foreground">Arabica · Parchment</div>
                <div className="text-lg font-semibold">{formatCurrency(pricePerBagByType.arabicaParchment)}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-white/80 p-2">
                <div className="text-xs text-muted-foreground">Arabica · Cherry</div>
                <div className="text-lg font-semibold">{formatCurrency(pricePerBagByType.arabicaCherry)}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-white/80 p-2">
                <div className="text-xs text-muted-foreground">Robusta · Parchment</div>
                <div className="text-lg font-semibold">{formatCurrency(pricePerBagByType.robustaParchment)}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-white/80 p-2">
                <div className="text-xs text-muted-foreground">Robusta · Cherry</div>
                <div className="text-lg font-semibold">{formatCurrency(pricePerBagByType.robustaCherry)}</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-2">Weighted by bags sold across recorded sales.</div>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Sale Form */}
      <Card className="order-1 border-border/70 bg-white/85">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IndianRupee className="h-5 w-5" />
            {editingRecord ? "Edit sale entry" : "Sale entry"}
          </CardTitle>
          <CardDescription>
            {editingRecord
              ? "Update the buyer, quantity, or price for this sale."
              : "Record one confirmed sale with the buyer, quantity, and agreed price."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-white/70 bg-white/85 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-amber-700">Location</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {selectedLocation?.name || selectedLocation?.code || "Select a location"}
                </p>
              </div>
              <div className="rounded-xl border border-white/70 bg-white/85 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-amber-700">Coffee</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{coffeeType}</p>
              </div>
              <div className="rounded-xl border border-white/70 bg-white/85 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-amber-700">Bag type</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatBagTypeLabel(bagType)}</p>
              </div>
              <div className="rounded-xl border border-white/70 bg-white/85 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-amber-700">Save rule</p>
                <p className="mt-1 text-sm font-semibold text-foreground">One buyer, one stock line, one agreed price</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {/* Date */}
            <div className="space-y-2">
              <Label>Date</Label>
              {isMobile ? (
                <input
                  type="date"
                  value={format(date, "yyyy-MM-dd")}
                  onChange={e => { const d = new Date(e.target.value + "T00:00:00"); if (!isNaN(d.getTime())) setDate(d) }}
                  className="w-full h-12 rounded-xl border border-input bg-background px-3 text-base font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              ) : (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal bg-transparent", !date && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? formatDateOnly(date) : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus />
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Batch Reference */}
            <div className="space-y-2">
              <FieldLabel
                label="Batch Reference"
                tooltip="Internal batch or ledger reference (optional, helps reconciliation)."
              />
              <Input
                type="text"
                placeholder="Optional batch or ledger reference"
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
                className={cn(isMobile && "h-12 text-base")}
              />
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label>Location</Label>
              {isMobile ? (
                <select
                  value={selectedLocationId}
                  onChange={e => setSelectedLocationId(e.target.value)}
                  disabled={!locations.length}
                  className="w-full h-12 rounded-xl border border-input bg-background px-3 text-base font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                >
                  <option value="">{locations.length ? "Select location" : "Add a location first"}</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name || loc.code}</option>
                  ))}
                </select>
              ) : (
                <Select value={selectedLocationId} onValueChange={setSelectedLocationId} disabled={!locations.length}>
                  <SelectTrigger>
                    <SelectValue placeholder={locations.length ? "Select location" : "Add a location first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name || loc.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                {isLegacyPooledAvailability
                  ? "Legacy pooled mode is active for this estate, so availability is checked estate-wide."
                  : "Location is captured for traceability. Stock validation is still checked estate-wide right now."}
              </p>
            </div>

            {/* Coffee Type */}
            <div className="space-y-2">
              <Label>Coffee Type</Label>
              {isMobile ? (
                <select
                  value={coffeeType}
                  onChange={e => setCoffeeType(e.target.value)}
                  className="w-full h-12 rounded-xl border border-input bg-background px-3 text-base font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {COFFEE_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              ) : (
                <Select value={coffeeType} onValueChange={setCoffeeType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COFFEE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Bag Type */}
            <div className="space-y-2">
              <FieldLabel
                label="Bag Type"
                tooltip="Select dry parchment or dry cherry to match dispatch."
              />
              {isMobile ? (
                <select
                  value={bagType}
                  onChange={e => setBagType(e.target.value)}
                  className="w-full h-12 rounded-xl border border-input bg-background px-3 text-base font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {BAG_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              ) : (
                <Select value={bagType} onValueChange={setBagType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BAG_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* KGs Sold */}
            <div className="space-y-2">
              <FieldLabel
                label="KGs Sold"
                tooltip={`Enter kilograms sold. We'll convert to bags using ${bagWeightKg} kg per bag.`}
              />
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder="KGs sold"
                value={kgsSold}
                onKeyDown={blockInvalidNumberKey}
                onChange={handleNonNegativeChange(setKgsSold)}
                className={cn(isMobile && "h-12 text-base")}
              />
              {exceedsAvailability ? (
                <p className="text-xs text-rose-600">
                  Exceeds available stock by {formatNumber(excessKgs)} KGs.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Available now: {selectionAvailability.availableKgs.toFixed(2)} KGs ({selectionAvailability.availableBags.toFixed(2)} bags)
                </p>
              )}
              {editAllowance.matchesSelection && (
                <p className="text-xs text-muted-foreground">
                  Editing credit: {formatNumber(editAllowance.allowanceKgs)} KGs from this record.
                </p>
              )}
              {netSelectionOverdrawnKgs > 0 && (
                <p className="text-xs text-rose-600">
                  Historical mismatch: sold exceeds received by {formatNumber(netSelectionOverdrawnKgs)} KGs (
                  {formatNumber(netSelectionOverdrawnBags)} bags).
                </p>
              )}
            </div>

            {/* Bags Sold (Auto-calculated) */}
            <div className="space-y-2">
              <Label>Bags Sold (Auto)</Label>
              <div className="flex items-center h-10 px-3 border rounded-md bg-muted/50">
                <span className="font-medium">{bagsSoldValue.toFixed(2)}</span>
              </div>
              <p className="text-xs text-muted-foreground">Auto-calculated (KGs / {bagWeightKg})</p>
            </div>

            {/* Price per Bag */}
            <div className="space-y-2">
              <FieldLabel
                label="Price per bag (Rs)"
                tooltip="Selling price per bag; revenue auto-calculates."
              />
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder="Enter price per bag"
                value={pricePerBag}
                onKeyDown={blockInvalidNumberKey}
                onChange={handleNonNegativeChange(setPricePerBag)}
                className={cn(isMobile && "h-12 text-base")}
              />
            </div>

            {/* Revenue (Auto-calculated) */}
            <div className="space-y-2">
              <Label>Revenue (Calculated)</Label>
              <div className="flex items-center h-10 px-3 border rounded-md bg-muted/50">
                <TrendingUp className="h-4 w-4 mr-2 text-emerald-600" />
                <span className="font-medium text-emerald-700">₹{calculatedRevenue.toLocaleString()}</span>
              </div>
              <p className="text-xs text-muted-foreground">Bags Sold x Price/Bag</p>
            </div>

            {/* Bank Account */}
            <div className="space-y-2">
              <FieldLabel
                label="Bank Account"
                tooltip="Account reference used for settlement or audit trail."
              />
              <Input
                type="text"
                placeholder="Optional bank or settlement reference"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
              />
            </div>

            {/* Buyer */}
            <div className="space-y-2">
              <FieldLabel
                label="Buyer"
                tooltip="Buyer name for receipts, reconciliation, and aging."
              />
              <Input
                type="text"
                list="buyer-suggestions"
                placeholder="Buyer name"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
              />
              <datalist id="buyer-suggestions">
                {buyerSuggestions.map((buyer) => (
                  <option key={buyer} value={buyer} />
                ))}
              </datalist>
            </div>

            {/* Notes */}
            <div className="space-y-2 md:col-span-2 xl:col-span-2">
              <Label>Sale notes</Label>
              <Input
                type="text"
                placeholder="Transport note, payment note, sample note, or anything worth remembering..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {editingRecord && (
              <Button variant="outline" onClick={resetForm} className="w-full sm:w-auto">
                Cancel
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={!canSubmitSale}
              className={cn("w-full bg-emerald-700 hover:bg-emerald-800 sm:w-auto", isMobile && "h-14 rounded-2xl text-base")}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {editingRecord ? "Update sale" : "Save sale"}
                </>
              )}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Tip: press Ctrl/Cmd + S to save quickly.</p>
          {!canSubmitSale && !isSaving && (
            <p className="mt-2 text-xs text-muted-foreground">
              Save blocked: {saveBlockers[0]}
            </p>
          )}
          {saveFeedback && (
            <p
              className={cn(
                "mt-2 text-xs",
                saveFeedback.type === "success" ? "text-emerald-700" : "text-rose-600",
              )}
            >
              {saveFeedback.message}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Sales Records Table */}
      <Card className="order-5 border-border/70 bg-white/85">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Sales history
              </CardTitle>
              <CardDescription>Review and reopen previous coffee sales · {resolvedSalesCountLabel}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={salesFilterLocationId} onValueChange={(value) => {
                setSalesFilterLocationId(value)
                setSalesPage(0)
              }}>
                <SelectTrigger className="w-full bg-white/70 sm:w-[220px]">
                  <SelectValue placeholder="All locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={LOCATION_ALL}>All locations</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name || loc.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {showDataToolsControls && (
                <Button variant="outline" size="sm" onClick={exportToCSV} className="w-full bg-transparent sm:w-auto">
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {selectedSalesRecord && (
                <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-sm">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Selected sale</p>
                      <p className="font-medium text-foreground">
                        {formatDateOnly(selectedSalesRecord.sale_date)} · {selectedSalesRecord.buyer_name || "Buyer TBD"}
                        {selectedSalesRecord.batch_no ? ` · Batch ${selectedSalesRecord.batch_no}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-white"
                  onClick={() => handleEdit(selectedSalesRecord)}
                >
                  Open for Edit
                </Button>
              </div>
              <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                <p>Location: {getLocationLabel(selectedSalesRecord)}</p>
                <p>Coffee: {selectedSalesRecord.coffee_type || "-"}</p>
                <p>Type: {formatBagTypeLabel(selectedSalesRecord.bag_type)}</p>
                <p>Batch: {selectedSalesRecord.batch_no || "-"}</p>
              </div>
              <div className="mt-1 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                <p>Bags: {formatNumber(selectedSalesBags)}</p>
                <p>KGs: {formatNumber(selectedSalesKgs)}</p>
                <p>Price/KG: {formatCurrency(selectedSalesPricePerKg)}</p>
                <p className="font-medium text-emerald-700">Revenue: {formatCurrency(selectedSalesRevenue, 0)}</p>
              </div>
            </div>
          )}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : salesRecords.length === 0 ? (
            <WorkflowEmptyState
              title="No sales recorded yet"
              description="Start with the first confirmed sale: real buyer, actual sold quantity, and the agreed price."
              steps={[
                "Pick the real location, coffee type, and bag type that match the sale.",
                "Enter the confirmed sold KGs and agreed price, not an estimate you may change later.",
                "Save the sale once it is commercially agreed, then edit only if the deal actually changes.",
              ]}
              tip="Sales should follow confirmed dispatch-received stock. If the numbers do not line up yet, fix dispatch first instead of guessing here."
              askPrompt="How do I record my first coffee sale?"
              primaryAction={{ label: "Use form above", onClick: scrollToEntryForm }}
              secondaryAction={{ label: "Manuals", href: "/manuals" }}
            />
          ) : (
            <div className="space-y-4">
              <div className="space-y-3 md:hidden">
                {salesRecords.map((record) => {
                  const soldKgs = resolveSalesRecordKgs(record, bagWeightKg)
                  return (
                    <div
                      key={record.id}
                      className={cn(
                        "rounded-2xl border bg-white p-4 shadow-sm",
                        selectedSalesRecord?.id === record.id ? "border-emerald-200 bg-emerald-50/30" : "border-black/[0.06]",
                      )}
                      onClick={() => setSelectedSalesRecord(record)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-base font-bold text-stone-900">{formatDateOnly(record.sale_date)}</p>
                          <p className="text-xs text-stone-400 mt-0.5">{record.buyer_name || "Buyer TBD"}</p>
                        </div>
                        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">
                          {record.coffee_type || "-"}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-stone-50 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-stone-400">Bags / KGs</p>
                          <p className="text-base font-black text-stone-900 mt-0.5">
                            {formatNumber(Number(record.bags_sold) || 0)} / {formatNumber(soldKgs)}
                          </p>
                        </div>
                        <div className="rounded-xl bg-emerald-50 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-emerald-600">Revenue</p>
                          <p className="text-xl font-black text-emerald-700 mt-0.5">{formatCurrency(Number(record.revenue) || 0, 0)}</p>
                        </div>
                        <div className="rounded-xl bg-stone-50 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-stone-400">Bag Type</p>
                          <p className="text-sm font-semibold text-stone-800 mt-0.5">{formatBagTypeLabel(record.bag_type)}</p>
                        </div>
                        <div className="rounded-xl bg-stone-50 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-stone-400">Location</p>
                          <p className="text-sm font-semibold text-stone-800 mt-0.5">{getLocationLabel(record)}</p>
                        </div>
                      </div>
                      {record.notes ? (
                        <p className="mt-2 text-xs text-stone-400 italic">{record.notes}</p>
                      ) : null}
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelectedSalesRecord(record)
                            handleEdit(record)
                          }}
                          className="h-10 flex-1 rounded-xl border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        >
                          <Pencil className="mr-1.5 h-4 w-4" />
                          Edit
                        </Button>
                        {canDelete && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleDelete(record.id!)
                            }}
                            className="h-10 flex-1 rounded-xl border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                          >
                            <Trash2 className="mr-1.5 h-4 w-4" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky top-0 bg-muted/70 backdrop-blur">Date</TableHead>
                      <TableHead className="sticky top-0 bg-muted/70 backdrop-blur">Batch Reference</TableHead>
                      <TableHead className="sticky top-0 bg-muted/70 backdrop-blur">Location</TableHead>
                      <TableHead className="sticky top-0 bg-muted/70 backdrop-blur">Coffee Type</TableHead>
                      <TableHead className="sticky top-0 bg-muted/70 backdrop-blur">Bag Type</TableHead>
                      <TableHead className="sticky top-0 bg-muted/70 backdrop-blur">Buyer</TableHead>
                      <TableHead className="text-right sticky top-0 bg-muted/70 backdrop-blur">Bags Sold</TableHead>
                      <TableHead className="text-right sticky top-0 bg-muted/70 backdrop-blur">KGs Sold</TableHead>
                      <TableHead className="text-right sticky top-0 bg-muted/70 backdrop-blur">Price/Bag</TableHead>
                      <TableHead className="text-right sticky top-0 bg-muted/70 backdrop-blur">Revenue</TableHead>
                      <TableHead className="sticky top-0 bg-muted/70 backdrop-blur">Bank Account</TableHead>
                      <TableHead className="sticky top-0 bg-muted/70 backdrop-blur">Notes</TableHead>
                      <TableHead className="text-right sticky top-0 bg-muted/70 backdrop-blur">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesRecords.map((record) => (
                      <TableRow
                        key={record.id}
                        className={cn(
                          "cursor-pointer",
                          selectedSalesRecord?.id === record.id ? "bg-emerald-50/60" : "",
                        )}
                        onClick={() => setSelectedSalesRecord(record)}
                      >
                        <TableCell>{formatDateOnly(record.sale_date)}</TableCell>
                        <TableCell>{record.batch_no || "-"}</TableCell>
                        <TableCell>{getLocationLabel(record)}</TableCell>
                        <TableCell>{record.coffee_type || "-"}</TableCell>
                        <TableCell>{formatBagTypeLabel(record.bag_type)}</TableCell>
                        <TableCell>{record.buyer_name || "-"}</TableCell>
                        <TableCell className="text-right">{formatNumber(Number(record.bags_sold) || 0)}</TableCell>
                        <TableCell className="text-right">
                          {formatNumber(resolveSalesRecordKgs(record, bagWeightKg))}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(record.price_per_bag) || 0)}</TableCell>
                        <TableCell className="text-right font-medium text-emerald-700">
                          {formatCurrency(Number(record.revenue) || 0, 0)}
                        </TableCell>
                        <TableCell>{record.bank_account || "-"}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{record.notes || "-"}</TableCell>
                        <TableCell className="text-right">
                          <TooltipProvider>
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      setSelectedSalesRecord(record)
                                      handleEdit(record)
                                    }}
                                    className="text-blue-600 hover:text-blue-700"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit sale</TooltipContent>
                              </Tooltip>
                              {canDelete && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        handleDelete(record.id!)
                                      }}
                                      className="text-red-600 hover:text-red-700"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete sale</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TooltipProvider>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {salesHasMore && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchSalesRecords(salesPage + 1, true)}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? "Loading..." : "Load more"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
        </>
      ) : (
        <OtherSalesTab
          showOverviewCard={false}
          locationFilterId={salesFilterLocationId}
          onLocationFilterChange={setSalesFilterLocationId}
        />
      )}
    </WorkspacePageShell>
  )
}
