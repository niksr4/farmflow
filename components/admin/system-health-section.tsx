"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { SystemHealthCheck, SystemHealthCounts, SystemHealthResponse } from "@/components/admin/types"
import { SYSTEM_HEALTH_STATUS_META } from "@/components/admin/utils"

type SystemHealthSectionProps = {
  systemHealthGeneratedLabel: string | null
  isSystemHealthLoading: boolean
  systemHealth: SystemHealthResponse | null
  systemHealthError: string | null
  systemHealthCounts: SystemHealthCounts
  sortedSystemChecks: SystemHealthCheck[]
  onRefresh: () => void
}

export function SystemHealthSection({
  systemHealthGeneratedLabel,
  isSystemHealthLoading,
  systemHealth,
  systemHealthError,
  systemHealthCounts,
  sortedSystemChecks,
  onRefresh,
}: SystemHealthSectionProps) {
  return (
    <Card id="system-health" className="scroll-mt-24 border-border/70 bg-white/85">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>System Health</CardTitle>
          <CardDescription>Daily checks from data-integrity, log-anomaly, imports, and error telemetry.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {systemHealthGeneratedLabel ? (
            <span className="text-xs text-muted-foreground">Updated {systemHealthGeneratedLabel}</span>
          ) : null}
          <Button size="sm" variant="outline" className="bg-transparent" onClick={onRefresh} disabled={isSystemHealthLoading}>
            {isSystemHealthLoading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isSystemHealthLoading && !systemHealth ? (
          <p className="text-sm text-muted-foreground">Loading system health...</p>
        ) : systemHealthError ? (
          <p className="text-sm text-rose-600">{systemHealthError}</p>
        ) : !systemHealth || systemHealth.checks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No health checks found yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
                Critical {systemHealthCounts.critical}
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                Warning {systemHealthCounts.warning}
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                Healthy {systemHealthCounts.healthy}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                Unknown {systemHealthCounts.unknown}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {sortedSystemChecks.map((check) => {
                const meta = SYSTEM_HEALTH_STATUS_META[check.status] || SYSTEM_HEALTH_STATUS_META.unknown
                return (
                  <div key={check.id} data-testid={`system-health-check-${check.id}`} className={`rounded-lg border p-3 ${meta.cardClass}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{check.label}</p>
                        <p className="text-xs text-muted-foreground">{check.value}</p>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.chipClass}`}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{check.detail}</p>
                    {check.actionPath ? (
                      <div className="mt-2">
                        <a
                          href={check.actionPath}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-emerald-700 hover:underline"
                        >
                          Open details
                        </a>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
