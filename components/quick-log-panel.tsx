"use client"

import { useEffect, useState, useCallback } from "react"
import { ChevronRight, Loader2, Plus, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type ActivityCode = {
  code: string
  reference: string
}

type RecentCode = ActivityCode & {
  useCount: number
  lastUsedDate: string
}

type QuickLogPanelProps = {
  // Called when user wants to open the full labor form pre-filled
  onQuickLog: (code: string, reference: string) => void
  className?: string
}

// Top HoneyFarm activity codes by real usage (from DB analysis):
// 210 Nursery (86), 152 Robusta Pruning (48), 150 Drip Maintenance (46),
// 132 Arabica Pruning (46), 163 Robusta Irrigation (45)
// These are the fallback if no recent entries found
const ESTATE_TOP_CODES: ActivityCode[] = [
  { code: "210", reference: "Nursery" },
  { code: "152", reference: "Robusta Pruning" },
  { code: "150", reference: "Drip Maintenance" },
  { code: "132", reference: "Arabica Pruning" },
  { code: "163", reference: "Irrigation" },
]

const CODE_COLORS = [
  "bg-emerald-100 border-emerald-200 text-emerald-800 hover:bg-emerald-200",
  "bg-sky-100 border-sky-200 text-sky-800 hover:bg-sky-200",
  "bg-violet-100 border-violet-200 text-violet-800 hover:bg-violet-200",
  "bg-amber-100 border-amber-200 text-amber-800 hover:bg-amber-200",
  "bg-rose-100 border-rose-200 text-rose-800 hover:bg-rose-200",
]

export default function QuickLogPanel({ onQuickLog, className }: QuickLogPanelProps) {
  const [recentCodes, setRecentCodes] = useState<RecentCode[]>([])
  const [allActivities, setAllActivities] = useState<ActivityCode[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [showSearch, setShowSearch] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [activitiesRes, laborRes] = await Promise.all([
        fetch("/api/get-activity"),
        fetch("/api/labor-neon?limit=100"),
      ])
      const [activitiesData, laborData] = await Promise.all([
        activitiesRes.json(),
        laborRes.json(),
      ])

      const activities: ActivityCode[] = activitiesData.success ? (activitiesData.activities || []) : []
      setAllActivities(activities)

      // Count recent code usage
      const codeCount = new Map<string, { count: number; lastDate: string; reference: string }>()
      if (laborData.success && Array.isArray(laborData.deployments)) {
        for (const dep of laborData.deployments) {
          const code = String(dep.code || "")
          const date = String(dep.date || "").slice(0, 10)
          const existing = codeCount.get(code)
          const ref = dep.reference || activities.find(a => a.code === code)?.reference || code
          if (!existing || date > existing.lastDate) {
            codeCount.set(code, { count: (existing?.count || 0) + 1, lastDate: date, reference: ref })
          } else {
            codeCount.set(code, { ...existing, count: existing.count + 1 })
          }
        }
      }

      // Build sorted recent list
      const recent: RecentCode[] = Array.from(codeCount.entries())
        .map(([code, v]) => ({ code, reference: v.reference, useCount: v.count, lastUsedDate: v.lastDate }))
        .sort((a, b) => b.useCount - a.useCount || b.lastUsedDate.localeCompare(a.lastUsedDate))
        .slice(0, 5)

      if (recent.length > 0) {
        setRecentCodes(recent)
      } else {
        // Fall back to pre-seeded top codes enriched with activity labels
        setRecentCodes(
          ESTATE_TOP_CODES.map(c => {
            const found = activities.find(a => a.code === c.code)
            return { ...c, reference: found?.reference || c.reference, useCount: 0, lastUsedDate: "" }
          }),
        )
      }
    } catch {
      setRecentCodes(ESTATE_TOP_CODES.map(c => ({ ...c, useCount: 0, lastUsedDate: "" })))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filteredActivities = search.trim()
    ? allActivities.filter(
        (a) =>
          a.code.toLowerCase().includes(search.toLowerCase()) ||
          a.reference.toLowerCase().includes(search.toLowerCase()),
      )
    : []

  return (
    <div className={cn(
      "rounded-2xl border border-black/[0.06] bg-white/60 backdrop-blur-xl backdrop-saturate-150",
      "shadow-[0_8px_32px_-8px_rgba(0,0,0,0.10),0_1px_2px_rgba(0,0,0,0.04)]",
      "overflow-hidden",
      className,
    )}>
      {/* Glass gradient overlay */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/40 to-transparent rounded-2xl" />

      <div className="relative px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-700 shadow-sm">
              <Zap className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-900 leading-tight">Quick log labor</p>
              <p className="text-[10px] text-neutral-400">Your most-used activity codes</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSearch(!showSearch)}
            className="text-[11px] text-emerald-700 font-medium hover:text-emerald-800 flex items-center gap-0.5"
          >
            <Plus className="h-3 w-3" />
            Other
          </button>
        </div>

        {showSearch && (
          <div className="mb-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search activity codes..."
              className="h-9 text-sm rounded-xl border-black/10 bg-white/80"
              autoFocus
            />
            {filteredActivities.length > 0 && (
              <div className="mt-1.5 rounded-xl border border-black/[0.06] bg-white/90 backdrop-blur-sm overflow-hidden divide-y divide-black/[0.04] shadow-lg max-h-48 overflow-y-auto">
                {filteredActivities.slice(0, 8).map((a) => (
                  <button
                    key={a.code}
                    type="button"
                    onClick={() => { onQuickLog(a.code, a.reference); setShowSearch(false); setSearch("") }}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-emerald-50 transition-colors"
                  >
                    <div>
                      <span className="text-[11px] font-mono text-neutral-400 mr-2">{a.code}</span>
                      <span className="text-sm text-neutral-800">{a.reference}</span>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-neutral-300" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quick-tap tiles */}
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-neutral-300" />
          </div>
        ) : (
          <div className="space-y-1.5">
            {recentCodes.map((code, i) => (
              <button
                key={code.code}
                type="button"
                onClick={() => onQuickLog(code.code, code.reference)}
                className={cn(
                  "w-full flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-all active:scale-[0.98] shadow-[0_1px_3px_rgba(0,0,0,0.05)]",
                  CODE_COLORS[i % CODE_COLORS.length],
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-[11px] font-bold opacity-60">{code.code}</span>
                  <span className="text-sm font-medium">{code.reference}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {code.useCount > 0 && (
                    <span className="text-[10px] opacity-50">{code.useCount}×</span>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
