"use client"

import { useState, useEffect, useCallback, useMemo, useRef, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from "react"
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
import { CalendarIcon, Loader2, Save, Trash2, Download, Package, Truck, Pencil } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getCurrentFiscalYear, getAvailableFiscalYears, getFiscalYearDateRange, type FiscalYear } from "@/lib/fiscal-year-utils"
import { DEFAULT_COFFEE_VARIETIES } from "@/lib/crop-config"
import { useAuth } from "@/hooks/use-auth"
import { useTenantSettings } from "@/hooks/use-tenant-settings"
import { formatDateOnly } from "@/lib/date-utils"
import { formatNumber } from "@/lib/format"
import { canAcceptNonNegative, isBlockedNumericKey } from "@/lib/number-input"
import posthog from "posthog-js"

interface DispatchRecord {
  id?: number
  dispatch_date: string
  location_id?: string | null
  location_name?: string | null
  location_code?: string | null
  estate?: string | null
  lot_id?: string | null
  coffee_type: string
  bag_type: string
  bags_dispatched: number
  kgs_received?: number | null
  price_per_bag?: number
  buyer_name?: string
  notes: string | null
  created_by: string
}

interface DispatchSummaryRow {
  coffee_type: string
  bag_type: string
  bags_dispatched: number
  kgs_received: number
}

interface LocationOption {
  id: string
  name: string
  code: string
}

interface BagTotals {
  arabica_dry_parchment_bags: number
  arabica_dry_cherry_bags: number
  robusta_dry_parchment_bags: number
  robusta_dry_cherry_bags: number
}

type LocationScope = "all" | "location" | "legacy_pool"

const COFFEE_TYPES = DEFAULT_COFFEE_VARIETIES
const BAG_TYPES = ["Dry Parchment", "Dry Cherry"]
const STOCK_EPSILON = 0.0001
const emptyBagTotals: BagTotals = {
  arabica_dry_parchment_bags: 0,
  arabica_dry_cherry_bags: 0,
  robusta_dry_parchment_bags: 0,
  robusta_dry_cherry_bags: 0,
}
const normalizeBagTypeKey = (value: string) => {
  const normalized = value.toLowerCase().trim()
  if (normalized.includes("cherry")) return "dry_cherry"
  return "dry_parchment"
}
const formatBagTypeLabel = (value: string) => (normalizeBagTypeKey(value) === "dry_cherry" ? "Dry Cherry" : "Dry Parchment")
const resolveDispatchRecordReceivedKgs = (record: Pick<DispatchRecord, "kgs_received" | "bags_dispatched">, bagWeightKg: number) => {
  const kgsReceivedValue = Number(record.kgs_received) || 0
  if (kgsReceivedValue > 0) return kgsReceivedValue
  const bagsValue = Number(record.bags_dispatched) || 0
  return bagsValue * bagWeightKg
}

type DispatchTabProps = {
  showDataToolsControls?: boolean
}

export default function DispatchTab({ showDataToolsControls = false }: DispatchTabProps) {
  const { user } = useAuth()
  const { settings } = useTenantSettings()
  const bagWeightKg = Number(settings.bagWeightKg) || 50
  const canDelete = user?.role === "admin" || user?.role === "owner"
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<FiscalYear>(getCurrentFiscalYear())
  const availableFiscalYears = getAvailableFiscalYears()
  
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [date, setDate] = useState<Date>(new Date())
  const [selectedLocationId, setSelectedLocationId] = useState<string>("")
  const [lotId, setLotId] = useState<string>("")
  const [coffeeType, setCoffeeType] = useState<string>("Arabica")
  const [bagType, setBagType] = useState<string>("Dry Parchment")
  const [bagsDispatched, setBagsDispatched] = useState<string>("")
  const [kgsReceived, setKgsReceived] = useState<string>("")
  const [notes, setNotes] = useState<string>("")
  
  const [bagTotals, setBagTotals] = useState<BagTotals>(emptyBagTotals)
  const [formBagTotals, setFormBagTotals] = useState<BagTotals>(emptyBagTotals)
  const [dispatchRecords, setDispatchRecords] = useState<DispatchRecord[]>([])
  const [dispatchSummary, setDispatchSummary] = useState<DispatchSummaryRow[]>([])
  const [formDispatchSummary, setFormDispatchSummary] = useState<DispatchSummaryRow[]>([])
  const [bagTotalsScope, setBagTotalsScope] = useState<LocationScope>("all")
  const [formBagTotalsScope, setFormBagTotalsScope] = useState<LocationScope>("location")
  const [formDispatchScope, setFormDispatchScope] = useState<LocationScope>("location")
  const [dispatchTotalCount, setDispatchTotalCount] = useState(0)
  const [dispatchPage, setDispatchPage] = useState(0)
  const [dispatchHasMore, setDispatchHasMore] = useState(false)
  const [selectedDispatchRecord, setSelectedDispatchRecord] = useState<DispatchRecord | null>(null)
  const [editingRecord, setEditingRecord] = useState<DispatchRecord | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const dispatchSaveStateRef = useRef({ canSubmitDispatch: false, isSaving: false })
  const dispatchSaveHandlerRef = useRef<(() => Promise<void> | void) | null>(null)
  const { toast } = useToast()
  const dispatchPageSize = 25
  const asOfDate = useMemo(() => format(date, "yyyy-MM-dd"), [date])
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
    (record: DispatchRecord) => {
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

  const dispatchedTotals = useMemo(() => {
    const totals = {
      arabica_dry_parchment: 0,
      arabica_dry_cherry: 0,
      robusta_dry_parchment: 0,
      robusta_dry_cherry: 0,
    }

    if (dispatchSummary.length > 0) {
      dispatchSummary.forEach((row) => {
        const coffeeKey = String(row.coffee_type || "").toLowerCase()
        const bagKey = normalizeBagTypeKey(String(row.bag_type || ""))
        const key = `${coffeeKey}_${bagKey}` as keyof typeof totals
        if (totals[key] !== undefined) {
          totals[key] += Number(row.bags_dispatched) || 0
        }
      })
      return totals
    }

    dispatchRecords.forEach((record) => {
      const bagKey = normalizeBagTypeKey(record.bag_type)
      const key = `${record.coffee_type.toLowerCase()}_${bagKey}` as keyof typeof totals
      if (totals[key] !== undefined) {
        totals[key] += Number(record.bags_dispatched)
      }
    })

    return totals
  }, [dispatchRecords, dispatchSummary])

  const dispatchReceivedKgsTotals = useMemo(() => {
    const totals = {
      arabica_dry_parchment: 0,
      arabica_dry_cherry: 0,
      robusta_dry_parchment: 0,
      robusta_dry_cherry: 0,
    }

    if (dispatchSummary.length > 0) {
      dispatchSummary.forEach((row) => {
        const coffeeKey = String(row.coffee_type || "").toLowerCase()
        const bagKey = normalizeBagTypeKey(String(row.bag_type || ""))
        const key = `${coffeeKey}_${bagKey}` as keyof typeof totals
        if (totals[key] !== undefined) {
          totals[key] += Number(row.kgs_received) || 0
        }
      })
      return totals
    }

    dispatchRecords.forEach((record) => {
      const bagKey = normalizeBagTypeKey(record.bag_type)
      const key = `${record.coffee_type.toLowerCase()}_${bagKey}` as keyof typeof totals
      if (totals[key] !== undefined) {
        totals[key] += resolveDispatchRecordReceivedKgs(record, bagWeightKg)
      }
    })

    return totals
  }, [bagWeightKg, dispatchRecords, dispatchSummary])

  const formDispatchedTotals = useMemo(() => {
    const totals = {
      arabica_dry_parchment: 0,
      arabica_dry_cherry: 0,
      robusta_dry_parchment: 0,
      robusta_dry_cherry: 0,
    }

    if (formDispatchSummary.length > 0) {
      formDispatchSummary.forEach((row) => {
        const coffeeKey = String(row.coffee_type || "").toLowerCase()
        const bagKey = normalizeBagTypeKey(String(row.bag_type || ""))
        const key = `${coffeeKey}_${bagKey}` as keyof typeof totals
        if (totals[key] !== undefined) {
          totals[key] += Number(row.bags_dispatched) || 0
        }
      })
      return totals
    }

    if (!selectedLocationId) {
      return totals
    }

    dispatchRecords.forEach((record) => {
      const recordLocationId =
        record.location_id ||
        resolveLocationIdFromLabel(record.location_name || record.location_code || record.estate)
      if (recordLocationId !== selectedLocationId) return
      const bagKey = normalizeBagTypeKey(record.bag_type)
      const key = `${record.coffee_type.toLowerCase()}_${bagKey}` as keyof typeof totals
      if (totals[key] !== undefined) {
        totals[key] += Number(record.bags_dispatched)
      }
    })

    return totals
  }, [dispatchRecords, formDispatchSummary, resolveLocationIdFromLabel, selectedLocationId])

  // Fetch bag totals from processing data across all locations
  const fetchBagTotals = useCallback(
    async (
      locationId: string | null,
      setter: (totals: BagTotals) => void,
      scopeSetter?: (scope: LocationScope) => void,
      options?: { asOfDate?: string },
    ) => {
      const resolvedLocation = locationId ? locationId.trim() : ""
      const fallbackScope: LocationScope = resolvedLocation ? "location" : "all"
      try {
        const params = new URLSearchParams({
          summary: "bagTotals",
        })
        if (options?.asOfDate) {
          params.set("fiscalYearEnd", options.asOfDate)
        } else {
          const { startDate, endDate } = getFiscalYearDateRange(selectedFiscalYear)
          params.set("fiscalYearStart", startDate)
          params.set("fiscalYearEnd", endDate)
        }
        if (resolvedLocation) {
          params.set("locationId", resolvedLocation)
        }
        const response = await fetch(`/api/processing-records?${params.toString()}`)
        const data = await response.json()

        if (!data.success || !Array.isArray(data.totals)) {
          setter(emptyBagTotals)
          scopeSetter?.(fallbackScope)
          return
        }

        let arabicaDryParchment = 0
        let arabicaDryCherry = 0
        let robustaDryParchment = 0
        let robustaDryCherry = 0

        for (const record of data.totals) {
          const type = String(record.coffee_type || "").toLowerCase()
          if (type === "arabica") {
            arabicaDryParchment += Number(record.dry_p_bags) || 0
            arabicaDryCherry += Number(record.dry_cherry_bags) || 0
          } else if (type === "robusta") {
            robustaDryParchment += Number(record.dry_p_bags) || 0
            robustaDryCherry += Number(record.dry_cherry_bags) || 0
          }
        }

        setter({
          arabica_dry_parchment_bags: Number(arabicaDryParchment.toFixed(2)),
          arabica_dry_cherry_bags: Number(arabicaDryCherry.toFixed(2)),
          robusta_dry_parchment_bags: Number(robustaDryParchment.toFixed(2)),
          robusta_dry_cherry_bags: Number(robustaDryCherry.toFixed(2)),
        })
        scopeSetter?.(data.locationScope === "legacy_pool" ? "legacy_pool" : fallbackScope)
      } catch (error) {
        console.error("Error fetching bag totals:", error)
        setter(emptyBagTotals)
        scopeSetter?.(fallbackScope)
      }
    },
    [selectedFiscalYear],
  )

  const fetchDispatchSummary = useCallback(
    async (
      locationId: string | null,
      setter: (rows: DispatchSummaryRow[]) => void,
      scopeSetter?: (scope: LocationScope) => void,
      options?: { asOfDate?: string },
    ) => {
      const resolvedLocation = locationId ? locationId.trim() : ""
      const fallbackScope: LocationScope = resolvedLocation ? "location" : "all"
      try {
        const params = new URLSearchParams({
          summaryOnly: "true",
        })
        if (options?.asOfDate) {
          params.set("endDate", options.asOfDate)
        } else {
          const { startDate, endDate } = getFiscalYearDateRange(selectedFiscalYear)
          params.set("startDate", startDate)
          params.set("endDate", endDate)
        }
        if (resolvedLocation) {
          params.set("locationId", resolvedLocation)
        }
        const response = await fetch(`/api/dispatch?${params.toString()}`)
        const data = await response.json()
        if (data.success) {
          setter(Array.isArray(data.totalsByType) ? data.totalsByType : [])
          scopeSetter?.(data.locationScope === "legacy_pool" ? "legacy_pool" : fallbackScope)
        } else {
          setter([])
          scopeSetter?.(fallbackScope)
        }
      } catch (error) {
        console.error("Error fetching dispatch summary:", error)
        setter([])
        scopeSetter?.(fallbackScope)
      }
    },
    [selectedFiscalYear],
  )

  // Fetch dispatch records
  const fetchDispatchRecords = useCallback(async (pageIndex = 0, append = false) => {
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
        limit: dispatchPageSize.toString(),
        offset: String(pageIndex * dispatchPageSize),
      })
      const response = await fetch(`/api/dispatch?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        const nextRecords = Array.isArray(data.records) ? data.records : []
        const nextTotalCount = Number(data.totalCount) || 0
        setDispatchRecords((prev) => (append ? [...prev, ...nextRecords] : nextRecords))
        setDispatchTotalCount(nextTotalCount)
        const resolvedCount = append ? pageIndex * dispatchPageSize + nextRecords.length : nextRecords.length
        setDispatchHasMore(nextTotalCount ? resolvedCount < nextTotalCount : nextRecords.length === dispatchPageSize)
        setDispatchPage(pageIndex)
      } else {
        console.error("Error fetching dispatch records:", data.error)
      }
    } catch (error) {
      console.error("Error fetching dispatch records:", error)
    } finally {
      if (append) {
        setIsLoadingMore(false)
      } else {
        setIsLoading(false)
      }
    }
  }, [dispatchPageSize, selectedFiscalYear])

  useEffect(() => {
    loadLocations()
    fetchDispatchRecords(0, false)
  }, [fetchDispatchRecords, loadLocations])

  useEffect(() => {
    if (!dispatchRecords.length) {
      setSelectedDispatchRecord(null)
      return
    }
    setSelectedDispatchRecord((prev) => {
      if (!prev) return dispatchRecords[0]
      return dispatchRecords.find((record) => record.id === prev.id) || dispatchRecords[0]
    })
  }, [dispatchRecords])

  useEffect(() => {
    fetchBagTotals(null, setBagTotals, setBagTotalsScope)
    fetchDispatchSummary(null, setDispatchSummary)
  }, [fetchBagTotals, fetchDispatchSummary])

  useEffect(() => {
    if (!selectedLocationId) {
      setFormBagTotals(emptyBagTotals)
      setFormDispatchSummary([])
      setFormBagTotalsScope("all")
      setFormDispatchScope("all")
      return
    }
    fetchBagTotals(selectedLocationId, setFormBagTotals, setFormBagTotalsScope, { asOfDate })
    fetchDispatchSummary(selectedLocationId, setFormDispatchSummary, setFormDispatchScope, { asOfDate })
  }, [asOfDate, fetchBagTotals, fetchDispatchSummary, selectedLocationId])

  const handleSave = async () => {
    if (!selectedLocationId) {
      toast({
        title: "Location required",
        description: "Select a location before recording a dispatch.",
        variant: "destructive",
      })
      return
    }
    const bagsValue = Number(bagsDispatched)
    if (!Number.isFinite(bagsValue) || bagsValue <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid number of bags",
        variant: "destructive",
      })
      return
    }
    const kgsValue = kgsReceived ? Number(kgsReceived) : null
    if (kgsValue !== null && (!Number.isFinite(kgsValue) || kgsValue < 0)) {
      toast({
        title: "Error",
        description: "KGs received must be 0 or more",
        variant: "destructive",
      })
      return
    }

    // Check if we have enough bags available from processing
    const balance = allowedBalance
    if (bagsValue > balance + STOCK_EPSILON) {
      toast({
        title: "Insufficient Inventory",
        description: `Only ${formatNumber(balance)} ${coffeeType} ${bagType} bags available from processing. You are trying to dispatch ${bagsDispatched} bags.`,
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      const locationLabel = selectedLocation?.name || selectedLocation?.code || ""
      const method = editingRecord ? "PUT" : "POST"
      const response = await fetch("/api/dispatch", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingRecord?.id,
          dispatch_date: format(date, "yyyy-MM-dd"),
          locationId: selectedLocationId,
          estate: locationLabel || null,
          lot_id: lotId || null,
          coffee_type: coffeeType,
          bag_type: bagType,
          bags_dispatched: bagsValue,
          kgs_received: kgsValue,
          notes: notes || null,
          created_by: "dispatch",
        }),
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Success",
          description: editingRecord ? "Dispatch record updated successfully" : "Dispatch record saved successfully",
        })
        posthog.capture(editingRecord ? "dispatch_updated" : "dispatch_recorded", {
          coffee_type: coffeeType,
          bag_type: bagType,
          bags_dispatched: bagsValue,
          kgs_received: kgsValue,
          location_id: selectedLocationId,
          lot_id: lotId || null,
          fiscal_year: selectedFiscalYear.label,
        })
        // Reset form
        resetForm()
        // Refresh records
        fetchDispatchRecords(0, false)
        fetchDispatchSummary(null, setDispatchSummary)
        fetchBagTotals(null, setBagTotals, setBagTotalsScope)
        if (selectedLocationId) {
          fetchDispatchSummary(selectedLocationId, setFormDispatchSummary, setFormDispatchScope, { asOfDate })
          fetchBagTotals(selectedLocationId, setFormBagTotals, setFormBagTotalsScope, { asOfDate })
        }
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to save dispatch record",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save dispatch record",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const resetForm = () => {
    setBagsDispatched("")
    setKgsReceived("")
    setNotes("")
    setEditingRecord(null)
    setLotId("")
  }

  const handleEdit = (record: DispatchRecord) => {
    setEditingRecord(record)
    setDate(new Date(record.dispatch_date))
    const resolvedLocationId =
      record.location_id || resolveLocationIdFromLabel(record.location_name || record.location_code || record.estate)
    if (resolvedLocationId) {
      setSelectedLocationId(resolvedLocationId)
    }
    setLotId(record.lot_id ? String(record.lot_id) : "")
    setCoffeeType(record.coffee_type)
    setBagType(formatBagTypeLabel(record.bag_type))
    setBagsDispatched(record.bags_dispatched.toString())
    setKgsReceived(record.kgs_received ? record.kgs_received.toString() : "")
    setNotes(record.notes || "")
  }

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this record?")) return

    try {
      const response = await fetch(`/api/dispatch?id=${id}`, {
        method: "DELETE",
              })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Success",
          description: "Record deleted successfully",
        })
        posthog.capture("dispatch_deleted", { dispatch_id: id })
        fetchDispatchRecords(0, false)
        fetchDispatchSummary(null, setDispatchSummary)
        fetchBagTotals(null, setBagTotals, setBagTotalsScope)
        if (selectedLocationId) {
          fetchDispatchSummary(selectedLocationId, setFormDispatchSummary, setFormDispatchScope, { asOfDate })
          fetchBagTotals(selectedLocationId, setFormBagTotals, setFormBagTotalsScope, { asOfDate })
        }
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

  const loadMoreDispatchRecords = async () => {
    if (isLoadingMore || isLoading || !dispatchHasMore) {
      return
    }
    await fetchDispatchRecords(dispatchPage + 1, true)
  }

  const exportToCSV = () => {
    const runExport = async () => {
      const { startDate, endDate } = getFiscalYearDateRange(selectedFiscalYear)
      const response = await fetch(`/api/dispatch?startDate=${startDate}&endDate=${endDate}&all=true`, {
              })
      const data = await response.json()

      if (!data.success || !Array.isArray(data.records)) {
        throw new Error(data.error || "Failed to load dispatch records for export")
      }

      const headers = [
        "Date",
        "Location",
        "Lot ID",
        "Coffee Type",
        "Bag Type",
        "Bags Dispatched",
        "KGs Received",
        "Notes",
      ]
      const rows = data.records.map((record: DispatchRecord) => [
        format(new Date(record.dispatch_date), "yyyy-MM-dd"),
        getLocationLabel(record),
        record.lot_id || "",
        record.coffee_type,
        formatBagTypeLabel(record.bag_type),
        record.bags_dispatched.toString(),
        resolveDispatchRecordReceivedKgs(record, bagWeightKg).toFixed(2),
        record.notes || "",
      ])

      const csvContent = [headers.join(","), ...rows.map((row: string[]) => row.map((cell) => `"${cell}"`).join(","))].join(
        "\n",
      )

      const blob = new Blob([csvContent], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `dispatch_records_${selectedFiscalYear.label.replace("/", "-")}.csv`
      a.click()
      URL.revokeObjectURL(url)
      posthog.capture("dispatch_csv_exported", {
        fiscal_year: selectedFiscalYear.label,
        record_count: data.records.length,
      })
    }

    runExport().catch((error) => {
      posthog.captureException(error)
      console.error("Error exporting dispatch records:", error)
      toast({
        title: "Error",
        description: "Failed to export dispatch records",
        variant: "destructive",
      })
    })
  }

  // Calculate balance
  const summaryBalanceArabicaDryParchment =
    bagTotals.arabica_dry_parchment_bags - dispatchedTotals.arabica_dry_parchment
  const summaryBalanceArabicaDryCherry =
    bagTotals.arabica_dry_cherry_bags - dispatchedTotals.arabica_dry_cherry
  const summaryBalanceRobustaDryParchment =
    bagTotals.robusta_dry_parchment_bags - dispatchedTotals.robusta_dry_parchment
  const summaryBalanceRobustaDryCherry =
    bagTotals.robusta_dry_cherry_bags - dispatchedTotals.robusta_dry_cherry

  const availabilityBalanceArabicaDryParchment =
    formBagTotals.arabica_dry_parchment_bags - formDispatchedTotals.arabica_dry_parchment
  const availabilityBalanceArabicaDryCherry =
    formBagTotals.arabica_dry_cherry_bags - formDispatchedTotals.arabica_dry_cherry
  const availabilityBalanceRobustaDryParchment =
    formBagTotals.robusta_dry_parchment_bags - formDispatchedTotals.robusta_dry_parchment
  const availabilityBalanceRobustaDryCherry =
    formBagTotals.robusta_dry_cherry_bags - formDispatchedTotals.robusta_dry_cherry

  // Get current selected balance
  const getBalanceForSelection = () => {
    if (coffeeType === "Arabica" && bagType === "Dry Parchment") return availabilityBalanceArabicaDryParchment
    if (coffeeType === "Arabica" && bagType === "Dry Cherry") return availabilityBalanceArabicaDryCherry
    if (coffeeType === "Robusta" && bagType === "Dry Parchment") return availabilityBalanceRobustaDryParchment
    if (coffeeType === "Robusta" && bagType === "Dry Cherry") return availabilityBalanceRobustaDryCherry
    return 0
  }
  const editAllowance = useMemo(() => {
    if (!editingRecord) {
      return { allowance: 0, matchesSelection: false }
    }
    const editLocationId =
      editingRecord.location_id ||
      resolveLocationIdFromLabel(editingRecord.location_name || editingRecord.location_code || editingRecord.estate)
    const matchesLocation = editLocationId && editLocationId === selectedLocationId
    const matchesCoffee =
      String(editingRecord.coffee_type || "").toLowerCase() === String(coffeeType || "").toLowerCase()
    const matchesBag =
      normalizeBagTypeKey(String(editingRecord.bag_type || "")) === normalizeBagTypeKey(String(bagType || ""))
    if (matchesLocation && matchesCoffee && matchesBag) {
      return { allowance: Number(editingRecord.bags_dispatched) || 0, matchesSelection: true }
    }
    return { allowance: 0, matchesSelection: false }
  }, [bagType, coffeeType, editingRecord, resolveLocationIdFromLabel, selectedLocationId])

  const currentBalance = getBalanceForSelection()
  const availableBalance = currentBalance + editAllowance.allowance
  const allowedBalance = editAllowance.matchesSelection
    ? Math.max(availableBalance, editAllowance.allowance)
    : availableBalance
  const bagsDispatchedValue = Number(bagsDispatched) || 0
  const exceedsAvailability = bagsDispatchedValue > allowedBalance + STOCK_EPSILON
  const excessBags = Math.max(0, bagsDispatchedValue - allowedBalance)
  const isLegacyPooledAvailability = formBagTotalsScope === "legacy_pool" || formDispatchScope === "legacy_pool"
  const canSubmitDispatch =
    Boolean(selectedLocationId) &&
    bagsDispatchedValue > 0 &&
    !exceedsAvailability &&
    !isSaving
  const resolvedCountLabel =
    dispatchTotalCount > dispatchRecords.length
      ? `Showing ${dispatchRecords.length} of ${dispatchTotalCount}`
      : `${dispatchRecords.length} record(s)`
  const selectedDispatchResolvedKgs = selectedDispatchRecord
    ? resolveDispatchRecordReceivedKgs(selectedDispatchRecord, bagWeightKg)
    : 0
  const selectedDispatchNominalKgs = selectedDispatchRecord
    ? (Number(selectedDispatchRecord.bags_dispatched) || 0) * bagWeightKg
    : 0
  const selectedDispatchVarianceKgs = selectedDispatchResolvedKgs - selectedDispatchNominalKgs
  const processedNominalBagsTotal =
    bagTotals.arabica_dry_parchment_bags +
    bagTotals.arabica_dry_cherry_bags +
    bagTotals.robusta_dry_parchment_bags +
    bagTotals.robusta_dry_cherry_bags
  const dispatchedNominalBagsTotal =
    dispatchedTotals.arabica_dry_parchment +
    dispatchedTotals.arabica_dry_cherry +
    dispatchedTotals.robusta_dry_parchment +
    dispatchedTotals.robusta_dry_cherry
  const dispatchedReceivedKgsTotal =
    dispatchReceivedKgsTotals.arabica_dry_parchment +
    dispatchReceivedKgsTotals.arabica_dry_cherry +
    dispatchReceivedKgsTotals.robusta_dry_parchment +
    dispatchReceivedKgsTotals.robusta_dry_cherry
  const pendingNominalBags = processedNominalBagsTotal - dispatchedNominalBagsTotal
  const dispatchVarianceKgsTotal = dispatchedReceivedKgsTotal - dispatchedNominalBagsTotal * bagWeightKg
  dispatchSaveStateRef.current = { canSubmitDispatch, isSaving }
  dispatchSaveHandlerRef.current = handleSave

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() !== "s") return
      event.preventDefault()
      if (dispatchSaveStateRef.current.canSubmitDispatch && !dispatchSaveStateRef.current.isSaving) {
        void dispatchSaveHandlerRef.current?.()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <div className="flex flex-col gap-8">
      {/* Fiscal Year Selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Coffee Bag Dispatch</h2>
          <p className="text-sm text-muted-foreground">Track outbound bags and reconcile location availability.</p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="fiscal-year" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Fiscal Year:
          </Label>
          <Select
            value={selectedFiscalYear.label}
            onValueChange={(value) => {
              const fy = availableFiscalYears.find((y) => y.label === value)
              if (fy) setSelectedFiscalYear(fy)
            }}
          >
            <SelectTrigger className="w-full sm:w-[140px]">
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

      {bagTotalsScope === "legacy_pool" && (
        <p className="order-2 text-xs text-amber-700">
          Summary totals include pooled pre-location records for this legacy estate.
        </p>
      )}
      <p className="order-3 text-xs text-muted-foreground">
        Bags are logistics units; received KGs feed downstream sales availability.
      </p>

      <Card className="order-4 border-border/70 bg-white/85">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Dispatch Reconciliation</CardTitle>
          <CardDescription>Use received KGs for saleable stock, while keeping nominal bag movement visible.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border/60 bg-white/80 p-3">
            <p className="text-xs text-muted-foreground">Processed nominal</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{formatNumber(processedNominalBagsTotal)} bags</p>
            <p className="mt-1 text-xs text-muted-foreground">{formatNumber(processedNominalBagsTotal * bagWeightKg)} KGs</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-white/80 p-3">
            <p className="text-xs text-muted-foreground">Dispatched nominal</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{formatNumber(dispatchedNominalBagsTotal)} bags</p>
            <p className="mt-1 text-xs text-muted-foreground">{formatNumber(dispatchedNominalBagsTotal * bagWeightKg)} KGs</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-white/80 p-3">
            <p className="text-xs text-muted-foreground">Received for sales</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{formatNumber(dispatchedReceivedKgsTotal)} KGs</p>
            <p className={cn("mt-1 text-xs", dispatchVarianceKgsTotal >= 0 ? "text-emerald-700" : "text-rose-700")}>
              Variance vs nominal dispatch: {dispatchVarianceKgsTotal >= 0 ? "+" : ""}
              {formatNumber(dispatchVarianceKgsTotal)} KGs
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-white/80 p-3">
            <p className="text-xs text-muted-foreground">Pending nominal bags</p>
            <p className={cn("mt-1 text-sm font-semibold", pendingNominalBags < 0 ? "text-rose-700" : "text-foreground")}>
              {formatNumber(Math.abs(pendingNominalBags))} bags
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {pendingNominalBags < 0 ? "Dispatched exceeds processed nominal" : "Still in processed stock"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="order-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Arabica Dry Parchment */}
        <Card className="border-border/60 bg-white/85">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Arabica Dry Parchment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">
              {formatNumber(bagTotals.arabica_dry_parchment_bags)}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Processed nominal: {formatNumber(bagTotals.arabica_dry_parchment_bags * bagWeightKg)} KGs
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Dispatched: {formatNumber(dispatchedTotals.arabica_dry_parchment)} bags (
              {formatNumber(dispatchedTotals.arabica_dry_parchment * bagWeightKg)} KGs)
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Received (sales basis): {formatNumber(dispatchReceivedKgsTotals.arabica_dry_parchment)} KGs
            </div>
            <div
              className={cn(
                "text-sm font-medium mt-1",
                summaryBalanceArabicaDryParchment < 0 ? "text-rose-600" : "text-emerald-600",
              )}
            >
              Balance: {formatNumber(summaryBalanceArabicaDryParchment)} bags
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatNumber(summaryBalanceArabicaDryParchment * bagWeightKg)} KGs
            </div>
          </CardContent>
        </Card>

        {/* Arabica Dry Cherry */}
        <Card className="border-border/60 bg-white/85">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Arabica Dry Cherry
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">
              {formatNumber(bagTotals.arabica_dry_cherry_bags)}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Processed nominal: {formatNumber(bagTotals.arabica_dry_cherry_bags * bagWeightKg)} KGs
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Dispatched: {formatNumber(dispatchedTotals.arabica_dry_cherry)} bags (
              {formatNumber(dispatchedTotals.arabica_dry_cherry * bagWeightKg)} KGs)
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Received (sales basis): {formatNumber(dispatchReceivedKgsTotals.arabica_dry_cherry)} KGs
            </div>
            <div
              className={cn(
                "text-sm font-medium mt-1",
                summaryBalanceArabicaDryCherry < 0 ? "text-rose-600" : "text-emerald-600",
              )}
            >
              Balance: {formatNumber(summaryBalanceArabicaDryCherry)} bags
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatNumber(summaryBalanceArabicaDryCherry * bagWeightKg)} KGs
            </div>
          </CardContent>
        </Card>

        {/* Robusta Dry Parchment */}
        <Card className="border-border/60 bg-white/85">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Robusta Dry Parchment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">
              {formatNumber(bagTotals.robusta_dry_parchment_bags)}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Processed nominal: {formatNumber(bagTotals.robusta_dry_parchment_bags * bagWeightKg)} KGs
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Dispatched: {formatNumber(dispatchedTotals.robusta_dry_parchment)} bags (
              {formatNumber(dispatchedTotals.robusta_dry_parchment * bagWeightKg)} KGs)
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Received (sales basis): {formatNumber(dispatchReceivedKgsTotals.robusta_dry_parchment)} KGs
            </div>
            <div
              className={cn(
                "text-sm font-medium mt-1",
                summaryBalanceRobustaDryParchment < 0 ? "text-rose-600" : "text-emerald-600",
              )}
            >
              Balance: {formatNumber(summaryBalanceRobustaDryParchment)} bags
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatNumber(summaryBalanceRobustaDryParchment * bagWeightKg)} KGs
            </div>
          </CardContent>
        </Card>

        {/* Robusta Dry Cherry */}
        <Card className="border-border/60 bg-white/85">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Robusta Dry Cherry
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">
              {formatNumber(bagTotals.robusta_dry_cherry_bags)}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Processed nominal: {formatNumber(bagTotals.robusta_dry_cherry_bags * bagWeightKg)} KGs
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Dispatched: {formatNumber(dispatchedTotals.robusta_dry_cherry)} bags (
              {formatNumber(dispatchedTotals.robusta_dry_cherry * bagWeightKg)} KGs)
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Received (sales basis): {formatNumber(dispatchReceivedKgsTotals.robusta_dry_cherry)} KGs
            </div>
            <div
              className={cn(
                "text-sm font-medium mt-1",
                summaryBalanceRobustaDryCherry < 0 ? "text-rose-600" : "text-emerald-600",
              )}
            >
              Balance: {formatNumber(summaryBalanceRobustaDryCherry)} bags
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatNumber(summaryBalanceRobustaDryCherry * bagWeightKg)} KGs
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Dispatch Form */}
      <Card className="order-1 border-border/70 bg-white/85">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            {editingRecord ? "Edit Dispatch" : "Record Dispatch"}
          </CardTitle>
          <CardDescription>
            {editingRecord
              ? "Update the dispatch record"
              : "Record coffee bags sent from the selected location (availability follows processing output)."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <p className="text-xs text-muted-foreground">
                {isLegacyPooledAvailability
                  ? "Legacy pooled mode is active; availability is estate-wide."
                  : "Availability is calculated for this location."}
              </p>
            </div>

            {/* Lot ID */}
            <div className="space-y-2">
              <FieldLabel
                label="Lot ID"
                tooltip="Match the lot/batch ID used in processing for traceability."
              />
              <Input
                placeholder="e.g. LOT-2026-001"
                value={lotId}
                onChange={(e) => setLotId(e.target.value)}
              />
            </div>

            {/* Coffee Type */}
            <div className="space-y-2">
              <Label>Coffee Type</Label>
              <Select value={coffeeType} onValueChange={setCoffeeType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COFFEE_TYPES.map((ct) => (
                    <SelectItem key={ct} value={ct}>
                      {ct}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bag Type */}
            <div className="space-y-2">
              <FieldLabel
                label="Bag Type"
                tooltip="Select dry parchment or dry cherry to match processing output."
              />
              <Select value={bagType} onValueChange={setBagType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BAG_TYPES.map((bt) => (
                    <SelectItem key={bt} value={bt}>
                      {bt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className={cn("text-xs", allowedBalance > 0 ? "text-emerald-600" : "text-rose-600")}>
                Available: {formatNumber(allowedBalance)} bags ({formatNumber(allowedBalance * bagWeightKg)} KGs)
              </p>
              {editAllowance.matchesSelection && (
                <p className="text-xs text-muted-foreground">
                  This record already accounts for {formatNumber(editAllowance.allowance)} bags.
                </p>
              )}
            </div>

            {/* Bags Dispatched */}
            <div className="space-y-2">
              <FieldLabel
                label="Bags Dispatched"
                tooltip={`Number of bags shipped (estate bag weight ${bagWeightKg} kg).`}
              />
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder="Enter number of bags"
                value={bagsDispatched}
                onKeyDown={blockInvalidNumberKey}
                onChange={handleNonNegativeChange(setBagsDispatched)}
                max={Math.max(0, allowedBalance)}
              />
              {exceedsAvailability && (
                <p className="text-xs text-rose-600">
                  Exceeds available inventory by {formatNumber(excessBags)} bags.
                </p>
              )}
            </div>

            {/* KGs Received */}
            <div className="space-y-2">
              <FieldLabel
                label="KGs Received (Optional)"
                tooltip="Actual received weight from the buyer or warehouse for reconciliation."
              />
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder="Enter KGs received"
                value={kgsReceived}
                onKeyDown={blockInvalidNumberKey}
                onChange={handleNonNegativeChange(setKgsReceived)}
              />
              {kgsReceived ? (
                <p className="text-xs text-muted-foreground">
                  {formatNumber(Number(kgsReceived) / bagWeightKg || 0)} bags received
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Blank means fallback to {formatNumber(bagsDispatchedValue * bagWeightKg)} KGs ({bagWeightKg} KG per bag).
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2 md:col-span-2">
              <Label>Notes (Optional)</Label>
              <Textarea
                placeholder="Add any notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[60px]"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {editingRecord && (
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            )}
            <Button onClick={handleSave} disabled={!canSubmitDispatch} className="bg-emerald-700 hover:bg-emerald-800">
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {editingRecord ? "Update Dispatch" : "Save Dispatch"}
                </>
              )}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Tip: press Ctrl/Cmd + S to save quickly.</p>
          {!canSubmitDispatch && !isSaving && (
            <p className="mt-2 text-xs text-muted-foreground">
              Enter location and quantity. Quantity must be within available stock.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Dispatch Records Table */}
      <Card className="order-6 border-border/70 bg-white/85">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Dispatch Records
              </CardTitle>
              <CardDescription>History of all dispatched bags · {resolvedCountLabel}</CardDescription>
            </div>
            {showDataToolsControls && (
              <Button variant="outline" size="sm" onClick={exportToCSV} className="bg-transparent">
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {selectedDispatchRecord && (
            <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Dispatch Drill-Down</p>
                  <p className="font-medium text-foreground">
                    {formatDateOnly(selectedDispatchRecord.dispatch_date)} · {getLocationLabel(selectedDispatchRecord)}
                    {selectedDispatchRecord.lot_id ? ` · Lot ${selectedDispatchRecord.lot_id}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-white"
                  onClick={() => handleEdit(selectedDispatchRecord)}
                >
                  Open for Edit
                </Button>
              </div>
              <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                <p>Coffee: {selectedDispatchRecord.coffee_type}</p>
                <p>Bag Type: {formatBagTypeLabel(selectedDispatchRecord.bag_type)}</p>
                <p>Bags: {formatNumber(Number(selectedDispatchRecord.bags_dispatched) || 0)}</p>
                <p>Received KGs: {formatNumber(selectedDispatchResolvedKgs)}</p>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Nominal KGs: {formatNumber(selectedDispatchNominalKgs)} · Variance:{" "}
                <span className={cn(selectedDispatchVarianceKgs >= 0 ? "text-emerald-700" : "text-rose-700")}>
                  {selectedDispatchVarianceKgs >= 0 ? "+" : ""}
                  {formatNumber(selectedDispatchVarianceKgs)} KGs
                </span>
              </div>
            </div>
          )}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : dispatchRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No dispatch records yet</p>
              <p className="text-sm mt-2">Log your first outbound shipment to reconcile inventory and sales.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3 md:hidden">
                {dispatchRecords.map((record) => {
                  const receivedKgs = resolveDispatchRecordReceivedKgs(record, bagWeightKg)
                  return (
                    <div
                      key={record.id}
                      className={cn(
                        "rounded-xl border border-border/70 bg-white p-3 shadow-sm",
                        selectedDispatchRecord?.id === record.id ? "border-emerald-200 bg-emerald-50/40" : "",
                      )}
                      onClick={() => setSelectedDispatchRecord(record)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{formatDateOnly(record.dispatch_date)}</p>
                          <p className="text-xs text-muted-foreground">{getLocationLabel(record)}</p>
                        </div>
                        <span className="rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 text-xs font-medium">
                          {record.coffee_type}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-md border border-black/5 bg-white px-2 py-1.5">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Bag Type</p>
                          <p className="font-medium text-foreground">{formatBagTypeLabel(record.bag_type)}</p>
                        </div>
                        <div className="rounded-md border border-black/5 bg-white px-2 py-1.5">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Lot</p>
                          <p className="font-medium text-foreground">{record.lot_id || "-"}</p>
                        </div>
                        <div className="rounded-md border border-black/5 bg-white px-2 py-1.5">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Bags</p>
                          <p className="font-medium text-foreground">{formatNumber(Number(record.bags_dispatched) || 0)}</p>
                        </div>
                        <div className="rounded-md border border-black/5 bg-white px-2 py-1.5">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Received KGs</p>
                          <p className="font-medium text-foreground">{formatNumber(receivedKgs)}</p>
                        </div>
                      </div>
                      {record.notes ? (
                        <p className="mt-2 rounded-md border border-black/5 bg-white px-2 py-1.5 text-xs text-muted-foreground">
                          {record.notes}
                        </p>
                      ) : null}
                      <div className="mt-3 flex gap-2">
                        <Button
                          aria-label="Edit dispatch"
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelectedDispatchRecord(record)
                            handleEdit(record)
                          }}
                          className="h-10 flex-1 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        >
                          <Pencil className="mr-1.5 h-4 w-4" />
                          Edit
                        </Button>
                        {canDelete && (
                          <Button
                            aria-label="Delete dispatch"
                            variant="outline"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleDelete(record.id!)
                            }}
                            className="h-10 flex-1 border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
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
                      <TableHead className="sticky top-0 bg-muted/70 backdrop-blur">Location</TableHead>
                      <TableHead className="sticky top-0 bg-muted/70 backdrop-blur">Lot ID</TableHead>
                      <TableHead className="sticky top-0 bg-muted/70 backdrop-blur">Coffee Type</TableHead>
                      <TableHead className="sticky top-0 bg-muted/70 backdrop-blur">Bag Type</TableHead>
                      <TableHead className="text-right sticky top-0 bg-muted/70 backdrop-blur">Bags</TableHead>
                      <TableHead className="text-right sticky top-0 bg-muted/70 backdrop-blur">KGs (Received)</TableHead>
                      <TableHead className="sticky top-0 bg-muted/70 backdrop-blur">Notes</TableHead>
                      <TableHead className="text-right sticky top-0 bg-muted/70 backdrop-blur">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dispatchRecords.map((record) => (
                      <TableRow
                        key={record.id}
                        className={cn(
                          "cursor-pointer",
                          selectedDispatchRecord?.id === record.id ? "bg-emerald-50/60" : "",
                        )}
                        onClick={() => setSelectedDispatchRecord(record)}
                      >
                        <TableCell>{formatDateOnly(record.dispatch_date)}</TableCell>
                        <TableCell>{getLocationLabel(record)}</TableCell>
                        <TableCell>{record.lot_id || "-"}</TableCell>
                        <TableCell>{record.coffee_type}</TableCell>
                        <TableCell>{formatBagTypeLabel(record.bag_type)}</TableCell>
                        <TableCell className="text-right">{formatNumber(Number(record.bags_dispatched) || 0)}</TableCell>
                        <TableCell className="text-right">
                          {formatNumber(resolveDispatchRecordReceivedKgs(record, bagWeightKg))}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{record.notes || "-"}</TableCell>
                        <TableCell className="text-right">
                          <TooltipProvider>
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    aria-label="Edit dispatch"
                                    variant="ghost"
                                    size="sm"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      setSelectedDispatchRecord(record)
                                      handleEdit(record)
                                    }}
                                    className="text-blue-600 hover:text-blue-700"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit dispatch</TooltipContent>
                              </Tooltip>
                              {canDelete && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      aria-label="Delete dispatch"
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
                                  <TooltipContent>Delete dispatch</TooltipContent>
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
              {dispatchHasMore && (
                <div className="flex justify-center pt-4">
                  <Button variant="outline" size="sm" onClick={loadMoreDispatchRecords} disabled={isLoadingMore}>
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
