"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Loader2, Save, Trash2 } from "lucide-react"
import { format } from "date-fns"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/use-auth"
import { getAvailableFiscalYears, getCurrentFiscalYear, type FiscalYear } from "@/lib/fiscal-year-utils"

interface LocationOption {
  id: string
  name: string
  code: string
}

interface CuringRecord {
  id: number
  process_date: string
  lot_id: string | null
  coffee_type: string | null
  process_type: string | null
  intake_kg: number | null
  intake_bags: number | null
  moisture_start_pct: number | null
  moisture_end_pct: number | null
  drying_days: number | null
  output_kg: number | null
  output_bags: number | null
  loss_kg: number | null
  storage_bin: string | null
  notes: string | null
  location_name?: string | null
  location_code?: string | null
}

export default function CuringTab() {
  const { user } = useAuth()
  const { toast } = useToast()
  const isAdmin = user?.role === "admin" || user?.role === "owner"

  const [selectedFiscalYear, setSelectedFiscalYear] = useState<FiscalYear>(getCurrentFiscalYear())
  const availableFiscalYears = getAvailableFiscalYears()

  const [locations, setLocations] = useState<LocationOption[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState("")
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [lotId, setLotId] = useState("")
  const [coffeeType, setCoffeeType] = useState("")
  const [processType, setProcessType] = useState("")
  const [intakeKg, setIntakeKg] = useState("")
  const [intakeBags, setIntakeBags] = useState("")
  const [moistureStart, setMoistureStart] = useState("")
  const [moistureEnd, setMoistureEnd] = useState("")
  const [dryingDays, setDryingDays] = useState("")
  const [outputKg, setOutputKg] = useState("")
  const [outputBags, setOutputBags] = useState("")
  const [lossKg, setLossKg] = useState("")
  const [storageBin, setStorageBin] = useState("")
  const [notes, setNotes] = useState("")

  const [recentRecords, setRecentRecords] = useState<CuringRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const selectedLocation = locations.find((loc) => loc.id === selectedLocationId) || null

  const calculatedLoss = useMemo(() => {
    const intake = Number(intakeKg)
    const output = Number(outputKg)
    if (Number.isFinite(intake) && Number.isFinite(output) && intake > 0) {
      return (intake - output).toFixed(2)
    }
    return ""
  }, [intakeKg, outputKg])

  const loadLocations = useCallback(async () => {
    try {
      const response = await fetch("/api/locations")
      const data = await response.json()
      if (data.success) {
        setLocations(data.locations || [])
        if (data.locations?.length) {
          setSelectedLocationId((prev) => prev || data.locations[0].id)
        }
      }
    } catch (error) {
      console.error("Error fetching locations:", error)
    }
  }, [])

  const fetchRecentRecords = useCallback(async () => {
    if (!selectedLocationId) return
    setLoading(true)
    try {
      const response = await fetch(
        `/api/curing-records?locationId=${selectedLocationId}&fiscalYearStart=${selectedFiscalYear.startDate}&fiscalYearEnd=${selectedFiscalYear.endDate}`,
      )
      const data = await response.json()
      if (data.success) {
        setRecentRecords(data.records || [])
      }
    } catch (error) {
      console.error("Error fetching curing records:", error)
    } finally {
      setLoading(false)
    }
  }, [selectedFiscalYear.endDate, selectedFiscalYear.startDate, selectedLocationId])

  const fetchRecordForDate = useCallback(
    async (date: Date) => {
      if (!selectedLocationId || !lotId.trim()) return
      try {
        const dateStr = format(date, "yyyy-MM-dd")
        const response = await fetch(
          `/api/curing-records?locationId=${selectedLocationId}&date=${dateStr}&lotId=${encodeURIComponent(lotId)}`,
        )
        const data = await response.json()
        if (data.success && data.record) {
          const record = data.record as CuringRecord
          setCoffeeType(record.coffee_type || "")
          setProcessType(record.process_type || "")
          setIntakeKg(record.intake_kg?.toString() || "")
          setIntakeBags(record.intake_bags?.toString() || "")
          setMoistureStart(record.moisture_start_pct?.toString() || "")
          setMoistureEnd(record.moisture_end_pct?.toString() || "")
          setDryingDays(record.drying_days?.toString() || "")
          setOutputKg(record.output_kg?.toString() || "")
          setOutputBags(record.output_bags?.toString() || "")
          setLossKg(record.loss_kg?.toString() || "")
          setStorageBin(record.storage_bin || "")
          setNotes(record.notes || "")
        }
      } catch (error) {
        console.error("Error fetching curing record:", error)
      }
    },
    [lotId, selectedLocationId],
  )

  useEffect(() => {
    loadLocations()
  }, [loadLocations])

  useEffect(() => {
    fetchRecentRecords()
  }, [fetchRecentRecords])

  useEffect(() => {
    if (lotId.trim()) {
      fetchRecordForDate(selectedDate)
    }
  }, [fetchRecordForDate, lotId, selectedDate])

  const handleSave = async () => {
    if (!selectedLocationId) {
      toast({ title: "Location required", description: "Select a location before saving.", variant: "destructive" })
      return
    }
    if (!lotId.trim()) {
      toast({ title: "Lot ID required", description: "Enter a lot/batch ID for curing." })
      return
    }

    setSaving(true)
    try {
      const response = await fetch("/api/curing-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: selectedLocationId,
          process_date: format(selectedDate, "yyyy-MM-dd"),
          lot_id: lotId.trim(),
          coffee_type: coffeeType || null,
          process_type: processType || null,
          intake_kg: intakeKg ? Number(intakeKg) : null,
          intake_bags: intakeBags ? Number(intakeBags) : null,
          moisture_start_pct: moistureStart ? Number(moistureStart) : null,
          moisture_end_pct: moistureEnd ? Number(moistureEnd) : null,
          drying_days: dryingDays ? Number(dryingDays) : null,
          output_kg: outputKg ? Number(outputKg) : null,
          output_bags: outputBags ? Number(outputBags) : null,
          loss_kg: lossKg ? Number(lossKg) : calculatedLoss ? Number(calculatedLoss) : null,
          storage_bin: storageBin || null,
          notes,
          recorded_by: user?.username || "system",
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save record")
      }
      toast({ title: "Saved", description: "Curing record saved successfully." })
      fetchRecentRecords()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save record", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (recordId: number) => {
    if (!confirm("Delete this curing record?")) return
    try {
      const response = await fetch(`/api/curing-records?id=${recordId}`, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete record")
      }
      toast({ title: "Deleted", description: "Curing record removed." })
      fetchRecentRecords()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete record", variant: "destructive" })
    }
  }

  const loadRecord = (record: CuringRecord) => {
    setSelectedDate(new Date(record.process_date))
    setLotId(record.lot_id || "")
    setCoffeeType(record.coffee_type || "")
    setProcessType(record.process_type || "")
    setIntakeKg(record.intake_kg?.toString() || "")
    setIntakeBags(record.intake_bags?.toString() || "")
    setMoistureStart(record.moisture_start_pct?.toString() || "")
    setMoistureEnd(record.moisture_end_pct?.toString() || "")
    setDryingDays(record.drying_days?.toString() || "")
    setOutputKg(record.output_kg?.toString() || "")
    setOutputBags(record.output_bags?.toString() || "")
    setLossKg(record.loss_kg?.toString() || "")
    setStorageBin(record.storage_bin || "")
    setNotes(record.notes || "")
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
            <SelectTrigger className="w-[200px]">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Curing & Drying</CardTitle>
            <CardDescription>Track drying bed progress, moisture drop, and outturn.</CardDescription>
          </div>
          <Badge variant="outline" className="text-xs">Module (opt-in)</Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name || loc.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    {format(selectedDate, "yyyy-MM-dd")}
                    <CalendarIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="p-0">
                  <Calendar mode="single" selected={selectedDate} onSelect={(d) => d && setSelectedDate(d)} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Lot / Batch ID</Label>
              <Input value={lotId} onChange={(event) => setLotId(event.target.value)} placeholder="LOT-001" />
            </div>
            <div className="space-y-2">
              <Label>Coffee Type</Label>
              <Input value={coffeeType} onChange={(event) => setCoffeeType(event.target.value)} placeholder="Arabica" />
            </div>
            <div className="space-y-2">
              <Label>Process Type</Label>
              <Input value={processType} onChange={(event) => setProcessType(event.target.value)} placeholder="Washed" />
            </div>
            <div className="space-y-2">
              <Label>Storage Bin</Label>
              <Input value={storageBin} onChange={(event) => setStorageBin(event.target.value)} placeholder="Drying Bay A" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Input (KG)</Label>
              <Input value={intakeKg} onChange={(event) => setIntakeKg(event.target.value)} type="number" />
            </div>
            <div className="space-y-2">
              <Label>Input (Bags)</Label>
              <Input value={intakeBags} onChange={(event) => setIntakeBags(event.target.value)} type="number" />
            </div>
            <div className="space-y-2">
              <Label>Moisture Start (%)</Label>
              <Input value={moistureStart} onChange={(event) => setMoistureStart(event.target.value)} type="number" />
            </div>
            <div className="space-y-2">
              <Label>Moisture End (%)</Label>
              <Input value={moistureEnd} onChange={(event) => setMoistureEnd(event.target.value)} type="number" />
            </div>
            <div className="space-y-2">
              <Label>Drying Days</Label>
              <Input value={dryingDays} onChange={(event) => setDryingDays(event.target.value)} type="number" />
            </div>
            <div className="space-y-2">
              <Label>Output (KG)</Label>
              <Input value={outputKg} onChange={(event) => setOutputKg(event.target.value)} type="number" />
            </div>
            <div className="space-y-2">
              <Label>Output (Bags)</Label>
              <Input value={outputBags} onChange={(event) => setOutputBags(event.target.value)} type="number" />
            </div>
            <div className="space-y-2">
              <Label>Loss (KG)</Label>
              <Input
                value={lossKg || calculatedLoss}
                onChange={(event) => setLossKg(event.target.value)}
                type="number"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Record
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Records</CardTitle>
          <CardDescription>Latest curing entries for {selectedLocation?.name || "estate"}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading records...
            </div>
          ) : recentRecords.length === 0 ? (
            <div className="text-sm text-muted-foreground">No curing records yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Input (KG)</TableHead>
                    <TableHead>Output (KG)</TableHead>
                    <TableHead>Moisture End</TableHead>
                    <TableHead>Loss</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>{record.process_date}</TableCell>
                      <TableCell>{record.lot_id || "-"}</TableCell>
                      <TableCell>{record.intake_kg ?? "-"}</TableCell>
                      <TableCell>{record.output_kg ?? "-"}</TableCell>
                      <TableCell>{record.moisture_end_pct ?? "-"}</TableCell>
                      <TableCell>{record.loss_kg ?? "-"}</TableCell>
                      <TableCell className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => loadRecord(record)}>
                          Load
                        </Button>
                        {isAdmin && (
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(record.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
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
