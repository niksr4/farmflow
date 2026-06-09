"use client"

import React from "react"
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ExceptionSummaryAlert } from "@/components/inventory-system/types"

type ExceptionSummary = {
  count: number
  highlights: string[]
  alerts: ExceptionSummaryAlert[]
}

type Props = {
  loading: boolean
  error: string | null
  summary: ExceptionSummary
  onOpenSeason: () => void
  onOpenAlert: (alert: ExceptionSummaryAlert) => void
}

export default function InventorySystemAlerts({ loading, error, summary, onOpenSeason, onOpenAlert }: Props) {
  return (
    <div className="order-2 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card lg:order-1">
      <div className="flex items-start justify-between border-b border-stone-100 px-5 py-4 dark:border-white/[0.05]">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-500">Alerts</p>
          <p className="flex items-center gap-1.5 text-sm font-bold text-stone-900 dark:text-white">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            System status
          </p>
          {!loading && !error && (
            <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500">
              {summary.count === 0
                ? "No active anomalies in the last 7 days."
                : `${summary.count} active alert${summary.count === 1 ? "" : "s"}`}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 rounded-lg border-stone-200 text-xs"
          onClick={onOpenSeason}
        >
          Season view
        </Button>
      </div>
      <div className="space-y-2 p-5">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading system status...
          </div>
        ) : error ? (
          <div className="text-xs text-rose-600">{error}</div>
        ) : summary.count === 0 ? (
          <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            All clear
          </div>
        ) : (
          <div className="grid gap-2">
            {(summary.alerts || []).slice(0, 3).map((alert, index) => {
              const summaryLine = [alert.location, alert.coffeeType].filter(Boolean).join(" • ")
              const tone =
                alert.severity === "high" || alert.severity === "critical"
                  ? "border-rose-100 bg-rose-50/70 text-rose-900"
                  : "border-amber-100 bg-amber-50/70 text-amber-900"
              return (
                <button
                  key={`${alert.id}-${index}`}
                  type="button"
                  data-testid={`inventory-system-alert-${index + 1}`}
                  className={cn("rounded-xl border px-3 py-2 text-left transition-colors hover:bg-white", tone)}
                  onClick={() => onOpenAlert(alert)}
                >
                  <p className="text-[10px] uppercase tracking-[0.15em] text-amber-700">Alert {index + 1}</p>
                  <p className="mt-1 line-clamp-2 text-xs font-medium leading-snug">{alert.title}</p>
                  {summaryLine ? <p className="mt-1 text-[11px] text-muted-foreground">{summaryLine}</p> : null}
                </button>
              )
            })}
            {summary.alerts.length === 0 &&
              (summary.highlights || []).slice(0, 3).map((item, index) => (
                <div key={`${item}-${index}`} className="rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-amber-700">Alert {index + 1}</p>
                  <p className="mt-1 text-xs font-medium leading-snug text-amber-900">{item}</p>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
