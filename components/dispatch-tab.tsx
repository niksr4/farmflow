"use client"

import { useState, useEffect, useCallback, useMemo, useRef, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from "react"
import InPageNav from "@/components/in-page-nav"
import FilterBar from "@/components/filter-bar"
import { useListControls } from "@/hooks/use-list-controls"
import Link from "next/link"
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
import { CalendarIcon, Loader2, Save, Trash2, Download, Package, Truck, Pencil, ChevronDown } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DEFAULT_COFFEE_VARIETIES } from "@/lib/crop-config"
import { useAuth } from "@/hooks/use-auth"
import { useTenantSettings } from "@/hooks/use-tenant-settings"
import { formatDateOnly } from "@/lib/date-utils"
import { formatNumber } from "@/lib/format"
import { canAcceptNonNegative, isBlockedNumericKey } from "@/lib/number-input"
import TaskGuideCard from "@/components/task-guide-card"
import { SkeletonTable } from "@/components/ui/skeleton"
import { EmptyStateTable } from "@/components/ui/empty-state"
import WorkflowEmptyState from "@/components/workflow-empty-state"
import WorkspacePageShell from "@/components/workspace-page-shell"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useFiscalYearSelection } from "@/hooks/use-fiscal-year-selection"
import { FiscalYearSelect } from "@/components/ui/fiscal-year-select"
import posthog from "posthog-js"
import { trackClick, reportActionFailure, reportActionError } from "@/lib/track-action"

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
const resolveDispatchRecordNominalKgs = (record: Pick<DispatchRecord, "bags_dispatched">, bagWeightKg: number) =>
  (Number(record.bags_dispatched) || 0) * bagWeightKg
const resolveDispatchRecordReceivedKgs = (record: Pick<DispatchRecord, "kgs_received" | "bags_dispatched">, _bagWeightKg: number) => {
  const kgsReceivedValue = Number(record.kgs_received) || 0
  if (kgsReceivedValue > 0) return kgsReceivedValue
  return 0
}

type DispatchTabProps = {
  showDataToolsControls?: boolean
}

export default function DispatchTab({ showDataToolsControls = false }: DispatchTabProps) {
  const { user } = useAuth()
  const { settings } = useTenantSettings()
  const bagWeightKg = Number(settings.bagWeightKg) || 50
  const canDelete = user?.role === "admin" || user?.role === "owner" || user?.role === "user"
  const isMobile = useMediaQuery("(max-width: 768px)")
  const {
    selectedFiscalYear,
    setSelectedFiscalYear,
    availableFiscalYears,
    startDate: fyStartDate,
    endDate: fyEndDate,
  } = useFiscalYearSelection()

  const [locations, setLocations] = useState<LocationOption[]>([])
  const [date, setDate] = useState<Date>(new Date())
  const [selectedLocationId, setSelectedLocationId] = useState<string>("")
  const [coffeeType, setCoffeeType] = useState<string>("Arabica")
  const [bagType, setBagType] = useState<string>("Dry Parchment")
  const [bagsDispatched, setBagsDispatched] = useState<string>("")
  const [kgsReceived, setKgsReceived] = useState<string>("")
  const [notes, setNotes] = useState<string>("")
  
  const [bagTotals, setBagTotals] = useState<BagTotals>(emptyBagTotals)
  const [formBagTotals, setFormBagTotals] = useState<BagTotals>(emptyBagTotals)
  const [dispatchRecords, setDispatchRecords] = useState<DispatchRecord[]>([])
  const recordControls = useListControls(dispatchRecords, {
    searchFields: (r) => [r.location_name, r.location_code, r.estate, r.coffee_type, r.bag_type, r.buyer_name, r.notes, r.lot_id],
    sorters: {
      date: (r) => String(r.dispatch_date || "").slice(0, 10),
      bags: (r) => Number(r.bags_dispatched) || 0,
      location: (r) => String(r.location_name || r.estate || ""),
    },
    defaultSort: "date",
  })
  const [dispatchSummary, setDispatchSummary] = useState<DispatchSummaryRow[]>([])
  const [formDispatchSummary, setFormDispatchSummary] = useState<DispatchSummaryRow[]>([])
  const [bagTotalsScope, setBagTotalsScope] = useState<LocationScope>("all")
  const [formBagTotalsScope, setFormBagTotalsScope] = useState<LocationScope>("location")
  const [formDispatchScope, setFormDispatchScope] = useState<LocationScope>("location")
  const [showStockBreakdown, setShowStockBreakdown] = useState(false)
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
  const dispatchFormRef = useRef<HTMLDivElement | null>(null)
  const kgsReceivedInputRef = useRef<HTMLInputElement | null>(null)
  const stockSummaryRef = useRef<HTMLDivElement | null>(null)
  const recordsRef = useRef<HTMLDivElement | null>(null)
  const [activeSection, setActiveSection] = useState<"stock-flow" | "new-dispatch" | "records">("stock-flow")
  const [showStockContent, setShowStockContent] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      const section = (e as CustomEvent<string>).detail
      if (section === "stock-flow") setActiveSection("stock-flow")
      else if (section === "new-dispatch") {
        // This component never unmounts on tab switch (forceMount), so an
        // abandoned edit (left without saving or canceling) can otherwise
        // silently resurface here — "New Dispatch" should always mean a
        // blank form, not whatever was last being edited.
        resetForm()
        setActiveSection("new-dispatch")
      } else if (section === "records") setActiveSection("records")
    }
    window.addEventListener("farmflow:scroll-to-section", handler)
    return () => window.removeEventListener("farmflow:scroll-to-section", handler)
  }, [])

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
      options?: { asOfDate?: string; startDate?: string },
    ) => {
      const resolvedLocation = locationId ? locationId.trim() : ""
      const fallbackScope: LocationScope = resolvedLocation ? "location" : "all"
      try {
        const params = new URLSearchParams({
          summary: "bagTotals",
        })
        if (options?.startDate) {
          params.set("fiscalYearStart", options.startDate)
        }
        if (options?.asOfDate) {
          params.set("fiscalYearEnd", options.asOfDate)
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
    [],
  )

  const fetchDispatchSummary = useCallback(
    async (
      locationId: string | null,
      setter: (rows: DispatchSummaryRow[]) => void,
      scopeSetter?: (scope: LocationScope) => void,
      options?: { asOfDate?: string; startDate?: string },
    ) => {
      const resolvedLocation = locationId ? locationId.trim() : ""
      const fallbackScope: LocationScope = resolvedLocation ? "location" : "all"
      try {
        const params = new URLSearchParams({
          summaryOnly: "true",
        })
        if (options?.startDate) {
          params.set("startDate", options.startDate)
        }
        if (options?.asOfDate) {
          params.set("endDate", options.asOfDate)
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
    [],
  )

  // Fetch dispatch records
  const fetchDispatchRecords = useCallback(async (pageIndex = 0, append = false) => {
    if (append) {
      setIsLoadingMore(true)
    } else {
      setIsLoading(true)
    }
    try {
      const params = new URLSearchParams({
        limit: dispatchPageSize.toString(),
        offset: String(pageIndex * dispatchPageSize),
        startDate: fyStartDate,
        endDate: fyEndDate,
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
  }, [dispatchPageSize, fyStartDate, fyEndDate])

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
    fetchBagTotals(null, setBagTotals, setBagTotalsScope, { startDate: fyStartDate, asOfDate: fyEndDate })
    fetchDispatchSummary(null, setDispatchSummary, undefined, { startDate: fyStartDate, asOfDate: fyEndDate })
  }, [fetchBagTotals, fetchDispatchSummary, fyStartDate, fyEndDate])

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

  useEffect(() => {
    if (!editingRecord) return
    const timeoutId = window.setTimeout(() => {
      dispatchFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      kgsReceivedInputRef.current?.focus()
      kgsReceivedInputRef.current?.select()
    }, 100)
    return () => window.clearTimeout(timeoutId)
  }, [editingRecord])

  const handleSave = async () => {
    trackClick(editingRecord ? "dispatch_update" : "dispatch_save")
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
          lot_id: null,
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
        })
        // Reset form
        resetForm()
        // Refresh records
        fetchDispatchRecords(0, false)
        fetchDispatchSummary(null, setDispatchSummary, undefined, { startDate: fyStartDate, asOfDate: fyEndDate })
        fetchBagTotals(null, setBagTotals, setBagTotalsScope, { startDate: fyStartDate, asOfDate: fyEndDate })
        if (selectedLocationId) {
          fetchDispatchSummary(selectedLocationId, setFormDispatchSummary, setFormDispatchScope, { asOfDate })
          fetchBagTotals(selectedLocationId, setFormBagTotals, setFormBagTotalsScope, { asOfDate })
        }
      } else {
        reportActionFailure(editingRecord ? "dispatch_update" : "dispatch_save", data.error || "non-ok response")
        toast({
          title: "Error",
          description: data.error || "Failed to save dispatch record",
          variant: "destructive",
        })
      }
    } catch (error) {
      reportActionError(editingRecord ? "dispatch_update" : "dispatch_save", error)
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
  }

  const handleEdit = (record: DispatchRecord) => {
    trackClick("dispatch_edit", { id: record.id })
    // The form only renders under the "new-dispatch" section — editing from the
    // Records list otherwise populates the form's state off-screen with nothing
    // visible changing, since the section showing it is never switched to.
    setActiveSection("new-dispatch")
    setEditingRecord(record)
    setSelectedDispatchRecord(record)
    setDate(new Date(record.dispatch_date))
    const resolvedLocationId =
      record.location_id || resolveLocationIdFromLabel(record.location_name || record.location_code || record.estate)
    setSelectedLocationId(resolvedLocationId || "")
    setCoffeeType(record.coffee_type)
    setBagType(formatBagTypeLabel(record.bag_type))
    setBagsDispatched(record.bags_dispatched.toString())
    setKgsReceived(record.kgs_received === null || record.kgs_received === undefined ? "" : record.kgs_received.toString())
    setNotes(record.notes || "")
  }

  const handleDelete = async (id: number) => {
    trackClick("dispatch_delete", { id })
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
        fetchDispatchSummary(null, setDispatchSummary, undefined, { startDate: fyStartDate, asOfDate: fyEndDate })
        fetchBagTotals(null, setBagTotals, setBagTotalsScope, { startDate: fyStartDate, asOfDate: fyEndDate })
        if (selectedLocationId) {
          fetchDispatchSummary(selectedLocationId, setFormDispatchSummary, setFormDispatchScope, { asOfDate })
          fetchBagTotals(selectedLocationId, setFormBagTotals, setFormBagTotalsScope, { asOfDate })
        }
      } else {
        reportActionFailure("dispatch_delete", data.error || "non-ok response", { id })
        toast({
          title: "Error",
          description: data.error || "Failed to delete record",
          variant: "destructive",
        })
      }
    } catch (error) {
      reportActionError("dispatch_delete", error, { id })
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
      const response = await fetch("/api/dispatch?all=true", {
              })
      const data = await response.json()

      if (!data.success || !Array.isArray(data.records)) {
        throw new Error(data.error || "Failed to load dispatch records for export")
      }

      const headers = [
        "Date",
        "Location",
        "Coffee Type",
        "Bag Type",
        "Bags Dispatched",
        "KGs Received",
        "Notes",
      ]
      const rows = data.records.map((record: DispatchRecord) => [
        format(new Date(record.dispatch_date), "yyyy-MM-dd"),
        getLocationLabel(record),
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
      a.download = "dispatch_records.csv"
      a.click()
      URL.revokeObjectURL(url)
      posthog.capture("dispatch_csv_exported", {
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
    ? resolveDispatchRecordNominalKgs(selectedDispatchRecord, bagWeightKg)
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
  const dispatchShellStats = [
    {
      label: "Processed Nominal",
      value: `${formatNumber(processedNominalBagsTotal, 0)} bags`,
      detail: `${formatNumber(processedNominalBagsTotal * bagWeightKg, 0)} KGs from processing`,
      tooltip: "Total nominal bag count derived from processing records this season. Each bag is assumed to be the configured bag weight.",
    },
    {
      label: "Confirmed Received",
      value: `${formatNumber(dispatchedReceivedKgsTotal, 0)} KGs`,
      detail: "This is the sellable stock basis downstream",
      tone: "positive" as const,
      tooltip: "KGs confirmed received by the buyer or warehouse. This is the authoritative figure for downstream sales and revenue calculations.",
    },
    {
      label: "Pending Dispatch",
      value: `${formatNumber(Math.abs(pendingNominalBags), 0)} bags`,
      detail: pendingNominalBags < 0 ? "Dispatch exceeds processed nominal" : "Still waiting in processed stock",
      tone: pendingNominalBags < 0 ? ("critical" as const) : ("default" as const),
      tooltip: pendingNominalBags < 0
        ? "More bags have been dispatched than were processed — check for missing processing records or data entry errors."
        : "Processed bags that have not yet been dispatched. Reduce this by recording dispatches.",
    },
    {
      label: "Dispatch Records",
      value: formatNumber(dispatchTotalCount || dispatchRecords.length, 0),
      detail: bagTotalsScope === "legacy_pool" ? "Legacy pooled stock mode active" : "Location-aware stock flow",
    },
  ]
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

  const scrollToEntryForm = useCallback(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }, [])

  return (
    <WorkspacePageShell
      badge="Operations workspace"
      title="Dispatch"
      description="Track outbound coffee bags, reconcile received KGs, and keep stock flow clean between pulping and sales."
      accent="emerald"
      className="space-y-0"
      stats={dispatchShellStats}
      supportingContent={
        <p>
          Bags are the logistics unit here, but confirmed received KGs are what drive commercial availability later.
        </p>
      }
    >
      <TaskGuideCard
        eyebrow="Dispatch guide"
        title="Record dispatch when bags or stock leave a location"
        description="Dispatch is for real outbound movement. It should match what the team loaded, transferred, or handed over."
        bullets={[
          "Choose the correct location before entering bag movement.",
          "Use received KGs when you know the actual received weight, because sales availability follows that number.",
          "If the shipment is still unclear, save the bag movement and update notes later rather than waiting.",
        ]}
        tip="Every bag that leaves a location should have a dispatch record. This keeps your stock balance accurate for sales and season-end."
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
      <InPageNav items={[
        { label: "Stock Flow", active: activeSection === "stock-flow", onClick: () => setActiveSection("stock-flow") },
        { label: "New Dispatch", active: activeSection === "new-dispatch", onClick: () => setActiveSection("new-dispatch") },
        { label: "Records", active: activeSection === "records", onClick: () => setActiveSection("records") },
      ]} />

      {bagTotalsScope === "legacy_pool" && (
        <p className="order-2 text-xs text-amber-700">
          Summary totals include pooled pre-location records for this legacy estate.
        </p>
      )}

      {activeSection === "stock-flow" && (
        <div>
          <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3.5 shadow-sm dark:border-white/[0.06] dark:bg-card">
            <button
              type="button"
              onClick={() => setShowStockContent(v => !v)}
              className="flex flex-1 items-center justify-between gap-3 text-left hover:opacity-80 transition-opacity"
            >
              <div>
                <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">Stock Flow</p>
                <p className="text-xs text-stone-400 mt-0.5">Processed, dispatched, received and on-hand, {selectedFiscalYear.label}</p>
              </div>
              <ChevronDown className={cn("h-4 w-4 text-stone-400 shrink-0 transition-transform duration-200", showStockContent && "rotate-180")} />
            </button>
            <div onClick={(e) => e.stopPropagation()}>
              <FiscalYearSelect value={selectedFiscalYear} options={availableFiscalYears} onChange={setSelectedFiscalYear} />
            </div>
          </div>
          {showStockContent && <>
      <div ref={stockSummaryRef} className="order-4 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card">
        <div className="border-b border-stone-100 px-5 py-4 dark:border-white/[0.05]">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Stock flow</p>
          <p className="mt-0.5 text-sm font-semibold text-stone-800 dark:text-stone-200">Bags are logistics units · received KGs are commercial stock</p>
        </div>
        <div className="grid grid-cols-1 gap-0 divide-y divide-stone-100 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4 dark:divide-white/[0.05]">
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Processed</p>
            <p className="mt-1 text-xl font-black tabular-nums text-stone-900 dark:text-white">{formatNumber(processedNominalBagsTotal)} bags</p>
            <p className="mt-0.5 text-xs text-stone-400">{formatNumber(processedNominalBagsTotal * bagWeightKg)} KGs nominal</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Dispatched</p>
            <p className="mt-1 text-xl font-black tabular-nums text-stone-900 dark:text-white">{formatNumber(dispatchedNominalBagsTotal)} bags</p>
            <p className="mt-0.5 text-xs text-stone-400">{formatNumber(dispatchedNominalBagsTotal * bagWeightKg)} KGs nominal</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Received</p>
            <p className="mt-1 text-xl font-black tabular-nums text-emerald-700 dark:text-emerald-400">{formatNumber(dispatchedReceivedKgsTotal)} KGs</p>
            <p className={cn("mt-0.5 text-xs", dispatchVarianceKgsTotal >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-rose-600")}>
              {dispatchVarianceKgsTotal >= 0 ? "+" : ""}{formatNumber(dispatchVarianceKgsTotal)} KGs vs nominal
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">On hand</p>
            <p className={cn("mt-1 text-xl font-black tabular-nums", pendingNominalBags < 0 ? "text-rose-600" : "text-stone-900 dark:text-white")}>
              {formatNumber(Math.abs(pendingNominalBags))} bags
            </p>
            <p className="mt-0.5 text-xs text-stone-400">
              {pendingNominalBags < 0 ? "Exceeds processed" : "Awaiting dispatch"}
            </p>
          </div>
        </div>
      </div>

      {/* Stock breakdown toggle */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setShowStockBreakdown(v => !v)}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-5 py-2.5 text-sm font-semibold text-stone-600 hover:bg-stone-100 transition-colors touch-manipulation"
        >
          {showStockBreakdown ? "Hide stock breakdown ▲" : "Show stock breakdown ▼"}
        </button>
      </div>

      {/* Summary Cards */}
      {showStockBreakdown && <div className="order-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Arabica Dry Parchment */}
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card">
          <div className="border-b border-stone-100 px-5 py-3 dark:border-white/[0.05]">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-500">Arabica Dry Parchment</p>
          </div>
          <div className="p-5">
            <div className="text-2xl font-black tabular-nums text-stone-900 dark:text-white">{formatNumber(bagTotals.arabica_dry_parchment_bags)}</div>
            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">Processed nominal: {formatNumber(bagTotals.arabica_dry_parchment_bags * bagWeightKg)} KGs</div>
            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">Dispatched: {formatNumber(dispatchedTotals.arabica_dry_parchment)} bags ({formatNumber(dispatchedTotals.arabica_dry_parchment * bagWeightKg)} KGs)</div>
            <div className="mt-1 text-xs text-stone-400 dark:text-stone-500">Confirmed received: {formatNumber(dispatchReceivedKgsTotals.arabica_dry_parchment)} KGs</div>
            <div className={cn("mt-1 text-sm font-semibold", summaryBalanceArabicaDryParchment < 0 ? "text-rose-600" : "text-emerald-600")}>Balance: {formatNumber(summaryBalanceArabicaDryParchment)} bags</div>
            <div className="text-xs text-stone-400 dark:text-stone-500">{formatNumber(summaryBalanceArabicaDryParchment * bagWeightKg)} KGs</div>
          </div>
        </div>

        {/* Arabica Dry Cherry */}
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card">
          <div className="border-b border-stone-100 px-5 py-3 dark:border-white/[0.05]">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-500">Arabica Dry Cherry</p>
          </div>
          <div className="p-5">
            <div className="text-2xl font-black tabular-nums text-stone-900 dark:text-white">{formatNumber(bagTotals.arabica_dry_cherry_bags)}</div>
            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">Processed nominal: {formatNumber(bagTotals.arabica_dry_cherry_bags * bagWeightKg)} KGs</div>
            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">Dispatched: {formatNumber(dispatchedTotals.arabica_dry_cherry)} bags ({formatNumber(dispatchedTotals.arabica_dry_cherry * bagWeightKg)} KGs)</div>
            <div className="mt-1 text-xs text-stone-400 dark:text-stone-500">Confirmed received: {formatNumber(dispatchReceivedKgsTotals.arabica_dry_cherry)} KGs</div>
            <div className={cn("mt-1 text-sm font-semibold", summaryBalanceArabicaDryCherry < 0 ? "text-rose-600" : "text-emerald-600")}>Balance: {formatNumber(summaryBalanceArabicaDryCherry)} bags</div>
            <div className="text-xs text-stone-400 dark:text-stone-500">{formatNumber(summaryBalanceArabicaDryCherry * bagWeightKg)} KGs</div>
          </div>
        </div>

        {/* Robusta Dry Parchment */}
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card">
          <div className="border-b border-stone-100 px-5 py-3 dark:border-white/[0.05]">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-500">Robusta Dry Parchment</p>
          </div>
          <div className="p-5">
            <div className="text-2xl font-black tabular-nums text-stone-900 dark:text-white">{formatNumber(bagTotals.robusta_dry_parchment_bags)}</div>
            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">Processed nominal: {formatNumber(bagTotals.robusta_dry_parchment_bags * bagWeightKg)} KGs</div>
            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">Dispatched: {formatNumber(dispatchedTotals.robusta_dry_parchment)} bags ({formatNumber(dispatchedTotals.robusta_dry_parchment * bagWeightKg)} KGs)</div>
            <div className="mt-1 text-xs text-stone-400 dark:text-stone-500">Confirmed received: {formatNumber(dispatchReceivedKgsTotals.robusta_dry_parchment)} KGs</div>
            <div className={cn("mt-1 text-sm font-semibold", summaryBalanceRobustaDryParchment < 0 ? "text-rose-600" : "text-emerald-600")}>Balance: {formatNumber(summaryBalanceRobustaDryParchment)} bags</div>
            <div className="text-xs text-stone-400 dark:text-stone-500">{formatNumber(summaryBalanceRobustaDryParchment * bagWeightKg)} KGs</div>
          </div>
        </div>

        {/* Robusta Dry Cherry */}
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card">
          <div className="border-b border-stone-100 px-5 py-3 dark:border-white/[0.05]">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-500">Robusta Dry Cherry</p>
          </div>
          <div className="p-5">
            <div className="text-2xl font-black tabular-nums text-stone-900 dark:text-white">{formatNumber(bagTotals.robusta_dry_cherry_bags)}</div>
            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">Processed nominal: {formatNumber(bagTotals.robusta_dry_cherry_bags * bagWeightKg)} KGs</div>
            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">Dispatched: {formatNumber(dispatchedTotals.robusta_dry_cherry)} bags ({formatNumber(dispatchedTotals.robusta_dry_cherry * bagWeightKg)} KGs)</div>
            <div className="mt-1 text-xs text-stone-400 dark:text-stone-500">Confirmed received: {formatNumber(dispatchReceivedKgsTotals.robusta_dry_cherry)} KGs</div>
            <div className={cn("mt-1 text-sm font-semibold", summaryBalanceRobustaDryCherry < 0 ? "text-rose-600" : "text-emerald-600")}>Balance: {formatNumber(summaryBalanceRobustaDryCherry)} bags</div>
            <div className="text-xs text-stone-400 dark:text-stone-500">{formatNumber(summaryBalanceRobustaDryCherry * bagWeightKg)} KGs</div>
          </div>
        </div>
      </div>}
      </>}
        </div>
      )}

      {/* Add Dispatch Form */}
      {activeSection === "new-dispatch" && <div ref={dispatchFormRef} className="order-1 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card">
        <div className="border-b border-stone-100 px-5 py-4 dark:border-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-800 dark:bg-emerald-900/40">
              <Truck className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-500">Operations</p>
              <p className="mt-0.5 text-lg font-bold text-stone-900 dark:text-white">{editingRecord ? "Edit dispatch entry" : "New dispatch entry"}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-stone-400 dark:text-stone-500">
            {editingRecord
              ? "Update what physically left this location."
              : "Record what physically left this location today. Add confirmed received KGs only when they are known."}
          </p>
          {editingRecord ? (
            <p className="mt-1 text-xs text-emerald-700">
              Editing {formatDateOnly(editingRecord.dispatch_date)} for {getLocationLabel(editingRecord)}.
            </p>
          ) : null}
        </div>
        <div className="p-5">
          <div className="mb-5 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.02]">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Location</p>
              <p className="mt-1 text-sm font-semibold text-stone-800 dark:text-stone-200">
                {selectedLocation?.name || selectedLocation?.code || "Select a location"}
              </p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.02]">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Coffee</p>
              <p className="mt-1 text-sm font-semibold text-stone-800 dark:text-stone-200">{coffeeType}</p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.02]">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Bag type</p>
              <p className="mt-1 text-sm font-semibold text-stone-800 dark:text-stone-200">{formatBagTypeLabel(bagType)}</p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.02]">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Rule</p>
              <p className="mt-1 text-sm font-semibold text-stone-800 dark:text-stone-200">One trip · one location · one stock line</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                  ? "Legacy pooled mode is active, so available stock is shown estate-wide."
                  : "Available stock is calculated for this location."}
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
                  {COFFEE_TYPES.map(ct => (
                    <option key={ct} value={ct}>{ct}</option>
                  ))}
                </select>
              ) : (
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
              )}
            </div>

            {/* Bag Type */}
            <div className="space-y-2">
              <FieldLabel
                label="Bag Type"
                tooltip="Select dry parchment or dry cherry to match processing output."
              />
              {isMobile ? (
                <select
                  value={bagType}
                  onChange={e => setBagType(e.target.value)}
                  className="w-full h-12 rounded-xl border border-input bg-background px-3 text-base font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {BAG_TYPES.map(bt => (
                    <option key={bt} value={bt}>{bt}</option>
                  ))}
                </select>
              ) : (
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
              )}
              <p className={cn("text-xs", allowedBalance > 0 ? "text-emerald-600" : "text-rose-600")}>
                Available now: {formatNumber(allowedBalance)} bags ({formatNumber(allowedBalance * bagWeightKg)} KGs)
              </p>
              {editAllowance.matchesSelection && (
                <p className="text-xs text-muted-foreground">
                  Editing credit: {formatNumber(editAllowance.allowance)} bags from this record.
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
                type="number" inputMode="decimal"
                step="0.01"
                min={0}
                placeholder="Enter number of bags"
                value={bagsDispatched}
                onKeyDown={blockInvalidNumberKey}
                onChange={handleNonNegativeChange(setBagsDispatched)}
                max={Math.max(0, allowedBalance)}
                className={cn(isMobile && "h-12 text-base")}
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
                label="Confirmed received KGs"
                tooltip="Actual received weight from the buyer or warehouse for reconciliation."
              />
              <Input
                ref={kgsReceivedInputRef}
                type="number" inputMode="decimal"
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
                  Leave blank until receipt is confirmed. Until then, this stock will not become saleable in Sales.
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2 md:col-span-2">
              <Label>Trip notes</Label>
              <Textarea
                placeholder="Vehicle, buyer pickup note, warehouse reference, or anything worth remembering..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[60px]"
              />
            </div>
          </div>

          <div className={cn("mt-4 flex flex-wrap gap-2", isMobile ? "flex-col" : "justify-end")}>
            {editingRecord && (
              <Button variant="outline" onClick={resetForm} className={cn(isMobile && "h-12 rounded-xl")}>
                Cancel
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={!canSubmitDispatch}
              className={cn("bg-emerald-700 hover:bg-emerald-800", isMobile && "h-14 rounded-2xl text-base w-full")}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {editingRecord ? "Update dispatch" : "Save dispatch"}
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
        </div>
      </div>}

      {/* Dispatch Records Table */}
      {activeSection === "records" && <div ref={recordsRef} className="order-6 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card">
        <div className="border-b border-stone-100 px-5 py-4 dark:border-white/[0.05]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-500">History</p>
              <p className="mt-0.5 flex items-center gap-2 text-lg font-bold text-stone-900 dark:text-white">
                <Package className="h-4 w-4 text-stone-400" />
                Dispatch records
              </p>
              <p className="text-xs text-stone-400 dark:text-stone-500">{resolvedCountLabel}</p>
            </div>
            {showDataToolsControls && (
              <Button variant="outline" size="sm" onClick={exportToCSV} className="bg-transparent">
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            )}
          </div>
          <FilterBar
            className="mt-3"
            search={recordControls.search}
            onSearchChange={recordControls.setSearch}
            searchPlaceholder="Search location, coffee, buyer, notes…"
            sortOptions={[
              { value: "date", label: "Date" },
              { value: "bags", label: "Bags" },
              { value: "location", label: "Location" },
            ]}
            sortValue={recordControls.sortValue}
            onSortChange={recordControls.setSortValue}
            sortDirection={recordControls.sortDirection}
            onSortDirectionChange={recordControls.setSortDirection}
          />
        </div>
        <div className="p-5">
          {recordControls.isFiltering && recordControls.items.length === 0 && !isLoading && dispatchRecords.length > 0 && (
            <p className="py-6 text-center text-sm text-stone-400">No records match your search.</p>
          )}
          {selectedDispatchRecord && (
                <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-sm">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Selected dispatch</p>
                      <p className="font-medium text-foreground">{formatDateOnly(selectedDispatchRecord.dispatch_date)} · {getLocationLabel(selectedDispatchRecord)}</p>
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
            <SkeletonTable rows={5} cols={5} />
          ) : dispatchRecords.length === 0 ? (
            <WorkflowEmptyState
              title="No dispatch records yet"
              description="Start with the first real movement out of a location. Bag type, bag count, and received KGs are enough to begin."
              steps={[
                "Choose the location and coffee type that actually moved today.",
                "Enter the bag type and bag count first, even if received KGs are not confirmed yet.",
                "Update received KGs later when the buyer or mill confirms the final number.",
              ]}
              tip="Dispatch discipline matters because sales stock becomes unreliable if bags leave the estate without a matching dispatch entry."
              askPrompt="How do I record my first dispatch in FarmFlow?"
              primaryAction={{ label: "Use form above", onClick: scrollToEntryForm }}
              secondaryAction={{ label: "Open manuals", href: "/manuals" }}
            />
          ) : (
            <div className="space-y-4">
              <div className="space-y-3 md:hidden">
                {recordControls.items.map((record) => {
                  const receivedKgs = resolveDispatchRecordReceivedKgs(record, bagWeightKg)
                  return (
                    <div
                      key={record.id}
                      className={cn(
                        "rounded-2xl border bg-white p-4 shadow-sm",
                        selectedDispatchRecord?.id === record.id ? "border-emerald-200 bg-emerald-50/30" : "border-black/[0.06]",
                      )}
                      onClick={() => setSelectedDispatchRecord(record)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-base font-bold text-stone-900">{formatDateOnly(record.dispatch_date)}</p>
                          <p className="text-xs text-stone-400 mt-0.5">{getLocationLabel(record)}</p>
                        </div>
                        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">
                          {record.coffee_type}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-stone-50 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-stone-400">Type</p>
                          <p className="text-sm font-semibold text-stone-800 mt-0.5">{formatBagTypeLabel(record.bag_type)}</p>
                        </div>
                        <div className="rounded-xl bg-stone-50 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-stone-400">Bags</p>
                          <p className="text-xl font-black text-stone-900 mt-0.5">{formatNumber(Number(record.bags_dispatched) || 0)}</p>
                        </div>
                        <div className="rounded-xl bg-stone-50 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide text-stone-400">Rcvd KGs</p>
                          <p className="text-xl font-black text-emerald-700 mt-0.5">{formatNumber(receivedKgs)}</p>
                        </div>
                      </div>
                      {record.notes ? (
                        <p className="mt-2 text-xs text-stone-400 italic">{record.notes}</p>
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
                          className="h-10 flex-1 rounded-xl border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
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
                    <TableRow className="bg-emerald-900 hover:bg-emerald-900">
                      <TableHead className="text-emerald-300 font-bold text-[11px] uppercase tracking-[0.16em]">Date</TableHead>
                      <TableHead className="text-emerald-300 font-bold text-[11px] uppercase tracking-[0.16em]">Location</TableHead>
                      <TableHead className="text-emerald-300 font-bold text-[11px] uppercase tracking-[0.16em]">Coffee</TableHead>
                      <TableHead className="text-emerald-300 font-bold text-[11px] uppercase tracking-[0.16em]">Bag type</TableHead>
                      <TableHead className="text-right text-emerald-300 font-bold text-[11px] uppercase tracking-[0.16em]">Bags</TableHead>
                      <TableHead className="text-right text-emerald-300 font-bold text-[11px] uppercase tracking-[0.16em]">KGs received</TableHead>
                      <TableHead className="text-emerald-300 font-bold text-[11px] uppercase tracking-[0.16em]">Notes</TableHead>
                      <TableHead className="text-right text-emerald-300 font-bold text-[11px] uppercase tracking-[0.16em]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recordControls.items.map((record) => (
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
        </div>
      </div>}
    </WorkspacePageShell>
  )
}
