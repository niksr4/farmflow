"use client"

/**
 * Per-worker work allocation, inline on the muster row.
 *
 * Individual, not bulk, and not carried over from yesterday -- both at the estate owner's
 * request. His reasoning held twice: a row that is already answered, or answered for five people
 * at once, invites confirmation rather than observation, and the entry stops being a deliberate
 * act. So each worker's work and block is chosen on their own row, every day.
 *
 * The fingerprint terminal is what makes that affordable. A punch settles presence for the whole
 * crew before anyone opens the app, so the taps that remain are only the judgement ones.
 *
 * Blocks are not restricted to the worker's own estate: crews move between estates as the work
 * demands. Their own estate's blocks are listed first, everything else after -- guided, not fenced.
 */

import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

type LocationOption = { id: string; name: string; code?: string | null; estate?: string | null }
type ActivityOption = { code: string; reference?: string | null }

const NO_BLOCK = "__no_block__"

/** A full day unless someone says otherwise; the rest cover splits and overtime. */
const DAY_SHARES = [
  { value: 1, label: "Full" },
  { value: 0.5, label: "Half" },
  { value: 0.25, label: "¼" },
  { value: 1.5, label: "1½" },
] as const

export default function WorkerAllocation({
  workerEstate, locations, activities, saving, onAdd, onClose,
}: {
  workerEstate: string | null
  locations: LocationOption[]
  activities: ActivityOption[]
  saving: boolean
  onAdd: (payload: { activityCode: string; locationId: string | null; dayFraction: number }) => Promise<boolean>
  onClose: () => void
}) {
  const [activityCode, setActivityCode] = useState("")
  const [locationId, setLocationId] = useState(NO_BLOCK)
  const [dayFraction, setDayFraction] = useState(1)
  const [busy, setBusy] = useState(false)

  // Own estate first, then everywhere else. Nothing is hidden -- workers get moved across estates
  // as the work demands, and a picker that forbids it just sends the truth back into free text.
  const grouped = useMemo(() => {
    const mine = locations.filter((l) => workerEstate && l.estate === workerEstate)
    const rest = locations.filter((l) => !workerEstate || l.estate !== workerEstate)
    return { mine, rest }
  }, [locations, workerEstate])

  const submit = async () => {
    if (!activityCode) return
    setBusy(true)
    const ok = await onAdd({
      activityCode,
      locationId: locationId === NO_BLOCK ? null : locationId,
      dayFraction,
    })
    setBusy(false)
    if (ok) {
      setActivityCode("")
      setLocationId(NO_BLOCK)
      setDayFraction(1)
      onClose()
    }
  }

  return (
    <div
      className="mt-2 space-y-1.5 rounded-xl bg-white/95 p-2 dark:bg-card"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Select value={activityCode} onValueChange={setActivityCode}>
        <SelectTrigger aria-label="Work" className="h-9 text-xs"><SelectValue placeholder="What work?" /></SelectTrigger>
        <SelectContent>
          {activities.map((a) => (
            <SelectItem key={a.code} value={a.code}>
              {a.code}{a.reference ? ` — ${a.reference}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={locationId} onValueChange={setLocationId}>
        <SelectTrigger aria-label="Block" className="h-9 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_BLOCK}>No particular block</SelectItem>
          {grouped.mine.length > 0 && (
            <SelectGroup>
              <SelectLabel>{workerEstate}</SelectLabel>
              {grouped.mine.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectGroup>
          )}
          {grouped.rest.length > 0 && (
            <SelectGroup>
              <SelectLabel>{grouped.mine.length > 0 ? "Other estates" : "Blocks"}</SelectLabel>
              {grouped.rest.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1">
        {DAY_SHARES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setDayFraction(s.value)}
            className={cn(
              "h-8 flex-1 rounded-lg border text-[11px] font-bold touch-manipulation",
              dayFraction === s.value
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-stone-200 bg-white text-stone-600 dark:border-white/[0.1] dark:bg-transparent",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={!activityCode || busy || saving}
          onClick={submit}
          className="h-9 flex-1 rounded-lg bg-emerald-600 text-xs font-bold text-white disabled:opacity-40 touch-manipulation"
        >
          {busy ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : "Add"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-lg px-3 text-xs font-bold text-stone-500 touch-manipulation"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
