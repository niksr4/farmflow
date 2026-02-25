"use client"

import { useCallback, useEffect, useState, type ChangeEvent, type KeyboardEvent } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FieldLabel } from "@/components/ui/field-label"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CalendarIcon, Loader2, Save, Trash2, Download } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getCurrentFiscalYear, getAvailableFiscalYears, type FiscalYear } from "@/lib/fiscal-year-utils"
import { DEFAULT_COFFEE_VARIETIES } from "@/lib/crop-config"
import { useAuth } from "@/hooks/use-auth"
import { useTenantSettings } from "@/hooks/use-tenant-settings"
import { formatDateOnly } from "@/lib/date-utils"
import { formatNumber } from "@/lib/format"
import { canAcceptNonNegative, isBlockedNumericKey } from "@/lib/number-input"

interface ProcessingRecord {
  id?: number
  lot_id?: string | null
  process_date: string
  crop_today: number | null
  crop_todate: number
  ripe_today: number | null
  ripe_todate: number
  ripe_percent: number
  green_today: number | null
  green_todate: number
  green_percent: number
  float_today: number | null
  float_todate: number
  float_percent: number
  wet_parchment: number | null
  fr_wp_percent: number
  dry_parch: number | null
  dry_p_todate: number
  wp_dp_percent: number
  dry_cherry: number | null
  dry_cherry_todate: number
  dry_cherry_percent: number
  dry_p_bags: number
  dry_p_bags_todate: number
  dry_cherry_bags: number
  dry_cherry_bags_todate: number
  moisture_pct: number | null
  quality_grade: string | null
  defect_notes: string | null
  quality_photo_url: string | null
  notes: string
}

const emptyRecord: Omit<ProcessingRecord, "id"> = {
  lot_id: "",
  process_date: format(new Date(), "yyyy-MM-dd"),
  crop_today: null,
  crop_todate: 0,
  ripe_today: null,
  ripe_todate: 0,
  ripe_percent: 0,
  green_today: null,
  green_todate: 0,
  green_percent: 0,
  float_today: null,
  float_todate: 0,
  float_percent: 0,
  wet_parchment: null,
  fr_wp_percent: 0,
  dry_parch: null,
  dry_p_todate: 0,
  wp_dp_percent: 0,
  dry_cherry: null,
  dry_cherry_todate: 0,
  dry_cherry_percent: 0,
  dry_p_bags: 0,
  dry_p_bags_todate: 0,
  dry_cherry_bags: 0,
  dry_cherry_bags_todate: 0,
  moisture_pct: null,
  quality_grade: "",
  defect_notes: "",
  quality_photo_url: "",
  notes: "",
}

interface DashboardData {
  location: string
  coffeeType: string
  cropToDate: number
  ripeToDate: number
  greenToDate: number
  floatToDate: number
  wetParchmentToDate: number
  dryPToDate: number
  dryCherryToDate: number
  dryPBagsToDate: number
  dryCherryBagsToDate: number
  isTotal?: boolean
  isGrandTotal?: boolean
}

interface LocationOption {
  id: string
  name: string
  code: string
}

const COFFEE_TYPES = DEFAULT_COFFEE_VARIETIES

type ProcessingTabProps = {
  showDataToolsControls?: boolean
}

export default function ProcessingTab({ showDataToolsControls = false }: ProcessingTabProps) {
  const { user } = useAuth()
  const { settings } = useTenantSettings()
  const bagWeightKg = Number(settings.bagWeightKg) || 50
  const canDelete = user?.role === "admin" || user?.role === "owner"
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<FiscalYear>(getCurrentFiscalYear())
  const availableFiscalYears = getAvailableFiscalYears()

  const [date, setDate] = useState<Date>(new Date())
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<string>("")
  const [coffeeType, setCoffeeType] = useState<string>(COFFEE_TYPES[0])
  const [record, setRecord] = useState<Omit<ProcessingRecord, "id">>(emptyRecord)
  const [hasExistingRecord, setHasExistingRecord] = useState(false)
  const [previousRecord, setPreviousRecord] = useState<ProcessingRecord | null>(null)
  const [recentRecords, setRecentRecords] = useState<ProcessingRecord[]>([])
  const [selectedRecentRecord, setSelectedRecentRecord] = useState<ProcessingRecord | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingRecords, setIsLoadingRecords] = useState(false)
  const [isLoadingMoreRecords, setIsLoadingMoreRecords] = useState(false)
  const [recordsPage, setRecordsPage] = useState(0)
  const [recordsTotalCount, setRecordsTotalCount] = useState(0)
  const [hasMoreRecords, setHasMoreRecords] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [dashboardData, setDashboardData] = useState<DashboardData[]>([])
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false)
  const { toast } = useToast()
  const recordsPageSize = 25

  const selectedLocation = locations.find((loc) => loc.id === selectedLocationId) || null

  const loadLocations = useCallback(async () => {
    try {
      const response = await fetch("/api/locations")
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load locations")
      }
      const loaded = data.locations || []
      setLocations(loaded)
      if (loaded.length > 0) {
        setSelectedLocationId((prev) => prev || loaded[0].id)
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load locations", variant: "destructive" })
    }
  }, [toast])

  const autoCalculateFields = useCallback(() => {
    setRecord((prev) => {
      const updated = { ...prev }

      const cropToday = Number(prev.crop_today) || 0
      const ripeToday = Number(prev.ripe_today) || 0
      const greenToday = Number(prev.green_today) || 0
      const floatToday = Number(prev.float_today) || 0
      const wetParchment = Number(prev.wet_parchment) || 0
      const dryParch = Number(prev.dry_parch) || 0
      const dryCherry = Number(prev.dry_cherry) || 0

      if (previousRecord) {
        const prevCropTodate = Number(previousRecord.crop_todate) || 0
        const prevRipeTodate = Number(previousRecord.ripe_todate) || 0
        const prevGreenTodate = Number(previousRecord.green_todate) || 0
        const prevFloatTodate = Number(previousRecord.float_todate) || 0
        const prevDryPTodate = Number(previousRecord.dry_p_todate) || 0
        const prevDryCherryTodate = Number(previousRecord.dry_cherry_todate) || 0
        const prevDryPBagsTodate = Number(previousRecord.dry_p_bags_todate) || 0
        const prevDryCherryBagsTodate = Number(previousRecord.dry_cherry_bags_todate) || 0

        updated.crop_todate = Number.parseFloat((prevCropTodate + cropToday).toFixed(2))
        updated.ripe_todate = Number.parseFloat((prevRipeTodate + ripeToday).toFixed(2))
        updated.green_todate = Number.parseFloat((prevGreenTodate + greenToday).toFixed(2))
        updated.float_todate = Number.parseFloat((prevFloatTodate + floatToday).toFixed(2))
        updated.dry_p_todate = Number.parseFloat((prevDryPTodate + dryParch).toFixed(2))
        updated.dry_cherry_todate = Number.parseFloat((prevDryCherryTodate + dryCherry).toFixed(2))

        const dryPBags = Number.parseFloat((dryParch / bagWeightKg).toFixed(2))
        const dryCherryBags = Number.parseFloat((dryCherry / bagWeightKg).toFixed(2))

        updated.dry_p_bags = dryPBags
        updated.dry_cherry_bags = dryCherryBags
        updated.dry_p_bags_todate = Number.parseFloat((prevDryPBagsTodate + dryPBags).toFixed(2))
        updated.dry_cherry_bags_todate = Number.parseFloat((prevDryCherryBagsTodate + dryCherryBags).toFixed(2))
      } else {
        updated.crop_todate = cropToday
        updated.ripe_todate = ripeToday
        updated.green_todate = greenToday
        updated.float_todate = floatToday
        updated.dry_p_todate = dryParch
        updated.dry_cherry_todate = dryCherry

        updated.dry_p_bags = Number.parseFloat((dryParch / bagWeightKg).toFixed(2))
        updated.dry_cherry_bags = Number.parseFloat((dryCherry / bagWeightKg).toFixed(2))
        updated.dry_p_bags_todate = updated.dry_p_bags
        updated.dry_cherry_bags_todate = updated.dry_cherry_bags
      }

      if (cropToday > 0) {
        updated.ripe_percent = Number.parseFloat(((ripeToday / cropToday) * 100).toFixed(2))
        updated.green_percent = Number.parseFloat(((greenToday / cropToday) * 100).toFixed(2))
        updated.float_percent = Number.parseFloat(((floatToday / cropToday) * 100).toFixed(2))
        const greenPlusFloat = greenToday + floatToday
        if (greenPlusFloat > 0) {
          updated.dry_cherry_percent = Number.parseFloat(((dryCherry * 100) / greenPlusFloat).toFixed(2))
        } else {
          updated.dry_cherry_percent = 0
        }
      } else {
        updated.ripe_percent = 0
        updated.green_percent = 0
        updated.float_percent = 0
        updated.dry_cherry_percent = 0
      }

      if (ripeToday > 0) {
        updated.fr_wp_percent = Number.parseFloat(((wetParchment / ripeToday) * 100).toFixed(2))
      } else {
        updated.fr_wp_percent = 0
      }

      if (wetParchment > 0) {
        updated.wp_dp_percent = Number.parseFloat(((dryParch / wetParchment) * 100).toFixed(2))
      } else {
        updated.wp_dp_percent = 0
      }

      return updated
    })
  }, [bagWeightKg, previousRecord])

  const loadRecentRecords = useCallback(async (pageIndex = 0, append = false) => {
    if (!selectedLocationId) {
      return
    }
    if (append) {
      setIsLoadingMoreRecords(true)
    } else {
      setIsLoadingRecords(true)
    }
    try {
      const params = new URLSearchParams({
        locationId: selectedLocationId,
        coffeeType,
        fiscalYearStart: selectedFiscalYear.startDate,
        fiscalYearEnd: selectedFiscalYear.endDate,
        limit: recordsPageSize.toString(),
        offset: String(pageIndex * recordsPageSize),
      })
      const url = `/api/processing-records?${params.toString()}`

      const response = await fetch(url)
      const responseText = await response.text()
      let data: any = null
      try {
        data = responseText ? JSON.parse(responseText) : null
      } catch {
        data = null
      }


      if (!response.ok) {
        console.error("Processing API error:", response.status, responseText)
        setRecentRecords([])
        toast({
          title: "Error",
          description: responseText || `Failed to load recent records (${response.status})`,
          variant: "destructive",
        })
        return
      }

      if (data?.success) {
        if (Array.isArray(data.records)) {
          const nextTotalCount = Number(data.totalCount) || 0
          setRecordsTotalCount(nextTotalCount)
          setRecentRecords((prev) => {
            const nextRecords = append ? [...prev, ...data.records] : data.records
            const hasMore = nextTotalCount ? nextRecords.length < nextTotalCount : data.records.length === recordsPageSize
            setHasMoreRecords(hasMore)
            return nextRecords
          })
          setRecordsPage(pageIndex)
        } else {
          console.warn("data.records is not an array:", data.records)
          setRecentRecords([])
          setHasMoreRecords(false)
        }
      } else {
        console.error("API returned success: false", data)
        setRecentRecords([])
        setHasMoreRecords(false)
        if (data?.error) {
          toast({
            title: "Error",
            description: data.error,
            variant: "destructive",
          })
        }
      }
    } catch (error) {
      console.error("Error loading recent records:", error)
      setRecentRecords([])
      setHasMoreRecords(false)
      toast({
        title: "Error",
        description: "Failed to load recent records",
        variant: "destructive",
      })
    } finally {
      if (append) {
        setIsLoadingMoreRecords(false)
      } else {
        setIsLoadingRecords(false)
      }
    }
  }, [
    coffeeType,
    recordsPageSize,
    selectedFiscalYear.endDate,
    selectedFiscalYear.startDate,
    selectedLocationId,
    toast,
  ])

  const loadRecordForDate = useCallback(async (selectedDate: Date) => {
    if (!selectedLocationId) {
      setRecord({ ...emptyRecord, process_date: format(selectedDate, "yyyy-MM-dd") })
      setHasExistingRecord(false)
      return
    }
    setIsLoading(true)
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd")

      const response = await fetch(
        `/api/processing-records?date=${dateStr}&locationId=${selectedLocationId}&coffeeType=${encodeURIComponent(
          coffeeType,
        )}`,
      )
      const data = await response.json()


      if (data.success && data.record) {
        const record = data.record
        const nonNumericFields = new Set([
          "process_date",
          "notes",
          "lot_id",
          "quality_grade",
          "defect_notes",
          "quality_photo_url",
        ])
        Object.keys(record).forEach((key) => {
          if (
            typeof record[key] === "string" &&
            !isNaN(Number(record[key])) &&
            !nonNumericFields.has(key)
          ) {
            record[key] = Number(record[key])
          }
        })
        setRecord(record)
        setHasExistingRecord(true)
      } else {
        setRecord({ ...emptyRecord, process_date: dateStr })
        setHasExistingRecord(false)
      }

      const previousResponse = await fetch(
        `/api/processing-records?beforeDate=${dateStr}&locationId=${selectedLocationId}&coffeeType=${encodeURIComponent(
          coffeeType,
        )}`,
      )
      const previousData = await previousResponse.json()

      if (previousData?.success && previousData.record) {
        const prevRecord = previousData.record
        const nonNumericFields = new Set([
          "process_date",
          "notes",
          "lot_id",
          "quality_grade",
          "defect_notes",
          "quality_photo_url",
        ])
        Object.keys(prevRecord).forEach((key) => {
          if (
            typeof prevRecord[key] === "string" &&
            !isNaN(Number(prevRecord[key])) &&
            !nonNumericFields.has(key)
          ) {
            prevRecord[key] = Number(prevRecord[key])
          }
        })

        setPreviousRecord(prevRecord)
      } else {
        setPreviousRecord(null)
      }
    } catch (error: any) {
      console.error("Error loading record:", error)
      toast({
        title: "Error",
        description: "Failed to load processing record",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [coffeeType, selectedLocationId, toast])

  const loadDashboardData = useCallback(async () => {
    setIsLoadingDashboard(true)
    try {
      const { startDate, endDate } = selectedFiscalYear
      const response = await fetch(
        `/api/processing-records?summary=dashboard&fiscalYearStart=${startDate}&fiscalYearEnd=${endDate}`,
      )
      const data = await response.json()

      if (!data.success || !Array.isArray(data.records)) {
        setDashboardData([])
        return
      }
      const results: DashboardData[] = data.records.map((rec: any) => {
        const locationLabel = rec.location_name || rec.location_code || "Estate"
        const coffeeType = String(rec.coffee_type || "Unknown")
        const label = `${locationLabel} ${coffeeType}`.trim()
        return {
          location: label,
          coffeeType,
          cropToDate: Number(rec.crop_total) || 0,
          ripeToDate: Number(rec.ripe_total) || 0,
          greenToDate: Number(rec.green_total) || 0,
          floatToDate: Number(rec.float_total) || 0,
          wetParchmentToDate: Number(rec.wet_parchment_total) || 0,
          dryPToDate: Number(rec.dry_parch_total) || 0,
          dryCherryToDate: Number(rec.dry_cherry_total) || 0,
          dryPBagsToDate: Number(rec.dry_p_bags_total) || 0,
          dryCherryBagsToDate: Number(rec.dry_cherry_bags_total) || 0,
        }
      })

      const sumRows = (rows: DashboardData[], label: string, coffeeType: string, isGrandTotal = false): DashboardData => ({
        location: label,
        coffeeType,
        cropToDate: rows.reduce((acc, row) => acc + row.cropToDate, 0),
        ripeToDate: rows.reduce((acc, row) => acc + row.ripeToDate, 0),
        greenToDate: rows.reduce((acc, row) => acc + row.greenToDate, 0),
        floatToDate: rows.reduce((acc, row) => acc + row.floatToDate, 0),
        wetParchmentToDate: rows.reduce((acc, row) => acc + row.wetParchmentToDate, 0),
        dryPToDate: rows.reduce((acc, row) => acc + row.dryPToDate, 0),
        dryCherryToDate: rows.reduce((acc, row) => acc + row.dryCherryToDate, 0),
        dryPBagsToDate: rows.reduce((acc, row) => acc + row.dryPBagsToDate, 0),
        dryCherryBagsToDate: rows.reduce((acc, row) => acc + row.dryCherryBagsToDate, 0),
        isTotal: true,
        isGrandTotal,
      })

      const typeGroups = results.reduce<Record<string, DashboardData[]>>((acc, row) => {
        const key = row.coffeeType.toLowerCase()
        if (!acc[key]) acc[key] = []
        acc[key].push(row)
        return acc
      }, {})
      const typeKeys = Object.keys(typeGroups)
      const totals: DashboardData[] = []
      if (typeKeys.length > 1) {
        if (typeGroups.arabica) totals.push(sumRows(typeGroups.arabica, "Total Arabica", "Arabica"))
        if (typeGroups.robusta) totals.push(sumRows(typeGroups.robusta, "Total Robusta", "Robusta"))
      }
      if (results.length > 0) {
        totals.push(sumRows(results, "Total All (All Types)", "All", true))
      }

      setDashboardData(results.length > 0 ? [...results, ...totals] : results)
    } catch (error) {
      console.error("Error loading dashboard data:", error)
      toast({
        title: "Error",
        description: "Failed to load dashboard data",
        variant: "destructive",
      })
    } finally {
      setIsLoadingDashboard(false)
    }
  }, [selectedFiscalYear, toast])

  useEffect(() => {
    loadLocations()
  }, [loadLocations])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  useEffect(() => {
    if (selectedLocationId) {
      loadRecentRecords(0, false)
    }
  }, [selectedLocationId, loadRecentRecords])

  useEffect(() => {
    if (!recentRecords.length) {
      setSelectedRecentRecord(null)
      return
    }
    setSelectedRecentRecord((prev) => {
      if (!prev) return recentRecords[0]
      return (
        recentRecords.find(
          (recordItem) => recordItem.id === prev.id && recordItem.process_date === prev.process_date,
        ) || recentRecords[0]
      )
    })
  }, [recentRecords])

  useEffect(() => {
    if (selectedLocationId) {
      loadRecordForDate(date)
    } else {
      setRecord({ ...emptyRecord, process_date: format(date, "yyyy-MM-dd") })
      setHasExistingRecord(false)
    }
  }, [date, selectedLocationId, loadRecordForDate])

  useEffect(() => {
    autoCalculateFields()
  }, [
    record.crop_today,
    record.ripe_today,
    record.green_today,
    record.float_today,
    record.wet_parchment,
    record.dry_parch,
    record.dry_cherry,
    previousRecord,
    autoCalculateFields,
  ])

  const handleSave = async () => {
    if (!selectedLocationId) {
      toast({
        title: "Estate not ready",
        description: "Add a location in Neon before saving records.",
        variant: "destructive",
      })
      return
    }
    setIsSaving(true)
    try {
      const response = await fetch("/api/processing-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...record, locationId: selectedLocationId, coffeeType }),
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Success",
          description: `Processing record saved successfully for ${selectedLocation?.name || "estate"}`,
        })
        setHasExistingRecord(true)

        await loadRecentRecords(0, false)
        await loadDashboardData()

        const nextDay = new Date(date)
        nextDay.setDate(nextDay.getDate() + 1)
        setDate(nextDay)
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      console.error("Save error:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to save processing record",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this record?")) return

    try {
      const response = await fetch(
        `/api/processing-records?date=${record.process_date}&locationId=${selectedLocationId}&coffeeType=${encodeURIComponent(
          coffeeType,
        )}`,
        {
          method: "DELETE",
        },
      )

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Success",
          description: "Record deleted successfully",
        })
        setRecord({ ...emptyRecord, process_date: format(date, "yyyy-MM-dd") })
        setHasExistingRecord(false)
        loadRecentRecords(0, false)
      } else {
        throw new Error(data.error)
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete record",
        variant: "destructive",
      })
    }
  }

  const loadMoreRecords = async () => {
    if (isLoadingMoreRecords || isLoadingRecords || !hasMoreRecords) {
      return
    }
    await loadRecentRecords(recordsPage + 1, true)
  }

  const handleExportCSV = async () => {
    if (!selectedLocationId) {
      toast({
        title: "Estate not ready",
        description: "Add a location in Neon before exporting.",
        variant: "destructive",
      })
      return
    }
    setIsExporting(true)
    try {
      const response = await fetch(
        `/api/processing-records?locationId=${selectedLocationId}&coffeeType=${encodeURIComponent(
          coffeeType,
        )}&all=true`,
      )
      const data = await response.json()

      let records: ProcessingRecord[] = []

      if (data.success && Array.isArray(data.records)) {
        records = data.records
      } else {
        throw new Error("No records to export")
      }

      if (records.length === 0) {
        toast({
          title: "No Data",
          description: "No records available to export",
          variant: "destructive",
        })
        return
      }

      records.sort((a, b) => new Date(a.process_date).getTime() - new Date(b.process_date).getTime())

      let cumulativeCrop = 0
      let cumulativeRipe = 0
      let cumulativeGreen = 0
      let cumulativeFloat = 0
      let cumulativeWetParchment = 0
      let cumulativeDryP = 0
      let cumulativeDryCherry = 0
      let cumulativeDryPBags = 0
      let cumulativeDryCherryBags = 0

      const processedRecords = records.map((rec) => {
        cumulativeCrop += Number(rec.crop_today) || 0
        cumulativeRipe += Number(rec.ripe_today) || 0
        cumulativeGreen += Number(rec.green_today) || 0
        cumulativeFloat += Number(rec.float_today) || 0
        cumulativeWetParchment += Number(rec.wet_parchment) || 0
        cumulativeDryP += Number(rec.dry_parch) || 0
        cumulativeDryCherry += Number(rec.dry_cherry) || 0
        cumulativeDryPBags += Number(rec.dry_p_bags) || 0
        cumulativeDryCherryBags += Number(rec.dry_cherry_bags) || 0

        return {
          ...rec,
          crop_todate: cumulativeCrop,
          ripe_todate: cumulativeRipe,
          green_todate: cumulativeGreen,
          float_todate: cumulativeFloat,
          wet_parchment_todate: cumulativeWetParchment,
          dry_p_todate: cumulativeDryP,
          dry_cherry_todate: cumulativeDryCherry,
          dry_p_bags_todate: cumulativeDryPBags,
          dry_cherry_bags_todate: cumulativeDryCherryBags,
        }
      })

      const headers = [
        "Date",
        "Lot ID",
        "Crop Today (kg)",
        "Crop To Date (kg)",
        "Ripe Today (kg)",
        "Ripe To Date (kg)",
        "Ripe %",
        "Green Today (kg)",
        "Green To Date (kg)",
        "Green %",
        "Float Today (kg)",
        "Float To Date (kg)",
        "Float %",
        "Wet Parchment (kg)",
        "Wet Parchment To-Date (kg)",
        "FR-WP %",
        "Dry Parchment (kg)",
        "Dry Parchment To Date (kg)",
        "WP-DP %",
        "Dry Cherry (kg)",
        "Dry Cherry To Date (kg)",
        "Dry Cherry %",
        "Dry Parchment Bags",
        "Dry Parchment Bags To Date",
        "Dry Cherry Bags",
        "Dry Cherry Bags To Date",
        "Moisture %",
        "Quality Grade",
        "Defect Notes",
        "Quality Photo URL",
        "Notes",
      ]

      const rows = processedRecords.map((rec: any) => [
        formatDateOnly(rec.process_date),
        rec.lot_id || "",
        rec.crop_today ?? "",
        rec.crop_todate,
        rec.ripe_today ?? "",
        rec.ripe_todate,
        rec.ripe_percent,
        rec.green_today ?? "",
        rec.green_todate,
        rec.green_percent,
        rec.float_today ?? "",
        rec.float_todate,
        rec.float_percent,
        rec.wet_parchment ?? "",
        rec.wet_parchment_todate,
        rec.fr_wp_percent,
        rec.dry_parch ?? "",
        rec.dry_p_todate,
        rec.wp_dp_percent,
        rec.dry_cherry ?? "",
        rec.dry_cherry_todate,
        rec.dry_cherry_percent,
        rec.dry_p_bags,
        rec.dry_p_bags_todate,
        rec.dry_cherry_bags,
        rec.dry_cherry_bags_todate,
        rec.moisture_pct ?? "",
        `"${String(rec.quality_grade || "").replace(/"/g, '""')}"`,
        `"${String(rec.defect_notes || "").replace(/"/g, '""')}"`,
        `"${String(rec.quality_photo_url || "").replace(/"/g, '""')}"`,
        `"${(rec.notes || "").replace(/"/g, '""')}"`,
      ])

      const csvContent = [headers.join(","), ...rows.map((row: any[]) => row.join(","))].join("\n")

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
      const link = document.createElement("a")
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute(
        "download",
        `${(selectedLocation?.name || "estate").replace(/\s+/g, "-")}-${coffeeType.toLowerCase()}-processing-records-${format(
          new Date(),
          "yyyy-MM-dd",
        )}.csv`,
      )
      link.style.visibility = "hidden"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast({
        title: "Success",
        description: `Processing records exported to CSV for ${selectedLocation?.name || "location"}`,
      })
    } catch (error: any) {
      console.error("Export error:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to export CSV",
        variant: "destructive",
      })
    } finally {
      setIsExporting(false)
    }
  }

  const updateField = (field: keyof ProcessingRecord, value: number | string | null) => {
    setRecord((prev) => ({ ...prev, [field]: value }))
  }
  const blockInvalidNumberKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isBlockedNumericKey(event.key)) {
      event.preventDefault()
    }
  }
  const handleNonNegativeFloat =
    (field: keyof ProcessingRecord) => (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value
      if (!canAcceptNonNegative(nextValue)) return
      updateField(field, nextValue === "" ? null : Number.parseFloat(nextValue))
    }

  return (
    <div className="container mx-auto space-y-8 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      {/* Fiscal Year Selector */}
      <Card className="border-border/70 bg-white/80">
        <CardHeader>
          <CardTitle>Fiscal Year</CardTitle>
          <CardDescription>Select the accounting year to view (April 1 - March 31)</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* Processing Dashboard */}
      <Card className="border-border/70 bg-white/80">
        <CardHeader>
          <CardTitle>Processing Dashboard</CardTitle>
          <CardDescription>
            Cumulative &quot;To Date&quot; values for all processing locations. Compare KPIs in Season View
            against the &quot;Total All (All Types)&quot; row.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingDashboard ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Loading dashboard...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold sticky top-0 bg-muted/70 backdrop-blur">Location</TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/70 backdrop-blur">Crop To Date (kg)</TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/70 backdrop-blur">Ripe To Date (kg)</TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/70 backdrop-blur">Green To Date (kg)</TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/70 backdrop-blur">Float To Date (kg)</TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/70 backdrop-blur">WP To Date (kg)</TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/70 backdrop-blur">
                      Dry Parchment To Date (kg)
                    </TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/70 backdrop-blur">
                      Dry Cherry To Date (kg)
                    </TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/70 backdrop-blur">
                      Dry Parchment Bags To Date
                    </TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/70 backdrop-blur">
                      Dry Cherry Bags To Date
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboardData.map((data) => (
                    <TableRow
                      key={data.location}
                      className={cn(
                        data.isGrandTotal && "border-t-2 border-emerald-200 font-semibold bg-emerald-50/70",
                        data.isTotal && "border-t-2 border-border/70 font-semibold bg-muted/50",
                      )}
                    >
                      <TableCell className="font-medium">{data.location}</TableCell>
                      <TableCell className="text-right">{formatNumber(data.cropToDate)}</TableCell>
                      <TableCell className="text-right">{formatNumber(data.ripeToDate)}</TableCell>
                      <TableCell className="text-right">{formatNumber(data.greenToDate)}</TableCell>
                      <TableCell className="text-right">{formatNumber(data.floatToDate)}</TableCell>
                      <TableCell className="text-right">{formatNumber(data.wetParchmentToDate)}</TableCell>
                      <TableCell className="text-right">{formatNumber(data.dryPToDate)}</TableCell>
                      <TableCell className="text-right">{formatNumber(data.dryCherryToDate)}</TableCell>
                      <TableCell className="text-right">{formatNumber(data.dryPBagsToDate)}</TableCell>
                      <TableCell className="text-right">{formatNumber(data.dryCherryBagsToDate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Processing Records */}
      <Card className="border-border/70 bg-white/80">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Processing Records</CardTitle>
              <CardDescription>Track daily coffee processing from cherry to final bags</CardDescription>
            </div>
            {showDataToolsControls && (
              <Button onClick={handleExportCSV} disabled={isExporting} variant="outline">
                {isExporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Export to CSV
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name || loc.code || "Unnamed location"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Coffee Type</Label>
              <Select value={coffeeType} onValueChange={setCoffeeType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
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
            <div className="space-y-2">
              <FieldLabel
                label="Lot ID"
                tooltip="Use the lot or batch ID that will carry through dispatch and sales."
              />
              <Input
                value={record.lot_id ?? ""}
                onChange={(e) => updateField("lot_id", e.target.value)}
                placeholder="e.g. LOT-2026-001"
              />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? formatDateOnly(date) : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus />
                  </PopoverContent>
                </Popover>
                {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
            </div>
          </div>

          {!isLoading && selectedLocationId && (
            <>
              <Card className="border-border/60 bg-white/80">
                <CardHeader>
                  <CardTitle className="text-lg">Crop</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div>
                    <FieldLabel
                      label="Crop Today (kg)"
                      tooltip="Total cherry received today before sorting."
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={record.crop_today ?? ""}
                      onKeyDown={blockInvalidNumberKey}
                      onChange={handleNonNegativeFloat("crop_today")}
                      placeholder="Enter crop today"
                    />
                  </div>
                  <div>
                    <Label>Crop To Date (kg)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={record.crop_todate}
                      disabled
                      className="bg-muted/60 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Auto-calculated</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-white/80">
                <CardHeader>
                  <CardTitle className="text-lg">Ripe Cherry</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <FieldLabel
                      label="Ripe Today (kg)"
                      tooltip="Ripe cherry selected for washed processing."
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={record.ripe_today ?? ""}
                      onKeyDown={blockInvalidNumberKey}
                      onChange={handleNonNegativeFloat("ripe_today")}
                      placeholder="Enter ripe today"
                    />
                  </div>
                  <div>
                    <Label>Ripe To Date (kg)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={record.ripe_todate}
                      disabled
                      className="bg-muted/60 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Auto-calculated</p>
                  </div>
                  <div>
                    <Label>Ripe %</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={record.ripe_percent}
                      disabled
                      className="bg-muted/60 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Auto-calculated</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-white/80">
                <CardHeader>
                  <CardTitle className="text-lg">Green Cherry</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <FieldLabel
                      label="Green Today (kg)"
                      tooltip="Under-ripe cherry separated from ripe intake."
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={record.green_today ?? ""}
                      onKeyDown={blockInvalidNumberKey}
                      onChange={handleNonNegativeFloat("green_today")}
                      placeholder="Enter green today"
                    />
                  </div>
                  <div>
                    <Label>Green To Date (kg)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={record.green_todate}
                      disabled
                      className="bg-muted/60 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Auto-calculated</p>
                  </div>
                  <div>
                    <Label>Green %</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={record.green_percent}
                      disabled
                      className="bg-muted/60 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Auto-calculated</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-white/80">
                <CardHeader>
                  <CardTitle className="text-lg">Float</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <FieldLabel
                      label="Float Today (kg)"
                      tooltip="Low-density floaters removed during water sorting."
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={record.float_today ?? ""}
                      onKeyDown={blockInvalidNumberKey}
                      onChange={handleNonNegativeFloat("float_today")}
                      placeholder="Enter float today"
                    />
                  </div>
                  <div>
                    <Label>Float To Date (kg)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={record.float_todate}
                      disabled
                      className="bg-muted/60 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Auto-calculated</p>
                  </div>
                  <div>
                    <Label>Float %</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={record.float_percent}
                      disabled
                      className="bg-muted/60 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Auto-calculated</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-white/80">
                <CardHeader>
                  <CardTitle className="text-lg">Wet Parchment</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <FieldLabel
                      label="Wet Parchment (kg)"
                      tooltip="Weight after pulping, fermentation, and washing."
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={record.wet_parchment ?? ""}
                      onKeyDown={blockInvalidNumberKey}
                      onChange={handleNonNegativeFloat("wet_parchment")}
                      placeholder="Enter wet parchment"
                    />
                  </div>
                  <div>
                    <Label>FR-WP %</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={record.fr_wp_percent}
                      disabled
                      className="bg-muted/60 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Auto-calculated (WP/Ripe Today)</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-white/80">
                <CardHeader>
                  <CardTitle className="text-lg">Dry Parchment</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <FieldLabel
                      label="Dry Parchment (kg)"
                      tooltip="Weight after drying to storage moisture."
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={record.dry_parch ?? ""}
                      onKeyDown={blockInvalidNumberKey}
                      onChange={handleNonNegativeFloat("dry_parch")}
                      placeholder="Enter dry parch"
                    />
                  </div>
                  <div>
                    <Label>Dry Parchment To Date (kg)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={record.dry_p_todate}
                      disabled
                      className="bg-muted/60 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Auto-calculated</p>
                  </div>
                  <div>
                    <Label>WP-DP %</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={record.wp_dp_percent}
                      disabled
                      className="bg-muted/60 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Auto-calculated (DP/WP)</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-white/80">
                <CardHeader>
                  <CardTitle className="text-lg">Dry Cherry</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <FieldLabel
                      label="Dry Cherry (kg)"
                      tooltip="Natural-process dried cherry weight."
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={record.dry_cherry ?? ""}
                      onKeyDown={blockInvalidNumberKey}
                      onChange={handleNonNegativeFloat("dry_cherry")}
                      placeholder="Enter dry cherry"
                    />
                  </div>
                  <div>
                    <Label>Dry Cherry To Date (kg)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={record.dry_cherry_todate}
                      disabled
                      className="bg-muted/60 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Auto-calculated</p>
                  </div>
                  <div>
                    <Label>Dry Cherry %</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={record.dry_cherry_percent}
                      disabled
                      className="bg-muted/60 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Auto-calculated</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-white/80">
                <CardHeader>
                  <CardTitle className="text-lg">Bags</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Dry Parchment Bags</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={record.dry_p_bags}
                      disabled
                      className="bg-muted/60 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Auto-calculated (kg/{bagWeightKg})</p>
                  </div>
                  <div>
                    <Label>Dry Parchment Bags To Date</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={record.dry_p_bags_todate}
                      disabled
                      className="bg-muted/60 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Auto-calculated</p>
                  </div>
                  <div>
                    <Label>Dry Cherry Bags</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={record.dry_cherry_bags}
                      disabled
                      className="bg-muted/60 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Auto-calculated (kg/{bagWeightKg})</p>
                  </div>
                  <div>
                    <Label>Dry Cherry Bags To Date</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={record.dry_cherry_bags_todate}
                      disabled
                      className="bg-muted/60 text-muted-foreground cursor-not-allowed"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Auto-calculated</p>
                  </div>
                </CardContent>
              </Card>

              <div>
                <Label>Notes</Label>
                <Textarea
                  value={record.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                  placeholder="Additional notes about today's processing..."
                  rows={3}
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      {hasExistingRecord ? "Update Record" : "Save Record"}
                    </>
                  )}
                </Button>
                {hasExistingRecord && canDelete && (
                  <Button variant="destructive" onClick={handleDelete}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Recent Records */}
      <Card className="border-border/70 bg-white/80">
        <CardHeader>
          <CardTitle>Recent Records</CardTitle>
          <CardDescription>
            {isLoadingRecords
              ? "Loading..."
              : recordsTotalCount > recentRecords.length
                ? `Showing ${recentRecords.length} of ${recordsTotalCount} record(s)`
                : `${recentRecords.length} record(s) found`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingRecords ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Loading recent records...</span>
            </div>
          ) : recentRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No processing records yet</p>
              <p className="text-sm mt-2">
                Start by logging today’s intake and output so dispatch and sales stay aligned.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedRecentRecord && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-sm">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Record Drill-Down</p>
                      <p className="font-medium text-foreground">
                        {formatDateOnly(selectedRecentRecord.process_date)}
                        {selectedRecentRecord.lot_id ? ` · Lot ${selectedRecentRecord.lot_id}` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDate(new Date(selectedRecentRecord.process_date))}
                      className="bg-white"
                    >
                      Open in Form
                    </Button>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                    <p>Crop: {formatNumber(Number(selectedRecentRecord.crop_today) || 0)} kg</p>
                    <p>Ripe: {formatNumber(Number(selectedRecentRecord.ripe_today) || 0)} kg</p>
                    <p>Dry Parchment: {formatNumber(Number(selectedRecentRecord.dry_parch) || 0)} kg</p>
                    <p>Dry Cherry: {formatNumber(Number(selectedRecentRecord.dry_cherry) || 0)} kg</p>
                  </div>
                  <div className="mt-1 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                    <p>DP Bags: {formatNumber(Number(selectedRecentRecord.dry_p_bags) || 0)}</p>
                    <p>Cherry Bags: {formatNumber(Number(selectedRecentRecord.dry_cherry_bags) || 0)}</p>
                    <p>Moisture: {selectedRecentRecord.moisture_pct != null ? `${formatNumber(Number(selectedRecentRecord.moisture_pct), 2)}%` : "-"}</p>
                    <p>Quality: {selectedRecentRecord.quality_grade || "-"}</p>
                  </div>
                </div>
              )}
              {recentRecords.map((rec) => (
                <Button
                  key={rec.id}
                  variant="outline"
                  className={cn(
                    "w-full justify-start border-border/60 bg-white/70 text-left hover:bg-muted/40",
                    selectedRecentRecord?.id === rec.id && selectedRecentRecord?.process_date === rec.process_date
                      ? "border-emerald-200 bg-emerald-50/60"
                      : "",
                  )}
                  onClick={() => {
                    setSelectedRecentRecord(rec)
                    setDate(new Date(rec.process_date))
                  }}
                >
                  <div className="flex justify-between w-full">
                    <span>{formatDateOnly(rec.process_date)}</span>
                    <span className="text-muted-foreground">
                      {rec.lot_id ? `Lot: ${rec.lot_id} | ` : ""}
                      Crop: {rec.crop_today ?? 0}kg | Bags: {rec.dry_p_bags}
                      {rec.quality_grade ? ` | Grade: ${rec.quality_grade}` : ""}
                      {rec.moisture_pct ? ` | Moisture: ${rec.moisture_pct}%` : ""}
                    </span>
                  </div>
                </Button>
              ))}
              {hasMoreRecords && (
                <div className="flex justify-center pt-2">
                  <Button variant="outline" size="sm" onClick={loadMoreRecords} disabled={isLoadingMoreRecords}>
                    {isLoadingMoreRecords ? "Loading..." : "Load more"}
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
