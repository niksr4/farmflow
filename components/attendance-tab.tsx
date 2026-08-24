"use client"

/**
 * AttendanceTab — redesigned for phone-first, low-literacy managers.
 *
 * Design principles:
 *  - Day strip at top: tap a day, instant switch. No date pickers.
 *  - Default: nobody present. Tap a name, or "All present" then untick the absentees.
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
  ListChecks,
  Loader2,
  Plus,
  PlusCircle,
  Trash2,
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
import ActivityCodeReference from "@/components/attendance/activity-code-reference"
import WorkerAllocation from "@/components/attendance/worker-allocation"

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

/**
 * The muster roll's column template, shared by the header and every line.
 *
 * It is one string on purpose: the columns only line up while the header, a worker's first line
 * and each extra job of a split day all use the identical track list, and three copies of that
 * would drift the first time someone widened a cell.
 *
 * Day and cost are their own columns from sm up and collapse into the work cell on a phone --
 * display:none keeps them out of the grid entirely, so the same markup is four columns on a
 * phone and six on a laptop without a second layout to maintain.
 */
const MUSTER_GRID =
  "grid items-center gap-x-1.5 sm:gap-x-2 " +
  // The name is the column a manager searches down, so it gets whatever is left after the rest
  // are cut to the bone. At 390px that is about 120px -- enough for "Ponnappa M" unabbreviated,
  // which an earlier, roomier-looking split was not.
  "grid-cols-[minmax(0,1fr)_5.5rem_4rem_3.75rem] " +
  // Proportional on a wide screen rather than a fixed name column plus one enormous gap, which
  // left the work and block so far from the name they stopped reading as the same row.
  "sm:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1.4fr)_5rem_7rem_4.5rem]"

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
  // The date this estate started recording labour on the muster, or null if it never did.
  // Allocation is only counted from that date, so it is also the only date range worth offering.
  const [assignmentsFrom, setAssignmentsFrom] = useState<string | null>(null)
  // Work set outside this window is saved but counted by nothing: labour_cost reads muster rows
  // only when the tenant has a cutover and the day is on or after it. Offering the button anyway
  // is how an estate ends up with a day's labour recorded and no total that moved.
  const musterRecordsLabour = Boolean(assignmentsFrom) && selectedDate >= String(assignmentsFrom)
  const [presentWorkerIds, setPresentWorkerIds] = useState<string[]>([])
  const [weeklySummary, setWeeklySummary] = useState<AttendanceSummaryRow[]>([])
  const [presentRecords, setPresentRecords] = useState<AttendanceRecordDetail[]>([])
  const [showDeviceSettings, setShowDeviceSettings] = useState(false)
  const [showCodes, setShowCodes] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isAddingWorker, setIsAddingWorker] = useState(false)
  const [removingWorkerId, setRemovingWorkerId] = useState<string | null>(null)
  const [newWorkerName, setNewWorkerName] = useState("")
  const [newWorkerCode, setNewWorkerCode] = useState("")
  // Tenants without a fingerprint terminal never see any of the biometric UI.
  const [hasBiometricDevices, setHasBiometricDevices] = useState(false)
  const [newWorkerRate, setNewWorkerRate] = useState("")
  const [showAddWorker, setShowAddWorker] = useState(false)
  // A contract crew is one roster row with a headcount, not N invented people. Until now the
  // muster could display and allocate a gang but nothing could create one, so an estate whose
  // Accounts labour form had been retired at cutover simply could not record contract labour.
  const [newWorkerIsGang, setNewWorkerIsGang] = useState(false)
  const [newWorkerHeadcount, setNewWorkerHeadcount] = useState("")
  const [showSummary, setShowSummary] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Work allocation. Selection mode is a separate mode on purpose: a row tap already means
  // "present / absent", and giving one gesture two meanings on a screen used with dirty hands
  // in a field is how the wrong thing gets recorded.
  const [assignments, setAssignments] = useState<LabourAssignment[]>([])
  // Workers paid by weight today. A day-rate allocation on the same day is a second pay basis
  // for one day, which may or may not be how this estate pays -- flagged, never auto-corrected.
  const [pickingWorkerIds, setPickingWorkerIds] = useState<string[]>([])
  const [locations, setLocations] = useState<Array<{ id: string; name: string; code?: string | null }>>([])
  const [activities, setActivities] = useState<Array<{ code: string; reference?: string | null }>>([])
  const [assigningWorkerId, setAssigningWorkerId] = useState<string | null>(null)
  // Sentinel for "the batch panel is saving", so the spinner has an id to match without
  // pretending the work belongs to one particular worker.
  const BATCH_SAVING = "__batch__"
  const [allocatingWorkerId, setAllocatingWorkerId] = useState<string | null>(null)
  // Setting work for several people at once. The API has always taken an array of worker ids --
  // it dedupes them and pluralises its own error messages -- but the UI only ever sent one, so a
  // 22-person day meant 22 identical trips through the same panel.
  //
  // A separate MODE rather than a second meaning for the row tap. Outside it a tap marks present
  // or absent; inside it a tap selects. Giving one gesture two meanings on a screen used with
  // dirty hands in a field is how the wrong thing gets recorded, which is what the note above
  // on `assignments` was already warning about.
  const [batchMode, setBatchMode] = useState(false)
  const [batchIds, setBatchIds] = useState<string[]>([])
  const batchSet = useMemo(() => new Set(batchIds), [batchIds])
  const exitBatch = useCallback(() => { setBatchMode(false); setBatchIds([]) }, [])
  const [editingAssignment, setEditingAssignment] = useState<LabourAssignment | null>(null)

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
        setPickingWorkerIds(Array.isArray(data.pickingWorkerIds) ? data.pickingWorkerIds : [])
        setHasBiometricDevices(Boolean(data.hasBiometricDevices))
        setAssignmentsFrom(data.assignmentsFrom ? String(data.assignmentsFrom).slice(0, 10) : null)
        setError(null)

        // NOBODY IS PRESENT UNTIL SOMEONE SAYS SO.
        //
        // Today used to open with every worker pre-ticked, on the reasoning that most turn up so
        // marking the exceptions is faster. That reasoning was already rejected for past dates,
        // in this same function, for a reason that applies just as well to today: pre-ticked rows
        // are one Save away from becoming real attendance, and therefore real wages, for a day
        // nobody actually mustered. Open the muster, get distracted, hit Save -- twenty-one people
        // are paid. Nothing about the screen would look wrong afterwards.
        //
        // Presence is a claim about who turned up. The app does not know that, so it should not
        // assert it. "All present" is one tap away for the common case, which costs a tap and
        // makes the claim someone's rather than the default's.
        setPresentWorkerIds(fetchedPresent)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load")
        setWorkers([])
        setPresentWorkerIds([])
      } finally {
        setLoading(false)
      }
    },
    [],
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

  // One worker, one job, one deliberate act -- individual rather than bulk, at the estate
  // owner's request. Returns whether it landed so the row can keep its dropdowns open on failure
  // instead of silently discarding what was typed.
  const handleAddAssignment = async (
    // One id, or several when the same job is being set for a group. The route has always taken
    // an array; only this caller was passing a single-element one.
    workerId: string | string[],
    payload: { id?: string; activityCode: string; locationId: string | null; dayFraction: number },
  ): Promise<boolean> => {
    const workerIds = Array.isArray(workerId) ? workerId : [workerId]
    setAssigningWorkerId(Array.isArray(workerId) ? BATCH_SAVING : workerId)
    try {
      // Presence is staged locally until Save, but the server will not accept work for anyone it
      // cannot see on the muster. Persist the roll first so ticking someone present and setting
      // their work in one motion behaves the way it reads.
      const presence = await fetch("/api/attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, presentWorkerIds }),
      })
      const presenceData = await presence.json().catch(() => ({}))
      if (!presence.ok || !presenceData?.success) {
        throw new Error(presenceData?.error || "Could not save who was present")
      }

      // Correcting an existing job edits it in place; delete-and-re-add would leave the day
      // uncosted in between, which is the state a distracted manager never comes back to.
      const res = payload.id
        ? await fetch("/api/attendance/assignments", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/attendance/assignments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date: selectedDate, workerIds, ...payload }),
          })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || "Could not save the work")
      await loadSnapshot(selectedDate)
      return true
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save the work")
      return false
    } finally {
      setAssigningWorkerId(null)
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

  // What the day has cost so far, and how much of it is still unaccounted for. The second number
  // is the one that changes behaviour: a manager who can see "6 present with no work set" fixes it
  // before leaving the screen, which is the whole point of allocating on the roll instead of
  // reconstructing it in Accounts a week later.
  const dayCost = useMemo(() => assignments.reduce((sum, a) => sum + a.totalCost, 0), [assignments])
  // Has this estate started allocating work at all today? Drives whether the cost figures are
  // shown -- an estate that only takes attendance should not be told daily that its labour cost
  // nothing and that four people are unaccounted for.
  const allocatesWork = assignments.length > 0
  const unallocatedCount = useMemo(() => {
    const withWork = new Set(assignments.map((a) => a.workerId))
    return presentWorkerIds.filter((id) => !withWork.has(id)).length
  }, [assignments, presentWorkerIds])
  const noRateWorkers = workers.filter((w) => w.dailyRate === null)
  // Only meaningful on a multi-estate tenant: an unassigned worker appears under every estate,
  // so the estate selector silently has no effect on the roster and nothing says why.

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
    // Work already recorded means marking them absent would leave a payable with nobody on the
    // muster to have earned it. Refused rather than silently dropping the jobs -- deleting money
    // records as a side effect of a tap is not something a screen should decide.
    const jobs = assignments.filter((a) => a.workerId === id)
    if (jobs.length > 0 && presentSet.has(id)) {
      toast.error(
        jobs.length === 1
          ? "Remove their work first — you cannot mark someone absent who has a job recorded."
          : `Remove their ${jobs.length} jobs first — you cannot mark someone absent who has work recorded.`,
      )
      return
    }
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
          kind: newWorkerIsGang ? "gang" : "individual",
          headcount: newWorkerIsGang ? Number(newWorkerHeadcount) : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to add")
      toast.success(`${data.worker?.name || "Employee"} added`)
      setNewWorkerName("")
      setNewWorkerRate("")
      setNewWorkerCode("")
      setNewWorkerIsGang(false)
      setNewWorkerHeadcount("")
      setShowAddWorker(false)
      // Reloading used to have to clear the auto-tick flag so a newly added worker would also get
      // pre-ticked. Nothing is pre-ticked now, so a new worker simply appears, absent, like
      // everyone else -- which is the honest state for someone the roll has not been taken for.
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

      {/* Where the day stands, before the detail. Four figures a manager can act on: who turned
          up, who did not, what it has cost, and who is still unaccounted for. */}
      {!loading && workers.length > 0 && (
        <div className={cn(
          "grid gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 mx-3 mt-3 dark:border-white/[0.08] dark:bg-white/[0.08]",
          allocatesWork ? "grid-cols-4" : "grid-cols-2",
        )}>
          {[
            { label: "Present", value: String(presentCount), tone: "emerald" as const },
            { label: "Absent", value: String(absentCount), tone: "plain" as const },
            // Cost and stragglers only mean something to an estate that allocates work. Shown to
            // one that does not, "Cost today Rs 0" is a permanent zero and an amber "No work set"
            // is a standing accusation about a feature they have not adopted -- a nag that can
            // never be cleared. They appear the moment the first job is set for the day.
            ...(allocatesWork
              ? [
                  { label: "Cost today", value: `₹${Math.round(dayCost).toLocaleString("en-IN")}`, tone: "clay" as const },
                  { label: "No work set", value: String(unallocatedCount), tone: unallocatedCount > 0 ? ("amber" as const) : ("plain" as const) },
                ]
              : []),
          ].map((tile) => (
            <div key={tile.label} className="bg-white px-2 py-2.5 text-center dark:bg-card">
              <p className="text-[9px] font-black uppercase tracking-wider text-stone-400">{tile.label}</p>
              <p
                className={cn(
                  "mt-0.5 truncate text-base font-black tabular-nums",
                  tile.tone === "emerald" && "text-emerald-700 dark:text-emerald-400",
                  tile.tone === "clay" && "text-amber-800 dark:text-amber-500",
                  tile.tone === "amber" && "text-amber-600",
                  tile.tone === "plain" && "text-stone-500",
                )}
              >
                {tile.value}
              </p>
            </div>
          ))}
        </div>
      )}

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


        {/* Same job, several people -- the common shape of an estate day. Offered only once
            somebody is present and there are codes to choose from, because before that it would
            be a button that can only disappoint. */}
        {!loading && presentWorkerIds.length > 1 && activities.length > 0 && (
          batchMode ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2.5 dark:border-sky-500/20 dark:bg-sky-500/10">
              <span className="text-sm font-bold text-sky-900 dark:text-sky-200">
                {batchIds.length === 0
                  ? "Tap the people doing the same job"
                  : `${batchIds.length} selected`}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBatchIds(workers.filter((w) => presentSet.has(w.id)).map((w) => w.id))}
                  className="rounded-lg px-2 py-1 text-xs font-bold text-sky-700 active:bg-sky-100 dark:text-sky-300"
                >
                  Select all present
                </button>
                <button
                  type="button"
                  onClick={exitBatch}
                  className="rounded-lg px-2 py-1 text-xs font-bold text-stone-500 active:bg-stone-100"
                >
                  Cancel
                </button>
              </div>
              {batchIds.length > 0 && (
                <div className="w-full">
                  <WorkerAllocation
                    key={`batch-${batchIds.length}`}
                    workerEstate={null}
                    locations={locations}
                    activities={activities}
                    saving={assigningWorkerId === BATCH_SAVING}
                    editing={null}
                    headcount={1}
                    isGang={false}
                    // Still null: a group can hold people on different wages, so there is no single
                    // rate to prefill, and typing one overrides all of them -- which is the point
                    // when a whole group is on one contract price.
                    //
                    // But the panel now gets the people too, because null alone made it announce
                    // "No daily wage for this worker" over a group where everyone had one, and
                    // that invites a typed rate that then shadows the roster. Each row is costed
                    // from its own worker's wage server-side; the panel says so now instead of
                    // contradicting it.
                    workerRate={null}
                    batchWorkers={batchIds.map((id) => {
                      const w = workers.find((x) => x.id === id)
                      return { name: w?.name ?? "Unnamed", rate: w?.dailyRate ?? null }
                    })}
                    onAdd={async (payload) => {
                      const ok = await handleAddAssignment(batchIds, payload)
                      if (ok) exitBatch()
                      return ok
                    }}
                    onClose={exitBatch}
                  />
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setAllocatingWorkerId(null); setEditingAssignment(null); setBatchMode(true) }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-sky-200 py-2.5 text-sm font-bold text-sky-700 transition-colors touch-manipulation active:bg-sky-50 dark:border-sky-500/30 dark:text-sky-400"
            >
              <Plus className="h-4 w-4" /> Set the same work for several people
            </button>
          )
        )}

        {error && <p className="text-sm text-red-600 px-1">{error}</p>}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl bg-stone-100" />
            ))}
          </div>
        ) : workers.length === 0 ? (
          <EmptyState title="No employees yet" description="Add your first employee below." size="sm" />
        ) : (
          <>
          {/* Column headers. The roll is read down a column -- who is on Weeding, which blocks got
              nobody -- far more often than it is read across one worker, so the cells line up on a
              fixed template and every line keeps to it. */}
          <div className={cn(MUSTER_GRID, "px-2 pb-1 text-[10px] font-black uppercase tracking-wider text-stone-400 sm:px-3")}>
            <span>Worker</span>
            <span>Work</span>
            <span>Block</span>
            <span className="hidden sm:block text-right">Day</span>
            <span className="hidden sm:block text-right">Cost</span>
            <span />
          </div>
          {workers.map((worker) => {
            const isPresent = presentSet.has(worker.id)
            const isRemoving = removingWorkerId === worker.id
            const record = recordByWorkerId.get(worker.id)
            const isBiometric = isPresent && record?.source === "biometric"
            const rows = assignmentsByWorker.get(worker.id) || []
            const act = () =>
              batchMode
                ? setBatchIds((cur) =>
                    cur.includes(worker.id) ? cur.filter((id) => id !== worker.id) : [...cur, worker.id],
                  )
                : toggleWorker(worker.id)
            // Only someone present can be given work, so batch mode simply ignores the absent --
            // the same rule the single-worker path already enforces server-side.
            const batchSelected = batchMode && batchSet.has(worker.id)
            return (
              // Tapping anywhere on the row still toggles presence -- that is the whole point on a
              // phone. But the row is not itself a button: it contains a delete button, a dismiss
              // button per allocation chip, and two dropdowns, and controls nested inside a
              // role="button" are not reachable by assistive tech, which would also announce the
              // row as one button named after every word in it. The check circle carries the real
              // semantics; keyboard users get that.
              // Present is a tint and a rail, not a solid fill. A saturated row forces every cell
              // to invert its colours, and the columns stop being comparable at a glance -- which
              // is the whole reason for the table.
              <div
                key={worker.id}
                onClick={act}
                className={cn(
                  "w-full overflow-hidden rounded-xl border-l-4 py-1.5 cursor-pointer",
                  "transition-colors touch-manipulation",
                  batchSelected
                    ? "border-sky-500 bg-sky-50 ring-2 ring-sky-300 dark:bg-sky-500/10"
                    : isPresent
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
                      : "border-transparent bg-white shadow-sm dark:bg-card",
                  // An absent worker cannot be given work, so it is dimmed rather than offered.
                  batchMode && !isPresent && "opacity-40",
                )}
              >
                {/* One line per job. A worker with a split day gets two, and the name is written
                    once so the eye reads it as one person's day rather than two people. */}
                {(rows.length > 0 ? rows : [null]).map((a, i) => (
                  <div key={a?.id ?? "empty"} className={cn(MUSTER_GRID, "px-2 py-1 sm:px-3")}>
                    <div className="min-w-0">
                      {i === 0 && (
                        <>
                          <p className="flex items-baseline gap-1 text-[13px] font-bold leading-tight text-stone-700 dark:text-stone-200">
                            <span className="truncate">{worker.name}</span>
                            {worker.kind === "gang" && (
                              <span className="shrink-0 text-[10px] font-black text-stone-400">×{worker.headcount ?? 1}</span>
                            )}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-medium text-stone-400">
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
                        </>
                      )}
                    </div>

                    <div className="min-w-0">
                      {a ? (
                        <>
                          {/* The name first: nobody memorises that 140 is Arabica Harvesting, and
                              a column of bare numbers cannot be read down, which is the whole
                              point of it being a column. The code stays, smaller, for whoever
                              does know it. */}
                          <button
                            type="button"
                            aria-label={`Edit ${a.activityName || a.activityCode}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              setEditingAssignment(a)
                              setAllocatingWorkerId(worker.id)
                            }}
                            className="block w-full truncate text-left text-[11px] font-bold leading-tight text-stone-700 underline decoration-dotted decoration-stone-300 underline-offset-2 dark:text-stone-200"
                          >
                            {a.activityName || a.activityCode}
                          </button>
                          {/* Day and cost get their own columns from sm up; on a phone they ride
                              here beside the code rather than being dropped, so both layouts
                              show the same numbers. */}
                          <p className="truncate text-[10px] leading-tight text-stone-400">
                            <span className="font-mono">{a.activityCode}</span>
                            <span className="sm:hidden"> · {a.dayFraction}d · ₹{a.totalCost.toLocaleString("en-IN")}</span>
                          </p>
                        </>
                      ) : isPresent && activities.length > 0 && musterRecordsLabour ? (
                        // In the Work column, not in a band underneath it: this is the cell that
                        // is about to hold the answer, and it is the one tap the day needs. Full
                        // cell width and 32px tall, because the previous 113x22 target was not
                        // something to hit with dirty hands.
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); setEditingAssignment(null); setAllocatingWorkerId(worker.id) }}
                          className="flex h-8 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-emerald-300 text-[11px] font-bold text-emerald-700 touch-manipulation active:bg-emerald-100 dark:border-emerald-500/40 dark:text-emerald-400"
                        >
                          <Plus className="h-3 w-3" /> Set work
                        </button>
                      ) : (
                        <span className="text-[11px] text-stone-300">—</span>
                      )}
                    </div>

                    <div className="flex min-w-0 items-center gap-1">
                      {a ? (
                        <>
                          <span className="truncate text-[11px] font-semibold text-stone-600 dark:text-stone-300">
                            {a.locationName ?? "no block"}
                          </span>
                          <button
                            type="button"
                            aria-label={`Remove ${a.activityCode} allocation`}
                            onClick={(event) => { event.stopPropagation(); void handleRemoveAssignment(a.id) }}
                            className="shrink-0 text-stone-300 hover:text-red-500"
                          >
                            ×
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] text-stone-300">—</span>
                      )}
                    </div>

                    <span className="hidden text-right text-[11px] tabular-nums text-stone-500 sm:block">
                      {a ? `${a.dayFraction}d` : ""}
                    </span>
                    <span className="hidden text-right text-[11px] font-semibold tabular-nums text-stone-600 sm:block dark:text-stone-300">
                      {a ? `₹${a.totalCost.toLocaleString("en-IN")}` : ""}
                    </span>

                    <div className="flex shrink-0 items-center justify-end gap-0.5">
                      {i === 0 && (
                        <>
                          <button
                            type="button"
                            aria-label={`Remove ${worker.name}`}
                            disabled={isRemoving}
                            onClick={(event) => {
                              event.stopPropagation()
                              handleRemoveWorker(worker.id, worker.name)
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-300 touch-manipulation active:bg-stone-100 disabled:opacity-50"
                          >
                            {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            aria-pressed={isPresent}
                            aria-label={`${worker.name} present`}
                            onClick={(event) => { event.stopPropagation(); act() }}
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 transition-all touch-manipulation",
                              isPresent
                                ? "border-emerald-600 bg-emerald-600"
                                : "border-stone-200 bg-white dark:bg-transparent",
                            )}
                          >
                            {isPresent && <Check className="h-4 w-4 text-white stroke-[3]" />}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {/* A second job is the exception, so it is offered once beneath a worker who
                    already has one rather than advertised on every row of the roll. */}
                {isPresent && rows.length > 0 && activities.length > 0 && allocatingWorkerId !== worker.id && (
                  <div className={cn(MUSTER_GRID, "px-2 pb-1 sm:px-3")}>
                    <span />
                    {/* Spans work and block: the label will not fit in a 68px column on a phone,
                        and a wrapped two-line "Another job" reads as a rendering fault. */}
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); setEditingAssignment(null); setAllocatingWorkerId(worker.id) }}
                      className="col-span-2 flex h-7 w-full items-center justify-center gap-1 whitespace-nowrap rounded-lg text-[10px] font-bold text-stone-400 touch-manipulation active:bg-stone-100 dark:active:bg-white/[0.06]"
                    >
                      <Plus className="h-3 w-3" /> Another job
                    </button>
                    <span className="hidden sm:block" />
                    <span className="hidden sm:block" />
                    <span />
                  </div>
                )}

                {/* Full width, below the columns -- the editor needs the room the cells do not have. */}
                <div className="px-3">
                  {activities.length > 0 && isPresent && allocatingWorkerId === worker.id && (
                    <WorkerAllocation
                      key={editingAssignment?.id ?? "new"}
                      workerEstate={worker.estate ?? null}
                      locations={locations}
                      activities={activities}
                      saving={assigningWorkerId === worker.id}
                      editing={editingAssignment}
                      headcount={worker.kind === "gang" ? Math.max(1, Number(worker.headcount) || 1) : 1}
                      isGang={worker.kind === "gang"}
                      workerRate={worker.dailyRate ?? null}
                      onAdd={(payload) => handleAddAssignment(worker.id, payload)}
                      onClose={() => { setAllocatingWorkerId(null); setEditingAssignment(null) }}
                    />
                  )}

                  {/* Work recorded for someone nobody marked present. Surfaced rather than
                      auto-corrected: the fix is a judgement call, not something a screen
                      should make silently. */}
                  {!isPresent && rows.length > 0 && (
                    <p className="pb-1 text-[11px] font-bold text-amber-600">
                      Work recorded but not marked present
                    </p>
                  )}

                  {pickingWorkerIds.includes(worker.id) && rows.length > 0 && (
                    <p className="pb-1 text-[11px] font-bold text-amber-600">
                      Also picked today — paid by weight and by day
                    </p>
                  )}
                </div>
              </div>
            )
          })}
          </>
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
              onClick={() => {
                // Anyone with work recorded keeps their place on the roll. Clearing them would
                // leave a payable nobody is on the muster to have earned, and doing that to a
                // whole roster in one tap is worse than doing it to one person.
                const withWork = new Set(assignments.map((a) => a.workerId))
                const kept = presentWorkerIds.filter((id) => withWork.has(id))
                setPresentWorkerIds(kept)
                if (kept.length > 0) {
                  toast.info(
                    kept.length === 1
                      ? "1 worker kept — they have work recorded today."
                      : `${kept.length} workers kept — they have work recorded today.`,
                  )
                }
              }}
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
            Add employee or crew
          </button>
        ) : (
          <form
            onSubmit={handleAddWorker}
            className="space-y-2 rounded-2xl border border-stone-200 bg-white px-3 py-2.5"
          >
            {/* Person or crew. A contract gang -- "Rathi & Team" -- is a third of the headcount on
                the days it turns up, and putting it on the roster as one row with a headcount is
                what lets the muster cost it without inventing nine names that would then need
                marking present individually. */}
            <div className="flex items-center gap-1 rounded-xl bg-stone-100 p-0.5 dark:bg-stone-800">
              {[
                { gang: false, label: "Person" },
                { gang: true, label: "Contract crew" },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setNewWorkerIsGang(opt.gang)}
                  disabled={isAddingWorker}
                  className={cn(
                    "flex-1 rounded-lg px-2 py-1.5 text-xs font-bold transition-colors",
                    newWorkerIsGang === opt.gang
                      ? "bg-white text-stone-900 shadow-sm dark:bg-stone-950 dark:text-stone-100"
                      : "text-stone-500",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <Input
              value={newWorkerName}
              onChange={(e) => setNewWorkerName(e.target.value)}
              placeholder={newWorkerIsGang ? "Crew name, e.g. Rathi & Team" : "Employee name"}
              className="h-9 text-base border-0 bg-transparent p-0 focus-visible:ring-0"
              autoFocus
              disabled={isAddingWorker}
            />
            <div className="flex items-center gap-2">
              {newWorkerIsGang && (
                <Input
                  value={newWorkerHeadcount}
                  onChange={(e) => setNewWorkerHeadcount(e.target.value)}
                  placeholder="How many"
                  inputMode="numeric"
                  type="number"
                  min={1}
                  className="w-24 h-9 text-base"
                  disabled={isAddingWorker}
                />
              )}
              <Input
                value={newWorkerRate}
                onChange={(e) => setNewWorkerRate(e.target.value)}
                placeholder={newWorkerIsGang ? "Rate/head ₹" : "Rate/day ₹ (optional)"}
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
                disabled={
                  isAddingWorker ||
                  !newWorkerName.trim() ||
                  (newWorkerIsGang && !(Number(newWorkerHeadcount) >= 1))
                }
              >
                {isAddingWorker ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
              </Button>
              <button type="button" onClick={() => { setShowAddWorker(false); setNewWorkerName(""); setNewWorkerRate(""); setNewWorkerCode(""); setNewWorkerIsGang(false); setNewWorkerHeadcount("") }}
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

        {/* What the codes mean. The roll is where that question gets asked -- mid-allocation, at
            seven in the morning -- so the list is here as well as under Costs, where it is owned. */}
        {activities.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowCodes(!showCodes)}
            className="flex w-full items-center justify-between py-1.5 text-xs font-bold uppercase tracking-widest text-stone-400"
          >
            <span className="flex items-center gap-1.5">
              <ListChecks className="h-3.5 w-3.5" />
              Activity codes
            </span>
            <span>{showCodes ? "▲" : "▼"}</span>
          </button>
          {showCodes && (
            <div className="pt-2">
              <ActivityCodeReference activities={activities} />
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

    </div>
  )
}
