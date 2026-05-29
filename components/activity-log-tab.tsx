"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { History, Loader2, RefreshCw, Search } from "lucide-react"
import { formatDateForDisplay } from "@/lib/date-utils"
import { cn } from "@/lib/utils"

type ActivitySource = "labour" | "expense" | "inventory"

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
}

const PAGE_SIZE = 50

const SOURCE_LABELS: Record<string, string> = {
  labour: "Labour",
  expense: "Expenses",
  inventory: "Inventory",
}

const SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All modules" },
  { value: "labour", label: "Labour" },
  { value: "expense", label: "Expenses" },
  { value: "inventory", label: "Inventory" },
]

const formatSourceLabel = (source: string) => SOURCE_LABELS[source] ?? source

const sourceTagClass = (source: string) => {
  if (source === "labour") return "bg-sky-100 text-sky-700 border-sky-200"
  if (source === "expense") return "bg-amber-100 text-amber-700 border-amber-200"
  if (source === "inventory") return "bg-emerald-100 text-emerald-700 border-emerald-200"
  return "bg-muted text-muted-foreground border-border"
}

const formatAmount = (amount: number | null) => {
  if (amount == null || amount === 0) return null
  return `₹${Number(amount).toLocaleString("en-IN")}`
}

export default function ActivityLogTab({ tenantId }: ActivityLogTabProps) {
  const [records, setRecords] = useState<ActivityRecord[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState("all")
  const [searchTerm, setSearchTerm] = useState("")

  const fetchRecords = useCallback(
    async (pageIndex = 0, append = false) => {
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
        const params = new URLSearchParams({
          tenantId,
          limit: String(PAGE_SIZE),
          offset: String(pageIndex * PAGE_SIZE),
        })
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

  const filteredRecords = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    if (!normalizedSearch) return records
    return records.filter((rec) => {
      const haystack = [
        String(rec.title || ""),
        String(rec.subtitle || ""),
        formatSourceLabel(rec.source),
        String(rec.username || ""),
      ]
        .join(" ")
        .toLowerCase()
      return haystack.includes(normalizedSearch)
    })
  }, [records, searchTerm])

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
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground/70" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by activity, item, or notes"
                className="pl-10"
              />
            </div>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-full bg-white lg:w-[200px]">
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
            <Button variant="outline" className="bg-white" onClick={() => fetchRecords(0, false)} disabled={isLoading}>
              <RefreshCw className={cn("mr-2 h-4 w-4", isLoading ? "animate-spin" : "")} />
              Refresh
            </Button>
          </div>

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
                        labour: "Labour deployments, wages, and worker costs",
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
