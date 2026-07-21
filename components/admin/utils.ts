import { formatDateForDisplay } from "@/lib/date-utils"
import { formatCurrency } from "@/lib/format"
import type {
  AuditEntityTypeOption,
  SystemHealthCheck,
  WeeklySummary,
  WeeklySummaryRange,
} from "@/components/admin/types"

export const AUDIT_ENTITY_TYPES: AuditEntityTypeOption[] = [
  { id: "all", label: "All modules" },
  { id: "processing_records", label: "Processing" },
  { id: "dispatch_records", label: "Dispatch" },
  { id: "sales_records", label: "Sales" },
  { id: "journal_entries", label: "Journal" },
]

export const formatAuditTimestamp = (value: string) => formatDateForDisplay(value)

const toDateInputValue = (value: Date) => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export const DEFAULT_WEEKLY_END = toDateInputValue(new Date())
export const DEFAULT_WEEKLY_START = toDateInputValue(new Date(new Date().setDate(new Date().getDate() - 6)))

export const formatAuditPayload = (payload: any) => {
  if (!payload) return "None"
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}

export const formatCount = (value: number) => Number(value || 0).toLocaleString()

export const formatDeltaText = (delta: number, currency = false) => {
  if (delta === 0) return "no change"
  const abs = currency ? formatCurrency(Math.abs(delta)) : formatCount(Math.abs(delta))
  return `${delta > 0 ? "+" : "-"}${abs}`
}

export const SYSTEM_HEALTH_STATUS_META: Record<
  SystemHealthCheck["status"],
  { label: string; chipClass: string; cardClass: string }
> = {
  healthy: {
    label: "Healthy",
    chipClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    cardClass: "border-emerald-100 bg-emerald-50/30",
  },
  warning: {
    label: "Warning",
    chipClass: "border-amber-200 bg-amber-50 text-amber-700",
    cardClass: "border-amber-100 bg-amber-50/30",
  },
  critical: {
    label: "Critical",
    chipClass: "border-rose-200 bg-rose-50 text-rose-700",
    cardClass: "border-rose-100 bg-rose-50/30",
  },
  unknown: {
    label: "Unknown",
    chipClass: "border-slate-200 bg-slate-50 text-slate-700",
    cardClass: "border-slate-100 bg-slate-50/30",
  },
}

export const buildWeeklySummaryText = (
  summary: WeeklySummary,
  tenantName: string,
  range: WeeklySummaryRange | null,
  compareSummary: WeeklySummary | null,
  compareRange: WeeklySummaryRange | null,
) => {
  const periodDays = range?.totalDays || 7
  const rangeLabel = range ? `${range.startDate} to ${range.endDate}` : "last 7 days"
  const compareLabel = compareRange ? `${compareRange.startDate} to ${compareRange.endDate}` : "previous period"
  const withCompare = (label: string, value: string, delta?: string | null) =>
    delta ? `${label}: ${value} (${delta} vs ${compareLabel})` : `${label}: ${value}`

  const lines = [
    `FarmFlow Weekly Summary (${tenantName})`,
    `Range: ${rangeLabel} (${periodDays} day${periodDays === 1 ? "" : "s"})`,
    `Inventory items: ${formatCount(summary.inventoryCount)}`,
    withCompare(
      `Transactions (${periodDays}d)`,
      formatCount(summary.transactionCount),
      compareSummary ? formatDeltaText(summary.transactionCount - compareSummary.transactionCount) : null,
    ),
    withCompare(
      `Processing records (${periodDays}d)`,
      formatCount(summary.processingCount),
      compareSummary ? formatDeltaText(summary.processingCount - compareSummary.processingCount) : null,
    ),
    withCompare(
      `Dispatches (${periodDays}d)`,
      formatCount(summary.dispatchCount),
      compareSummary ? formatDeltaText(summary.dispatchCount - compareSummary.dispatchCount) : null,
    ),
    withCompare(
      `Sales (${periodDays}d)`,
      formatCount(summary.salesCount),
      compareSummary ? formatDeltaText(summary.salesCount - compareSummary.salesCount) : null,
    ),
    withCompare(
      `Sales revenue (${periodDays}d)`,
      formatCurrency(summary.salesRevenue),
      compareSummary ? formatDeltaText(summary.salesRevenue - compareSummary.salesRevenue, true) : null,
    ),
    withCompare(
      `Labour spend (${periodDays}d)`,
      formatCurrency(summary.laborSpend),
      compareSummary ? formatDeltaText(summary.laborSpend - compareSummary.laborSpend, true) : null,
    ),
    withCompare(
      `Expense spend (${periodDays}d)`,
      formatCurrency(summary.expenseSpend),
      compareSummary ? formatDeltaText(summary.expenseSpend - compareSummary.expenseSpend, true) : null,
    ),
    `Receivables outstanding: ${formatCurrency(summary.receivablesOutstanding)}`,
  ]
  return lines.join("\n")
}
