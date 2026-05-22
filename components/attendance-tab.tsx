"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  addDays,
  format,
  isToday,
  isFuture,
  startOfWeek,
} from "date-fns"
import { Check, IndianRupee, Loader2, PlusCircle, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { formatDateOnly } from "@/lib/date-utils"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"

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

function dateToInputStr(d: Date): string {
  return format(d, "yyyy-MM-dd")
}

function getWeekDays(): Date[] {
  const start = startOfWeek(new Date(), { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export default function AttendanceTab() {
  const today = new Date()
  const [selectedDate, setSelectedDate] = useState(dateToInputStr(today))
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
  const [showAddWorker, setShowAddWorker] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [autoSelectedDate, setAutoSelectedDate] = useState<string | null>(null)

  const weekDays = useMemo(() => getWeekDays(), [])

  const loadAttendanceSnapshot = useCallback(async (date: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/attendance?date=${date}`, { cache: "no-store" })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to load attendance")
      }

      const fetchedWorkers: AttendanceWorker[] = Array.isArray(data.workers) ? data.workers : []
      const fetchedPresent: string[] = Array.isArray(data.presentWorkerIds) ? data.presentWorkerIds : []

      setWorkers(fetchedWorkers)
      setWeeklySummary(Array.isArray(data.weeklySummary) ? data.weeklySummary : [])
      setWeekStartDate(String(data.weekStartDate || ""))
      setWeekEndDate(String(data.weekEndDate || ""))
      setError(null)

      // Default everyone to present if no saved data exists for this date
      if (fetchedPresent.length === 0 && fetchedWorkers.length > 0 && autoSelectedDate !== date) {
        setPresentWorkerIds(fetchedWorkers.map((w) => w.id))
        setAutoSelectedDate(date)
      } else {
        setPresentWorkerIds(fetchedPresent)
      }
    } catch (loadError: unknown) {
      const msg = loadError instanceof Error ? loadError.message : "Failed to load attendance"
      setWorkers([])
      setPresentWorkerIds([])
      setWeeklySummary([])
      setWeekStartDate(null)
      setWeekEndDate(null)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [autoSelectedDate])

  useEffect(() => {
    void loadAttendanceSnapshot(selectedDate)
  }, [selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const presentSet = useMemo(() => new Set(presentWorkerIds), [presentWorkerIds])
  const presentCount = presentWorkerIds.length
  const absentCount = workers.length - presentCount
  const workersWithoutRate = workers.filter((w) => w.dailyRate === null)

  const toggleWorker = (workerId: string) => {
    setPresentWorkerIds((current) => {
      const next = new Set(current)
      next.has(workerId) ? next.delete(workerId) : next.add(workerId)
      return Array.from(next)
    })
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const response = await fetch("/api/attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, presentWorkerIds }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to save attendance")
      }
      toast.success(`Muster saved — ${presentCount} present`)
      await loadAttendanceSnapshot(selectedDate)
    } catch (saveError: unknown) {
      const msg = saveError instanceof Error ? saveError.message : "Failed to save attendance"
      toast.error(msg)
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddWorker = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
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
      setShowAddWorker(false)
      // Reset auto-select so new worker gets added to present list
      setAutoSelectedDate(null)
      await loadAttendanceSnapshot(selectedDate)
    } catch (workerError: unknown) {
      const msg = workerError instanceof Error ? workerError.message : "Failed to add employee"
      toast.error(msg)
    } finally {
      setIsAddingWorker(false)
    }
  }

  return (
    <div className="space-y-0 pb-24">
      {/* Day strip */}
      <div className="sticky top-0 z-10 bg-white border-b border-black/[0.06] px-3 py-2">
        <div className="flex items-stretch gap-1">
          {weekDays.map((day) => {
            const str = dateToInputStr(day)
            const isSelected = str === selectedDate
            const isT = isToday(day)
            const isFut = isFuture(day) && !isToday(day)
            return (
              <button
                key={str}
                type="button"
                disabled={isFut}
                onClick={() => setSelectedDate(str)}
                className={cn(
                  "flex-1 flex flex-col items-center py-1.5 rounded-xl transition-all touch-manipulation",
                  isSelected
                    ? "bg-emerald-700 text-white"
                    : isFut
                      ? "text-neutral-300 cursor-default"
                      : "text-neutral-500 hover:bg-neutral-50 active:bg-neutral-100",
                )}
              >
                <span className="text-[9px] font-medium uppercase tracking-wide">
                  {format(day, "EEE").charAt(0)}
                </span>
                <span className={cn(
                  "text-sm font-bold leading-tight",
                  isT && !isSelected && "text-emerald-700",
                )}>
                  {format(day, "d")}
                </span>
                {isT && (
                  <span className={cn(
                    "h-1 w-1 rounded-full mt-0.5",
                    isSelected ? "bg-white/70" : "bg-emerald-600",
                  )} />
                )}
              </button>
            )
          })}
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between mt-2 px-0.5">
          <p className="text-xs font-medium text-neutral-600">
            {formatDateOnly(selectedDate)}
          </p>
          {!loading && workers.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-emerald-700">{presentCount} present</span>
              {absentCount > 0 && (
                <span className="text-xs text-neutral-400">{absentCount} absent</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Workers list */}
      <div className="px-3 pt-2 space-y-1.5">
        {/* Rate warning — compact */}
        {!loading && workers.length > 0 && workersWithoutRate.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <IndianRupee className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span>
              {workersWithoutRate.length} worker{workersWithoutRate.length > 1 ? "s" : ""} missing daily rate — wages won&apos;t be calculated.
            </span>
          </div>
        )}

        {error && (
          <p className="text-sm text-rose-600 px-1">{error}</p>
        )}

        {loading ? (
          <div className="space-y-1.5">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl bg-neutral-100" />
            ))}
          </div>
        ) : workers.length === 0 ? (
          <EmptyState
            title="No employees yet"
            description="Add your first employee below."
            size="sm"
          />
        ) : (
          workers.map((worker) => {
            const isPresent = presentSet.has(worker.id)
            return (
              <button
                key={worker.id}
                type="button"
                onClick={() => toggleWorker(worker.id)}
                className={cn(
                  "w-full flex items-center justify-between rounded-xl border px-3.5 py-3 transition-all",
                  "touch-manipulation active:scale-[0.98]",
                  isPresent
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-black/[0.06] bg-white",
                )}
              >
                <div className="min-w-0 text-left">
                  <p className={cn(
                    "text-sm font-semibold leading-tight",
                    isPresent ? "text-emerald-900" : "text-neutral-500",
                  )}>
                    {worker.name}
                  </p>
                  <p className={cn(
                    "text-[11px] mt-0.5",
                    isPresent ? "text-emerald-600" : "text-neutral-400",
                  )}>
                    {worker.dailyRate !== null
                      ? `₹${worker.dailyRate}/day`
                      : "No rate set"}
                  </p>
                </div>

                <div className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                  isPresent
                    ? "border-emerald-500 bg-emerald-500"
                    : "border-neutral-200 bg-white",
                )}>
                  {isPresent && <Check className="h-4 w-4 text-white stroke-[3]" />}
                </div>
              </button>
            )
          })
        )}

        {/* Quick-select row */}
        {!loading && workers.length > 0 && (
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPresentWorkerIds(workers.map((w) => w.id))}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-black/[0.06] bg-white py-2.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 active:scale-[0.98] touch-manipulation"
            >
              <Users className="h-3.5 w-3.5" />
              All present
            </button>
            <button
              type="button"
              onClick={() => setPresentWorkerIds([])}
              disabled={presentCount === 0}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-black/[0.06] bg-white py-2.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 active:scale-[0.98] touch-manipulation disabled:opacity-40"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Add employee */}
        <div className="pt-1">
          {!showAddWorker ? (
            <button
              type="button"
              onClick={() => setShowAddWorker(true)}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-200 py-3 text-xs font-medium text-neutral-400 hover:border-neutral-300 hover:text-neutral-500 transition-colors touch-manipulation"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Add employee
            </button>
          ) : (
            <form
              onSubmit={handleAddWorker}
              className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2"
            >
              <Input
                value={newWorkerName}
                onChange={(e) => setNewWorkerName(e.target.value)}
                placeholder="Employee name"
                className="flex-1 h-8 text-sm border-0 bg-transparent p-0 focus-visible:ring-0 placeholder:text-neutral-400"
                autoFocus
                disabled={isAddingWorker}
              />
              <Button
                type="submit"
                size="sm"
                className="h-8 bg-emerald-700 hover:bg-emerald-800 text-white"
                disabled={isAddingWorker || !newWorkerName.trim()}
              >
                {isAddingWorker ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
              </Button>
              <button
                type="button"
                onClick={() => { setShowAddWorker(false); setNewWorkerName("") }}
                className="text-xs text-neutral-400 hover:text-neutral-600 px-1"
              >
                Cancel
              </button>
            </form>
          )}
        </div>

        {/* Weekly summary — collapsed by default */}
        {weeklySummary.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowSummary(!showSummary)}
              className="w-full flex items-center justify-between px-1 py-2 text-xs font-medium text-neutral-500 hover:text-neutral-700 transition-colors"
            >
              <span>This week&apos;s summary</span>
              <span className="text-neutral-300">{showSummary ? "▲" : "▼"}</span>
            </button>
            {showSummary && (
              <div className="rounded-xl border border-black/[0.06] bg-neutral-50 overflow-hidden divide-y divide-black/[0.04]">
                {weeklySummary.map((row) => (
                  <div key={row.workerId} className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-sm text-neutral-700">{row.name}</span>
                    <span className="text-sm font-semibold text-neutral-900">
                      {row.daysPresent} {row.daysPresent === 1 ? "day" : "days"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky save bar */}
      {!loading && workers.length > 0 && !error && (
        <div className="fixed bottom-16 inset-x-0 px-3 pb-2 pt-1 bg-white/90 backdrop-blur-sm border-t border-black/[0.05] z-30">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              "w-full flex items-center justify-center gap-2 h-12 rounded-2xl",
              "bg-emerald-700 text-white text-sm font-semibold shadow-sm",
              "hover:bg-emerald-800 active:scale-[0.98] transition-all touch-manipulation",
              isSaving && "opacity-70 cursor-wait",
            )}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Check className="h-4 w-4 stroke-[2.5]" />
                Save muster · {presentCount} present
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
