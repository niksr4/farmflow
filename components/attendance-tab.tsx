"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, Loader2, PlusCircle, RotateCcw, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateOnly } from "@/lib/date-utils"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"

type AttendanceWorker = {
  id: string
  name: string
}

type AttendanceSummaryRow = {
  workerId: string
  name: string
  daysPresent: number
}

const getTodayInputValue = () => new Date().toISOString().split("T")[0]

const buildWeekLabel = (startDate: string | null, endDate: string | null) => {
  if (!startDate || !endDate) return "Current week"
  return `${formatDateOnly(startDate)} to ${formatDateOnly(endDate)}`
}

export default function AttendanceTab() {
  const [selectedDate, setSelectedDate] = useState(getTodayInputValue())
  const [workers, setWorkers] = useState<AttendanceWorker[]>([])
  const [presentWorkerIds, setPresentWorkerIds] = useState<string[]>([])
  const [weeklySummary, setWeeklySummary] = useState<AttendanceSummaryRow[]>([])
  const [weekStartDate, setWeekStartDate] = useState<string | null>(null)
  const [weekEndDate, setWeekEndDate] = useState<string | null>(null)
  const [newWorkerName, setNewWorkerName] = useState("")
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isAddingWorker, setIsAddingWorker] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadAttendanceSnapshot = useCallback(async (date: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ date })
      const response = await fetch(`/api/attendance?${params.toString()}`, { cache: "no-store" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to load attendance")
      }

      setWorkers(Array.isArray(data.workers) ? data.workers : [])
      setPresentWorkerIds(Array.isArray(data.presentWorkerIds) ? data.presentWorkerIds : [])
      setWeeklySummary(Array.isArray(data.weeklySummary) ? data.weeklySummary : [])
      setWeekStartDate(String(data.weekStartDate || ""))
      setWeekEndDate(String(data.weekEndDate || ""))
      setError(null)
    } catch (loadError: any) {
      setWorkers([])
      setPresentWorkerIds([])
      setWeeklySummary([])
      setWeekStartDate(null)
      setWeekEndDate(null)
      setError(loadError?.message || "Failed to load attendance")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAttendanceSnapshot(selectedDate)
  }, [loadAttendanceSnapshot, selectedDate])

  const presentWorkerIdSet = useMemo(() => new Set(presentWorkerIds), [presentWorkerIds])
  const presentCount = presentWorkerIds.length

  const toggleWorkerPresence = (workerId: string) => {
    setPresentWorkerIds((current) => {
      const next = new Set(current)
      if (next.has(workerId)) {
        next.delete(workerId)
      } else {
        next.add(workerId)
      }
      return Array.from(next)
    })
  }

  const handleSaveAttendance = async () => {
    setIsSaving(true)
    try {
      const response = await fetch("/api/attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          presentWorkerIds,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to save attendance")
      }

      toast.success(`Attendance saved for ${formatDateOnly(selectedDate)}`)
      await loadAttendanceSnapshot(selectedDate)
    } catch (saveError: any) {
      toast.error(saveError?.message || "Failed to save attendance")
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddWorker = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newWorkerName.trim()) return

    setIsAddingWorker(true)
    try {
      const response = await fetch("/api/attendance/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newWorkerName }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to add employee")
      }

      toast.success(`${data.worker?.name || "Employee"} added`)
      setNewWorkerName("")
      await loadAttendanceSnapshot(selectedDate)
    } catch (workerError: any) {
      toast.error(workerError?.message || "Failed to add employee")
    } finally {
      setIsAddingWorker(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-xl sm:text-2xl">Attendance</CardTitle>
            <CardDescription>Morning muster for estate staff, with weekly days-present totals.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{workers.length} employees</Badge>
            <Badge variant="outline">{presentCount} present</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleAddWorker} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-2">
              <Label htmlFor="attendance-worker-name">Add employee</Label>
              <Input
                id="attendance-worker-name"
                value={newWorkerName}
                onChange={(event) => setNewWorkerName(event.target.value)}
                placeholder="e.g. Asha, Ravi Kumar"
                disabled={isAddingWorker || Boolean(error)}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                className="w-full md:w-auto"
                disabled={isAddingWorker || Boolean(error) || !newWorkerName.trim()}
              >
                {isAddingWorker ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                Add employee
              </Button>
            </div>
          </form>

          <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="attendance-date">Muster date</Label>
              <Input
                id="attendance-date"
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Weekly summary window</Label>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {buildWeekLabel(weekStartDate, weekEndDate)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="bg-transparent"
                onClick={() => setPresentWorkerIds(workers.map((worker) => worker.id))}
                disabled={workers.length === 0}
              >
                <Users className="mr-2 h-4 w-4" />
                Mark all
              </Button>
              <Button
                type="button"
                variant="outline"
                className="bg-transparent"
                onClick={() => setPresentWorkerIds([])}
                disabled={presentWorkerIds.length === 0}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Clear
              </Button>
              <Button type="button" onClick={handleSaveAttendance} disabled={isSaving || Boolean(error)}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Save muster
              </Button>
            </div>
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily Muster</CardTitle>
          <CardDescription>Tap each employee who came in on {formatDateOnly(selectedDate)}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl bg-stone-100" />
              ))}
            </div>
          ) : workers.length === 0 ? (
            <EmptyState
              title="No employees added yet"
              description="Add employees in the Workers tab to begin taking daily attendance."
              size="sm"
            />
          ) : (
            workers.map((worker) => {
              const isPresent = presentWorkerIdSet.has(worker.id)
              return (
                <div
                  key={worker.id}
                  className="flex flex-col gap-3 rounded-lg border border-border/70 bg-white/80 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-foreground">{worker.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {isPresent ? "Included in today's muster." : "Not marked present yet."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={isPresent ? "default" : "outline"}
                    className={isPresent ? "" : "bg-transparent"}
                    onClick={() => toggleWorkerPresence(worker.id)}
                  >
                    {isPresent ? "Present" : "Mark present"}
                  </Button>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weekly Attendance Summary</CardTitle>
          <CardDescription>Days present for the selected week.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32 w-full rounded-xl bg-stone-100" />
          ) : weeklySummary.length === 0 ? (
            <EmptyState title="No data for this week" description="Mark attendance above to populate the weekly summary." size="sm" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Days Present</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklySummary.map((row) => (
                    <TableRow key={row.workerId}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-right font-medium">{row.daysPresent}</TableCell>
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
