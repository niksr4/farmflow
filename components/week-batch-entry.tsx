"use client"

/**
 * Week Batch Entry — log labor for Mon–Fri in one session.
 *
 * Design rationale: HoneyFarm's peak logging windows are Saturday 10am and
 * Monday 11am-12pm. They're entering a full week's data in one sitting.
 * This component surfaces a table where rows = activity codes, columns = days
 * of the week. Fill in worker counts, submit once, creates N labor entries.
 */

import { useState, useCallback, useEffect } from "react"
import { Check, ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { format, startOfWeek, addDays } from "date-fns"
import { formatCurrency } from "@/lib/format"

type ActivityCode = { code: string; reference: string }

type LaborRow = {
  code: string
  reference: string
  costPerWorker: number
  dayCounts: Record<string, number> // ISO date -> worker count
}

type WeekBatchEntryProps = {
  locationId?: string
  defaultWage?: number
  onSuccess?: () => void
  className?: string
}

function getWeekDays(): { iso: string; short: string; letter: string }[] {
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 })
  return Array.from({ length: 6 }, (_, i) => {
    const d = addDays(monday, i)
    return {
      iso: format(d, "yyyy-MM-dd"),
      short: format(d, "EEE d"),
      letter: format(d, "EEEEE"), // M T W T F S
    }
  })
}

export default function WeekBatchEntry({ locationId, defaultWage = 0, onSuccess, className }: WeekBatchEntryProps) {
  const { toast } = useToast()
  const [activities, setActivities] = useState<ActivityCode[]>([])
  const [rows, setRows] = useState<LaborRow[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [addingCode, setAddingCode] = useState(false)
  const [codeSearch, setCodeSearch] = useState("")

  const weekDays = getWeekDays()

  useEffect(() => {
    fetch("/api/get-activity")
      .then(r => r.json())
      .then(d => { if (d.success) setActivities(d.activities || []) })
      .catch(() => {})
  }, [])

  const addRow = useCallback((code: string, reference: string) => {
    setRows(prev => {
      if (prev.some(r => r.code === code)) return prev
      const dayCounts: Record<string, number> = {}
      weekDays.forEach(d => { dayCounts[d.iso] = 0 })
      return [...prev, { code, reference, costPerWorker: defaultWage, dayCounts }]
    })
    setAddingCode(false)
    setCodeSearch("")
  }, [weekDays, defaultWage])

  const updateCount = (rowIdx: number, dayIso: string, value: string) => {
    const num = Number(value) || 0
    setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, dayCounts: { ...r.dayCounts, [dayIso]: num } } : r))
  }

  const updateWage = (rowIdx: number, value: string) => {
    const num = Number(value) || 0
    setRows(prev => prev.map((r, i) => i === rowIdx ? { ...r, costPerWorker: num } : r))
  }

  const removeRow = (rowIdx: number) => {
    setRows(prev => prev.filter((_, i) => i !== rowIdx))
  }

  const totalCost = rows.reduce((total, row) => {
    const rowTotal = Object.values(row.dayCounts).reduce((s, c) => s + c * row.costPerWorker, 0)
    return total + rowTotal
  }, 0)

  const entryCount = rows.reduce((total, row) => {
    return total + Object.values(row.dayCounts).filter(c => c > 0).length
  }, 0)

  const handleSubmit = async () => {
    const entries: { date: string; code: string; reference: string; workers: number; costPerWorker: number }[] = []
    for (const row of rows) {
      for (const [date, count] of Object.entries(row.dayCounts)) {
        if (count > 0) {
          entries.push({ date, code: row.code, reference: row.reference, workers: count, costPerWorker: row.costPerWorker })
        }
      }
    }

    if (entries.length === 0) {
      toast({ title: "Nothing to save", description: "Enter at least one worker count.", variant: "destructive" })
      return
    }

    setSubmitting(true)
    try {
      const results = await Promise.all(
        entries.map(e =>
          fetch("/api/labor-neon", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              date: e.date,
              code: e.code,
              reference: e.reference,
              laborEntries: [{ name: "In-house", laborCount: e.workers, costPerLabor: e.costPerWorker }],
              totalCost: e.workers * e.costPerWorker,
              notes: "",
              taskDescription: "",
              ...(locationId ? { locationId } : {}),
            }),
          }).then(r => r.json()),
        ),
      )

      const failed = results.filter(r => !r.success)
      if (failed.length === 0) {
        toast({ title: `${entries.length} labor entr${entries.length === 1 ? "y" : "ies"} saved`, description: `Total: ${formatCurrency(totalCost)}` })
        setRows([])
        onSuccess?.()
      } else {
        toast({ title: `${failed.length} entries failed to save`, description: "Check your entries and try again.", variant: "destructive" })
      }
    } catch {
      toast({ title: "Save failed", description: "Please try again.", variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  const filteredActivities = codeSearch.trim()
    ? activities.filter(
        a =>
          a.code.toLowerCase().includes(codeSearch.toLowerCase()) ||
          a.reference.toLowerCase().includes(codeSearch.toLowerCase()),
      ).slice(0, 6)
    : activities.slice(0, 6)

  return (
    <div className={cn(
      "rounded-2xl border border-black/[0.06] bg-white/60 backdrop-blur-xl backdrop-saturate-150",
      "shadow-[0_8px_32px_-8px_rgba(0,0,0,0.10),0_1px_2px_rgba(0,0,0,0.04)]",
      "overflow-hidden",
      className,
    )}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-black/[0.02] transition-colors"
      >
        <div>
          <p className="text-sm font-semibold text-neutral-900">Log this week&apos;s labor</p>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            {rows.length === 0 ? "Add activity codes, fill in daily worker counts" : `${rows.length} activit${rows.length === 1 ? "y" : "ies"} · ${entryCount} entr${entryCount === 1 ? "y" : "ies"} · ${formatCurrency(totalCost)}`}
          </p>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-neutral-400" /> : <ChevronDown className="h-4 w-4 text-neutral-400" />}
      </button>

      {expanded && (
        <div className="border-t border-black/[0.06] px-4 py-3 space-y-3">
          {rows.length > 0 && (
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left text-[10px] uppercase tracking-[0.14em] text-neutral-400 font-normal pb-2 pr-2 min-w-[100px]">Activity</th>
                    <th className="text-left text-[10px] uppercase tracking-[0.14em] text-neutral-400 font-normal pb-2 pr-2 min-w-[60px]">₹/worker</th>
                    {weekDays.map(d => (
                      <th key={d.iso} className="text-center text-[10px] uppercase tracking-[0.14em] text-neutral-400 font-normal pb-2 px-1 min-w-[40px]">
                        {d.letter}<br /><span className="text-[9px] font-normal opacity-70">{format(new Date(d.iso + "T00:00:00"), "d")}</span>
                      </th>
                    ))}
                    <th className="pb-2 w-6" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.04]">
                  {rows.map((row, rowIdx) => {
                    const rowTotal = Object.values(row.dayCounts).reduce((s, c) => s + c * row.costPerWorker, 0)
                    return (
                      <tr key={row.code} className="group">
                        <td className="py-2 pr-2">
                          <div>
                            <span className="font-mono text-[10px] text-neutral-400">{row.code} </span>
                            <span className="text-neutral-800 text-xs">{row.reference}</span>
                          </div>
                          {rowTotal > 0 && (
                            <span className="text-[10px] text-neutral-400">{formatCurrency(rowTotal)}</span>
                          )}
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            type="number"
                            min={0}
                            step={50}
                            value={row.costPerWorker || ""}
                            onChange={e => updateWage(rowIdx, e.target.value)}
                            className="h-7 w-16 text-xs rounded-lg border-black/10 bg-white/80 px-2 text-center"
                            placeholder="₹"
                          />
                        </td>
                        {weekDays.map(d => (
                          <td key={d.iso} className="py-2 px-1 text-center">
                            <Input
                              type="number"
                              min={0}
                              step={0.5}
                              value={row.dayCounts[d.iso] || ""}
                              onChange={e => updateCount(rowIdx, d.iso, e.target.value)}
                              className={cn(
                                "h-7 w-10 text-xs rounded-lg border-black/10 bg-white/80 px-1 text-center",
                                row.dayCounts[d.iso] > 0 && "border-emerald-300 bg-emerald-50/80 text-emerald-800 font-medium",
                              )}
                              placeholder="0"
                            />
                          </td>
                        ))}
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeRow(rowIdx)}
                            className="opacity-0 group-hover:opacity-100 text-neutral-300 hover:text-red-400 transition-all"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Add activity row */}
          {addingCode ? (
            <div className="space-y-1.5">
              <Input
                value={codeSearch}
                onChange={e => setCodeSearch(e.target.value)}
                placeholder="Search activity..."
                className="h-8 text-sm rounded-xl border-black/10 bg-white/80"
                autoFocus
              />
              <div className="rounded-xl border border-black/[0.06] bg-white/90 backdrop-blur-sm overflow-hidden divide-y divide-black/[0.04] shadow-sm">
                {filteredActivities.map(a => (
                  <button
                    key={a.code}
                    type="button"
                    onClick={() => addRow(a.code, a.reference)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-emerald-50 transition-colors"
                  >
                    <span className="font-mono text-[10px] text-neutral-400 w-8">{a.code}</span>
                    <span className="text-sm text-neutral-800">{a.reference}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setAddingCode(false)} className="text-xs text-neutral-400 hover:text-neutral-600">Cancel</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingCode(true)}
              className="flex items-center gap-2 rounded-xl border border-dashed border-neutral-200 px-3 py-2 text-sm text-neutral-500 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50/50 transition-all w-full"
            >
              <Plus className="h-3.5 w-3.5" />
              Add activity
            </button>
          )}

          {entryCount > 0 && (
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full h-10 bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm rounded-xl"
            >
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
              ) : (
                <><Check className="mr-2 h-4 w-4" />Save {entryCount} entr{entryCount === 1 ? "y" : "ies"} · {formatCurrency(totalCost)}</>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
