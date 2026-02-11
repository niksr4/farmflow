"use client"

import { useState, useEffect, useCallback, useMemo, type ChangeEvent, type KeyboardEvent } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FieldLabel } from "@/components/ui/field-label"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CalendarIcon, Loader2, Save, Trash2, Download, IndianRupee, TrendingUp, Pencil } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getCurrentFiscalYear, getAvailableFiscalYears, getFiscalYearDateRange, type FiscalYear } from "@/lib/fiscal-year-utils"
import { DEFAULT_COFFEE_VARIETIES } from "@/lib/crop-config"
import { useAuth } from "@/hooks/use-auth"
import { useTenantSettings } from "@/hooks/use-tenant-settings"
import { formatDateOnly } from "@/lib/date-utils"
import { formatCurrency, formatNumber } from "@/lib/format"
import { canAcceptNonNegative, isBlockedNumericKey } from "@/lib/number-input"

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
  kgs?: number | null
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
  revenue: number
}

interface LocationOption {
  id: string
  name: string
  code: string
}

type InventoryTotals = { bags: number; kgs: number }
type InventoryBreakdown = { cherry: InventoryTotals; parchment: InventoryTotals; total: InventoryTotals }

const COFFEE_TYPES = DEFAULT_COFFEE_VARIETIES
const BAG_TYPES = ["Dry Parchment", "Dry Cherry"]
const LOCATION_ALL = "all"
const normalizeBagType = (value: string | null | undefined) =>
  String(value || "").toLowerCase().includes("cherry") ? "cherry" : "parchment"
const formatBagTypeLabel = (value: string | null | undefined) =>
  normalizeBagType(value) === "cherry" ? "Dry Cherry" : "Dry Parchment"

export default function SalesTab() {
  const { user } = useAuth()
  const { settings } = useTenantSettings()
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<FiscalYear>(getCurrentFiscalYear())
  const availableFiscalYears = getAvailableFiscalYears()
  const bagWeightKg = Number(settings.bagWeightKg) || 50
  const canDelete = user?.role === "admin" || user?.role === "owner"
  
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [date, setDate] = useState<Date>(new Date())
  const [batchNo, setBatchNo] = useState<string>("")
  const [selectedLocationId, setSelectedLocationId] = useState<string>("")
  const [salesFilterLocationId, setSalesFilterLocationId] = useState<string>(LOCATION_ALL)
  const [lotId, setLotId] = useState<string>("")
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
  const [salesTotals, setSalesTotals] = useState({ totalBagsSold: 0, totalRevenue: 0 })
  const [salesPage, setSalesPage] = useState(0)
  const [salesHasMore, setSalesHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [editingRecord, setEditingRecord] = useState<SalesRecord | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()
  const salesPageSize = 25
  const blockInvalidNumberKey = (event: KeyboardEvent<HTMLInputElement>) => {
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
      const response = await fetch("/api/locations")
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
      const response = await fetch("/api/sales?buyers=true")
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
      totals.totalKgsSold += bagsSoldCount * bagWeightKg
      totals.totalRevenue += Number(record.revenue) || 0
    })

    return totals
  }, [bagWeightKg, salesRecords])

  // Fetch sales records
  const fetchSalesRecords = useCallback(async (pageIndex = 0, append = false) => {
    if (append) {
      setIsLoadingMore(true)
    } else {
      setIsLoading(true)
    }
    try {
      const { startDate, endDate } = getFiscalYearDateRange(selectedFiscalYear)
      const params = new URLSearchParams({
        startDate,
        endDate,
        limit: salesPageSize.toString(),
        offset: String(pageIndex * salesPageSize),
      })
      if (salesFilterLocationId && salesFilterLocationId !== LOCATION_ALL) {
        params.set("locationId", salesFilterLocationId)
      }
      const response = await fetch(`/api/sales?${params.toString()}`)
      const data = await response.json()
      
      if (data.success) {
        const nextRecords = Array.isArray(data.records) ? data.records : []
        const nextTotalCount = Number(data.totalCount) || 0
        setSalesRecords((prev) => (append ? [...prev, ...nextRecords] : nextRecords))
        setSalesTotals({
          totalBagsSold: Number(data.totalBagsSold) || 0,
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
  }, [salesFilterLocationId, salesPageSize, selectedFiscalYear])

  const fetchDispatchSummary = useCallback(async () => {
    try {
      const { startDate, endDate } = getFiscalYearDateRange(selectedFiscalYear)
      const params = new URLSearchParams({
        startDate,
        endDate,
        summaryOnly: "true",
      })
      if (selectedLocationId) {
        params.set("locationId", selectedLocationId)
      }
      const response = await fetch(`/api/dispatch?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setDispatchSummary(Array.isArray(data.totalsByType) ? data.totalsByType : [])
      }
    } catch (error) {
      console.error("Error fetching dispatch records:", error)
    }
  }, [selectedFiscalYear, selectedLocationId])

  const fetchSalesSummary = useCallback(async () => {
    if (!selectedLocationId) {
      setSalesSummary([])
      return
    }
    try {
      const { startDate, endDate } = getFiscalYearDateRange(selectedFiscalYear)
      const params = new URLSearchParams({
        startDate,
        endDate,
        summaryOnly: "true",
      })
      params.set("locationId", selectedLocationId)
      const response = await fetch(`/api/sales?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setSalesSummary(Array.isArray(data.totalsByType) ? data.totalsByType : [])
      }
    } catch (error) {
      console.error("Error fetching sales summary:", error)
    }
  }, [selectedFiscalYear, selectedLocationId])

  const fetchOverviewDispatchSummary = useCallback(async () => {
    try {
      const { startDate, endDate } = getFiscalYearDateRange(selectedFiscalYear)
      const params = new URLSearchParams({
        startDate,
        endDate,
        summaryOnly: "true",
      })
      if (salesFilterLocationId && salesFilterLocationId !== LOCATION_ALL) {
        params.set("locationId", salesFilterLocationId)
      }
      const response = await fetch(`/api/dispatch?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setOverviewDispatchSummary(Array.isArray(data.totalsByType) ? data.totalsByType : [])
      }
    } catch (error) {
      console.error("Error fetching dispatch summary:", error)
    }
  }, [salesFilterLocationId, selectedFiscalYear])

  const fetchOverviewSalesSummary = useCallback(async () => {
    try {
      const { startDate, endDate } = getFiscalYearDateRange(selectedFiscalYear)
      const params = new URLSearchParams({
        startDate,
        endDate,
        summaryOnly: "true",
      })
      if (salesFilterLocationId && salesFilterLocationId !== LOCATION_ALL) {
        params.set("locationId", salesFilterLocationId)
      }
      const response = await fetch(`/api/sales?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setOverviewSalesSummary(Array.isArray(data.totalsByType) ? data.totalsByType : [])
      }
    } catch (error) {
      console.error("Error fetching sales overview:", error)
    }
  }, [salesFilterLocationId, selectedFiscalYear])

  useEffect(() => {
    loadLocations()
    loadBuyerSuggestions()
  }, [loadBuyerSuggestions, loadLocations])

  useEffect(() => {
    fetchSalesRecords(0, false)
  }, [fetchSalesRecords])

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
        const type = record.coffee_type || "Unknown"
        if (!receivedTotals[type]) {
          receivedTotals[type] = createBreakdown()
        }
        const kgsReceived = Number(record.kgs_received) || 0
        const bagsReceived = kgsReceived / bagWeightKg
        const bagType = normalizeBagType(record.bag_type)
        receivedTotals[type][bagType].bags += bagsReceived
        receivedTotals[type][bagType].kgs += kgsReceived
        receivedTotals[type].total.bags += bagsReceived
        receivedTotals[type].total.kgs += kgsReceived
      })

      salesRows.forEach((record) => {
        const type = record.coffee_type || "Unknown"
        if (!soldTotals[type]) {
          soldTotals[type] = createBreakdown()
        }
        const bagsSoldCount = Number(record.bags_sold) || 0
        const kgsSoldCount = bagsSoldCount * bagWeightKg
        const bagType = normalizeBagType(record.bag_type)
        soldTotals[type][bagType].bags += bagsSoldCount
        soldTotals[type][bagType].kgs += kgsSoldCount
        soldTotals[type].total.bags += bagsSoldCount
        soldTotals[type].total.kgs += kgsSoldCount
      })

      const availableTotals = Object.keys(receivedTotals).reduce((acc, type) => {
        acc[type] = createBreakdown()
        acc[type].cherry.bags = Math.max(0, receivedTotals[type].cherry.bags - (soldTotals[type]?.cherry.bags || 0))
        acc[type].cherry.kgs = Math.max(0, receivedTotals[type].cherry.kgs - (soldTotals[type]?.cherry.kgs || 0))
        acc[type].parchment.bags = Math.max(0, receivedTotals[type].parchment.bags - (soldTotals[type]?.parchment.bags || 0))
        acc[type].parchment.kgs = Math.max(0, receivedTotals[type].parchment.kgs - (soldTotals[type]?.parchment.kgs || 0))
        acc[type].total.bags = Math.max(0, receivedTotals[type].total.bags - (soldTotals[type]?.total.bags || 0))
        acc[type].total.kgs = Math.max(0, receivedTotals[type].total.kgs - (soldTotals[type]?.total.kgs || 0))
        return acc
      }, {} as Record<string, InventoryBreakdown>)

      const totalReceived = COFFEE_TYPES.reduce((sum, type) => sum + (receivedTotals[type]?.total.kgs || 0), 0)
      const totalReceivedBags = COFFEE_TYPES.reduce((sum, type) => sum + (receivedTotals[type]?.total.bags || 0), 0)
      const totalSold = COFFEE_TYPES.reduce((sum, type) => sum + (soldTotals[type]?.total.kgs || 0), 0)
      const totalSoldBags = COFFEE_TYPES.reduce((sum, type) => sum + (soldTotals[type]?.total.bags || 0), 0)
      const totalAvailable = Math.max(0, totalReceived - totalSold)
      const totalAvailableBags = Math.max(0, totalReceivedBags - totalSoldBags)

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
      }
    },
    [bagWeightKg],
  )

  const overviewAvailabilityTotals = useMemo(
    () => buildAvailability(overviewDispatchSummary, overviewSalesSummary),
    [buildAvailability, overviewDispatchSummary, overviewSalesSummary],
  )

  const getAvailableForSelection = () => {
    const normalizedCoffee = coffeeType.toLowerCase()
    const normalizedBag = normalizeBagType(bagType)
    let receivedKgs = 0
    let soldKgs = 0

    dispatchSummary.forEach((row) => {
      const recordCoffee = String(row.coffee_type || "").toLowerCase()
      if (recordCoffee !== normalizedCoffee) return
      if (normalizeBagType(row.bag_type) !== normalizedBag) return
      const received = Number(row.kgs_received) || 0
      const dispatchedBags = Number(row.bags_dispatched) || 0
      receivedKgs += received > 0 ? received : dispatchedBags * bagWeightKg
    })

    salesSummary.forEach((row) => {
      const recordCoffee = String(row.coffee_type || "").toLowerCase()
      if (recordCoffee !== normalizedCoffee) return
      if (normalizeBagType(row.bag_type) !== normalizedBag) return
      const bagsSoldCount = Number(row.bags_sold) || 0
      soldKgs += bagsSoldCount * bagWeightKg
    })

    const availableKgs = Math.max(0, receivedKgs - soldKgs)
    const availableBags = availableKgs / bagWeightKg
    return { availableKgs, availableBags }
  }

  const handleSave = async () => {
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
    if (kgsValue > availableKgs) {
      toast({
        title: "Insufficient Inventory",
        description: `Only ${availableKgs.toFixed(2)} KGs of ${coffeeType} ${bagType} available based on received inventory.`,
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      const locationLabel = selectedLocation?.name || selectedLocation?.code || ""
      const method = editingRecord ? "PUT" : "POST"
      const response = await fetch("/api/sales", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingRecord?.id,
          sale_date: format(date, "yyyy-MM-dd"),
          batch_no: batchNo || null,
          lot_id: lotId || null,
          locationId: selectedLocationId,
          estate: locationLabel || null,
          coffee_type: coffeeType,
          bag_type: bagType,
          buyer_name: buyerName || null,
          bags_sold: bagsSoldValue,
          price_per_bag: priceValue,
          bank_account: bankAccount || null,
          notes: notes || null,
        }),
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Success",
          description: editingRecord ? "Sales record updated successfully" : "Sales record saved successfully",
        })
        if (buyerName.trim()) {
          setBuyerSuggestions((prev) => Array.from(new Set([buyerName.trim(), ...prev])))
        }
        // Reset form
        resetForm()
        // Refresh records
        fetchSalesRecords(0, false)
        fetchDispatchSummary()
        fetchSalesSummary()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to save sales record",
          variant: "destructive",
        })
      }
    } catch (error) {
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
    setLotId("")
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
    setLotId(record.lot_id || "")
    const resolvedLocationId =
      record.location_id || resolveLocationIdFromLabel(record.location_name || record.location_code || record.estate)
    if (resolvedLocationId) {
      setSelectedLocationId(resolvedLocationId)
    }
    setCoffeeType(record.coffee_type || "Arabica")
    setBagType(formatBagTypeLabel(record.bag_type))
    const kgsFromRecord = Number(record.kgs) || 0
    const kgsValue = kgsFromRecord > 0 ? kgsFromRecord : Number(record.bags_sold) * bagWeightKg
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
        fetchSalesRecords(0, false)
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to delete record",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete record",
        variant: "destructive",
      })
    }
  }

  const exportToCSV = () => {
    const runExport = async () => {
      const { startDate, endDate } = getFiscalYearDateRange(selectedFiscalYear)
      const params = new URLSearchParams({
        startDate,
        endDate,
        all: "true",
      })
      if (salesFilterLocationId && salesFilterLocationId !== LOCATION_ALL) {
        params.set("locationId", salesFilterLocationId)
      }
      const response = await fetch(`/api/sales?${params.toString()}`, {
              })
      const data = await response.json()

      if (!data.success || !Array.isArray(data.records)) {
        throw new Error(data.error || "Failed to load sales records for export")
      }

      const headers = [
        "Date",
        "B&L Batch No",
        "Lot ID",
        "Location",
        "Coffee Type",
        "Bags Sold",
        "Bag Type",
        "KGs Sold",
        "Buyer",
        "Price/Bag",
        "Revenue",
        "Bank Account",
        "Notes",
      ]
      const rows = data.records.map((record: SalesRecord) => [
        format(new Date(record.sale_date), "yyyy-MM-dd"),
        record.batch_no || "",
        record.lot_id || "",
        getLocationLabel(record),
        record.coffee_type || "",
        record.bags_sold.toString(),
        formatBagTypeLabel(record.bag_type),
        ((Number(record.kgs) || 0) > 0 ? Number(record.kgs) : Number(record.bags_sold) * bagWeightKg).toFixed(2),
        record.buyer_name || "",
        record.price_per_bag.toString(),
        record.revenue.toString(),
        record.bank_account || "",
        record.notes || "",
      ])

      const csvContent = [headers.join(","), ...rows.map((row: string[]) => row.map((cell) => `"${cell}"`).join(","))].join(
        "\n",
      )

      const blob = new Blob([csvContent], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `sales_records_${selectedFiscalYear.label.replace("/", "-")}.csv`
      a.click()
      URL.revokeObjectURL(url)
    }

    runExport().catch((error) => {
      console.error("Error exporting sales records:", error)
      toast({
        title: "Error",
        description: "Failed to export sales records",
        variant: "destructive",
      })
    })
  }

  const fallbackTotals = calculateTotals()
  const totalBagsSold = salesTotals.totalBagsSold || fallbackTotals.totalBagsSold
  const totalRevenue = salesTotals.totalRevenue || fallbackTotals.totalRevenue
  const totals = {
    totalBagsSold,
    totalKgsSold: totalBagsSold * bagWeightKg,
    totalRevenue,
  }
  const avgPricePerBag = totals.totalBagsSold > 0 ? totals.totalRevenue / totals.totalBagsSold : 0
  const resolvedSalesCount = salesTotalCount || salesRecords.length
  const resolvedSalesCountLabel =
    salesTotalCount > salesRecords.length
      ? `Showing ${salesRecords.length} of ${salesTotalCount}`
      : `${salesRecords.length} record(s)`
  const selectionAvailability = getAvailableForSelection()

  return (
    <div className="space-y-6">
      {/* Fiscal Year Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Coffee Sales</h2>
        <div className="flex items-center gap-2">
          <Label htmlFor="fiscal-year" className="text-sm text-muted-foreground">
            Fiscal Year:
          </Label>
          <Select
            value={selectedFiscalYear.label}
            onValueChange={(value) => {
              const fy = availableFiscalYears.find((y) => y.label === value)
              if (fy) setSelectedFiscalYear(fy)
            }}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableFiscalYears.map((fy) => (
                <SelectItem key={fy.label} value={fy.label}>
                  FY {fy.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="border-2 border-muted">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Inventory Available for Sale</CardTitle>
          <CardDescription>Received coffee available to sell (in KGs)</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {COFFEE_TYPES.map((type) => {
            const totals = overviewAvailabilityTotals.availableTotals[type]
            return (
              <div key={type} className="space-y-3">
                <div className="text-sm font-semibold">{type}</div>
                <div className="rounded-md border p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Cherry</div>
                  <div className="text-lg font-semibold">{formatNumber(totals.cherry.kgs)} KGs</div>
                  <div className="text-xs text-muted-foreground">{formatNumber(totals.cherry.bags)} Bags</div>
                </div>
                <div className="rounded-md border p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Parchment</div>
                  <div className="text-lg font-semibold">{formatNumber(totals.parchment.kgs)} KGs</div>
                  <div className="text-xs text-muted-foreground">{formatNumber(totals.parchment.bags)} Bags</div>
                </div>
                <div className="rounded-md border p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Total {type}</div>
                  <div className="text-lg font-semibold">{formatNumber(totals.total.kgs)} KGs</div>
                  <div className="text-xs text-muted-foreground">{formatNumber(totals.total.bags)} Bags</div>
                </div>
              </div>
            )
          })}
            <div className="space-y-3">
            <div className="text-sm font-semibold">Summary</div>
            <div className="rounded-md border p-3 space-y-1">
              <div className="text-xs text-muted-foreground">Total Received</div>
              <div className="text-lg font-semibold">{formatNumber(overviewAvailabilityTotals.totalReceived)} KGs</div>
              <div className="text-xs text-muted-foreground">{formatNumber(overviewAvailabilityTotals.totalReceivedBags)} Bags</div>
            </div>
            <div className="rounded-md border p-3 space-y-1">
              <div className="text-xs text-muted-foreground">Total Sold</div>
              <div className="text-lg font-semibold">{formatNumber(overviewAvailabilityTotals.totalSold)} KGs</div>
              <div className="text-xs text-muted-foreground">{formatNumber(overviewAvailabilityTotals.totalSoldBags)} Bags</div>
            </div>
            <div className="rounded-md border p-3 space-y-1">
              <div className="text-xs text-muted-foreground">Total Available</div>
              <div className="text-lg font-semibold">{formatNumber(overviewAvailabilityTotals.totalAvailable)} KGs</div>
              <div className="text-xs text-muted-foreground">{formatNumber(overviewAvailabilityTotals.totalAvailableBags)} Bags</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <Card className="border-2 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totals.totalRevenue, 0)}</div>
            <div className="text-sm text-muted-foreground mt-1">
              {resolvedSalesCount} sales recorded
            </div>
            <div className="text-sm font-medium mt-1 text-blue-600">
              Avg Price/Bag: {formatCurrency(avgPricePerBag)}
            </div>
          </CardContent>
        </Card>

        {/* Total Bags Sold */}
        <Card className="border-2 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Bags Sold</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totals.totalBagsSold)}</div>
            <div className="text-sm text-muted-foreground mt-1">
              KGs Sold: {formatNumber(totals.totalKgsSold)}
            </div>
          </CardContent>
        </Card>

        {/* Total KGs Sold */}
        <Card className="border-2 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total KGs Sold</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totals.totalKgsSold)}</div>
            <div className="text-sm text-muted-foreground mt-1">
              Bags Sold: {formatNumber(totals.totalBagsSold)}
            </div>
          </CardContent>
        </Card>

        {/* Avg Price per Bag */}
        <Card className="border-2 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Price per Bag</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(avgPricePerBag)}</div>
            <div className="text-sm text-muted-foreground mt-1">
              Revenue / Bags Sold
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Sale Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IndianRupee className="h-5 w-5" />
            {editingRecord ? "Edit Sale" : "Record Sale"}
          </CardTitle>
          <CardDescription>
            {editingRecord
              ? "Update the sales record"
              : "Record sales for the selected location (availability follows dispatch receipts)."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Date */}
            <div className="space-y-2">
              <Label>Date</Label>
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
            </div>

            {/* B&L Batch No */}
            <div className="space-y-2">
              <FieldLabel
                label="B&L Batch No"
                tooltip="Internal batch or ledger reference (optional but helps reconciliation)."
              />
              <Input
                type="text"
                placeholder="e.g., hfa, hfb, hfc, mv"
                value={batchNo}
                onChange={(e) => setBatchNo(e.target.value)}
              />
            </div>

            {/* Lot ID */}
            <div className="space-y-2">
              <FieldLabel
                label="Lot ID"
                tooltip="Match the lot/batch ID from processing and dispatch records."
              />
              <Input
                type="text"
                placeholder="e.g., LOT-2026-001"
                value={lotId}
                onChange={(e) => setLotId(e.target.value)}
              />
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label>Location</Label>
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
              <p className="text-xs text-muted-foreground">Totals and availability follow this location.</p>
            </div>

            {/* Coffee Type */}
            <div className="space-y-2">
              <Label>Coffee Type</Label>
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
            </div>

            {/* Bag Type */}
            <div className="space-y-2">
              <FieldLabel
                label="Bag Type"
                tooltip="Select dry parchment or dry cherry to match dispatch."
              />
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
              />
              <p className="text-xs text-muted-foreground">
                Available: {selectionAvailability.availableKgs.toFixed(2)} KGs ({selectionAvailability.availableBags.toFixed(2)} bags)
              </p>
            </div>

            {/* Bags Sold (Auto-calculated) */}
            <div className="space-y-2">
              <Label>Bags Sold (Auto)</Label>
              <div className="flex items-center h-10 px-3 border rounded-md bg-muted">
                <span className="font-medium">{bagsSoldValue.toFixed(2)}</span>
              </div>
              <p className="text-xs text-muted-foreground">Auto-calculated (KGs / {bagWeightKg})</p>
            </div>

            {/* Price per Bag */}
            <div className="space-y-2">
              <FieldLabel
                label="Price per Bag (Rs)"
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
              />
            </div>

            {/* Revenue (Auto-calculated) */}
            <div className="space-y-2">
              <Label>Revenue (Calculated)</Label>
              <div className="flex items-center h-10 px-3 border rounded-md bg-muted">
                <TrendingUp className="h-4 w-4 mr-2 text-green-600" />
                <span className="font-medium text-green-600">₹{calculatedRevenue.toLocaleString()}</span>
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
                placeholder="e.g., H3xl3"
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
                placeholder="e.g., LD, Ned"
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
            <div className="space-y-2">
              <Label>Notes (Optional)</Label>
              <Input
                type="text"
                placeholder="Any notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            {editingRecord && (
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            )}
            <Button onClick={handleSave} disabled={isSaving} className="bg-green-700 hover:bg-green-800">
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {editingRecord ? "Update Sale" : "Save Sale"}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sales Records Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Sales Records
              </CardTitle>
              <CardDescription>History of all coffee sales · {resolvedSalesCountLabel}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={salesFilterLocationId} onValueChange={(value) => {
                setSalesFilterLocationId(value)
                setSalesPage(0)
              }}>
                <SelectTrigger className="w-[180px] bg-transparent">
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
              <Button variant="outline" size="sm" onClick={exportToCSV} className="bg-transparent">
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : salesRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No sales records found</div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="sticky top-0 bg-muted/60">Date</TableHead>
                      <TableHead className="sticky top-0 bg-muted/60">B&L Batch No</TableHead>
                      <TableHead className="sticky top-0 bg-muted/60">Lot ID</TableHead>
                      <TableHead className="sticky top-0 bg-muted/60">Location</TableHead>
                      <TableHead className="sticky top-0 bg-muted/60">Coffee Type</TableHead>
                      <TableHead className="sticky top-0 bg-muted/60">Bag Type</TableHead>
                      <TableHead className="sticky top-0 bg-muted/60">Buyer</TableHead>
                      <TableHead className="text-right sticky top-0 bg-muted/60">Bags Sold</TableHead>
                      <TableHead className="text-right sticky top-0 bg-muted/60">KGs Sold</TableHead>
                      <TableHead className="text-right sticky top-0 bg-muted/60">Price/Bag</TableHead>
                      <TableHead className="text-right sticky top-0 bg-muted/60">Revenue</TableHead>
                      <TableHead className="sticky top-0 bg-muted/60">Bank Account</TableHead>
                      <TableHead className="sticky top-0 bg-muted/60">Notes</TableHead>
                      <TableHead className="text-right sticky top-0 bg-muted/60">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesRecords.map((record, index) => (
                      <TableRow key={record.id} className={index % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                        <TableCell>{formatDateOnly(record.sale_date)}</TableCell>
                        <TableCell>{record.batch_no || "-"}</TableCell>
                        <TableCell>{record.lot_id || "-"}</TableCell>
                        <TableCell>{getLocationLabel(record)}</TableCell>
                        <TableCell>{record.coffee_type || "-"}</TableCell>
                        <TableCell>{formatBagTypeLabel(record.bag_type)}</TableCell>
                        <TableCell>{record.buyer_name || "-"}</TableCell>
                        <TableCell className="text-right">{formatNumber(Number(record.bags_sold) || 0)}</TableCell>
                        <TableCell className="text-right">
                          {formatNumber(
                            (Number(record.kgs) || 0) > 0 ? Number(record.kgs) : Number(record.bags_sold) * bagWeightKg,
                          )}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(record.price_per_bag) || 0)}</TableCell>
                        <TableCell className="text-right font-medium text-green-600">
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
                                    onClick={() => handleEdit(record)}
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
                                      onClick={() => handleDelete(record.id!)}
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
    </div>
  )
}
