import "server-only"

import { sql } from "@/lib/server/db"
import type { AssistantSearchResult } from "@/lib/ai-assistant"
import { logServerError } from "@/lib/server/safe-logging"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

type AssistantSearchInput = {
  tenantId: string
  role: string
  query: string
  enabledModules: string[]
  maxResults?: number
}

type TenantContext = ReturnType<typeof normalizeTenantContext>

const normalizeQuery = (value: string) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()

const normalizeRole = (value: string) => String(value || "").trim().toLowerCase()

// Neon returns Postgres date columns as JS Date objects, whose default
// String() form is not ISO — format those via the IST calendar day instead.
const formatDateLabel = (value: unknown) =>
  value instanceof Date
    ? value.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    : String(value || "").slice(0, 10)

const formatAmount = (value: unknown) => `₹${(Number(value) || 0).toLocaleString("en-IN")}`

const formatQuantity = (value: unknown, unit: unknown) => {
  const numeric = Number(value) || 0
  const normalizedUnit = String(unit || "").trim() || "kg"
  return `${numeric.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${normalizedUnit}`
}

const buildInventoryResults = async (tenantContext: TenantContext, query: string): Promise<AssistantSearchResult[]> => {
  try {
    const pattern = `%${query}%`
    const prefixPattern = `${query}%`
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT
          item_type,
          COALESCE(SUM(quantity), 0) AS quantity,
          COALESCE(MAX(unit), 'kg') AS unit
        FROM current_inventory
        WHERE tenant_id = ${tenantContext.tenantId}
          AND item_type ILIKE ${pattern}
        GROUP BY item_type
        ORDER BY
          CASE
            WHEN lower(item_type) = ${query} THEN 0
            WHEN lower(item_type) LIKE ${prefixPattern} THEN 1
            ELSE 2
          END,
          item_type ASC
        LIMIT 3
      `,
    )
    return (rows || []).map((row: any) => ({
      id: `inventory:${row.item_type}`,
      type: "inventory",
      title: String(row.item_type || ""),
      detail: `Current stock: ${formatQuantity(row.quantity, row.unit)}`,
      href: `/dashboard?tab=inventory&itemType=${encodeURIComponent(String(row.item_type || ""))}`,
    }))
  } catch (error) {
    logServerError("Assistant inventory search failed", error)
    return []
  }
}

const buildTransactionResults = async (tenantContext: TenantContext, query: string): Promise<AssistantSearchResult[]> => {
  try {
    const pattern = `%${query}%`
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT
          id,
          item_type,
          transaction_type,
          transaction_date,
          notes
        FROM transaction_history
        WHERE tenant_id = ${tenantContext.tenantId}
          AND (
            item_type ILIKE ${pattern}
            OR COALESCE(notes, '') ILIKE ${pattern}
          )
        ORDER BY transaction_date DESC, id DESC
        LIMIT 3
      `,
    )
    return (rows || []).map((row: any) => ({
      id: `transaction:${row.id}`,
      type: "transaction",
      title: `${String(row.item_type || "Item")} · ${String(row.transaction_type || "Transaction")}`,
      detail: `${formatDateLabel(row.transaction_date)}${row.notes ? ` · ${String(row.notes).slice(0, 90)}` : ""}`,
      href: `/dashboard?tab=transactions&txnSearch=${encodeURIComponent(query)}`,
    }))
  } catch (error) {
    logServerError("Assistant transaction search failed", error)
    return []
  }
}

const buildExpenseResults = async (tenantContext: TenantContext, query: string): Promise<AssistantSearchResult[]> => {
  try {
    const pattern = `%${query}%`
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT
          id,
          entry_date,
          code,
          total_amount,
          notes
        FROM expense_transactions
        WHERE tenant_id = ${tenantContext.tenantId}
          AND (
            code ILIKE ${pattern}
            OR COALESCE(notes, '') ILIKE ${pattern}
          )
        ORDER BY entry_date DESC, id DESC
        LIMIT 3
      `,
    )
    return (rows || []).map((row: any) => ({
      id: `expense:${row.id}`,
      type: "expense",
      title: String(row.code || "Expense entry"),
      detail: `${formatDateLabel(row.entry_date)} · ${formatAmount(row.total_amount)}${row.notes ? ` · ${String(row.notes).slice(0, 70)}` : ""}`,
      href: "/dashboard?tab=accounts&panel=expenses",
    }))
  } catch (error) {
    logServerError("Assistant expense search failed", error)
    return []
  }
}

const buildLocationResults = async (tenantContext: TenantContext, query: string): Promise<AssistantSearchResult[]> => {
  try {
    const pattern = `%${query}%`
    const prefixPattern = `${query}%`
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT
          id,
          name,
          code
        FROM locations
        WHERE tenant_id = ${tenantContext.tenantId}
          AND (
            name ILIKE ${pattern}
            OR COALESCE(code, '') ILIKE ${pattern}
          )
        ORDER BY
          CASE
            WHEN lower(name) = ${query} THEN 0
            WHEN lower(COALESCE(code, '')) = ${query} THEN 1
            WHEN lower(name) LIKE ${prefixPattern} THEN 2
            ELSE 3
          END,
          name ASC
        LIMIT 3
      `,
    )
    return (rows || []).map((row: any) => ({
      id: `location:${row.id}`,
      type: "location",
      title: String(row.name || "Location"),
      detail: row.code ? `Code ${String(row.code)} · Settings → Locations` : "Settings → Locations",
      href: "/settings#locations",
    }))
  } catch (error) {
    logServerError("Assistant location search failed", error)
    return []
  }
}

const buildDispatchResults = async (tenantContext: TenantContext, query: string): Promise<AssistantSearchResult[]> => {
  try {
    const pattern = `%${query}%`
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT
          id,
          dispatch_date,
          coffee_type,
          bag_type,
          bags_dispatched,
          estate
        FROM dispatch_records
        WHERE tenant_id = ${tenantContext.tenantId}
          AND (
            COALESCE(estate, '') ILIKE ${pattern}
            OR COALESCE(coffee_type, '') ILIKE ${pattern}
            OR COALESCE(bag_type, '') ILIKE ${pattern}
          )
        ORDER BY dispatch_date DESC, id DESC
        LIMIT 3
      `,
    )
    return (rows || []).map((row: any) => ({
      id: `dispatch:${row.id}`,
      type: "dispatch",
      title: `${String(row.coffee_type || "Coffee")} · ${String(row.bag_type || "Bags")}`,
      detail: `${formatDateLabel(row.dispatch_date)} · ${Number(row.bags_dispatched) || 0} bags${row.estate ? ` · ${String(row.estate)}` : ""}`,
      href: "/dashboard?tab=dispatch",
    }))
  } catch (error) {
    logServerError("Assistant dispatch search failed", error)
    return []
  }
}

const buildSalesResults = async (tenantContext: TenantContext, query: string): Promise<AssistantSearchResult[]> => {
  try {
    const pattern = `%${query}%`
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT
          id,
          sale_date,
          buyer_name,
          coffee_type,
          bag_type,
          revenue
        FROM sales_records
        WHERE tenant_id = ${tenantContext.tenantId}
          AND (
            COALESCE(buyer_name, '') ILIKE ${pattern}
            OR COALESCE(coffee_type, '') ILIKE ${pattern}
            OR COALESCE(bag_type, '') ILIKE ${pattern}
          )
        ORDER BY sale_date DESC, id DESC
        LIMIT 3
      `,
    )
    return (rows || []).map((row: any) => ({
      id: `sale:${row.id}`,
      type: "sale",
      title: String(row.buyer_name || `${String(row.coffee_type || "Coffee")} sale`),
      detail: `${formatDateLabel(row.sale_date)} · ${String(row.coffee_type || "Coffee")} ${String(row.bag_type || "").trim()} · ${formatAmount(row.revenue)}`,
      href: "/dashboard?tab=sales",
    }))
  } catch (error) {
    logServerError("Assistant sales search failed", error)
    return []
  }
}

const buildReceivableResults = async (tenantContext: TenantContext, query: string): Promise<AssistantSearchResult[]> => {
  try {
    const pattern = `%${query}%`
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT
          id,
          buyer_name,
          invoice_no,
          due_date,
          amount,
          status
        FROM receivables
        WHERE tenant_id = ${tenantContext.tenantId}
          AND (
            COALESCE(buyer_name, '') ILIKE ${pattern}
            OR COALESCE(invoice_no, '') ILIKE ${pattern}
          )
        ORDER BY due_date DESC, id DESC
        LIMIT 3
      `,
    )
    return (rows || []).map((row: any) => ({
      id: `receivable:${row.id}`,
      type: "receivable",
      title: String(row.buyer_name || row.invoice_no || "Receivable"),
      detail: `${row.invoice_no ? `Invoice ${String(row.invoice_no)} · ` : ""}${formatAmount(row.amount)} · ${String(row.status || "unpaid")}${row.due_date ? ` · due ${formatDateLabel(row.due_date)}` : ""}`,
      href: "/dashboard?tab=receivables",
    }))
  } catch (error) {
    logServerError("Assistant receivables search failed", error)
    return []
  }
}

const buildJournalResults = async (tenantContext: TenantContext, query: string): Promise<AssistantSearchResult[]> => {
  try {
    const pattern = `%${query}%`
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT
          id,
          entry_date,
          title,
          plot,
          fertilizer_name,
          notes
        FROM journal_entries
        WHERE tenant_id = ${tenantContext.tenantId}
          AND (
            COALESCE(title, '') ILIKE ${pattern}
            OR COALESCE(plot, '') ILIKE ${pattern}
            OR COALESCE(fertilizer_name, '') ILIKE ${pattern}
            OR COALESCE(notes, '') ILIKE ${pattern}
          )
        ORDER BY entry_date DESC, id DESC
        LIMIT 3
      `,
    )
    return (rows || []).map((row: any) => ({
      id: `journal:${row.id}`,
      type: "journal",
      title: String(row.title || row.plot || row.fertilizer_name || "Journal entry"),
      detail: `${formatDateLabel(row.entry_date)}${row.notes ? ` · ${String(row.notes).slice(0, 80)}` : ""}`,
      href: "/dashboard?tab=journal",
    }))
  } catch (error) {
    logServerError("Assistant journal search failed", error)
    return []
  }
}

export async function searchAssistantData(input: AssistantSearchInput): Promise<AssistantSearchResult[]> {
  const query = normalizeQuery(input.query)
  if (query.length < 2) {
    return []
  }

  const tenantContext = normalizeTenantContext(input.tenantId, input.role)
  const enabledModules = new Set((input.enabledModules || []).map((moduleId) => String(moduleId || "").trim()).filter(Boolean))
  const normalizedRole = normalizeRole(input.role)
  const canManageTenantSettings = normalizedRole === "owner" || normalizedRole === "admin"
  const canViewCoffeeSales = normalizedRole === "owner" || normalizedRole === "admin"

  const searches: Array<Promise<AssistantSearchResult[]>> = []

  if (enabledModules.has("inventory") || enabledModules.has("transactions")) {
    searches.push(buildInventoryResults(tenantContext, query))
    searches.push(buildTransactionResults(tenantContext, query))
  }
  if (enabledModules.has("accounts")) {
    searches.push(buildExpenseResults(tenantContext, query))
  }
  if (canManageTenantSettings) {
    searches.push(buildLocationResults(tenantContext, query))
  }
  if (enabledModules.has("dispatch")) {
    searches.push(buildDispatchResults(tenantContext, query))
  }
  if (enabledModules.has("sales") && canViewCoffeeSales) {
    searches.push(buildSalesResults(tenantContext, query))
  }
  if (enabledModules.has("receivables")) {
    searches.push(buildReceivableResults(tenantContext, query))
  }
  if (enabledModules.has("journal")) {
    searches.push(buildJournalResults(tenantContext, query))
  }

  const groupedResults = await Promise.all(searches)
  const maxResults = Math.max(1, Math.min(input.maxResults || 8, 10))
  const flattened = groupedResults.flat()

  const seen = new Set<string>()
  const deduped: AssistantSearchResult[] = []
  for (const result of flattened) {
    if (seen.has(result.id)) continue
    seen.add(result.id)
    deduped.push(result)
    if (deduped.length >= maxResults) break
  }
  return deduped
}
