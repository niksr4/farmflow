"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, IndianRupee, Loader2, PlusCircle, RotateCcw, Users } from "lucide-react"
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
import TaskGuideCard from "@/components/task-guide-card"

type AttendanceWorker = {
  id: string
  name: string
  dailyRate: number | null
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
  const [editingRate, setEditingRate] = useState<{ workerId: string; value: string } | null>(null)
  const [isSavingRate, setIsSavingRate] = useState(false)

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
  const workersWithoutRate = useMemo(() => workers.filter((w) => w.dailyRate === null), [workers])

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

  const handleSaveRate = async (workerId: string, rateValue: string) => {
    const parsed = parseFloat(rateValue)
    if (!rateValue.trim() || Number.isNaN(parsed) || parsed < 0) {
      toast.error("Enter a valid daily rate")
      return
    }
    setIsSavingRate(true)
    try {
      const response = await fetch(`/api/attendance/workers/${workerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyRate: parsed }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to save rate")
      }
      setWorkers((current) =>
        current.map((w) => (w.id === workerId ? { ...w, dailyRate: parsed } : w)),
      )
      setEditingRate(null)
      toast.success("Daily rate saved")
    } catch (saveError: any) {
      toast.error(saveError?.message || "Failed to save rate")
    } finally {
      setIsSavingRate(false)
    }
  }

  return (
    <div className="space-y-4">
      <TaskGuideCard
        eyebrow="Attendance guide"
        title="Mark who came in today"
        description="Use this as the morning or day-end muster. Keep it simple: choose the date, mark who was present, then save."
        bullets={[
          "Add workers once, then reuse the same list every day.",
          "Mark only the people who actually came in for that date.",
          "This tab can run on its own for daily muster; rates and payroll can come later.",
        ]}
        tip="A clean daily muster makes weekly attendance, wages, and labor review easier for the owner."
        tone="operations"
      />

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-xl sm:text-2xl">Daily attendance</CardTitle>
            <CardDescription>Mark who came today and keep a simple weekly roll-up.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{workers.length} employees</Badge>
            <Badge variant="outline">{presentCount} present</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-white/70 bg-white/85 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-700">Muster date</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatDateOnly(selectedDate)}</p>
              </div>
              <div className="rounded-xl border border-white/70 bg-white/85 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-700">Present now</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{presentCount} workers marked</p>
              </div>
              <div className="rounded-xl border border-white/70 bg-white/85 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-700">This week</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{buildWeekLabel(weekStartDate, weekEndDate)}</p>
              </div>
            </div>
          </div>

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
          <CardTitle>Who came today</CardTitle>
          <CardDescription>Tap each employee who was present on {formatDateOnly(selectedDate)}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!loading && workers.length > 0 && workersWithoutRate.length > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <IndianRupee className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>
                {workersWithoutRate.length === workers.length
                  ? "No daily rates set yet — add rates below to track wage costs automatically."
                  : `${workersWithoutRate.length} ${workersWithoutRate.length === 1 ? "worker has" : "workers have"} no daily rate — add rates below to track wage costs.`}
              </p>
            </div>
          )}
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl bg-stone-100" />
              ))}
            </div>
          ) : workers.length === 0 ? (
            <EmptyState
              title="No employees added yet"
              description="Add your first employee above. Use Workers later if you want daily rates, bank details, or the full roster."
              size="sm"
            />
          ) : (
            workers.map((worker) => {
              const isPresent = presentWorkerIdSet.has(worker.id)
              const isEditingThisRate = editingRate?.workerId === worker.id
              return (
                <div
                  key={worker.id}
                  className="flex flex-col gap-3 rounded-lg border border-border/70 bg-white/80 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{worker.name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-xs text-muted-foreground">
                        {isPresent ? "Marked present for this date." : "Not marked present yet."}
                      </p>
                      {isEditingThisRate ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">₹</span>
                          <Input
                            type="number"
                            min={0}
                            step="1"
                            placeholder="Daily rate"
                            value={editingRate.value}
                            onChange={(e) => setEditingRate({ workerId: worker.id, value: e.target.value })}
                            className="h-6 w-24 rounded-md px-2 py-0 text-xs"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleSaveRate(worker.id, editingRate.value)
                              if (e.key === "Escape") setEditingRate(null)
                            }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            disabled={isSavingRate}
                            onClick={() => void handleSaveRate(worker.id, editingRate.value)}
                          >
                            {isSavingRate ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                          </Button>
                          <button
                            type="button"
                            className="text-xs text-muted-foreground underline"
                            onClick={() => setEditingRate(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : worker.dailyRate !== null ? (
                        <button
                          type="button"
                          className="text-xs text-emerald-700 hover:underline"
                          onClick={() => setEditingRate({ workerId: worker.id, value: String(worker.dailyRate) })}
                        >
                          ₹{worker.dailyRate}/day
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-xs text-amber-700 hover:underline"
                          onClick={() => setEditingRate({ workerId: worker.id, value: "" })}
                        >
                          Set daily rate
                        </button>
                      )}
                    </div>
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
          <CardTitle>This week</CardTitle>
          <CardDescription>Days present in the selected week.</CardDescription>
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
