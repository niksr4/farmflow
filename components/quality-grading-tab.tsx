"use client"

import { useCallback, useEffect, useState } from "react"
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

interface QualityRecord {
  id: number
  grade_date: string
  lot_id: string | null
  coffee_type: string | null
  process_type: string | null
  grade: string | null
  moisture_pct: number | null
  screen_size: string | null
  defects_count: number | null
  defect_notes: string | null
  sample_weight_g: number | null
  outturn_pct: number | null
  cup_score: number | null
  buyer_reference: string | null
  graded_by: string | null
  notes: string | null
}

export default function QualityGradingTab() {
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
  const [grade, setGrade] = useState("")
  const [moisture, setMoisture] = useState("")
  const [screenSize, setScreenSize] = useState("")
  const [defectsCount, setDefectsCount] = useState("")
  const [defectNotes, setDefectNotes] = useState("")
  const [sampleWeight, setSampleWeight] = useState("")
  const [outturnPct, setOutturnPct] = useState("")
  const [cupScore, setCupScore] = useState("")
  const [buyerReference, setBuyerReference] = useState("")
  const [gradedBy, setGradedBy] = useState("")
  const [notes, setNotes] = useState("")

  const [recentRecords, setRecentRecords] = useState<QualityRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

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
        `/api/quality-grading-records?locationId=${selectedLocationId}&fiscalYearStart=${selectedFiscalYear.startDate}&fiscalYearEnd=${selectedFiscalYear.endDate}`,
      )
      const data = await response.json()
      if (data.success) {
        setRecentRecords(data.records || [])
      }
    } catch (error) {
      console.error("Error fetching quality records:", error)
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
          `/api/quality-grading-records?locationId=${selectedLocationId}&date=${dateStr}&lotId=${encodeURIComponent(lotId)}`,
        )
        const data = await response.json()
        if (data.success && data.record) {
          const record = data.record as QualityRecord
          setCoffeeType(record.coffee_type || "")
          setProcessType(record.process_type || "")
          setGrade(record.grade || "")
          setMoisture(record.moisture_pct?.toString() || "")
          setScreenSize(record.screen_size || "")
          setDefectsCount(record.defects_count?.toString() || "")
          setDefectNotes(record.defect_notes || "")
          setSampleWeight(record.sample_weight_g?.toString() || "")
          setOutturnPct(record.outturn_pct?.toString() || "")
          setCupScore(record.cup_score?.toString() || "")
          setBuyerReference(record.buyer_reference || "")
          setGradedBy(record.graded_by || "")
          setNotes(record.notes || "")
        }
      } catch (error) {
        console.error("Error fetching quality record:", error)
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
      toast({ title: "Lot ID required", description: "Enter a lot/batch ID for grading." })
      return
    }

    setSaving(true)
    try {
      const response = await fetch("/api/quality-grading-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: selectedLocationId,
          grade_date: format(selectedDate, "yyyy-MM-dd"),
          lot_id: lotId.trim(),
          coffee_type: coffeeType || null,
          process_type: processType || null,
          grade: grade || null,
          moisture_pct: moisture ? Number(moisture) : null,
          screen_size: screenSize || null,
          defects_count: defectsCount ? Number(defectsCount) : null,
          defect_notes: defectNotes || null,
          sample_weight_g: sampleWeight ? Number(sampleWeight) : null,
          outturn_pct: outturnPct ? Number(outturnPct) : null,
          cup_score: cupScore ? Number(cupScore) : null,
          buyer_reference: buyerReference || null,
          graded_by: gradedBy || user?.username || "system",
          notes,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save record")
      }
      toast({ title: "Saved", description: "Quality record saved successfully." })
      fetchRecentRecords()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save record", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (recordId: number) => {
    if (!confirm("Delete this grading record?")) return
    try {
      const response = await fetch(`/api/quality-grading-records?id=${recordId}`, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete record")
      }
      toast({ title: "Deleted", description: "Quality record removed." })
      fetchRecentRecords()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete record", variant: "destructive" })
    }
  }

  const loadRecord = (record: QualityRecord) => {
    setSelectedDate(new Date(record.grade_date))
    setLotId(record.lot_id || "")
    setCoffeeType(record.coffee_type || "")
    setProcessType(record.process_type || "")
    setGrade(record.grade || "")
    setMoisture(record.moisture_pct?.toString() || "")
    setScreenSize(record.screen_size || "")
    setDefectsCount(record.defects_count?.toString() || "")
    setDefectNotes(record.defect_notes || "")
    setSampleWeight(record.sample_weight_g?.toString() || "")
    setOutturnPct(record.outturn_pct?.toString() || "")
    setCupScore(record.cup_score?.toString() || "")
    setBuyerReference(record.buyer_reference || "")
    setGradedBy(record.graded_by || "")
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
            <CardTitle>Quality & Grading</CardTitle>
            <CardDescription>Capture grading results, defects, and quality scores.</CardDescription>
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
              <Label>Grade</Label>
              <Input value={grade} onChange={(event) => setGrade(event.target.value)} placeholder="AA, AB, PB" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Moisture (%)</Label>
              <Input value={moisture} onChange={(event) => setMoisture(event.target.value)} type="number" />
            </div>
            <div className="space-y-2">
              <Label>Screen Size</Label>
              <Input value={screenSize} onChange={(event) => setScreenSize(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Defects Count</Label>
              <Input value={defectsCount} onChange={(event) => setDefectsCount(event.target.value)} type="number" />
            </div>
            <div className="space-y-2">
              <Label>Sample Weight (g)</Label>
              <Input value={sampleWeight} onChange={(event) => setSampleWeight(event.target.value)} type="number" />
            </div>
            <div className="space-y-2">
              <Label>Outturn (%)</Label>
              <Input value={outturnPct} onChange={(event) => setOutturnPct(event.target.value)} type="number" />
            </div>
            <div className="space-y-2">
              <Label>Cup Score</Label>
              <Input value={cupScore} onChange={(event) => setCupScore(event.target.value)} type="number" />
            </div>
            <div className="space-y-2">
              <Label>Buyer Reference</Label>
              <Input value={buyerReference} onChange={(event) => setBuyerReference(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Graded By</Label>
              <Input value={gradedBy} onChange={(event) => setGradedBy(event.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Defect Notes</Label>
            <Textarea value={defectNotes} onChange={(event) => setDefectNotes(event.target.value)} />
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
          <CardDescription>Latest grading entries for the selected location.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading records...
            </div>
          ) : recentRecords.length === 0 ? (
            <div className="text-sm text-muted-foreground">No grading records yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Moisture</TableHead>
                    <TableHead>Defects</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>{record.grade_date}</TableCell>
                      <TableCell>{record.lot_id || "-"}</TableCell>
                      <TableCell>{record.grade || "-"}</TableCell>
                      <TableCell>{record.moisture_pct ?? "-"}</TableCell>
                      <TableCell>{record.defects_count ?? "-"}</TableCell>
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
