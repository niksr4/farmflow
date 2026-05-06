"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { ExceptionSummaryAlert } from "@/components/inventory-system/types"

type ExceptionsSummary = {
  count: number
  alerts: ExceptionSummaryAlert[]
}

type PriorityAlertsCardProps = {
  loading: boolean
  error: string | null
  summary: ExceptionsSummary
  canShowSeason: boolean
  onOpenSeason: () => void
  onOpenAlert: (alert: ExceptionSummaryAlert) => void
}

export default function PriorityAlertsCard({
  loading,
  error,
  summary,
  canShowSeason,
  onOpenSeason,
  onOpenAlert,
}: PriorityAlertsCardProps) {
  return (
    <Card className="border-black/5 bg-white/90">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Priority Alerts</CardTitle>
          <CardDescription>High-signal issues to clear before day-end close.</CardDescription>
        </div>
        {canShowSeason && (
          <Button size="sm" variant="outline" onClick={onOpenSeason} className="bg-white">
            Open Season Alerts
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading alerts...
          </div>
        ) : error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : summary.count === 0 ? (
          <p className="text-sm text-emerald-700">No active alerts right now.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {(summary.alerts || []).slice(0, 3).map((alert, index) => {
              const summaryLine = [alert.location, alert.coffeeType].filter(Boolean).join(" • ")
              const isHigh = alert.severity === "high" || alert.severity === "critical"
              return (
                <button
                  key={`${alert.id}-${index}`}
                  type="button"
                  data-testid={`home-priority-alert-${index + 1}`}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors hover:bg-white",
                    isHigh ? "border-rose-100 bg-rose-50/70" : "border-amber-100 bg-amber-50/70",
                  )}
                  onClick={() => onOpenAlert(alert)}
                >
                  <p className={cn("text-xs uppercase tracking-[0.16em]", isHigh ? "text-rose-700" : "text-amber-700")}>
                    Alert {index + 1}
                  </p>
                  <p className={cn("mt-1 text-sm font-medium", isHigh ? "text-rose-800" : "text-amber-900")}>
                    {alert.title}
                  </p>
                  {summaryLine ? <p className="mt-1 text-xs text-muted-foreground">{summaryLine}</p> : null}
                  <p className="mt-2 text-xs text-emerald-700">Investigate →</p>
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
