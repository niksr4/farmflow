"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ReportMenu } from "@/components/ui/report-menu"
import type { ReportDefinition } from "@/lib/reports/report-definition"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { History, Loader2, RefreshCw } from "lucide-react"
import { formatDateForDisplay } from "@/lib/date-utils"
import { cn } from "@/lib/utils"
import FilterBar from "@/components/filter-bar"
import { useListControls } from "@/hooks/use-list-controls"
import { ACTIVITY_SOURCES, type ActivitySource } from "@/lib/activity-contracts"


type ActivityRecord = {
  id: string
  source: ActivitySource | string
  event_date: string
  title: string
  subtitle: string | null
  amount: number | null
  username: string | null
}

type ActivityLogTabProps = {
  tenantId: string | null
  estateName?: string
  /**
   * True while `estateName` does not yet describe `tenantId` -- the owner has selected a preview
   * tenant and its settings are still loading. The report is held back rather than being built
   * with the previous tenant's estate in its title.
   */
  estateNamePending?: boolean
}

const PAGE_SIZE = 50

const SOURCE_LABELS: Record<string, string> = {
  labor: "Labour",
  expense: "Non-Labour Expenses",
  inventory: "Inventory",
}

// Derived from the contract rather than retyped. This list carrying its own spelling of "labour"
// is exactly what made the filter silently return every source -- the route ignored a value it did
// not recognise, so the dropdown looked like it worked.
const SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All modules" },
  ...ACTIVITY_SOURCES.map((value) => ({ value, label: SOURCE_LABELS[value] })),
]

const formatSourceLabel = (source: string) => SOURCE_LABELS[source] ?? source

const sourceTagClass = (source: string) => {
  if (source === "labor") return "bg-sky-100 text-sky-700 border-sky-200"
  if (source === "expense") return "bg-amber-100 text-amber-700 border-amber-200"
  if (source === "inventory") return "bg-emerald-100 text-emerald-700 border-emerald-200"
  return "bg-muted text-muted-foreground border-border"
}

const formatAmount = (amount: number | null) => {
  if (amount == null || amount === 0) return null
  return `₹${Number(amount).toLocaleString("en-IN")}`
}

export default function ActivityLogTab({ tenantId, estateName, estateNamePending }: ActivityLogTabProps) {
  const [records, setRecords] = useState<ActivityRecord[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState("all")
  const [allLoaded, setAllLoaded] = useState(false)

  const fetchRecords = useCallback(
    async (pageIndex = 0, append = false, fetchAll = false) => {
      if (!tenantId) {
        setRecords([])
        setTotalCount(0)
        setHasMore(false)
        setError("Tenant context missing.")
        return
      }

      if (append) {
        setIsLoadingMore(true)
      } else {
        setIsLoading(true)
      }

      try {
        const params = new URLSearchParams(
          fetchAll
            ? { tenantId, all: "true", limit: "2000", offset: "0" }
            : { tenantId, limit: String(PAGE_SIZE), offset: String(pageIndex * PAGE_SIZE) },
        )
        if (sourceFilter !== "all") {
          params.set("source", sourceFilter)
        }

        const response = await fetch(`/api/admin/tenant-activity?${params.toString()}`)
        const data = await response.json()
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to load activity")
        }

        const nextRecords = Array.isArray(data.records) ? data.records : []
        const nextTotalCount = Number(data.totalCount) || 0
        setRecords((prev) => (append ? [...prev, ...nextRecords] : nextRecords))
        setTotalCount(nextTotalCount)
        const resolvedCount = append ? pageIndex * PAGE_SIZE + nextRecords.length : nextRecords.length
        setHasMore(nextTotalCount ? resolvedCount < nextTotalCount : nextRecords.length === PAGE_SIZE)
        setPage(pageIndex)
        setAllLoaded(fetchAll)
        setError(null)
      } catch (loadError: any) {
        setError(loadError?.message || "Failed to load activity")
        if (!append) {
          setRecords([])
          setTotalCount(0)
          setHasMore(false)
        }
      } finally {
        if (append) {
          setIsLoadingMore(false)
        } else {
          setIsLoading(false)
        }
      }
    },
    [sourceFilter, tenantId],
  )

  useEffect(() => {
    fetchRecords(0, false)
  }, [fetchRecords])

  const recordControls = useListControls(records, {
    searchFields: (rec) => [rec.title, rec.subtitle, formatSourceLabel(rec.source), rec.username, rec.event_date],
    sorters: {
      date: (rec) => String(rec.event_date || "").slice(0, 10),
      amount: (rec) => Number(rec.amount) || 0,
      source: (rec) => formatSourceLabel(rec.source),
      user: (rec) => String(rec.username || ""),
    },
    defaultSort: "date",
  })
  const filteredRecords = recordControls.items

  /**
   * The audit log as a document, which is the one report somebody else asks the estate for.
   *
   * ⚠ IT FETCHES THE WHOLE LOG RATHER THAN REPORTING WHAT IS ON SCREEN. The table paginates at
   * fifty rows, so a report built from `filteredRecords` would hand over the most recent fifty
   * entries under a title saying "Audit Log" -- complete-looking and wrong, which is worse than no
   * report at all for the only artefact anybody audits.
   *
   * The route caps `all=true` at 2000 rows, so when there are more than that the subtitle SAYS the
   * report is the most recent 2000 of N. A truncated report that admits it is usable; one that
   * does not is a false statement about the estate's records.
   */
  const reportDefinition = useMemo<ReportDefinition>(() => {
    const REPORT_ROW_CAP = 2000
    const scope = sourceFilter === "all" ? "All modules" : formatSourceLabel(sourceFilter)
    return {
      slug: "audit-log",
      title: "Audit Log",
      estateName,
      period: scope,
      orientation: "landscape",
      /**
       * The period goes to the ENDPOINT, which applies it in SQL before the row cap.
       *
       * ⚠ THIS USED TO FILTER CLIENT-SIDE, and the comment here claimed that was "only sound
       * because the whole log is fetched first". It is not: the route caps `all=true` at 2000 and
       * orders by date DESC, so it returns the NEWEST 2000 events and a fiscal-year request on a
       * tenant writing ~50 rows a day got back about the last forty days. Filtering that in the
       * browser produced a document headed with a year that was missing most of it -- and the cap
       * note said "most recent 2000 of N", which disclosed truncation of the LOG while saying
       * nothing about the period being incomplete. A filter can only narrow what the query
       * returned; it cannot recover rows the LIMIT already discarded.
       */
      periods: ["current", "day", "week", "month", "year"],
      buildRows: async (reportPeriod) => {
        const headers = ["Date", "Module", "Entry", "Detail", "Amount", "Recorded by"]
        if (!tenantId) return { headers, rows: [] }

        const params = new URLSearchParams({
          tenantId,
          all: "true",
          limit: String(REPORT_ROW_CAP),
          offset: "0",
        })
        if (sourceFilter !== "all") params.set("source", sourceFilter)
        if (reportPeriod.start) params.set("from", reportPeriod.start)
        if (reportPeriod.end) params.set("to", reportPeriod.end)

        const response = await fetch(`/api/admin/tenant-activity?${params.toString()}`)
        const payload = await response.json()
        if (!response.ok || !payload.success) {
          // Thrown, not swallowed into an empty report. ReportMenu surfaces it as a toast; an
          // empty audit log would read as "nothing ever happened here".
          throw new Error(payload?.error || "Could not load the activity log")
        }

        const fetched: ActivityRecord[] = Array.isArray(payload.records) ? payload.records : []
        const total = Number(payload.totalCount) || fetched.length

        /**
         * No client-side period filter: the rows that came back are already the period's, and
         * `total` is now the count WITHIN the period, so the cap note below compares two counts
         * of the same thing.
         */
        const all = fetched
        const rows: Array<Array<string | number | null>> = all.map((rec) => [
          String(rec.event_date || "").slice(0, 10),
          formatSourceLabel(rec.source),
          rec.title,
          rec.subtitle,
          rec.amount,
          rec.username,
        ])

        /**
         * One note, not two. `total` is now the route's count WITHIN the same period as the rows,
         * so the two figures describe the same thing and the note means what it says. It used to
         * need a second branch because the count covered the whole log while the rows covered the
         * month, which made the honest version of the sentence unwriteable.
         */
        if (total > fetched.length) {
          rows.push([
            "",
            "",
            `Showing the most recent ${fetched.length} of ${total} entries in this period.`,
            "",
            null,
            "",
          ])
        }
        return { headers, rows }
      },
    }
  }, [estateName, sourceFilter, tenantId])

  const resolvedCountLabel =
    totalCount > records.length ? `Showing ${records.length} of ${totalCount}` : `${records.length} record(s)`

  return (
    <div className="space-y-6">
      <Card className="border-border/70 bg-white/85">
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-emerald-700" />
            Activity Log
          </CardTitle>
          <CardDescription>
            Full timeline of transactions and entries recorded across the estate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FilterBar
            search={recordControls.search}
            onSearchChange={(value) => {
              recordControls.setSearch(value)
              // Client-side filtering only sees loaded rows; pull the history before matching.
              if (value.trim() && !allLoaded && !isLoadingMore) void fetchRecords(0, false, true)
            }}
            searchPlaceholder="Search by activity, item, or notes"
            sortOptions={[
              { value: "date", label: "Date" },
              { value: "amount", label: "Amount" },
              { value: "source", label: "Source" },
              { value: "user", label: "User" },
            ]}
            sortValue={recordControls.sortValue}
            onSortChange={recordControls.setSortValue}
            sortDirection={recordControls.sortDirection}
            onSortDirectionChange={recordControls.setSortDirection}
          >
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="h-11 w-full shrink-0 rounded-xl bg-white lg:w-[200px]" aria-label="Filter by source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="h-11 shrink-0 rounded-xl bg-white" onClick={() => fetchRecords(0, false)} disabled={isLoading}>
              <RefreshCw className={cn("mr-2 h-4 w-4", isLoading ? "animate-spin" : "")} />
              Refresh
            </Button>
            <ReportMenu
              definition={reportDefinition}
              disabled={isLoading || !tenantId || Boolean(estateNamePending)}
              emptyReason="Nothing recorded yet"
              className="h-11 shrink-0 rounded-xl bg-white"
            />
          </FilterBar>

          <p className="text-xs text-muted-foreground">{resolvedCountLabel}</p>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              No activity records match your current filters.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-lg border border-border/60 bg-white/80">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Date</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>User</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.map((rec) => {
                      const amountStr = formatAmount(rec.amount)
                      const sourceMeta: Record<string, string> = {
                        labor: "Labour deployments, wages, and worker costs",
                        expense: "Equipment, consumables, and activity expenses",
                        inventory: "Stock movements, purchases, and allocations",
                      }
                      return (
                        <TableRow key={`${rec.source}-${rec.id}`}>
                          <TableCell className="whitespace-nowrap">{formatDateForDisplay(rec.event_date)}</TableCell>
                          <TableCell>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className={cn(
                                      "inline-flex cursor-default items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                                      sourceTagClass(rec.source),
                                    )}
                                  >
                                    {formatSourceLabel(rec.source)}
                                  </span>
                                </TooltipTrigger>
                                {sourceMeta[rec.source] && (
                                  <TooltipContent>{sourceMeta[rec.source]}</TooltipContent>
                                )}
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                          <TableCell className="max-w-[260px]">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="group flex w-full flex-col gap-0.5 text-left">
                                  <span className="font-medium text-sm leading-snug group-hover:text-emerald-700 transition-colors">
                                    {rec.title || "—"}
                                  </span>
                                  {rec.subtitle && (
                                    <span className="text-xs text-muted-foreground truncate">{rec.subtitle}</span>
                                  )}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent side="right" align="start" className="w-72 space-y-2.5 p-4 text-sm">
                                <p className="font-semibold text-foreground">{rec.title || "—"}</p>
                                {rec.subtitle && (
                                  <p className="text-muted-foreground leading-relaxed">{rec.subtitle}</p>
                                )}
                                <div className="border-t pt-2.5 space-y-1.5 text-xs text-muted-foreground">
                                  <div className="flex justify-between">
                                    <span>Date</span>
                                    <span className="font-medium text-foreground">{formatDateForDisplay(rec.event_date)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Module</span>
                                    <span className="font-medium text-foreground">{formatSourceLabel(rec.source)}</span>
                                  </div>
                                  {amountStr && (
                                    <div className="flex justify-between">
                                      <span>Amount</span>
                                      <span className="font-medium text-foreground">{amountStr}</span>
                                    </div>
                                  )}
                                  {rec.username && (
                                    <div className="flex justify-between">
                                      <span>Recorded by</span>
                                      <span className="font-medium text-foreground">{rec.username}</span>
                                    </div>
                                  )}
                                </div>
                              </PopoverContent>
                            </Popover>
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {amountStr ? (
                              <span className="text-sm font-medium tabular-nums">{amountStr}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {rec.username ? (
                              <span className="font-medium text-sm">{rec.username}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              {hasMore && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => fetchRecords(page + 1, true)}
                    disabled={isLoadingMore}
                    className="bg-white"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      "Load more"
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
