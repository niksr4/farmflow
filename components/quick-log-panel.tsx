"use client"

import { useEffect, useState, useCallback } from "react"
import { ArrowRight, Check, ChevronDown, Loader2, Minus, Plus, Search, X, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { formatCurrency } from "@/lib/format"
import { useTenantSettings } from "@/hooks/use-tenant-settings"
import { format, subDays } from "date-fns"
import { toast } from "sonner"

type ActivityCode = { code: string; reference: string }
type RecentCode = ActivityCode & { useCount: number; lastUsedDate: string }

type QuickLogPanelProps = {
  onNavigateToFull?: () => void
  locationId?: string
  className?: string
}

const ESTATE_TOP_CODES: ActivityCode[] = [
  { code: "210", reference: "Nursery" },
  { code: "152", reference: "Robusta Pruning" },
  { code: "150", reference: "Drip Maintenance" },
  { code: "132", reference: "Arabica Pruning" },
  { code: "163", reference: "Irrigation" },
]

function todayStr() {
  return format(new Date(), "yyyy-MM-dd")
}
function yesterdayStr() {
  return format(subDays(new Date(), 1), "yyyy-MM-dd")
}

export default function QuickLogPanel({ onNavigateToFull, locationId, className }: QuickLogPanelProps) {
  const [recentCodes, setRecentCodes] = useState<RecentCode[]>([])
  const [allActivities, setAllActivities] = useState<ActivityCode[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showSearch, setShowSearch] = useState(false)

  const [activeCode, setActiveCode] = useState<RecentCode | null>(null)
  const [workers, setWorkers] = useState(0)
  const [entryDate, setEntryDate] = useState(todayStr())
  const [saving, setSaving] = useState(false)
  const [savedCode, setSavedCode] = useState<string | null>(null)

  const { settings } = useTenantSettings()
  const wage = settings.laborWages?.defaultInHouseWage ?? 0

  const fetchData = useCallback(async () => {
    try {
      const [activitiesRes, laborRes] = await Promise.all([
        fetch(locationId ? `/api/get-activity?locationId=${locationId}` : "/api/get-activity"),
        fetch("/api/labor-neon?limit=100"),
      ])
      const [activitiesData, laborData] = await Promise.all([
        activitiesRes.json(),
        laborRes.json(),
      ])

      const activities: ActivityCode[] = activitiesData.success ? (activitiesData.activities || []) : []
      setAllActivities(activities)

      const codeCount = new Map<string, { count: number; lastDate: string; reference: string }>()
      if (laborData.success && Array.isArray(laborData.deployments)) {
        for (const dep of laborData.deployments) {
          const code = String(dep.code || "")
          const date = String(dep.date || "").slice(0, 10)
          const ref = dep.reference || activities.find((a) => a.code === code)?.reference || code
          const existing = codeCount.get(code)
          if (!existing || date > existing.lastDate) {
            codeCount.set(code, { count: (existing?.count || 0) + 1, lastDate: date, reference: ref })
          } else {
            codeCount.set(code, { ...existing, count: existing.count + 1 })
          }
        }
      }

      const recent: RecentCode[] = Array.from(codeCount.entries())
        .map(([code, v]) => ({ code, reference: v.reference, useCount: v.count, lastUsedDate: v.lastDate }))
        .sort((a, b) => b.useCount - a.useCount || b.lastUsedDate.localeCompare(a.lastUsedDate))
        .slice(0, 5)

      setRecentCodes(
        recent.length > 0
          ? recent
          : ESTATE_TOP_CODES.map((c) => ({
              ...c,
              reference: activities.find((a) => a.code === c.code)?.reference || c.reference,
              useCount: 0,
              lastUsedDate: "",
            })),
      )
    } catch {
      setRecentCodes(ESTATE_TOP_CODES.map((c) => ({ ...c, useCount: 0, lastUsedDate: "" })))
    } finally {
      setLoading(false)
    }
  }, [locationId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const openEntry = (code: ActivityCode) => {
    const rc: RecentCode = "useCount" in code
      ? (code as RecentCode)
      : { ...code, useCount: 0, lastUsedDate: "" }
    setActiveCode(rc)
    setWorkers(0)
    setEntryDate(todayStr())
    setShowSearch(false)
    setSearch("")
  }

  const handleSave = async () => {
    if (!activeCode || workers <= 0) {
      toast.error("Enter at least 1 worker")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/labor-neon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: new Date(entryDate + "T12:00:00").toISOString(),
          code: activeCode.code,
          reference: activeCode.reference,
          laborEntries: [{ name: "In-house", laborCount: workers, costPerLabor: wage }],
          totalCost: workers * wage,
          ...(locationId ? { locationId } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Save failed")

      setSavedCode(activeCode.code)
      setActiveCode(null)
      window.dispatchEvent(new CustomEvent("farmflow:record-saved"))
      setTimeout(() => {
        setSavedCode(null)
        fetchData()
      }, 2000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Couldn't save — try again"
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const filteredActivities = search.trim()
    ? allActivities
        .filter(
          (a) =>
            a.code.toLowerCase().includes(search.toLowerCase()) ||
            a.reference.toLowerCase().includes(search.toLowerCase()),
        )
        .slice(0, 8)
    : []

  const total = workers * wage
  const today = todayStr()
  const yesterday = yesterdayStr()

  return (
    <div
      className={cn(
        "rounded-2xl border border-black/[0.06] bg-white overflow-hidden",
        "shadow-[0_2px_16px_rgba(0,0,0,0.06)]",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.05]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-700 shadow-sm">
            <Zap className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900 leading-tight">Quick log labor</p>
            <p className="text-[10px] text-neutral-400 leading-none mt-0.5">Tap to log, no form needed</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowSearch(!showSearch)
            setSearch("")
          }}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-neutral-500 hover:bg-neutral-100 transition-colors"
        >
          <Search className="h-3 w-3" />
          Other
        </button>
      </div>

      <div className="px-3 py-3 space-y-2">
        {/* Search */}
        {showSearch && (
          <div className="space-y-1.5">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search activity codes..."
              className="h-9 text-sm rounded-xl border-black/[0.08]"
              autoFocus
            />
            {filteredActivities.length > 0 && (
              <div className="rounded-xl border border-black/[0.06] bg-white overflow-hidden divide-y divide-black/[0.04] shadow-lg max-h-52 overflow-y-auto">
                {filteredActivities.map((a) => (
                  <button
                    key={a.code}
                    type="button"
                    onClick={() => openEntry(a)}
                    className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-emerald-50 transition-colors active:bg-emerald-100"
                  >
                    <span className="font-mono text-[10px] text-neutral-400 shrink-0 w-8">{a.code}</span>
                    <span className="text-sm text-neutral-800 flex-1">{a.reference}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Code tiles */}
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-neutral-300" />
          </div>
        ) : (
          <div className="space-y-1.5">
            {recentCodes.map((code) => {
              const isActive = activeCode?.code === code.code
              const justSaved = savedCode === code.code

              return (
                <div key={code.code}>
                  <button
                    type="button"
                    onClick={() => (isActive ? setActiveCode(null) : openEntry(code))}
                    className={cn(
                      "w-full flex items-center justify-between rounded-xl border px-3 py-3 text-left",
                      "transition-all active:scale-[0.98] touch-manipulation",
                      isActive
                        ? "border-emerald-300 bg-emerald-50"
                        : justSaved
                          ? "border-emerald-200 bg-emerald-50/60"
                          : "border-black/[0.06] bg-white hover:bg-neutral-50",
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono text-[10px] text-neutral-400 shrink-0">{code.code}</span>
                      <span className="text-sm font-medium text-neutral-800 truncate">{code.reference}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {justSaved ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <>
                          {code.useCount > 0 && (
                            <span className="text-[10px] text-neutral-400">{code.useCount}×</span>
                          )}
                          <ChevronDown
                            className={cn(
                              "h-3.5 w-3.5 text-neutral-300 transition-transform duration-200",
                              isActive && "-rotate-180",
                            )}
                          />
                        </>
                      )}
                    </div>
                  </button>

                  {/* Inline entry form — expands under the tile */}
                  {isActive && (
                    <div className="mt-1.5 rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-3 space-y-3">
                      {/* Workers stepper */}
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm font-medium text-neutral-700">Workers today</span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setWorkers((w) => Math.max(0, w - 1))}
                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-black/[0.08] bg-white text-neutral-700 shadow-sm active:scale-95 transition-transform touch-manipulation"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-10 text-center text-2xl font-bold text-neutral-900 tabular-nums">
                            {workers}
                          </span>
                          <button
                            type="button"
                            onClick={() => setWorkers((w) => w + 1)}
                            className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-sm active:scale-95 transition-transform touch-manipulation"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Date selector */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-neutral-700 shrink-0 w-10">Date</span>
                        <div className="flex items-center gap-1.5 flex-1">
                          <button
                            type="button"
                            onClick={() => setEntryDate(today)}
                            className={cn(
                              "flex-1 rounded-lg border py-2 text-xs font-medium transition-all touch-manipulation",
                              entryDate === today
                                ? "border-emerald-400 bg-emerald-700 text-white"
                                : "border-black/[0.08] bg-white text-neutral-600 hover:bg-neutral-50",
                            )}
                          >
                            Today
                          </button>
                          <button
                            type="button"
                            onClick={() => setEntryDate(yesterday)}
                            className={cn(
                              "flex-1 rounded-lg border py-2 text-xs font-medium transition-all touch-manipulation",
                              entryDate === yesterday
                                ? "border-emerald-400 bg-emerald-700 text-white"
                                : "border-black/[0.08] bg-white text-neutral-600 hover:bg-neutral-50",
                            )}
                          >
                            Yesterday
                          </button>
                          <input
                            type="date"
                            value={entryDate !== today && entryDate !== yesterday ? entryDate : ""}
                            onChange={(e) => e.target.value && setEntryDate(e.target.value)}
                            className={cn(
                              "flex-1 rounded-lg border py-2 text-xs font-medium text-center touch-manipulation transition-all",
                              entryDate !== today && entryDate !== yesterday
                                ? "border-emerald-400 bg-emerald-700 text-white [color-scheme:dark]"
                                : "border-black/[0.08] bg-white text-neutral-500",
                            )}
                          />
                        </div>
                      </div>

                      {/* Cost summary */}
                      {wage > 0 && workers > 0 && (
                        <p className="text-xs text-right text-neutral-500">
                          {workers} × {formatCurrency(wage)} ={" "}
                          <span className="font-semibold text-neutral-800">{formatCurrency(total)}</span>
                        </p>
                      )}
                      {wage === 0 && (
                        <p className="text-xs text-amber-600">
                          Set a default wage in Settings to track cost automatically.
                        </p>
                      )}

                      {/* Save / cancel */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveCode(null)}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/[0.08] bg-white text-neutral-400 active:scale-95 touch-manipulation"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={handleSave}
                          disabled={saving || workers <= 0}
                          className={cn(
                            "flex-1 h-10 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] touch-manipulation",
                            workers > 0
                              ? "bg-emerald-700 text-white shadow-sm hover:bg-emerald-800"
                              : "bg-neutral-100 text-neutral-400 cursor-not-allowed",
                          )}
                        >
                          {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                          ) : workers > 0 && wage > 0 ? (
                            `Save · ${formatCurrency(total)}`
                          ) : (
                            "Save"
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Link to full labor log */}
        {onNavigateToFull && (
          <button
            type="button"
            onClick={onNavigateToFull}
            className="w-full flex items-center justify-between px-2 py-2 text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <span>View full labor log & history</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}
