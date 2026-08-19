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
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type LocationOption = { id: string; name: string; code?: string | null; estate?: string | null }
type ActivityOption = { code: string; reference?: string | null }

const NO_BLOCK = "__no_block__"

/**
 * A full day unless someone says otherwise, half when they left at noon, and double pay on a
 * holiday.
 *
 * Double pay is a multiplier, not a longer day: the money doubles while the day stays one. Two
 * days' worth of day_fraction would have shown the block twice the labour it actually received,
 * and labour-days per acre is what the per-acre analysis rests on.
 */
const DAY_SHARES = [
  { value: 1, multiplier: 1, label: "Full" },
  { value: 0.5, multiplier: 1, label: "Half" },
  { value: 1, multiplier: 2, label: "Holiday 2x" },
] as const

export default function WorkerAllocation({
  workerEstate, locations, activities, saving, editing, headcount, isGang, workerRate, onAdd, onClose,
}: {
  workerEstate: string | null
  locations: LocationOption[]
  activities: ActivityOption[]
  saving: boolean
  /** An existing job being corrected, or null when setting a new one. */
  editing: { id: string; activityCode: string; locationId: string | null; dayFraction: number } | null
  /** A gang carries its crew size; an individual is always one. */
  headcount: number
  /** The estate's normal wage for this person -- the base of the rate chain. */
  workerRate: number | null
  isGang: boolean
  onAdd: (payload: {
    id?: string
    activityCode: string
    locationId: string | null
    dayFraction: number
    payMultiplier: number
    rate: number | null
    headcount?: number
    driverCharge?: number | null
    supervisorCharge?: number | null
    vehicleCharge?: number | null
  }) => Promise<boolean>
  onClose: () => void
}) {
  const [activityCode, setActivityCode] = useState(editing?.activityCode ?? "")
  const [locationId, setLocationId] = useState(editing?.locationId ?? NO_BLOCK)
  const [dayFraction, setDayFraction] = useState(editing?.dayFraction ?? 1)
  const [payMultiplier, setPayMultiplier] = useState(1)
  // Blank means "whatever this work pays"; typing here prices this one entry differently without
  // changing the code for everyone.
  const [rateOverride, setRateOverride] = useState("")
  const [crew, setCrew] = useState(String(headcount || 1))
  const [driver, setDriver] = useState("")
  const [supervisor, setSupervisor] = useState("")
  const [vehicle, setVehicle] = useState("")
  const [busy, setBusy] = useState(false)

  // The daily wage, unless this day was worth something else. Work that pays differently is
  // priced on the day rather than kept in a rate table: the exceptions vary by day, gang and
  // season, so a stored rate would be stale more often than right. Shown before saving, because
  // a cost nobody can see is a cost nobody checks.
  const typed = rateOverride.trim() !== "" ? Number(rateOverride) : null
  const effectiveRate = typed ?? workerRate
  const rateSource = typed != null ? "this entry" : workerRate != null ? "daily wage" : null
  const heads = isGang ? Math.max(1, Number(crew) || 1) : 1
  const extras = [driver, supervisor, vehicle].reduce((sum, v) => sum + (Number(v) || 0), 0)
  const total =
    effectiveRate == null || !Number.isFinite(effectiveRate)
      ? null
      : effectiveRate * heads * dayFraction * payMultiplier + extras

  const [workQuery, setWorkQuery] = useState("")

  // Matches the code OR its description, and on every word typed rather than as a prefix, so
  // "shade lop" finds "134 Arabica Shade Work" and "lopping" finds it too. An estate's name for
  // a job rarely matches the code list word for word -- Medappa call it Shade Lopping, the list
  // calls it Arabica Shade Work -- and a prefix match would find neither.
  const matchingActivities = useMemo(() => {
    const terms = workQuery.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return activities
    return activities.filter((a) => {
      const haystack = `${a.code} ${a.reference ?? ""}`.toLowerCase()
      return terms.every((t) => haystack.includes(t))
    })
  }, [activities, workQuery])

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
      ...(editing ? { id: editing.id } : {}),
      activityCode,
      locationId: locationId === NO_BLOCK ? null : locationId,
      dayFraction,
      payMultiplier,
      rate: rateOverride.trim() !== "" ? Number(rateOverride) : null,
      ...(isGang ? { headcount: heads } : {}),
      driverCharge: Number(driver) || null,
      supervisorCharge: Number(supervisor) || null,
      vehicleCharge: Number(vehicle) || null,
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
      {/* Searchable, because the list is 80 codes long on a real estate and this is used on a
          phone, standing in a field, at 7am. Medappa's writer asked for "Shade Looping" on day
          one and could not find it -- the estate's word for the job is not always the word in
          the code list, and scrolling eighty items to discover that is not a search. Matching on
          the description as well as the code is what makes "shade" reach 134 Arabica Shade Work. */}
      <Select value={activityCode} onValueChange={setActivityCode} onOpenChange={(open) => !open && setWorkQuery("")}>
        <SelectTrigger aria-label="Work" className="h-9 text-xs"><SelectValue placeholder="What work?" /></SelectTrigger>
        <SelectContent>
          <div className="sticky top-0 z-10 bg-popover px-1.5 pb-1.5 pt-1">
            <Input
              autoFocus
              value={workQuery}
              onChange={(e) => setWorkQuery(e.target.value)}
              // Radix Select types ahead to jump between items; without this the search box
              // never receives the keystrokes it is asking for.
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Search work or code…"
              className="h-8 text-xs"
            />
          </div>
          {matchingActivities.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              No work matches “{workQuery}”. Add it under Costs → Codes.
            </p>
          ) : (
            matchingActivities.map((a) => (
              <SelectItem key={a.code} value={a.code}>
                {a.code}{a.reference ? ` — ${a.reference}` : ""}
              </SelectItem>
            ))
          )}
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
        {DAY_SHARES.map((share) => {
          const active = dayFraction === share.value && payMultiplier === share.multiplier
          return (
            <button
              key={share.label}
              type="button"
              onClick={() => { setDayFraction(share.value); setPayMultiplier(share.multiplier) }}
              className={cn(
                "h-8 flex-1 rounded-lg border text-[11px] font-bold touch-manipulation",
                active
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-stone-200 bg-white text-stone-600 dark:border-white/[0.1] dark:bg-transparent",
              )}
            >
              {share.label}
            </button>
          )
        })}
      </div>

      {/* A gang is one line on the roll, so the crew size is the thing that changes day to day --
          eleven booked, eight turned up. */}
      {isGang && (
        <label className="flex items-center gap-2 text-[11px] font-semibold text-stone-500">
          <span className="w-20 shrink-0">Who came</span>
          <input
            type="number" inputMode="numeric" min={1} value={crew}
            onChange={(e) => setCrew(e.target.value)}
            aria-label="Crew who turned up"
            className="h-8 w-16 rounded-lg border border-stone-200 px-2 text-xs tabular-nums dark:border-white/[0.1] dark:bg-transparent"
          />
          <span className="text-stone-400">of {headcount}</span>
        </label>
      )}

      {/* The rate this work pays. Prefilled from the code so nobody types it twice a morning, and
          editable because one day is occasionally not like the others. */}
      <label className="flex items-center gap-2 text-[11px] font-semibold text-stone-500">
        <span className="w-20 shrink-0">Rate / day</span>
        <input
          type="number" inputMode="decimal" min={0}
          value={rateOverride}
          onChange={(e) => setRateOverride(e.target.value)}
          placeholder={effectiveRate != null ? String(effectiveRate) : "no rate yet"}
          aria-label="Rate per day"
          className="h-8 flex-1 rounded-lg border border-stone-200 px-2 text-xs tabular-nums placeholder:text-stone-400 dark:border-white/[0.1] dark:bg-transparent"
        />
      </label>

      {/* A gang day is heads times rate, plus whatever else that day needed. Left blank when you
          sent your own car. */}
      {isGang && (
        <div className="flex items-center gap-1">
          {([["Driver", driver, setDriver], ["Supervisor", supervisor, setSupervisor], ["Vehicle", vehicle, setVehicle]] as const).map(
            ([label, value, set]) => (
              <input
                key={label}
                type="number" inputMode="decimal" min={0}
                value={value}
                onChange={(e) => set(e.target.value)}
                placeholder={label}
                aria-label={`${label} charge`}
                className="h-8 min-w-0 flex-1 rounded-lg border border-stone-200 px-2 text-[11px] tabular-nums placeholder:text-stone-400 dark:border-white/[0.1] dark:bg-transparent"
              />
            ),
          )}
        </div>
      )}

      {/* What it will cost, before it is saved. */}
      <p className="px-0.5 text-[11px] font-bold text-stone-500">
        {total == null ? (
          <span className="text-amber-600">
            No daily wage for this worker — type what today is worth
          </span>
        ) : (
          <>
            <span className="text-stone-700 dark:text-stone-200">₹{Math.round(total).toLocaleString("en-IN")}</span>
            <span className="ml-1 font-medium text-stone-400">
              = ₹{effectiveRate}{rateSource ? ` (${rateSource})` : ""}{isGang ? ` × ${heads}` : ""}{dayFraction !== 1 ? ` × ${dayFraction}` : ""}
              {payMultiplier !== 1 ? ` × ${payMultiplier} holiday` : ""}
              {extras > 0 ? ` + ₹${extras.toLocaleString("en-IN")} extras` : ""}
            </span>
          </>
        )}
      </p>

      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={!activityCode || busy || saving}
          onClick={submit}
          className="h-9 flex-1 rounded-lg bg-emerald-600 text-xs font-bold text-white disabled:opacity-40 touch-manipulation"
        >
          {busy ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : editing ? "Save" : "Add"}
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
