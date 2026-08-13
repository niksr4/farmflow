"use client"

/**
 * AttendanceTab — redesigned for phone-first, low-literacy managers.
 *
 * Design principles:
 *  - Day strip at top: tap a day, instant switch. No date pickers.
 *  - Default: everyone present on first open. Tap to mark absent.
 *  - Worker rows are full-width, 64px tall — works with dirty hands.
 *  - Present = bold green. Absent = muted grey. Impossible to confuse.
 *  - One big save button, always visible at the bottom.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { addDays, format, isToday, isFuture, startOfWeek } from "date-fns"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Fingerprint,
  IndianRupee,
  Loader2,
  PlusCircle,
  Trash2,
  Briefcase,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { trackRecordCreated } from "@/lib/track-action"
import { useSingleFlight } from "@/hooks/use-single-flight"
import AttendanceDeviceSettings from "@/components/attendance-device-settings"
import AssignWorkSheet from "@/components/attendance/assign-work-sheet"

type AttendanceWorker = {
  id: string
  name: string
  dailyRate: number | null
  deviceUserCode: string | null
  locationId: string | null
  kind?: "individual" | "gang"
  headcount?: number | null
  estate?: string | null
}
/** One row per job, so a worker who split their day appears more than once. */
type LabourAssignment = {
  id: string
  workerId: string
  activityCode: string
  activityName: string | null
  locationId: string | null
  locationName: string | null
  dayFraction: number
  rate: number
  headcount: number
  lumpSum: number | null
  totalCost: number
}
type AttendanceSummaryRow = { workerId: string; name: string; daysPresent: number }
type AttendanceRecordDetail = {
  workerId: string
  checkInTime: string | null
  checkOutTime: string | null
  source: "manual" | "biometric"
}

const formatPunchTime = (iso: string | null) => {
  if (!iso) return "--:--"
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? "--:--" : format(parsed, "HH:mm")
}

const formatDurationHours = (checkInIso: string | null, checkOutIso: string | null) => {
  if (!checkInIso || !checkOutIso) return ""
  const start = new Date(checkInIso).getTime()
  const end = new Date(checkOutIso).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return ""
  const totalMinutes = Math.round((end - start) / 60_000)
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0")
  const minutes = String(totalMinutes % 60).padStart(2, "0")
  return `${hours}:${minutes}`
}

function dateToStr(d: Date): string { return format(d, "yyyy-MM-dd") }

function getWeekDays(weekOffset: number): Date[] {
  const start = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset * 7)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export default function AttendanceTab() {
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDate, setSelectedDate] = useState(dateToStr(new Date()))
  const [workers, setWorkers] = useState<AttendanceWorker[]>([])
  const [presentWorkerIds, setPresentWorkerIds] = useState<string[]>([])
  const [weeklySummary, setWeeklySummary] = useState<AttendanceSummaryRow[]>([])
  const [presentRecords, setPresentRecords] = useState<AttendanceRecordDetail[]>([])
  const [showDeviceSettings, setShowDeviceSettings] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isAddingWorker, setIsAddingWorker] = useState(false)
  const [removingWorkerId, setRemovingWorkerId] = useState<string | null>(null)
  const [newWorkerName, setNewWorkerName] = useState("")
  const [newWorkerCode, setNewWorkerCode] = useState("")
  // Tenants without a fingerprint terminal never see any of the biometric UI.
  const [hasBiometricDevices, setHasBiometricDevices] = useState(false)
  const [isMultiEstate, setIsMultiEstate] = useState(false)
  const [newWorkerRate, setNewWorkerRate] = useState("")
  const [showAddWorker, setShowAddWorker] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoSelectedDate, setAutoSelectedDate] = useState<string | null>(null)

  // Work allocation. Selection mode is a separate mode on purpose: a row tap already means
  // "present / absent", and giving one gesture two meanings on a screen used with dirty hands
  // in a field is how the wrong thing gets recorded.
  const [assignments, setAssignments] = useState<LabourAssignment[]>([])
  const [locations, setLocations] = useState<Array<{ id: string; name: string; code?: string | null }>>([])
  const [activities, setActivities] = useState<Array<{ code: string; reference?: string | null }>>([])
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [assignOpen, setAssignOpen] = useState(false)
  const [assigning, setAssigning] = useState(false)

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset])

  useEffect(() => {
    const days = getWeekDays(weekOffset)
    setSelectedDate(dateToStr(weekOffset === 0 ? new Date() : days[0]))
  }, [weekOffset])

  const loadSnapshot = useCallback(
    async (date: string) => {
      setLoading(true)
      try {
        const res = await fetch(`/api/attendance?date=${date}`, { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load")

        const fetchedWorkers: AttendanceWorker[] = Array.isArray(data.workers) ? data.workers : []
        const fetchedPresent: string[] = Array.isArray(data.presentWorkerIds) ? data.presentWorkerIds : []

        setWorkers(fetchedWorkers)
        setWeeklySummary(Array.isArray(data.weeklySummary) ? data.weeklySummary : [])
        setPresentRecords(Array.isArray(data.presentRecords) ? data.presentRecords : [])
        setAssignments(Array.isArray(data.assignments) ? data.assignments : [])
        setHasBiometricDevices(Boolean(data.hasBiometricDevices))
        setIsMultiEstate(Boolean(data.isMultiEstate))
        setError(null)

        // "Everyone present by default" applies to TODAY ONLY.
        //
        // It is a real time-saver while taking a live muster — most workers turn up, so marking
        // the exceptions beats tapping forty names. On a past date it invents history: a day
        // nobody recorded renders identically to a day everyone attended, so there is no way to
        // tell "all present" from "never taken". Worse, those pre-ticked rows are one Save away
        // from becoming real attendance — and therefore real wages — for a day never mustered.
        //
        // Past dates now show exactly what is stored: absent unless a record says otherwise.
        const isTodaysDate = isToday(new Date(`${date}T00:00:00`))
        if (isTodaysDate && fetchedPresent.length === 0 && fetchedWorkers.length > 0 && autoSelectedDate !== date) {
          setPresentWorkerIds(fetchedWorkers.map((w) => w.id))
          setAutoSelectedDate(date)
        } else {
          setPresentWorkerIds(fetchedPresent)
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load")
        setWorkers([])
        setPresentWorkerIds([])
      } finally {
        setLoading(false)
      }
    },
    [autoSelectedDate],
  )

  useEffect(() => { void loadSnapshot(selectedDate) }, [selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Blocks and activity codes change rarely, so they load once rather than per date. scope=all is
  // deliberate on locations: the allocation sheet must offer every block a worker could have been
  // sent to, not only the estate currently selected in the header.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [locRes, actRes] = await Promise.all([
          fetch("/api/locations?scope=all"),
          fetch("/api/get-activity"),
        ])
        const [locData, actData] = await Promise.all([locRes.json(), actRes.json()])
        if (cancelled) return
        if (locData?.success) setLocations(locData.locations || [])
        if (actData?.success) setActivities(actData.activities || [])
      } catch {
        // Non-fatal: the muster still records presence, allocation just has nothing to offer.
      }
    })()
    return () => { cancelled = true }
  }, [])

  const assignmentsByWorker = useMemo(() => {
    const map = new Map<string, LabourAssignment[]>()
    for (const a of assignments) {
      const list = map.get(a.workerId) || []
      list.push(a)
      map.set(a.workerId, list)
    }
    return map
  }, [assignments])

  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const exitSelecting = () => { setSelecting(false); setSelectedIds(new Set()) }

  const handleAssign = async (payload: {
    activityCode: string
    locationId: string | null
    dayFraction: number
    rate: number | null
    lumpSum: number | null
  }) => {
    setAssigning(true)
    try {
      const res = await fetch("/api/attendance/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, workerIds: Array.from(selectedIds), ...payload }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || "Could not save the work allocation")
      toast.success(`Work set for ${data.assigned} ${data.assigned === 1 ? "worker" : "workers"}`)
      setAssignOpen(false)
      exitSelecting()
      await loadSnapshot(selectedDate)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save the work allocation")
    } finally {
      setAssigning(false)
    }
  }

  const handleRemoveAssignment = async (id: string) => {
    try {
      const res = await fetch(`/api/attendance/assignments?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || "Could not remove it")
      setAssignments((prev) => prev.filter((a) => a.id !== id))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not remove it")
    }
  }

  const presentSet = useMemo(() => new Set(presentWorkerIds), [presentWorkerIds])
  const recordByWorkerId = useMemo(
    () => new Map(presentRecords.map((record) => [record.workerId, record])),
    [presentRecords],
  )
  const presentCount = presentWorkerIds.length
  const absentCount = workers.length - presentCount
  const noRateWorkers = workers.filter((w) => w.dailyRate === null)
  // Only meaningful on a multi-estate tenant: an unassigned worker appears under every estate,
  // so the estate selector silently has no effect on the roster and nothing says why.
  const unassignedWorkers = isMultiEstate ? workers.filter((w) => !w.estate) : []

  const workersById = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers])
  const weeklyReportRows = useMemo(
    () =>
      weeklySummary.map((row) => {
        const dailyRate = workersById.get(row.workerId)?.dailyRate ?? null
        return { ...row, dailyRate, wageTotal: dailyRate !== null ? row.daysPresent * dailyRate : null }
      }),
    [weeklySummary, workersById],
  )
  const weeklyReportTotal = weeklyReportRows.reduce((sum, row) => sum + (row.wageTotal ?? 0), 0)
  const weeklyReportHasRates = weeklyReportRows.some((row) => row.wageTotal !== null)

  const toggleWorker = (id: string) => {
    setPresentWorkerIds((cur) => {
      const s = new Set(cur)
      s.has(id) ? s.delete(id) : s.add(id)
      return Array.from(s)
    })
  }

  const handleSaveUnguarded = async () => {
    setIsSaving(true)
    try {
      const res = await fetch("/api/attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, presentWorkerIds }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to save")
      trackRecordCreated("attendance", { present_count: presentCount, date: selectedDate })
      toast.success(`Saved — ${presentCount} present`)
      await loadSnapshot(selectedDate)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setIsSaving(false)
    }
  }

  // Mobile double-tap guard: `disabled` only applies after a re-render, so two fast
  // taps both entered this handler and saved twice. See lib/single-flight.ts.
  const handleSave = useSingleFlight(handleSaveUnguarded)

  const exportDailyReportToCSV = () => {
    const headers = ["EmployeeCode", "Name", "InTime", "OutTime", "Duration", "Status"]
    const rows = workers.map((worker) => {
      const record = recordByWorkerId.get(worker.id)
      const isPresentRow = presentSet.has(worker.id)
      return [
        worker.deviceUserCode || "",
        worker.name,
        isPresentRow ? formatPunchTime(record?.checkInTime ?? null) : "00:00",
        isPresentRow ? formatPunchTime(record?.checkOutTime ?? null) : "00:00",
        isPresentRow ? formatDurationHours(record?.checkInTime ?? null, record?.checkOutTime ?? null) : "00:00",
        isPresentRow ? "P" : "A",
      ]
    })
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `attendance-daily-${selectedDate}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const exportWeeklySummaryToCSV = () => {
    const weekLabel = dateToStr(weekDays[0])
    const headers = ["Worker", "Days Present", "Daily Rate", "Wage Total"]
    const rows = weeklyReportRows.map((row) => [
      row.name,
      String(row.daysPresent),
      row.dailyRate !== null ? String(row.dailyRate) : "",
      row.wageTotal !== null ? String(row.wageTotal) : "",
    ])
    if (weeklyReportHasRates) {
      rows.push(["Total", "", "", String(weeklyReportTotal)])
    }
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `attendance-week-${weekLabel}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleAddWorker = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWorkerName.trim()) return
    setIsAddingWorker(true)
    try {
      const res = await fetch("/api/attendance/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newWorkerName,
          dailyRate: newWorkerRate.trim() ? Number(newWorkerRate) : undefined,
          deviceUserCode: newWorkerCode.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to add")
      toast.success(`${data.worker?.name || "Employee"} added`)
      setNewWorkerName("")
      setNewWorkerRate("")
      setNewWorkerCode("")
      setShowAddWorker(false)
      setAutoSelectedDate(null)
      await loadSnapshot(selectedDate)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to add")
    } finally {
      setIsAddingWorker(false)
    }
  }

  const handleRemoveWorker = async (id: string, name: string) => {
    if (!window.confirm(`Remove ${name}? They'll no longer appear in attendance, but past records are kept.`)) return
    setRemovingWorkerId(id)
    try {
      const res = await fetch(`/api/attendance/workers/${id}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to remove")
      toast.success(`${name} removed`)
      setWorkers((cur) => cur.filter((w) => w.id !== id))
      setPresentWorkerIds((cur) => cur.filter((workerId) => workerId !== id))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove")
    } finally {
      setRemovingWorkerId(null)
    }
  }

  return (
    <div className="pb-28">
      {/* Day strip */}
      <div className="sticky top-0 z-10 bg-white border-b border-stone-100 px-3 pt-2 pb-3 space-y-2">
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => setWeekOffset((o) => o - 1)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-stone-500 active:bg-stone-100 touch-manipulation"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev week
          </button>
          <span className="text-xs font-bold uppercase tracking-widest text-stone-400">
            {weekOffset === 0 ? "This week" : `${format(weekDays[0], "d MMM")} – ${format(weekDays[6], "d MMM")}`}
          </span>
          <button
            type="button"
            disabled={weekOffset === 0}
            onClick={() => setWeekOffset((o) => Math.min(0, o + 1))}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-stone-500 active:bg-stone-100 touch-manipulation disabled:opacity-30"
          >
            Next week <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex gap-1">
          {weekDays.map((day) => {
            const str = dateToStr(day)
            const isSelected = str === selectedDate
            const isFut = isFuture(day) && !isToday(day)
            return (
              <button
                key={str}
                type="button"
                disabled={isFut}
                onClick={() => setSelectedDate(str)}
                className={cn(
                  "flex-1 flex flex-col items-center py-2 rounded-2xl transition-all touch-manipulation",
                  isSelected
                    ? "bg-emerald-700 shadow-md"
                    : isFut
                      ? "text-stone-300 cursor-default"
                      : "text-stone-500 hover:bg-stone-100 active:bg-stone-200",
                )}
              >
                <span className={cn("text-[9px] font-bold uppercase tracking-widest",
                  isSelected ? "text-emerald-200" : "")}>
                  {format(day, "EEE").slice(0, 1)}
                </span>
                <span className={cn("text-base font-black leading-tight mt-0.5",
                  isSelected ? "text-white" : isToday(day) ? "text-emerald-700" : "")}>
                  {format(day, "d")}
                </span>
                {isToday(day) && !isSelected && (
                  <span className="h-1 w-1 rounded-full bg-emerald-500 mt-0.5" />
                )}
              </button>
            )
          })}
        </div>

        {/* Count row */}
        {!loading && workers.length > 0 && (
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-stone-500">
              {format(new Date(selectedDate + "T12:00:00"), "EEEE, d MMM")}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-sm font-black text-emerald-700">{presentCount} in</span>
              {absentCount > 0 && (
                <span className="text-sm font-bold text-stone-400">{absentCount} out</span>
              )}
              {/* The full daily report existed but was reachable only by typing its URL, so in
                  practice it did not exist. Opens in a new tab so a half-taken muster isn't lost
                  by navigating away. */}
              <a
                href={`/attendance-report?date=${selectedDate}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open the full attendance report for this day"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-400 active:bg-stone-100"
              >
                <FileText className="h-3.5 w-3.5" />
              </a>
              <button
                type="button"
                aria-label="Export day's attendance report"
                onClick={exportDailyReportToCSV}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-400 active:bg-stone-100"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Worker list */}
      <div className="px-3 pt-3 space-y-2">
        {/* Rate nudge */}
        {!loading && noRateWorkers.length > 0 && (
          <div className="flex items-center gap-3 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3">
            <IndianRupee className="h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm font-medium text-amber-800">
              {noRateWorkers.length} worker{noRateWorkers.length > 1 ? "s" : ""} missing daily rate
            </p>
          </div>
        )}

        {/* An unassigned worker shows under every estate, so on a two-estate tenant the selector
            changes nothing about the roster and there is no hint why. Surfacing it here is the
            only place a manager would notice. */}
        {!loading && unassignedWorkers.length > 0 && (
          <div className="flex items-center gap-3 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3">
            <Users className="h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm font-medium text-amber-800">
              {unassignedWorkers.length} worker{unassignedWorkers.length > 1 ? "s" : ""} not assigned to an estate —
              they appear under every estate
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-600 px-1">{error}</p>}

        {/* Allocation bar. Only meaningful once there are codes to assign, so estates that have
            not set any up never see it. */}
        {!loading && workers.length > 0 && activities.length > 0 && (
          selecting ? (
            <div className="flex items-center gap-2 rounded-2xl bg-stone-900 px-4 py-3 text-white">
              <span className="text-sm font-bold">{selectedIds.size} selected</span>
              <button type="button"
                      onClick={() => setSelectedIds(new Set(workers.map((w) => w.id)))}
                      className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold">All</button>
              <button type="button"
                      onClick={() => setSelectedIds(new Set(presentWorkerIds))}
                      className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold">Present</button>
              <span className="flex-1" />
              <Button size="sm" disabled={selectedIds.size === 0} onClick={() => setAssignOpen(true)}
                      className="h-9 bg-emerald-500 font-bold hover:bg-emerald-400">Set work</Button>
              <button type="button" onClick={exitSelecting}
                      className="rounded-lg px-2 py-1.5 text-xs font-bold text-white/70">Done</button>
            </div>
          ) : (
            <button type="button" onClick={() => setSelecting(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-stone-200
                               bg-white px-4 py-3 text-sm font-bold text-stone-600 touch-manipulation
                               dark:border-white/[0.08] dark:bg-transparent">
              <Briefcase className="h-4 w-4" />
              Allocate work to the crew
            </button>
          )
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl bg-stone-100" />
            ))}
          </div>
        ) : workers.length === 0 ? (
          <EmptyState title="No employees yet" description="Add your first employee below." size="sm" />
        ) : (
          workers.map((worker) => {
            const isPresent = presentSet.has(worker.id)
            const isRemoving = removingWorkerId === worker.id
            const record = recordByWorkerId.get(worker.id)
            const isBiometric = isPresent && record?.source === "biometric"
            const rows = assignmentsByWorker.get(worker.id) || []
            const isSelected = selectedIds.has(worker.id)
            const act = () => (selecting ? toggleSelected(worker.id) : toggleWorker(worker.id))
            return (
              <div
                key={worker.id}
                role="button"
                tabIndex={0}
                onClick={act}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    act()
                  }
                }}
                className={cn(
                  "w-full flex items-center justify-between rounded-2xl px-4 py-4 cursor-pointer",
                  "transition-all active:scale-[0.98] touch-manipulation",
                  isPresent
                    ? "bg-emerald-600 shadow-md shadow-emerald-100"
                    : "bg-white shadow-sm",
                  selecting && isSelected && "ring-2 ring-offset-2 ring-stone-900",
                )}
              >
                <div className="text-left min-w-0 flex items-start gap-3">
                  {selecting && (
                    <span className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-[11px] font-black",
                      isSelected
                        ? "border-stone-900 bg-stone-900 text-white"
                        : isPresent ? "border-white/70" : "border-stone-300",
                    )}>
                      {isSelected ? "✓" : ""}
                    </span>
                  )}
                  <div className="min-w-0">
                  <p className={cn(
                    "text-base font-bold leading-tight truncate",
                    isPresent ? "text-white" : "text-stone-500",
                  )}>
                    {worker.name}
                    {worker.kind === "gang" && (
                      <span className={cn(
                        "ml-2 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide align-middle",
                        isPresent ? "bg-white/20 text-white" : "bg-stone-100 text-stone-500",
                      )}>
                        crew of {worker.headcount ?? 1}
                      </span>
                    )}
                  </p>
                  <p className={cn(
                    "flex items-center gap-1 text-xs font-medium mt-0.5",
                    isPresent ? "text-emerald-200" : "text-stone-400",
                  )}>
                    {isBiometric ? (
                      <>
                        <Fingerprint className="h-3 w-3 shrink-0" />
                        {formatPunchTime(record?.checkInTime ?? null)} – {formatPunchTime(record?.checkOutTime ?? null)}
                      </>
                    ) : worker.dailyRate !== null ? (
                      `₹${worker.dailyRate}/day`
                    ) : (
                      "No rate"
                    )}
                  </p>

                  {/* What they actually did. One chip per job, so a split day reads as two. */}
                  {rows.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {rows.map((a) => (
                        <span key={a.id}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold",
                                isPresent ? "bg-white/15 text-white" : "bg-stone-100 text-stone-600",
                              )}>
                          <span className="font-mono opacity-70">{a.activityCode}</span>
                          {a.locationName ?? "no block"}
                          {a.dayFraction !== 1 && <span className="opacity-70">· {a.dayFraction}d</span>}
                          <span className="opacity-70">· ₹{a.totalCost.toLocaleString("en-IN")}</span>
                          <button type="button" aria-label="Remove this allocation"
                                  onClick={(event) => { event.stopPropagation(); void handleRemoveAssignment(a.id) }}
                                  className="ml-0.5 opacity-60 hover:opacity-100">×</button>
                        </span>
                      ))}
                    </div>
                  ) : isPresent ? (
                    <p className={cn("mt-1.5 text-[11px] font-semibold",
                                     isPresent ? "text-emerald-100/80" : "text-stone-400")}>
                      Here, but no work set yet
                    </p>
                  ) : null}

                  {/* Work recorded for someone nobody marked present. Surfaced rather than
                      auto-corrected: the fix is a judgement call, not something a screen
                      should make silently. */}
                  {!isPresent && rows.length > 0 && (
                    <p className="mt-1.5 text-[11px] font-bold text-amber-600">
                      Work recorded but not marked present
                    </p>
                  )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Remove ${worker.name}`}
                    disabled={isRemoving}
                    onClick={(event) => {
                      event.stopPropagation()
                      handleRemoveWorker(worker.id, worker.name)
                    }}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl touch-manipulation disabled:opacity-50",
                      isPresent ? "text-emerald-100 active:bg-white/20" : "text-stone-300 active:bg-stone-100",
                    )}
                  >
                    {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                  <div className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all",
                    isPresent ? "bg-white/20" : "border-2 border-stone-200 bg-white",
                  )}>
                    {isPresent && <Check className="h-5 w-5 text-white stroke-[3]" />}
                  </div>
                </div>
              </div>
            )
          })
        )}

        {/* Bulk actions */}
        {!loading && workers.length > 0 && (
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPresentWorkerIds(workers.map((w) => w.id))}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl border border-stone-200 bg-white py-3 text-sm font-semibold text-stone-600 active:bg-stone-50 touch-manipulation"
            >
              <Users className="h-4 w-4" />
              All present
            </button>
            <button
              type="button"
              onClick={() => setPresentWorkerIds([])}
              disabled={presentCount === 0}
              className="flex-1 flex items-center justify-center rounded-2xl border border-stone-200 bg-white py-3 text-sm font-semibold text-stone-600 active:bg-stone-50 touch-manipulation disabled:opacity-40"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Add employee */}
        {!showAddWorker ? (
          <button
            type="button"
            onClick={() => setShowAddWorker(true)}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-200 py-4 text-sm font-semibold text-stone-400 hover:border-stone-300 transition-colors touch-manipulation"
          >
            <PlusCircle className="h-4 w-4" />
            Add employee
          </button>
        ) : (
          <form
            onSubmit={handleAddWorker}
            className="space-y-2 rounded-2xl border border-stone-200 bg-white px-3 py-2.5"
          >
            <Input
              value={newWorkerName}
              onChange={(e) => setNewWorkerName(e.target.value)}
              placeholder="Employee name"
              className="h-9 text-base border-0 bg-transparent p-0 focus-visible:ring-0"
              autoFocus
              disabled={isAddingWorker}
            />
            <div className="flex items-center gap-2">
              <Input
                value={newWorkerRate}
                onChange={(e) => setNewWorkerRate(e.target.value)}
                placeholder="Rate/day ₹ (optional)"
                inputMode="decimal"
                type="number"
                min={0}
                className="flex-1 h-9 text-base"
                disabled={isAddingWorker}
              />
              {/* The enrol ID shown on the fingerprint terminal. Only offered to estates that
                  actually have one, and optional — a code can still be attached later from the
                  unmapped-codes panel once that person first punches. */}
              {hasBiometricDevices && (
                <Input
                  value={newWorkerCode}
                  onChange={(e) => setNewWorkerCode(e.target.value)}
                  placeholder="Finger ID"
                  inputMode="numeric"
                  className="w-24 h-9 text-base"
                  disabled={isAddingWorker}
                />
              )}
              <Button
                type="submit"
                size="sm"
                className="h-9 rounded-xl bg-emerald-700 hover:bg-emerald-800"
                disabled={isAddingWorker || !newWorkerName.trim()}
              >
                {isAddingWorker ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
              </Button>
              <button type="button" onClick={() => { setShowAddWorker(false); setNewWorkerName(""); setNewWorkerRate(""); setNewWorkerCode("") }}
                className="text-xs text-stone-400 px-1 shrink-0">Cancel</button>
            </div>
          </form>
        )}

        {/* Weekly report */}
        {weeklyReportRows.length > 0 && (
          <div className="pt-1">
            <div className="flex items-center justify-between px-1 py-1">
              <button
                type="button"
                onClick={() => setShowSummary(!showSummary)}
                className="flex flex-1 items-center justify-between py-1.5 text-xs font-bold uppercase tracking-widest text-stone-400"
              >
                <span>Weekly report — {format(weekDays[0], "d MMM")}–{format(weekDays[6], "d MMM")}</span>
                <span className="ml-2">{showSummary ? "▲" : "▼"}</span>
              </button>
              <Button size="sm" variant="outline" onClick={exportWeeklySummaryToCSV} className="h-8 shrink-0 bg-transparent px-2.5 text-xs">
                <Download className="mr-1.5 h-3.5 w-3.5" /> Export
              </Button>
            </div>
            {showSummary && (
              <div className="rounded-2xl bg-white shadow-sm overflow-hidden divide-y divide-stone-50">
                {weeklyReportRows.map((row) => (
                  <div key={row.workerId} className="flex items-center justify-between px-4 py-3.5">
                    <span className="text-sm font-semibold text-stone-700">{row.name}</span>
                    <div className="text-right">
                      <span className="block text-base font-black text-stone-900">{row.daysPresent}d</span>
                      {row.wageTotal !== null && (
                        <span className="block text-xs font-semibold text-emerald-700">₹{row.wageTotal}</span>
                      )}
                    </div>
                  </div>
                ))}
                {weeklyReportHasRates && (
                  <div className="flex items-center justify-between px-4 py-3.5 bg-stone-50">
                    <span className="text-sm font-bold text-stone-700">Total</span>
                    <span className="text-base font-black text-emerald-700">₹{weeklyReportTotal}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Fingerprint devices -- hidden entirely for estates with no terminal registered */}
        {hasBiometricDevices && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowDeviceSettings(!showDeviceSettings)}
            className="flex w-full items-center justify-between py-1.5 text-xs font-bold uppercase tracking-widest text-stone-400"
          >
            <span className="flex items-center gap-1.5">
              <Fingerprint className="h-3.5 w-3.5" />
              Fingerprint devices
            </span>
            <span>{showDeviceSettings ? "▲" : "▼"}</span>
          </button>
          {showDeviceSettings && (
            <div className="pt-2">
              <AttendanceDeviceSettings workers={workers.map((w) => ({ id: w.id, name: w.name }))} />
            </div>
          )}
        </div>
        )}
      </div>

      {/* Sticky save bar */}
      {!loading && workers.length > 0 && !error && (
        <div className="fixed bottom-16 inset-x-0 px-3 pb-2 pt-2 bg-white/95 backdrop-blur-sm border-t border-stone-100 z-30">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              "w-full h-14 rounded-2xl flex items-center justify-center gap-2",
              "bg-emerald-700 text-white text-base font-bold shadow-md",
              "active:scale-[0.98] transition-all touch-manipulation",
              isSaving && "opacity-70",
            )}
          >
            {isSaving
              ? <Loader2 className="h-5 w-5 animate-spin" />
              : <><Check className="h-5 w-5 stroke-[2.5]" /> Save · {presentCount} present</>
            }
          </button>
        </div>
      )}

      <AssignWorkSheet
        open={assignOpen}
        saving={assigning}
        targets={workers
          .filter((w) => selectedIds.has(w.id))
          .map((w) => ({ id: w.id, name: w.name, kind: w.kind ?? "individual", headcount: w.headcount ?? null }))}
        locations={locations}
        activities={activities}
        onCancel={() => setAssignOpen(false)}
        onSubmit={handleAssign}
      />
    </div>
  )
}
