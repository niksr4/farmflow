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
import { Check, Download, IndianRupee, Loader2, PlusCircle, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"

type AttendanceWorker = { id: string; name: string; dailyRate: number | null }
type AttendanceSummaryRow = { workerId: string; name: string; daysPresent: number }

function dateToStr(d: Date): string { return format(d, "yyyy-MM-dd") }

function getWeekDays(): Date[] {
  const start = startOfWeek(new Date(), { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export default function AttendanceTab() {
  const [selectedDate, setSelectedDate] = useState(dateToStr(new Date()))
  const [workers, setWorkers] = useState<AttendanceWorker[]>([])
  const [presentWorkerIds, setPresentWorkerIds] = useState<string[]>([])
  const [weeklySummary, setWeeklySummary] = useState<AttendanceSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isAddingWorker, setIsAddingWorker] = useState(false)
  const [newWorkerName, setNewWorkerName] = useState("")
  const [showAddWorker, setShowAddWorker] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoSelectedDate, setAutoSelectedDate] = useState<string | null>(null)

  const weekDays = useMemo(() => getWeekDays(), [])

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
        setError(null)

        if (fetchedPresent.length === 0 && fetchedWorkers.length > 0 && autoSelectedDate !== date) {
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

  const presentSet = useMemo(() => new Set(presentWorkerIds), [presentWorkerIds])
  const presentCount = presentWorkerIds.length
  const absentCount = workers.length - presentCount
  const noRateWorkers = workers.filter((w) => w.dailyRate === null)

  const toggleWorker = (id: string) => {
    setPresentWorkerIds((cur) => {
      const s = new Set(cur)
      s.has(id) ? s.delete(id) : s.add(id)
      return Array.from(s)
    })
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = await fetch("/api/attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, presentWorkerIds }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to save")
      toast.success(`Saved — ${presentCount} present`)
      await loadSnapshot(selectedDate)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setIsSaving(false)
    }
  }

  const exportWeeklySummaryToCSV = () => {
    const weekLabel = dateToStr(weekDays[0])
    const headers = ["Worker", "Days Present"]
    const rows = weeklySummary.map((row) => [row.name, String(row.daysPresent)])
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
        body: JSON.stringify({ name: newWorkerName }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to add")
      toast.success(`${data.worker?.name || "Employee"} added`)
      setNewWorkerName("")
      setShowAddWorker(false)
      setAutoSelectedDate(null)
      await loadSnapshot(selectedDate)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to add")
    } finally {
      setIsAddingWorker(false)
    }
  }

  return (
    <div className="pb-28">
      {/* Day strip */}
      <div className="sticky top-0 z-10 bg-white border-b border-stone-100 px-3 pt-2 pb-3 space-y-2">
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
          workers.map((worker) => {
            const isPresent = presentSet.has(worker.id)
            return (
              <button
                key={worker.id}
                type="button"
                onClick={() => toggleWorker(worker.id)}
                className={cn(
                  "w-full flex items-center justify-between rounded-2xl px-4 py-4",
                  "transition-all active:scale-[0.98] touch-manipulation",
                  isPresent
                    ? "bg-emerald-600 shadow-md shadow-emerald-100"
                    : "bg-white shadow-sm",
                )}
              >
                <div className="text-left min-w-0">
                  <p className={cn(
                    "text-base font-bold leading-tight truncate",
                    isPresent ? "text-white" : "text-stone-500",
                  )}>
                    {worker.name}
                  </p>
                  <p className={cn(
                    "text-xs font-medium mt-0.5",
                    isPresent ? "text-emerald-200" : "text-stone-400",
                  )}>
                    {worker.dailyRate !== null ? `₹${worker.dailyRate}/day` : "No rate"}
                  </p>
                </div>
                <div className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all",
                  isPresent ? "bg-white/20" : "border-2 border-stone-200 bg-white",
                )}>
                  {isPresent && <Check className="h-5 w-5 text-white stroke-[3]" />}
                </div>
              </button>
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
            className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2.5"
          >
            <Input
              value={newWorkerName}
              onChange={(e) => setNewWorkerName(e.target.value)}
              placeholder="Employee name"
              className="flex-1 h-9 text-base border-0 bg-transparent p-0 focus-visible:ring-0"
              autoFocus
              disabled={isAddingWorker}
            />
            <Button
              type="submit"
              size="sm"
              className="h-9 rounded-xl bg-emerald-700 hover:bg-emerald-800"
              disabled={isAddingWorker || !newWorkerName.trim()}
            >
              {isAddingWorker ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
            </Button>
            <button type="button" onClick={() => { setShowAddWorker(false); setNewWorkerName("") }}
              className="text-xs text-stone-400 px-1">Cancel</button>
          </form>
        )}

        {/* Weekly summary */}
        {weeklySummary.length > 0 && (
          <div className="pt-1">
            <div className="flex items-center justify-between px-1 py-1">
              <button
                type="button"
                onClick={() => setShowSummary(!showSummary)}
                className="flex flex-1 items-center justify-between py-1.5 text-xs font-bold uppercase tracking-widest text-stone-400"
              >
                <span>Week summary</span>
                <span className="ml-2">{showSummary ? "▲" : "▼"}</span>
              </button>
              <Button size="sm" variant="outline" onClick={exportWeeklySummaryToCSV} className="h-8 shrink-0 bg-transparent px-2.5 text-xs">
                <Download className="mr-1.5 h-3.5 w-3.5" /> Export
              </Button>
            </div>
            {showSummary && (
              <div className="rounded-2xl bg-white shadow-sm overflow-hidden divide-y divide-stone-50">
                {weeklySummary.map((row) => (
                  <div key={row.workerId} className="flex items-center justify-between px-4 py-3.5">
                    <span className="text-sm font-semibold text-stone-700">{row.name}</span>
                    <span className="text-base font-black text-stone-900">
                      {row.daysPresent}d
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
