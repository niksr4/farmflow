import { formatDateForDisplay } from "@/lib/date-utils"
import type { UserModuleSource } from "@/components/tenant-settings/types"

export const AUDIT_ENTITY_TYPES = [
  { id: "all", label: "All modules" },
  { id: "processing_records", label: "Processing" },
  { id: "dispatch_records", label: "Dispatch" },
  { id: "sales_records", label: "Sales" },
  { id: "transaction_history", label: "Inventory" },
  { id: "labor_transactions", label: "Labor" },
  { id: "expense_transactions", label: "Expenses" },
] as const

export const formatAuditTimestamp = (value: string) => formatDateForDisplay(value)

export const formatAuditPayload = (payload: unknown) => {
  if (!payload) return "None"
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}

export const formatUserModuleSource = (source: UserModuleSource) => {
  if (source === "user") return "User override"
  if (source === "tenant") return "Tenant defaults"
  return "System defaults"
}
