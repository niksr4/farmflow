"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
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
import { CalendarIcon, Download, Loader2, Save, Droplets, Edit, Trash2 } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { formatDateOnly } from "@/lib/date-utils"
import { formatNumber } from "@/lib/format"
import { useAuth } from "@/hooks/use-auth"
import TaskGuideCard from "@/components/task-guide-card"

interface LocationOption {
  id: string
  name: string
  code: string
}

interface RubberRecord {
  id: number
  record_date: string
  latex_kg: number
  cup_lump_kg: number
  sheets_kg: number
  sheet_grade: string
  drc_pct: number
  notes: string
  recorded_by: string
  created_at: string
  updated_at: string
  location_id?: string | null
  location_name?: string | null
  location_code?: string | null
}

export const RUBBER_SHEET_GRADES = [
  { value: "RSS1", label: "RSS 1 — Export premium" },
  { value: "RSS2", label: "RSS 2" },
  { value: "RSS3", label: "RSS 3" },
  { value: "RSS4", label: "RSS 4 — Kerala benchmark" },
  { value: "RSS5", label: "RSS 5" },
  { value: "Cup Lump", label: "Cup Lump (unsheted)" },
  { value: "Block", label: "Block rubber / ISNR" },
]

const LOCATION_ALL = "all"
const LOCATION_UNASSIGNED = "unassigned"
const UNASSIGNED_LABEL = "Unassigned (legacy)"

function getGradeLabel(value: string) {
  return RUBBER_SHEET_GRADES.find((g) => g.value === value)?.label ?? value
}

export function RubberTab() {
  const { user } = useAuth()

  const [locations, setLocations] = useState<LocationOption[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState(LOCATION_ALL)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [latexKg, setLatexKg] = useState("")
  const [cupLumpKg, setCupLumpKg] = useState("")
  const [sheetsKg, setSheetsKg] = useState("")
  const [sheetGrade, setSheetGrade] = useState("RSS4")
  const [drcPct, setDrcPct] = useState("")
  const [notes, setNotes] = useState("")
  const [recentRecords, setRecentRecords] = useState<RubberRecord[]>([])
  const [selectedRecord, setSelectedRecord] = useState<RubberRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [hasExistingRecord, setHasExistingRecord] = useState(false)
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null)
  const [isDeletingRecordId, setIsDeletingRecordId] = useState<number | null>(null)

  const selectedLocation = locations.find((loc) => loc.id === selectedLocationId) || null
  const canDeleteRecord = user?.role === "admin" || user?.role === "owner" || user?.role === "user"
  const showLocationColumn = selectedLocationId === LOCATION_ALL || selectedLocationId === LOCATION_UNASSIGNED

  const scrollToEntryForm = useCallback(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }, [])

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

  // Derived ratios — shown read-only alongside form
  const cupLumpYieldPct =
    latexKg && cupLumpKg && Number(latexKg) > 0
      ? ((Number(cupLumpKg) / Number(latexKg)) * 100).toFixed(1)
      : "—"

  const sheetYieldPct =
    cupLumpKg && sheetsKg && Number(cupLumpKg) > 0
      ? ((Number(sheetsKg) / Number(cupLumpKg)) * 100).toFixed(1)
      : "—"

  const fetchRecentRecords = useCallback(async () => {
    if (!selectedLocationId) return
    setLoading(true)
    try {
      const locationParam =
        selectedLocationId === LOCATION_ALL
          ? ""
          : `&locationId=${encodeURIComponent(selectedLocationId)}`
      const response = await fetch(`/api/rubber-records?${locationParam.replace(/^&/, "")}`)
      const data = await response.json()
      if (data.success) setRecentRecords(data.records || [])
    } catch (error) {
      console.error("Error fetching rubber records:", error)
    } finally {
      setLoading(false)
    }
  }, [selectedLocationId])

  const fetchRecordForDate = useCallback(
    async (date: Date) => {
      if (!selectedLocationId) return
      if (selectedLocationId === LOCATION_ALL || selectedLocationId === LOCATION_UNASSIGNED) {
        resetForm()
        return
      }
      try {
        const dateStr = format(date, "yyyy-MM-dd")
        const response = await fetch(
          `/api/rubber-records?locationId=${selectedLocationId}&date=${dateStr}`,
        )
        const data = await response.json()
        if (data.success && data.record) {
          populateForm(data.record)
        } else {
          resetForm()
        }
      } catch (error) {
        console.error("Error fetching record for date:", error)
      }
    },
    [selectedLocationId],
  )

  function resetForm() {
    setLatexKg("")
    setCupLumpKg("")
    setSheetsKg("")
    setSheetGrade("RSS4")
    setDrcPct("")
    setNotes("")
    setHasExistingRecord(false)
    setEditingRecordId(null)
  }

  function populateForm(record: RubberRecord) {
    setLatexKg(record.latex_kg?.toString() || "")
    setCupLumpKg(record.cup_lump_kg?.toString() || "")
    setSheetsKg(record.sheets_kg?.toString() || "")
    setSheetGrade(record.sheet_grade || "RSS4")
    setDrcPct(record.drc_pct?.toString() || "")
    setNotes(record.notes || "")
    setHasExistingRecord(true)
    setEditingRecordId(Number(record.id) || null)
  }

  useEffect(() => { loadLocations() }, [loadLocations])
  useEffect(() => { fetchRecentRecords() }, [fetchRecentRecords])
  useEffect(() => {
    if (!recentRecords.length) { setSelectedRecord(null); return }
    setSelectedRecord((prev) => {
      if (!prev) return recentRecords[0]
      return recentRecords.find((r) => r.id === prev.id) || recentRecords[0]
    })
  }, [recentRecords])
  useEffect(() => { fetchRecordForDate(selectedDate) }, [selectedDate, fetchRecordForDate])

  const handleSave = async () => {
    if (!selectedLocationId || selectedLocationId === LOCATION_ALL || selectedLocationId === LOCATION_UNASSIGNED) {
      setMessage({ type: "error", text: "Select a specific location to save a record" })
      return
    }
    if (!latexKg) {
      setMessage({ type: "error", text: "Latex collected (kg) is required" })
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch("/api/rubber-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingRecordId || undefined,
          locationId: selectedLocationId,
          record_date: format(selectedDate, "yyyy-MM-dd"),
          latex_kg: Number(latexKg),
          cup_lump_kg: cupLumpKg ? Number(cupLumpKg) : 0,
          sheets_kg: sheetsKg ? Number(sheetsKg) : 0,
          sheet_grade: sheetGrade,
          drc_pct: drcPct ? Number(drcPct) : 0,
          notes,
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

  const loadRecord = (record: RubberRecord) => {
    setSelectedRecord(record)
    if (record.location_id && (selectedLocationId === LOCATION_ALL || selectedLocationId === LOCATION_UNASSIGNED)) {
      setSelectedLocationId(record.location_id)
    }
    setSelectedDate(new Date(record.record_date))
    populateForm(record)
    scrollToEntryForm()
  }

  const handleDeleteRecord = async (record: RubberRecord) => {
    if (!canDeleteRecord) return
    if (!window.confirm(`Delete rubber record for ${formatDateOnly(record.record_date)}?`)) return

    setIsDeletingRecordId(record.id)
    setMessage(null)
    try {
      const response = await fetch(`/api/rubber-records?id=${record.id}`, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || "Failed to delete record")

      setMessage({ type: "success", text: "Record deleted." })
      if (selectedRecord?.id === record.id) {
        setSelectedRecord(null)
        resetForm()
      }
      await fetchRecentRecords()
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Failed to delete record" })
    } finally {
      setIsDeletingRecordId(null)
    }
  }

  const handleExportCSV = () => {
    if (!recentRecords.length) return
    const toCsvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const toCsvRow = (values: unknown[]) => values.map(toCsvCell).join(",")

    const rows: string[] = [
      toCsvRow(["Location", "Date", "Latex (kg)", "Cup Lump (kg)", "Cup Lump %", "Sheets (kg)", "Sheet %", "Grade", "DRC %", "Notes"]),
    ]

    const groups = new Map<string, RubberRecord[]>()
    recentRecords.forEach((r) => {
      const loc = r.location_name || r.location_code || (r.location_id ? "Unknown" : UNASSIGNED_LABEL)
      groups.set(loc, [...(groups.get(loc) || []), r])
    })

    const grandTotals = { latex: 0, cupLump: 0, sheets: 0 }

    ;[...groups.keys()].sort((a, b) => a.localeCompare(b)).forEach((loc) => {
      const locRows = [...(groups.get(loc) || [])].sort((a, b) => a.record_date.localeCompare(b.record_date))
      const totals = { latex: 0, cupLump: 0, sheets: 0 }

      locRows.forEach((r) => {
        const latex = Number(r.latex_kg) || 0
        const lump = Number(r.cup_lump_kg) || 0
        const sheets = Number(r.sheets_kg) || 0
        totals.latex += latex
        totals.cupLump += lump
        totals.sheets += sheets
        grandTotals.latex += latex
        grandTotals.cupLump += lump
        grandTotals.sheets += sheets

        rows.push(toCsvRow([
          loc,
          format(new Date(r.record_date), "yyyy-MM-dd"),
          latex.toFixed(2),
          lump.toFixed(2),
          latex > 0 ? ((lump / latex) * 100).toFixed(1) : "0.0",
          sheets.toFixed(2),
          lump > 0 ? ((sheets / lump) * 100).toFixed(1) : "0.0",
          r.sheet_grade || "RSS4",
          (Number(r.drc_pct) || 0).toFixed(1),
          r.notes || "",
        ]))
      })

      rows.push(toCsvRow([
        `TOTAL — ${loc}`, "",
        totals.latex.toFixed(2),
        totals.cupLump.toFixed(2),
        totals.latex > 0 ? ((totals.cupLump / totals.latex) * 100).toFixed(1) : "0.0",
        totals.sheets.toFixed(2),
        totals.cupLump > 0 ? ((totals.sheets / totals.cupLump) * 100).toFixed(1) : "0.0",
        "", "", "",
      ]))
      rows.push("")
    })

    rows.push(toCsvRow([
      "GRAND TOTAL", "",
      grandTotals.latex.toFixed(2),
      grandTotals.cupLump.toFixed(2),
      grandTotals.latex > 0 ? ((grandTotals.cupLump / grandTotals.latex) * 100).toFixed(1) : "0.0",
      grandTotals.sheets.toFixed(2),
      grandTotals.cupLump > 0 ? ((grandTotals.sheets / grandTotals.cupLump) * 100).toFixed(1) : "0.0",
      "", "", "",
    ]))

    const blob = new Blob([rows.join("\n")], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `rubber-${(selectedLocation?.name || "estate").toLowerCase().replace(/\s+/g, "-")}-${format(new Date(), "yyyy-MM-dd")}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <TaskGuideCard
        eyebrow="Rubber guide"
        title="Track daily latex, cup lump, and sheet production"
        description="Record each day's tapping output separately so rubber numbers stay clean from other crops."
        bullets={[
          "Select a specific location before saving — all locations view is read-only.",
          "Enter latex collected first (required). Cup lump and sheets can be added later in the day or next day.",
          "DRC % is optional but useful if your buyer pays on dry rubber content rather than gross weight.",
          "Sheet grade defaults to RSS 4 — the Kerala benchmark. Change it if you produce RSS 1–3 or sell raw cup lump.",
        ]}
        tip="Wintering season (Nov–Feb)? Use the notes field to flag low-flow days — helps explain yield dips in the season view."
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Droplets className="h-5 w-5" />
            Rubber Tapping Record
          </CardTitle>
          <CardDescription>
            Record daily latex collection, coagulation (cup lump), and RSS sheet production
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !selectedDate && "text-muted-foreground")}
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

            <div className="space-y-2">
              <Label>Location</Label>
              <Select
                value={selectedLocationId}
                onValueChange={setSelectedLocationId}
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
                <p className="text-xs text-muted-foreground">Add locations in Settings to enable rubber tracking.</p>
              )}
            </div>
          </div>

          {(selectedLocationId === LOCATION_ALL || selectedLocationId === LOCATION_UNASSIGNED) && (
            <Alert>
              <AlertDescription>Select a specific location to add or edit a record.</AlertDescription>
            </Alert>
          )}

          {/* --- Tapping stage --- */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Tapping — Latex collection
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="latexKg">Latex collected (kg) *</Label>
                <Input
                  id="latexKg"
                  type="number" inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={latexKg}
                  onChange={(e) => setLatexKg(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="drcPct">DRC % (optional)</Label>
                <Input
                  id="drcPct"
                  type="number" inputMode="decimal"
                  step="0.1"
                  min="0"
                  max="100"
                  value={drcPct}
                  onChange={(e) => setDrcPct(e.target.value)}
                  placeholder="e.g. 32"
                />
                <p className="text-xs text-muted-foreground">Dry Rubber Content — fresh latex is usually 28–38%</p>
              </div>
            </div>
          </div>

          {/* --- Coagulation stage --- */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Coagulation — Cup lump
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cupLumpKg">Cup lump produced (kg)</Label>
                <Input
                  id="cupLumpKg"
                  type="number" inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={cupLumpKg}
                  onChange={(e) => setCupLumpKg(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label>Cup lump yield</Label>
                <Input value={cupLumpYieldPct === "—" ? "—" : `${cupLumpYieldPct}%`} disabled className="bg-muted" />
                <p className="text-xs text-muted-foreground">Ratio of cup lump to fresh latex</p>
              </div>
            </div>
          </div>

          {/* --- Sheet production stage --- */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Sheet production — RSS / Cup lump sold
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sheetsKg">Sheets / product weight (kg)</Label>
                <Input
                  id="sheetsKg"
                  type="number" inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={sheetsKg}
                  onChange={(e) => setSheetsKg(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label>Sheet yield from cup lump</Label>
                <Input value={sheetYieldPct === "—" ? "—" : `${sheetYieldPct}%`} disabled className="bg-muted" />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="sheetGrade">Grade / product type</Label>
                <Select value={sheetGrade} onValueChange={setSheetGrade}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RUBBER_SHEET_GRADES.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Weather, tapper, panel issues, wintering notes..."
              rows={3}
            />
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
          {selectedRecord && (
            <div className="mb-4 rounded-xl border border-green-100 bg-green-50/50 p-3 text-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-green-700">Rubber Drill-Down</p>
                  <p className="font-medium text-foreground">
                    {formatDateOnly(selectedRecord.record_date)} ·{" "}
                    {selectedRecord.location_name ||
                      selectedRecord.location_code ||
                      (selectedRecord.location_id ? "Unknown" : UNASSIGNED_LABEL)}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="bg-white" onClick={() => loadRecord(selectedRecord)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit in Form
                </Button>
                {canDeleteRecord && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-white text-rose-700 border-rose-200 hover:bg-rose-50"
                    disabled={isDeletingRecordId === selectedRecord.id}
                    onClick={() => handleDeleteRecord(selectedRecord)}
                  >
                    {isDeletingRecordId === selectedRecord.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Delete
                  </Button>
                )}
              </div>
              <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-5">
                <p>Latex: {formatNumber(selectedRecord.latex_kg)} kg</p>
                <p>Cup lump: {formatNumber(selectedRecord.cup_lump_kg)} kg</p>
                <p>Sheets: {formatNumber(selectedRecord.sheets_kg)} kg</p>
                <p>Grade: {getGradeLabel(selectedRecord.sheet_grade)}</p>
                <p>DRC: {selectedRecord.drc_pct > 0 ? `${formatNumber(selectedRecord.drc_pct)}%` : "—"}</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : recentRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No rubber records yet</p>
              <p className="text-sm mt-2">Log the first tapping to start tracking latex and sheet production.</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    {showLocationColumn && <TableHead className="sticky top-0 bg-muted/60">Location</TableHead>}
                    <TableHead className="sticky top-0 bg-muted/60">Date</TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/60">Latex (kg)</TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/60">Cup Lump (kg)</TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/60">Sheets (kg)</TableHead>
                    <TableHead className="sticky top-0 bg-muted/60">Grade</TableHead>
                    <TableHead className="text-right sticky top-0 bg-muted/60">DRC %</TableHead>
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
                        selectedRecord?.id === record.id ? "border-green-200 bg-green-50/60" : "",
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
                      <TableCell>{formatDateOnly(record.record_date)}</TableCell>
                      <TableCell className="text-right">{formatNumber(record.latex_kg)}</TableCell>
                      <TableCell className="text-right">{formatNumber(record.cup_lump_kg)}</TableCell>
                      <TableCell className="text-right">{formatNumber(record.sheets_kg)}</TableCell>
                      <TableCell>{record.sheet_grade || "RSS4"}</TableCell>
                      <TableCell className="text-right">
                        {record.drc_pct > 0 ? `${formatNumber(record.drc_pct)}%` : "—"}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{record.notes || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); loadRecord(record) }}
                            className="h-8 px-2 text-amber-700"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {canDeleteRecord && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => { e.stopPropagation(); handleDeleteRecord(record) }}
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
