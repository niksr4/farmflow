"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { formatDateOnly } from "@/lib/date-utils"
import { useToast } from "@/hooks/use-toast"

interface JournalEntry {
  id: string
  entry_date: string
  location_id: string | null
  location_name?: string | null
  location_code?: string | null
  plot?: string | null
  title?: string | null
  fertilizer_name?: string | null
  fertilizer_composition?: string | null
  spray_composition?: string | null
  irrigation_done?: boolean | null
  irrigation_notes?: string | null
  notes?: string | null
  created_by?: string | null
  created_at?: string | null
}

interface LocationOption {
  id: string
  name: string
  code?: string | null
}

const LOCATION_ALL = "all"
const LOCATION_NONE = "none"

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10)

const resolveLocationLabel = (entry: JournalEntry) => {
  if (entry.location_name) return entry.location_name
  if (entry.location_code) return entry.location_code
  return "Unassigned"
}

export default function JournalTab() {
  const { toast } = useToast()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [filterLocationId, setFilterLocationId] = useState<string>(LOCATION_ALL)
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    entryDate: toIsoDate(new Date()),
    locationId: LOCATION_NONE,
    plot: "",
    title: "",
    fertilizerName: "",
    fertilizerComposition: "",
    sprayComposition: "",
    irrigationDone: false,
    irrigationNotes: "",
    notes: "",
  })

  const entryDates = useMemo(
    () =>
      entries
        .map((entry) => {
          try {
            return new Date(entry.entry_date)
          } catch {
            return null
          }
        })
        .filter(Boolean) as Date[],
    [entries],
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
      if (loaded.length && form.locationId === LOCATION_NONE) {
        setForm((prev) => ({ ...prev, locationId: loaded[0].id }))
      }
    } catch (error) {
      console.error("Failed to load locations", error)
    }
  }, [form.locationId])

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchTerm.trim()) params.set("q", searchTerm.trim())
      if (selectedDate) params.set("date", toIsoDate(selectedDate))
      if (filterLocationId && filterLocationId !== LOCATION_ALL) {
        params.set("locationId", filterLocationId)
      }
      const response = await fetch(`/api/journal?${params.toString()}`)
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load journal entries")
      }
      setEntries(data.entries || [])
      setTotalCount(Number(data.totalCount) || 0)
    } catch (error: any) {
      console.error("Failed to load journal entries", error)
      toast({ title: "Error", description: error.message || "Failed to load journal entries", variant: "destructive" })
      setEntries([])
      setTotalCount(0)
    } finally {
      setLoading(false)
    }
  }, [filterLocationId, searchTerm, selectedDate, toast])

  useEffect(() => {
    loadLocations()
  }, [loadLocations])

  useEffect(() => {
    const handle = setTimeout(() => {
      fetchEntries()
    }, 200)
    return () => clearTimeout(handle)
  }, [fetchEntries])

  useEffect(() => {
    if (selectedDate) {
      setForm((prev) => ({ ...prev, entryDate: toIsoDate(selectedDate) }))
    }
  }, [selectedDate])

  const resetForm = () => {
    setForm({
      entryDate: selectedDate ? toIsoDate(selectedDate) : toIsoDate(new Date()),
      locationId: locations[0]?.id || LOCATION_NONE,
      plot: "",
      title: "",
      fertilizerName: "",
      fertilizerComposition: "",
      sprayComposition: "",
      irrigationDone: false,
      irrigationNotes: "",
      notes: "",
    })
    setEditingEntry(null)
  }

  const handleSave = async () => {
    if (!form.entryDate) {
      toast({ title: "Missing date", description: "Select a date before saving.", variant: "destructive" })
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        id: editingEntry?.id,
        entry_date: form.entryDate,
        location_id: form.locationId === LOCATION_NONE ? null : form.locationId,
        plot: form.plot,
        title: form.title,
        fertilizer_name: form.fertilizerName,
        fertilizer_composition: form.fertilizerComposition,
        spray_composition: form.sprayComposition,
        irrigation_done: form.irrigationDone,
        irrigation_notes: form.irrigationNotes,
        notes: form.notes,
      }
      const response = await fetch("/api/journal", {
        method: editingEntry ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save journal entry")
      }
      toast({ title: "Saved", description: "Journal entry updated." })
      resetForm()
      fetchEntries()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save entry", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  const handleEdit = (entry: JournalEntry) => {
    setEditingEntry(entry)
    setForm({
      entryDate: entry.entry_date?.slice(0, 10) || toIsoDate(new Date()),
      locationId: entry.location_id || LOCATION_NONE,
      plot: entry.plot || "",
      title: entry.title || "",
      fertilizerName: entry.fertilizer_name || "",
      fertilizerComposition: entry.fertilizer_composition || "",
      sprayComposition: entry.spray_composition || "",
      irrigationDone: Boolean(entry.irrigation_done),
      irrigationNotes: entry.irrigation_notes || "",
      notes: entry.notes || "",
    })
  }

  const handleDelete = async (entry: JournalEntry) => {
    if (!confirm("Delete this journal entry?")) return
    setIsDeletingId(entry.id)
    try {
      const response = await fetch(`/api/journal?id=${entry.id}`, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to delete entry")
      }
      toast({ title: "Deleted", description: "Entry removed." })
      fetchEntries()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete entry", variant: "destructive" })
    } finally {
      setIsDeletingId(null)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Journal Filters</CardTitle>
          <CardDescription>Pick a date and search past notes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            modifiers={{ hasEntry: entryDates }}
            modifiersClassNames={{ hasEntry: "bg-emerald-100 text-emerald-800" }}
          />
          <div className="space-y-2">
            <Label>Location</Label>
            <Select value={filterLocationId} onValueChange={setFilterLocationId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={LOCATION_ALL}>All locations</SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => setSelectedDate(undefined)}>
            Clear Date Filter
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{editingEntry ? "Update Journal Entry" : "New Journal Entry"}</CardTitle>
            <CardDescription>Capture fertilizer mixes, spray compositions, irrigation, and daily notes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.entryDate}
                  onChange={(event) => setForm((prev) => ({ ...prev, entryDate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Select
                  value={form.locationId}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, locationId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={LOCATION_NONE}>No location</SelectItem>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Plot / Block</Label>
                <Input
                  placeholder="e.g., HF A"
                  value={form.plot}
                  onChange={(event) => setForm((prev) => ({ ...prev, plot: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  placeholder="Daily summary"
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Fertilizer</Label>
                <Input
                  placeholder="e.g., 19-19-19"
                  value={form.fertilizerName}
                  onChange={(event) => setForm((prev) => ({ ...prev, fertilizerName: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Fertilizer Composition</Label>
                <Input
                  placeholder="Ratio / mix details"
                  value={form.fertilizerComposition}
                  onChange={(event) => setForm((prev) => ({ ...prev, fertilizerComposition: event.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Spray Composition</Label>
                <Input
                  placeholder="Spray mix details"
                  value={form.sprayComposition}
                  onChange={(event) => setForm((prev) => ({ ...prev, sprayComposition: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center gap-2">
                <input
                  id="irrigation"
                  type="checkbox"
                  checked={form.irrigationDone}
                  onChange={(event) => setForm((prev) => ({ ...prev, irrigationDone: event.target.checked }))}
                />
                <Label htmlFor="irrigation">Irrigation done</Label>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Irrigation notes</Label>
                <Input
                  placeholder="Hours, method, or plot coverage"
                  value={form.irrigationNotes}
                  onChange={(event) => setForm((prev) => ({ ...prev, irrigationNotes: event.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Daily Notes</Label>
                <Textarea
                  rows={4}
                  placeholder="Any daily observations or work completed..."
                  value={form.notes}
                  onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : editingEntry ? "Update Entry" : "Save Entry"}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                Clear Form
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Journal Entries</CardTitle>
            <CardDescription>
              {selectedDate ? `Showing notes for ${formatDateOnly(selectedDate)}` : "Search across all notes"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                placeholder="Search fertilizer, spray, irrigation, notes..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              <Button variant="outline" onClick={() => setSearchTerm("")}>
                Clear Search
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Showing {entries.length} of {totalCount} entries.
            </p>
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading entries...</div>
            ) : entries.length === 0 ? (
              <div className="text-sm text-muted-foreground">No journal entries yet.</div>
            ) : (
              <div className="rounded-lg border divide-y">
                {entries.map((entry) => (
                  <div key={entry.id} className="p-4 space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold">
                          {entry.title || "Daily Note"} - {formatDateOnly(entry.entry_date)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {resolveLocationLabel(entry)}
                          {entry.plot ? ` • ${entry.plot}` : ""}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEdit(entry)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(entry)}
                          disabled={isDeletingId === entry.id}
                        >
                          {isDeletingId === entry.id ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2 text-sm md:grid-cols-2">
                      <div>
                        <span className="text-muted-foreground">Fertilizer:</span>{" "}
                        {entry.fertilizer_name || "-"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Composition:</span>{" "}
                        {entry.fertilizer_composition || "-"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Spray:</span>{" "}
                        {entry.spray_composition || "-"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Irrigation:</span>{" "}
                        {entry.irrigation_done ? "Done" : "Not logged"}
                        {entry.irrigation_notes ? ` - ${entry.irrigation_notes}` : ""}
                      </div>
                    </div>
                    {entry.notes && <p className="text-sm text-muted-foreground">{entry.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
