"use client"

/**
 * The activity code list, as a lookup on the muster roll.
 *
 * Deliberately read-only. The roll is where somebody needs to know what 140 means at seven in the
 * morning; Costs is where the list is owned and edited. Putting the editor in both places would
 * be two front doors onto one table, which is the drift this whole redesign set out to remove --
 * so this one links there rather than reproducing it.
 *
 * Codes are searchable by number or by name, because an estate that knows it wants "weeding"
 * should not have to already know it is 131 and 151.
 */

import { useMemo, useState } from "react"
import { Search } from "lucide-react"

type ActivityOption = { code: string; reference?: string | null }

export default function ActivityCodeReference({ activities }: { activities: ActivityOption[] }) {
  const [query, setQuery] = useState("")

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return activities
    return activities.filter(
      (a) => a.code.toLowerCase().includes(q) || String(a.reference ?? "").toLowerCase().includes(q),
    )
  }, [activities, query])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a code or the work it covers"
          aria-label="Search activity codes"
          className="h-9 w-full rounded-lg border border-stone-200 bg-white pl-8 pr-3 text-xs text-stone-700 placeholder:text-stone-400 dark:border-white/[0.1] dark:bg-transparent dark:text-stone-200"
        />
      </div>

      {matches.length === 0 ? (
        <p className="px-1 py-3 text-xs text-stone-400">
          No code matches “{query}”. Codes are managed under Costs → Activity Codes.
        </p>
      ) : (
        // Capped height on purpose: this sits under a muster roll that is already long, and a
        // reference nobody asked to scroll past should not push the page down by eighty rows.
        <div className="max-h-64 overflow-y-auto rounded-lg border border-stone-200 dark:border-white/[0.06]">
          {matches.map((a) => (
            <div
              key={a.code}
              className="flex items-baseline gap-2 border-b border-stone-100 px-2.5 py-1.5 last:border-0 dark:border-white/[0.04]"
            >
              <span className="w-12 shrink-0 font-mono text-[11px] font-bold text-stone-500">{a.code}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-stone-700 dark:text-stone-300">
                {a.reference || "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="px-1 text-[11px] text-stone-400">
        {matches.length} of {activities.length} codes. Add or rename them under Costs → Activity Codes.
      </p>
    </div>
  )
}
