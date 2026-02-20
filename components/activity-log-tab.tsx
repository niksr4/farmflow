"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { History, Loader2, RefreshCw, Search } from "lucide-react"
import { formatDateForDisplay } from "@/lib/date-utils"
import { cn } from "@/lib/utils"

type ActivityAction = "create" | "update" | "delete" | "upsert"

type AuditLog = {
  id: number
  tenant_id: string
  user_id: string | null
  username: string | null
  role: string | null
  action: ActivityAction | string
  entity_type: string
  entity_id: string | null
  created_at: string
}

type ActivityLogTabProps = {
  tenantId: string | null
}

const PAGE_SIZE = 50

const ENTITY_LABELS: Record<string, string> = {
  transaction_history: "Inventory",
  current_inventory: "Inventory",
  processing_records: "Processing",
  dispatch_records: "Dispatch",
  sales_records: "Sales",
  other_sales_records: "Other Sales",
  pepper_records: "Pepper",
  curing_records: "Curing",
  quality_grading_records: "Quality",
  rainfall_records: "Rainfall",
  journal_entries: "Journal",
  labor_transactions: "Accounts",
  expense_transactions: "Accounts",
  receivables: "Receivables",
  billing_invoices: "Billing",
  locations: "Locations",
  users: "Users",
  tenant_modules: "Modules",
  user_modules: "User Access",
  tenants: "Tenant",
}

const ACTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All actions" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "upsert", label: "Upsert" },
]

const formatEntityLabel = (entityType: string) => {
  if (ENTITY_LABELS[entityType]) return ENTITY_LABELS[entityType]
  return entityType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

const actionBadgeClass = (action: string) => {
  const normalized = action.toLowerCase()
  if (normalized === "create") return "bg-emerald-100 text-emerald-700 border-emerald-200"
  if (normalized === "update") return "bg-blue-100 text-blue-700 border-blue-200"
  if (normalized === "delete") return "bg-rose-100 text-rose-700 border-rose-200"
  return "bg-amber-100 text-amber-700 border-amber-200"
}

export default function ActivityLogTab({ tenantId }: ActivityLogTabProps) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entityFilter, setEntityFilter] = useState("all")
  const [actionFilter, setActionFilter] = useState("all")
  const [searchTerm, setSearchTerm] = useState("")

  const fetchLogs = useCallback(
    async (pageIndex = 0, append = false) => {
      if (!tenantId) {
        setLogs([])
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
        if (entityFilter !== "all") {
          params.set("entityType", entityFilter)
        }

        const response = await fetch(`/api/admin/audit-logs?${params.toString()}`)
        const data = await response.json()
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to load activity logs")
        }

        const nextLogs = Array.isArray(data.logs) ? data.logs : []
        const nextTotalCount = Number(data.totalCount) || 0
        setLogs((prev) => (append ? [...prev, ...nextLogs] : nextLogs))
        setTotalCount(nextTotalCount)
        const resolvedCount = append ? pageIndex * PAGE_SIZE + nextLogs.length : nextLogs.length
        setHasMore(nextTotalCount ? resolvedCount < nextTotalCount : nextLogs.length === PAGE_SIZE)
        setPage(pageIndex)
        setError(null)
      } catch (loadError: any) {
        setError(loadError?.message || "Failed to load activity logs")
        if (!append) {
          setLogs([])
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
    [entityFilter, tenantId],
  )

  useEffect(() => {
    fetchLogs(0, false)
  }, [fetchLogs])

  const entityOptions = useMemo(() => {
    const uniqueEntityTypes = Array.from(new Set(logs.map((log) => String(log.entity_type || "")))).filter(Boolean)
    return uniqueEntityTypes
      .map((value) => ({ value, label: formatEntityLabel(value) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [logs])

  const filteredLogs = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    return logs.filter((log) => {
      if (actionFilter !== "all" && String(log.action || "").toLowerCase() !== actionFilter) {
        return false
      }
      if (!normalizedSearch) return true
      const entityLabel = formatEntityLabel(log.entity_type || "").toLowerCase()
      const haystack = [
        String(log.username || ""),
        String(log.role || ""),
        String(log.action || ""),
        String(log.entity_type || ""),
        entityLabel,
        String(log.entity_id || ""),
      ]
        .join(" ")
        .toLowerCase()
      return haystack.includes(normalizedSearch)
    })
  }, [actionFilter, logs, searchTerm])

  const resolvedCountLabel =
    totalCount > logs.length ? `Showing ${logs.length} of ${totalCount}` : `${logs.length} record(s)`

  return (
    <div className="space-y-6">
      <Card className="border-border/70 bg-white/85">
        <CardHeader className="space-y-2">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-emerald-700" />
            Activity Log
          </CardTitle>
          <CardDescription>
            Cross-module timeline for create, update, and delete operations across the estate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground/70" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by user, module, action, or record ID"
                className="pl-10"
              />
            </div>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-full bg-white lg:w-[220px]">
                <SelectValue placeholder="All modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modules</SelectItem>
                {entityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full bg-white lg:w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="bg-white" onClick={() => fetchLogs(0, false)} disabled={isLoading}>
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
          ) : filteredLogs.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
              No activity records match your current filters.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-lg border border-border/60 bg-white/80">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Record</TableHead>
                      <TableHead>User</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => {
                      const action = String(log.action || "").toLowerCase()
                      return (
                        <TableRow key={log.id}>
                          <TableCell>{formatDateForDisplay(log.created_at)}</TableCell>
                          <TableCell>{formatEntityLabel(log.entity_type || "")}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("capitalize", actionBadgeClass(action))}>
                              {action || "event"}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {log.entity_id ? String(log.entity_id) : "n/a"}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span>{log.username || "system"}</span>
                              <span className="text-xs text-muted-foreground capitalize">{log.role || "unknown"}</span>
                            </div>
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
                    onClick={() => fetchLogs(page + 1, true)}
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
