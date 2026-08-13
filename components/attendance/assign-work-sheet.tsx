"use client"

/**
 * Set the work and block for a selection of workers, in one action.
 *
 * Deliberately NOT pre-filled from yesterday. The estate owner's objection to a carried-over
 * default was that it dilutes the enterer's responsibility -- a row that is already answered
 * invites confirmation rather than observation, and the data ends up fast, complete and wrong.
 * Batching is a different thing from defaulting: nothing here is decided until someone picks it,
 * it just gets picked once for five people instead of five times.
 */

import { useEffect, useMemo, useState } from "react"
import { Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { formatLocationLabel } from "@/lib/location-label"
import { cn } from "@/lib/utils"

export type AssignTarget = { id: string; name: string; kind: "individual" | "gang"; headcount: number | null }
type LocationOption = { id: string; name: string; code?: string | null; estate?: string | null }
type ActivityOption = { code: string; reference?: string | null }

/** Radix throws on <SelectItem value="">, so "no block" needs a real sentinel. */
const NO_BLOCK = "__no_block__"

const DAY_PRESETS = [
  { value: 1, label: "Full day" },
  { value: 0.5, label: "Half day" },
  { value: 0.25, label: "Quarter" },
] as const

export default function AssignWorkSheet({
  open, targets, locations, activities, saving, onCancel, onSubmit,
}: {
  open: boolean
  targets: AssignTarget[]
  locations: LocationOption[]
  activities: ActivityOption[]
  saving: boolean
  onCancel: () => void
  onSubmit: (payload: {
    activityCode: string
    locationId: string | null
    dayFraction: number
    rate: number | null
    lumpSum: number | null
  }) => void
}) {
  const [activityCode, setActivityCode] = useState("")
  const [locationId, setLocationId] = useState(NO_BLOCK)
  const [dayFraction, setDayFraction] = useState(1)
  const [customFraction, setCustomFraction] = useState("")
  const [rate, setRate] = useState("")
  const [lumpSum, setLumpSum] = useState("")

  // Every open starts blank. Carrying the last answer forward is the passive default again,
  // one step removed.
  useEffect(() => {
    if (!open) return
    setActivityCode("")
    setLocationId(NO_BLOCK)
    setDayFraction(1)
    setCustomFraction("")
    setRate("")
    setLumpSum("")
  }, [open])

  const gangs = useMemo(() => targets.filter((t) => t.kind === "gang"), [targets])
  const effectiveFraction = customFraction.trim() ? Number(customFraction) : dayFraction
  const fractionValid = Number.isFinite(effectiveFraction) && effectiveFraction > 0 && effectiveFraction <= 2
  const canSubmit = Boolean(activityCode) && fractionValid && !saving

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true"
         aria-label="Set work and block">
      <button type="button" aria-label="Cancel" onClick={onCancel}
              className="absolute inset-0 bg-stone-900/50 backdrop-blur-[2px]" />

      <div className="relative z-10 w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl
                      border border-stone-200 bg-white p-5 shadow-xl dark:border-white/[0.08] dark:bg-card">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Allocate work</p>
            <h2 className="mt-0.5 text-xl font-bold">
              {targets.length} {targets.length === 1 ? "worker" : "workers"} selected
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {targets.slice(0, 4).map((t) => t.name).join(", ")}
              {targets.length > 4 ? ` and ${targets.length - 4} more` : ""}
            </p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-stone-400 active:bg-stone-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {gangs.length > 0 && (
          <p className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-900
                        dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200">
            {gangs.map((g) => `${g.name} counts as ${g.headcount ?? 1}`).join(" · ")} — cost is per head unless you
            enter a contract amount below.
          </p>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="assign-code" className="text-base">Work done</Label>
            <Select value={activityCode} onValueChange={setActivityCode}>
              <SelectTrigger id="assign-code" className="h-11"><SelectValue placeholder="Choose the activity" /></SelectTrigger>
              <SelectContent>
                {activities.map((a) => (
                  <SelectItem key={a.code} value={a.code}>
                    {a.code}{a.reference ? ` — ${a.reference}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {locations.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="assign-block" className="text-base">Block</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger id="assign-block" className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_BLOCK}>No particular block</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>{formatLocationLabel(loc, locations)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-base">How much of the day</Label>
            <div className="flex flex-wrap gap-2">
              {DAY_PRESETS.map((p) => (
                <button key={p.value} type="button"
                        onClick={() => { setDayFraction(p.value); setCustomFraction("") }}
                        className={cn(
                          "h-11 flex-1 min-w-[92px] rounded-xl border text-sm font-bold touch-manipulation",
                          !customFraction.trim() && dayFraction === p.value
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-stone-200 bg-white text-stone-600 dark:border-white/[0.08] dark:bg-transparent",
                        )}>
                  {p.label}
                </button>
              ))}
            </div>
            <Input value={customFraction} onChange={(e) => setCustomFraction(e.target.value)}
                   inputMode="decimal" placeholder="Or type a share — 1.5 for a day plus overtime" className="h-11" />
            {customFraction.trim() && !fractionValid && (
              <p className="text-sm text-red-600">Enter more than 0 and at most 2.</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="assign-rate" className="text-base">Rate today</Label>
              <Input id="assign-rate" value={rate} onChange={(e) => setRate(e.target.value)}
                     inputMode="decimal" placeholder="Their usual rate" className="h-11" />
              <p className="text-xs text-muted-foreground">Leave blank to use each worker&apos;s own daily rate.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assign-lump" className="text-base">Contract amount</Label>
              <Input id="assign-lump" value={lumpSum} onChange={(e) => setLumpSum(e.target.value)}
                     inputMode="decimal" placeholder="For a whole-job price" className="h-11" />
              <p className="text-xs text-muted-foreground">Overrides the per-head cost when set.</p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <Button className="h-12 flex-1 text-base font-bold" disabled={!canSubmit}
                  onClick={() =>
                    onSubmit({
                      activityCode,
                      locationId: locationId === NO_BLOCK ? null : locationId,
                      dayFraction: effectiveFraction,
                      rate: rate.trim() ? Number(rate) : null,
                      lumpSum: lumpSum.trim() ? Number(lumpSum) : null,
                    })
                  }>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Set work for {targets.length}
          </Button>
          <Button variant="outline" className="h-12 px-5" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}
