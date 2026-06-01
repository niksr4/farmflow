"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { ArrowRight, Check, Loader2, Minus, Plus, Search, X } from "lucide-react"
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

function todayStr() { return format(new Date(), "yyyy-MM-dd") }
function yesterdayStr() { return format(subDays(new Date(), 1), "yyyy-MM-dd") }

function activityEmoji(ref: string): string {
  const r = ref.toLowerCase()
  if (r.includes("prun")) return "✂️"
  if (r.includes("weed") || r.includes("slash")) return "🌿"
  if (r.includes("drip") || r.includes("irrig") || r.includes("water")) return "💧"
  if (r.includes("nursery")) return "🌱"
  if (r.includes("harvest") || r.includes("pick")) return "🧺"
  if (r.includes("spray") || r.includes("pest") || r.includes("borer")) return "🌫️"
  if (r.includes("manure") || r.includes("lime") || r.includes("fertil")) return "🌾"
  if (r.includes("transport") || r.includes("vehicle")) return "🚛"
  if (r.includes("maint") || r.includes("fence") || r.includes("road")) return "🔧"
  if (r.includes("compost")) return "♻️"
  if (r.includes("plant")) return "🪴"
  if (r.includes("salary") || r.includes("wage") || r.includes("bonus")) return "💰"
  return "⚡"
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
  const [savedSummary, setSavedSummary] = useState<{ reference: string; workers: number; total: number } | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

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
        .slice(0, 6)

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

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (activeCode && formRef.current) {
      setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50)
    }
  }, [activeCode])

  const openEntry = (code: ActivityCode) => {
    const rc: RecentCode = "useCount" in code
      ? (code as RecentCode)
      : { ...code, useCount: 0, lastUsedDate: "" }
    setActiveCode((prev) => prev?.code === rc.code ? null : rc)
    setWorkers(0)
    setEntryDate(todayStr())
    setShowSearch(false)
    setSearch("")
  }

  const handleSave = async () => {
    if (!activeCode || workers <= 0) { toast.error("Enter at least 1 worker"); return }
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
      setSavedSummary({ reference: activeCode.reference, workers, total: workers * wage })
      setActiveCode(null)
      window.dispatchEvent(new CustomEvent("farmflow:record-saved"))
      setTimeout(() => { setSavedCode(null); setSavedSummary(null); fetchData() }, 2000)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Couldn't save — try again")
    } finally {
      setSaving(false)
    }
  }

  const filteredActivities = search.trim()
    ? allActivities.filter((a) =>
        a.code.toLowerCase().includes(search.toLowerCase()) ||
        a.reference.toLowerCase().includes(search.toLowerCase()),
      ).slice(0, 8)
    : []

  const total = workers * wage
  const today = todayStr()
  const yesterday = yesterdayStr()

  return (
    <>
    {/* Full-screen save confirmation — covers the whole screen for 2 seconds */}
    {savedSummary && (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-emerald-700 touch-manipulation"
        onClick={() => setSavedSummary(null)}
      >
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/20 mb-6">
          <Check className="h-14 w-14 text-white stroke-[3]" />
        </div>
        <p className="text-4xl font-black text-white mb-2">Saved!</p>
        <p className="text-lg font-semibold text-white/90 mb-1">{savedSummary.reference}</p>
        <p className="text-base text-white/70">
          {savedSummary.workers} {savedSummary.workers === 1 ? "person" : "people"}
          {savedSummary.total > 0 ? ` · ${formatCurrency(savedSummary.total)}` : ""}
        </p>
        <p className="mt-8 text-xs text-white/40">Tap anywhere to continue</p>
      </div>
    )}
    <div className={cn("space-y-2", className)}>
      {/* Section header */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-stone-400">
          Quick log labour
        </p>
        <button
          type="button"
          onClick={() => { setShowSearch(!showSearch); setSearch("") }}
          className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 touch-manipulation"
        >
          <Search className="h-3 w-3" />
          Other
        </button>
      </div>

      {/* Search */}
      {showSearch && (
        <div className="space-y-1.5">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search activity codes…"
            className="h-11 text-base rounded-2xl border-stone-200 bg-white px-4"
            autoFocus
          />
          {filteredActivities.length > 0 && (
            <div className="rounded-2xl bg-white shadow-md overflow-hidden divide-y divide-stone-100">
              {filteredActivities.map((a) => (
                <button
                  key={a.code}
                  type="button"
                  onClick={() => openEntry(a)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-emerald-50 transition-colors touch-manipulation"
                >
                  <span className="text-xl">{activityEmoji(a.reference)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-stone-900 truncate">{a.reference}</p>
                    <p className="text-[10px] text-stone-400">{a.code}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-stone-300 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2-column tile grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-2.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-stone-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            {recentCodes.map((code) => {
              const isActive = activeCode?.code === code.code
              const justSaved = savedCode === code.code
              const emoji = activityEmoji(code.reference)
              return (
                <button
                  key={code.code}
                  type="button"
                  onClick={() => openEntry(code)}
                  className={cn(
                    "relative flex flex-col items-start rounded-2xl p-4 text-left transition-all",
                    "touch-manipulation active:scale-[0.96]",
                    isActive
                      ? "bg-emerald-700 shadow-lg shadow-emerald-200"
                      : justSaved
                        ? "bg-emerald-50 shadow-sm"
                        : "bg-white shadow-sm hover:shadow-md",
                  )}
                >
                  {justSaved && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-emerald-600">
                      <Check className="h-8 w-8 text-white stroke-[2.5]" />
                    </div>
                  )}
                  <span className="text-2xl mb-2 leading-none">{emoji}</span>
                  <p className={cn(
                    "text-sm font-bold leading-tight line-clamp-2",
                    isActive ? "text-white" : "text-stone-800",
                  )}>
                    {code.reference}
                  </p>
                  {code.useCount > 0 && (
                    <p className={cn(
                      "text-[10px] mt-1 font-medium",
                      isActive ? "text-emerald-200" : "text-stone-400",
                    )}>
                      {code.useCount}× used
                    </p>
                  )}
                </button>
              )
            })}
          </div>

          {/* Inline entry form — shown below the grid */}
          {activeCode && (
            <div ref={formRef} className="rounded-2xl bg-white shadow-md border border-emerald-100 overflow-hidden">
              {/* Activity label */}
              <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-stone-100">
                <span className="text-2xl">{activityEmoji(activeCode.reference)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-stone-900 truncate">{activeCode.reference}</p>
                  <p className="text-[11px] text-stone-400">{activeCode.code}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCode(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-stone-100 text-stone-400 touch-manipulation"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="px-4 py-4 space-y-4">
                {/* Workers stepper */}
                <div>
                  <div className="flex items-baseline justify-between mb-3">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-400">Workers today</p>
                    <p className="text-[10px] text-stone-400">use + / − or tap number to type</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setWorkers((w) => Math.max(0, w - 1))}
                      className="flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 text-stone-600 active:scale-95 transition-transform touch-manipulation"
                    >
                      <Minus className="h-5 w-5 stroke-[2.5]" />
                    </button>
                    <div className="flex flex-col items-center w-20">
                      <span className="text-5xl font-black text-stone-900 tabular-nums text-center leading-none">
                        {workers}
                      </span>
                      <span className="text-xs font-semibold text-stone-400 mt-1.5 uppercase tracking-wide">
                        {workers === 1 ? "person" : "people"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWorkers((w) => w + 1)}
                      className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-md active:scale-95 transition-transform touch-manipulation"
                    >
                      <Plus className="h-5 w-5 stroke-[2.5]" />
                    </button>
                  </div>
                </div>

                {/* Date selector */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-400 mb-2">
                    Date
                  </p>
                  <div className="flex gap-2">
                    {[
                      { label: "Today", value: today },
                      { label: "Yesterday", value: yesterday },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEntryDate(opt.value)}
                        className={cn(
                          "flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all touch-manipulation",
                          entryDate === opt.value
                            ? "bg-stone-900 text-white"
                            : "bg-stone-100 text-stone-500 hover:bg-stone-200",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                    <input
                      type="date"
                      value={entryDate !== today && entryDate !== yesterday ? entryDate : ""}
                      onChange={(e) => e.target.value && setEntryDate(e.target.value)}
                      className={cn(
                        "flex-1 rounded-xl py-2.5 text-sm font-semibold text-center touch-manipulation border-0 bg-stone-100 text-stone-500",
                        entryDate !== today && entryDate !== yesterday && "bg-stone-900 text-white [color-scheme:dark]",
                      )}
                    />
                  </div>
                </div>

                {/* Cost line */}
                {wage > 0 && workers > 0 && (
                  <p className="text-sm text-stone-500 text-right">
                    {workers} × {formatCurrency(wage)} ={" "}
                    <span className="font-bold text-stone-900">{formatCurrency(total)}</span>
                  </p>
                )}
                {wage === 0 && (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
                    Set a default wage in Settings to auto-calculate cost.
                  </p>
                )}

                {/* Save button */}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || workers <= 0}
                  className={cn(
                    "w-full h-14 rounded-2xl text-base font-bold transition-all active:scale-[0.98] touch-manipulation",
                    workers > 0
                      ? "bg-emerald-700 text-white shadow-md hover:bg-emerald-800"
                      : "bg-stone-100 text-stone-400 cursor-not-allowed",
                  )}
                >
                  {saving ? (
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  ) : workers > 0 && wage > 0 ? (
                    `Save  ·  ${formatCurrency(total)}`
                  ) : (
                    "Save"
                  )}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Link to full log */}
      {onNavigateToFull && (
        <button
          type="button"
          onClick={onNavigateToFull}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-stone-400 hover:text-stone-600 transition-colors touch-manipulation"
        >
          Log with more detail
          <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
    </>
  )
}
