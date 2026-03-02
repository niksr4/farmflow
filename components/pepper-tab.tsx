"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CalendarIcon, Download, Loader2, Save, Leaf, Edit, Trash2 } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { getCurrentFiscalYear, getAvailableFiscalYears, type FiscalYear } from "@/lib/fiscal-year-utils"
import { formatDateOnly } from "@/lib/date-utils"
import { formatNumber } from "@/lib/format"
import { useAuth } from "@/hooks/use-auth"

interface LocationOption {
  id: string
  name: string
  code: string
}

interface PepperRecord {
  id: number
  process_date: string
  kg_picked: number
  green_pepper: number
  green_pepper_percent: number
  dry_pepper: number
  dry_pepper_percent: number
  notes: string
  recorded_by: string
  created_at: string
  updated_at: string
  location_id?: string | null
  location_name?: string | null
  location_code?: string | null
}

const LOCATION_ALL = "all"
const LOCATION_UNASSIGNED = "unassigned"
const UNASSIGNED_LABEL = "Unassigned (legacy)"

export function PepperTab() {
  const { user } = useAuth()
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<FiscalYear>(getCurrentFiscalYear())
  const availableFiscalYears = getAvailableFiscalYears()

  const [locations, setLocations] = useState<LocationOption[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState(LOCATION_ALL)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [kgPicked, setKgPicked] = useState("")
  const [greenPepper, setGreenPepper] = useState("")
  const [dryPepper, setDryPepper] = useState("")
  const [notes, setNotes] = useState("")
  const [recentRecords, setRecentRecords] = useState<PepperRecord[]>([])
  const [selectedPepperRecord, setSelectedPepperRecord] = useState<PepperRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [hasExistingRecord, setHasExistingRecord] = useState(false)
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null)
  const [isDeletingRecordId, setIsDeletingRecordId] = useState<number | null>(null)
  const selectedLocation = locations.find((loc) => loc.id === selectedLocationId) || null
  const canDeleteRecord = user?.role === "admin" || user?.role === "owner"
  const showLocationColumn = selectedLocationId === LOCATION_ALL || selectedLocationId === LOCATION_UNASSIGNED

  const loadLocations = useCallback(async () => {
    try {
      const response = await fetch("/api/locations")
      const data = await response.json()
      if (data.success) {
        setLocations(data.locations || [])
        setSelectedLocationId((prev) => prev || LOCATION_ALL)
      }
    } catch (error) {
      console.error("Error fetching locations:", error)
    }
  }, [])

  // Calculate percentages
  const greenPepperPercent =
    kgPicked && greenPepper ? ((Number.parseFloat(greenPepper) / Number.parseFloat(kgPicked)) * 100).toFixed(2) : "0.00"
  const dryPepperPercent =
    greenPepper && dryPepper
      ? ((Number.parseFloat(dryPepper) / Number.parseFloat(greenPepper)) * 100).toFixed(2)
      : "0.00"

  // Fetch recent records
  const fetchRecentRecords = useCallback(async () => {
    if (!selectedLocationId) return
    setLoading(true)
    try {
      const locationParam =
        selectedLocationId === LOCATION_ALL
          ? ""
          : `&locationId=${encodeURIComponent(selectedLocationId)}`
      const response = await fetch(
        `/api/pepper-records?fiscalYearStart=${selectedFiscalYear.startDate}&fiscalYearEnd=${selectedFiscalYear.endDate}${locationParam}`,
      )
      const data = await response.json()

      if (data.success) {
        setRecentRecords(data.records || [])
      }
    } catch (error) {
      console.error("Error fetching pepper records:", error)
    } finally {
      setLoading(false)
    }
  }, [selectedFiscalYear.endDate, selectedFiscalYear.startDate, selectedLocationId])

  // Fetch record for selected date
  const fetchRecordForDate = useCallback(async (date: Date) => {
    if (!selectedLocationId) return
    if (selectedLocationId === LOCATION_ALL || selectedLocationId === LOCATION_UNASSIGNED) {
      setKgPicked("")
      setGreenPepper("")
      setDryPepper("")
      setNotes("")
      setHasExistingRecord(false)
      setEditingRecordId(null)
      return
    }
    try {
      const dateStr = format(date, "yyyy-MM-dd")
      const response = await fetch(
        `/api/pepper-records?locationId=${selectedLocationId}&date=${dateStr}`,
      )
      const data = await response.json()

      if (data.success && data.record) {
        const record = data.record
        setKgPicked(record.kg_picked?.toString() || "")
        setGreenPepper(record.green_pepper?.toString() || "")
        setDryPepper(record.dry_pepper?.toString() || "")
        setNotes(record.notes || "")
        setHasExistingRecord(true)
        setEditingRecordId(Number(record.id) || null)
      } else {
        // Clear form for new entry
        setKgPicked("")
        setGreenPepper("")
        setDryPepper("")
        setNotes("")
        setHasExistingRecord(false)
        setEditingRecordId(null)
      }
    } catch (error) {
      console.error("Error fetching record:", error)
    }
  }, [selectedLocationId])

  // Load recent records when location changes
  useEffect(() => {
    loadLocations()
  }, [loadLocations])

  useEffect(() => {
    fetchRecentRecords()
  }, [fetchRecentRecords])

  useEffect(() => {
    if (!recentRecords.length) {
      setSelectedPepperRecord(null)
      return
    }
    setSelectedPepperRecord((prev) => {
      if (!prev) return recentRecords[0]
      return recentRecords.find((record) => record.id === prev.id) || recentRecords[0]
    })
  }, [recentRecords])

  // Load record when date changes
  useEffect(() => {
    fetchRecordForDate(selectedDate)
  }, [selectedDate, fetchRecordForDate])

  const handleSave = async () => {
    if (!selectedLocationId || selectedLocationId === LOCATION_ALL || selectedLocationId === LOCATION_UNASSIGNED) {
      setMessage({ type: "error", text: "Select a specific location to save a record" })
      return
    }
    // Require only KG Picked and Green Pepper; dry weight can be entered later
    if (!kgPicked || !greenPepper) {
      setMessage({ type: "error", text: "Please fill in required fields: KG Picked and Green Pepper" })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      const response = await fetch("/api/pepper-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingRecordId || undefined,
          locationId: selectedLocationId,
          process_date: format(selectedDate, "yyyy-MM-dd"),
          kg_picked: Number.parseFloat(kgPicked),
          green_pepper: Number.parseFloat(greenPepper),
          green_pepper_percent: Number.parseFloat(greenPepperPercent),
          // dry weight is optional; send 0 when empty so backend keeps consistent numeric type
          dry_pepper: dryPepper ? Number.parseFloat(dryPepper) : 0,
          dry_pepper_percent: dryPepper ? Number.parseFloat(dryPepperPercent) : 0,
          notes,
          recorded_by: "user",
        }),
      })

      const data = await response.json()

      if (data.success) {
        setMessage({ type: "success", text: "Record saved successfully!" })
        setHasExistingRecord(true)
        setEditingRecordId(Number(data.record?.id) || editingRecordId)
        fetchRecentRecords()
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save record" })
      }
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Failed to save record" })
    } finally {
      setSaving(false)
    }
  }

  const handleExportCSV = () => {
    if (recentRecords.length === 0) return

    const headers = showLocationColumn
      ? ["Location", "Date", "KG Picked", "Green Pepper", "Green %", "Dry Pepper", "Dry %", "Notes"]
      : ["Date", "KG Picked", "Green Pepper", "Green %", "Dry Pepper", "Dry %", "Notes"]
    const rows = recentRecords.map((record) => {
      const row = [
        format(new Date(record.process_date), "yyyy-MM-dd"),
        record.kg_picked,
        record.green_pepper,
        record.green_pepper_percent,
        record.dry_pepper,
        record.dry_pepper_percent,
        record.notes || "",
      ]
      if (showLocationColumn) {
        const locationLabel =
          record.location_name || record.location_code || (record.location_id ? "Unknown" : UNASSIGNED_LABEL)
        return [locationLabel, ...row]
      }
      return row
    })

    const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `pepper-${(selectedLocation?.name || "estate").toLowerCase().replace(" ", "-")}-${format(
      new Date(),
      "yyyy-MM-dd",
    )}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const loadRecord = (record: PepperRecord) => {
    setSelectedPepperRecord(record)
    if (record.location_id && (selectedLocationId === LOCATION_ALL || selectedLocationId === LOCATION_UNASSIGNED)) {
      setSelectedLocationId(record.location_id)
    }
    setSelectedDate(new Date(record.process_date))
    setKgPicked(record.kg_picked.toString())
    setGreenPepper(record.green_pepper.toString())
    setDryPepper(record.dry_pepper.toString())
    setNotes(record.notes || "")
    setHasExistingRecord(true)
    setEditingRecordId(record.id)
  }

  const handleDeleteRecord = async (record: PepperRecord) => {
    if (!canDeleteRecord) return
    if (!window.confirm(`Delete pepper record for ${formatDateOnly(record.process_date)}?`)) {
      return
    }

    setIsDeletingRecordId(record.id)
    setMessage(null)
    try {
      const response = await fetch(`/api/pepper-records?id=${record.id}`, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete record")
      }

      setMessage({ type: "success", text: "Record deleted successfully." })
      if (selectedPepperRecord?.id === record.id) {
        setSelectedPepperRecord(null)
        setKgPicked("")
        setGreenPepper("")
        setDryPepper("")
        setNotes("")
        setHasExistingRecord(false)
        setEditingRecordId(null)
      }
      await fetchRecentRecords()
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Failed to delete record" })
    } finally {
      setIsDeletingRecordId(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
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

      {/* Location and Date Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Leaf className="h-5 w-5" />
            Pepper Processing Record
          </CardTitle>
          <CardDescription>Record pepper picking and processing data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Date Picker */}
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? formatDateOnly(selectedDate) : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Location Selector */}
            <div className="space-y-2">
              <Label>Location</Label>
              <Select
                value={selectedLocationId}
                onValueChange={(value) => setSelectedLocationId(value)}
                disabled={locations.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={locations.length ? "Select location" : "No locations"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={LOCATION_ALL}>All locations</SelectItem>
                  <SelectItem value={LOCATION_UNASSIGNED}>{UNASSIGNED_LABEL}</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name || loc.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {locations.length === 0 && (
                <p className="text-xs text-muted-foreground">Add locations in Settings to enable pepper tracking.</p>
              )}
            </div>
          </div>

          {(selectedLocationId === LOCATION_ALL || selectedLocationId === LOCATION_UNASSIGNED) && (
            <Alert>
              <AlertDescription>Select a specific location to add or edit a record.</AlertDescription>
            </Alert>
          )}

          {/* Input Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="kgPicked">KG Picked *</Label>
              <Input
                id="kgPicked"
                type="number"
                step="0.01"
                value={kgPicked}
                onChange={(e) => setKgPicked(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="greenPepper">Green Pepper (KG) *</Label>
              <Input
                id="greenPepper"
                type="number"
                step="0.01"
                value={greenPepper}
                onChange={(e) => setGreenPepper(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label>Green Pepper %</Label>
              <Input value={greenPepperPercent} disabled className="bg-muted" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dryPepper">Dry Pepper (KG) (optional)</Label>
              <Input
                id="dryPepper"
                type="number"
                step="0.01"
                value={dryPepper}
                onChange={(e) => setDryPepper(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Dry Pepper %</Label>
              <Input value={dryPepperPercent} disabled className="bg-muted" />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>
          </div>

          {message && (
            <Alert variant={message.type === "error" ? "destructive" : "default"}>
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
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
          </div>
        </CardContent>
      </Card>

      {/* Recent Records */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Records</CardTitle>
            <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={recentRecords.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
          <CardDescription>Click a row to edit that record</CardDescription>
        </CardHeader>
        <CardContent>
          {selectedPepperRecord && (
            <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Pepper Drill-Down</p>
                  <p className="font-medium text-foreground">
                    {formatDateOnly(selectedPepperRecord.process_date)} ·{" "}
                    {selectedPepperRecord.location_name ||
                      selectedPepperRecord.location_code ||
                      (selectedPepperRecord.location_id ? "Unknown" : UNASSIGNED_LABEL)}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="bg-white" onClick={() => loadRecord(selectedPepperRecord)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit in Form
                </Button>
                {canDeleteRecord && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-white text-rose-700 border-rose-200 hover:bg-rose-50"
                    disabled={isDeletingRecordId === selectedPepperRecord.id}
                    onClick={() => handleDeleteRecord(selectedPepperRecord)}
                  >
                    {isDeletingRecordId === selectedPepperRecord.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Delete
                  </Button>
                )}
              </div>
              <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                <p>Picked: {formatNumber(selectedPepperRecord.kg_picked)} KG</p>
                <p>Green: {formatNumber(selectedPepperRecord.green_pepper)} KG</p>
                <p>Dry: {formatNumber(selectedPepperRecord.dry_pepper)} KG</p>
                <p>Dry Yield: {formatNumber(selectedPepperRecord.dry_pepper_percent)}%</p>
              </div>
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : recentRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No pepper records yet</p>
              <p className="text-sm mt-2">Log the first picking to start tracking conversions.</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    {showLocationColumn && <TableHead className="sticky top-0 bg-muted/60">Location</TableHead>}
                    <TableHead className="sticky top-0 bg-muted/60">Date</TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/60">KG Picked</TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/60">Green Pepper</TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/60">Green %</TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/60">Dry Pepper</TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/60">Dry %</TableHead>
                    <TableHead className="sticky top-0 bg-muted/60">Notes</TableHead>
                    <TableHead className="sticky top-0 bg-muted/60 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentRecords.map((record, index) => (
                    <TableRow
                      key={record.id}
                      className={cn(
                        "cursor-pointer hover:bg-muted/50",
                        index % 2 === 0 ? "bg-white" : "bg-muted/20",
                        selectedPepperRecord?.id === record.id ? "border-emerald-200 bg-emerald-50/60" : "",
                      )}
                      onClick={() => loadRecord(record)}
                    >
                      {showLocationColumn && (
                        <TableCell>
                          {record.location_name ||
                            record.location_code ||
                            (record.location_id ? "Unknown" : UNASSIGNED_LABEL)}
                        </TableCell>
                      )}
                      <TableCell>{formatDateOnly(record.process_date)}</TableCell>
                      <TableCell className="text-right">{formatNumber(record.kg_picked)}</TableCell>
                      <TableCell className="text-right">{formatNumber(record.green_pepper)}</TableCell>
                      <TableCell className="text-right">{formatNumber(record.green_pepper_percent)}%</TableCell>
                      <TableCell className="text-right">{formatNumber(record.dry_pepper)}</TableCell>
                      <TableCell className="text-right">{formatNumber(record.dry_pepper_percent)}%</TableCell>
                      <TableCell className="max-w-xs truncate">{record.notes || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(event) => {
                              event.stopPropagation()
                              loadRecord(record)
                            }}
                            className="h-8 px-2 text-amber-700"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {canDeleteRecord && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleDeleteRecord(record)
                              }}
                              disabled={isDeletingRecordId === record.id}
                              className="h-8 px-2 text-rose-700"
                            >
                              {isDeletingRecordId === record.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
