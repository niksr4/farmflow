import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { getCurrentFiscalYear } from "@/lib/fiscal-year-utils"
import { isModuleAccessError, requireAnyModuleAccess } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import type { ExportDatasetId } from "@/lib/data-tools"

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_ROWS = 8000
const FETCH_LIMIT = MAX_ROWS + 1
const DEFAULT_BAG_WEIGHT_KG = 50

const DATASET_TO_MODULES: Record<ExportDatasetId, string[]> = {
  processing: ["processing"],
  dispatch: ["dispatch"],
  sales: ["sales"],
  pepper: ["pepper"],
  rainfall: ["rainfall"],
  transactions: ["transactions"],
  inventory: ["inventory"],
  labor: ["accounts"],
  expenses: ["accounts"],
  reconciliation: ["dispatch", "sales", "season"],
  "receivables-aging": ["receivables"],
  "pnl-monthly": ["accounts", "sales", "season"],
}

const DATASET_LABELS = Object.keys(DATASET_TO_MODULES).join(", ")

const toCsvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`
const toCsv = (rows: Array<Record<string, unknown>>) => {
  if (!rows.length) return ""
  const headers = Object.keys(rows[0])
  const lines = [headers.map(toCsvCell).join(",")]
  for (const row of rows) {
    lines.push(headers.map((header) => toCsvCell((row as any)[header])).join(","))
  }
  return lines.join("\n")
}

const parseDate = (value: string | null | undefined, fallback: string) => {
  const normalized = String(value || "").trim()
  if (!normalized) return fallback
  if (!DATE_PATTERN.test(normalized)) return null
  return normalized
}

const parseTenantId = (input: string | null, sessionTenantId: string, role: string) => {
  const requested = String(input || "").trim()
  if (role === "owner" && requested) return requested
  return sessionTenantId
}

const datasetUsesDateRange = (dataset: ExportDatasetId) => dataset !== "inventory"

const tableHasColumn = async (
  tenantContext: ReturnType<typeof normalizeTenantContext>,
  tableName: string,
  columnName: string,
) => {
  const rows = await runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
      LIMIT 1
    `,
  )
  return Array.isArray(rows) && rows.length > 0
}

const loadProcessingRows = async (
  tenantId: string,
  startDate: string,
  endDate: string,
  tenantContext: ReturnType<typeof normalizeTenantContext>,
) =>
  runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT
        pr.process_date::text AS process_date,
        COALESCE(l.name, l.code, 'Unassigned') AS location,
        COALESCE(pr.coffee_type, 'Unknown') AS coffee_type,
        COALESCE(NULLIF(pr.lot_id, ''), 'UNSPECIFIED') AS lot_id,
        COALESCE(pr.crop_today, 0) AS crop_kg,
        COALESCE(pr.ripe_today, 0) AS ripe_kg,
        COALESCE(pr.green_today, 0) AS green_kg,
        COALESCE(pr.float_today, 0) AS float_kg,
        COALESCE(pr.wet_parchment, 0) AS wet_parchment_kg,
        COALESCE(pr.dry_parch, 0) AS dry_parchment_kg,
        COALESCE(pr.dry_cherry, 0) AS dry_cherry_kg,
        COALESCE(pr.notes, '') AS notes
      FROM processing_records pr
      LEFT JOIN locations l ON l.id = pr.location_id
      WHERE pr.tenant_id = ${tenantId}
        AND pr.process_date >= ${startDate}::date
        AND pr.process_date <= ${endDate}::date
      ORDER BY pr.process_date DESC, location ASC
      LIMIT ${FETCH_LIMIT}
    `,
  )

const loadDispatchRows = async (
  tenantId: string,
  startDate: string,
  endDate: string,
  tenantContext: ReturnType<typeof normalizeTenantContext>,
) =>
  runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT
        d.dispatch_date::text AS dispatch_date,
        COALESCE(l.name, l.code, 'Unassigned') AS location,
        COALESCE(d.coffee_type, 'Unknown') AS coffee_type,
        COALESCE(d.bag_type, 'Unknown') AS bag_type,
        ROUND(COALESCE(d.bags_dispatched, 0)::numeric, 2) AS bags_dispatched,
        ROUND(COALESCE(d.kgs_received, 0)::numeric, 2) AS kgs_received,
        COALESCE(NULLIF(d.lot_id, ''), '') AS lot_id,
        COALESCE(NULLIF(d.estate, ''), '') AS estate,
        COALESCE(d.notes, '') AS notes
      FROM dispatch_records d
      LEFT JOIN locations l ON l.id = d.location_id
      WHERE d.tenant_id = ${tenantId}
        AND d.dispatch_date >= ${startDate}::date
        AND d.dispatch_date <= ${endDate}::date
      ORDER BY d.dispatch_date DESC, d.created_at DESC
      LIMIT ${FETCH_LIMIT}
    `,
  )

const loadSalesRows = async (
  tenantId: string,
  startDate: string,
  endDate: string,
  tenantContext: ReturnType<typeof normalizeTenantContext>,
) =>
  runTenantQuery(
    sql,
    tenantContext,
    sql`
      WITH bag_weight AS (
        SELECT COALESCE(NULLIF(bag_weight_kg, 0), ${DEFAULT_BAG_WEIGHT_KG}) AS bag_weight_kg
        FROM tenants
        WHERE id = ${tenantId}
        LIMIT 1
      )
      SELECT
        s.sale_date::text AS sale_date,
        COALESCE(l.name, l.code, 'Unassigned') AS location,
        COALESCE(s.coffee_type, 'Unknown') AS coffee_type,
        COALESCE(s.bag_type, 'Unknown') AS bag_type,
        ROUND(COALESCE(s.bags_sold, 0)::numeric, 2) AS bags_sold,
        ROUND(
          COALESCE(
            NULLIF(s.kgs_received, 0),
            NULLIF(s.kgs, 0),
            NULLIF(s.weight_kgs, 0),
            NULLIF(s.kgs_sent, 0),
            s.bags_sold * bw.bag_weight_kg
          )::numeric,
          2
        ) AS sold_kgs,
        ROUND(COALESCE(s.price_per_bag, 0)::numeric, 2) AS price_per_bag,
        ROUND(COALESCE(s.price_per_kg, 0)::numeric, 4) AS price_per_kg,
        ROUND(COALESCE(s.revenue, COALESCE(s.total_revenue, 0))::numeric, 2) AS revenue,
        COALESCE(NULLIF(s.buyer_name, ''), '') AS buyer_name,
        COALESCE(NULLIF(s.batch_no, ''), '') AS batch_no,
        COALESCE(NULLIF(s.lot_id, ''), '') AS lot_id,
        COALESCE(NULLIF(s.estate, ''), '') AS estate,
        COALESCE(s.notes, '') AS notes
      FROM sales_records s
      LEFT JOIN locations l ON l.id = s.location_id
      CROSS JOIN bag_weight bw
      WHERE s.tenant_id = ${tenantId}
        AND s.sale_date >= ${startDate}::date
        AND s.sale_date <= ${endDate}::date
      ORDER BY s.sale_date DESC, s.created_at DESC
      LIMIT ${FETCH_LIMIT}
    `,
  )

const loadPepperRows = async (
  tenantId: string,
  startDate: string,
  endDate: string,
  tenantContext: ReturnType<typeof normalizeTenantContext>,
) =>
  runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT
        pr.process_date::text AS process_date,
        COALESCE(l.name, l.code, 'Unassigned') AS location,
        ROUND(COALESCE(pr.kg_picked, 0)::numeric, 2) AS kg_picked,
        ROUND(COALESCE(pr.green_pepper, 0)::numeric, 2) AS green_pepper,
        ROUND(COALESCE(pr.green_pepper_percent, 0)::numeric, 2) AS green_pepper_percent,
        ROUND(COALESCE(pr.dry_pepper, 0)::numeric, 2) AS dry_pepper,
        ROUND(COALESCE(pr.dry_pepper_percent, 0)::numeric, 2) AS dry_pepper_percent,
        COALESCE(pr.notes, '') AS notes
      FROM pepper_records pr
      LEFT JOIN locations l ON l.id = pr.location_id
      WHERE pr.tenant_id = ${tenantId}
        AND pr.process_date >= ${startDate}::date
        AND pr.process_date <= ${endDate}::date
      ORDER BY pr.process_date DESC, location ASC
      LIMIT ${FETCH_LIMIT}
    `,
  )

const loadRainfallRows = async (
  tenantId: string,
  startDate: string,
  endDate: string,
  tenantContext: ReturnType<typeof normalizeTenantContext>,
) =>
  runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT
        rr.record_date::text AS record_date,
        ROUND(COALESCE(rr.inches, 0)::numeric, 2) AS inches,
        ROUND(COALESCE(rr.cents, 0)::numeric, 0) AS hundredths,
        COALESCE(rr.user_id, 'system') AS user_id,
        COALESCE(rr.notes, '') AS notes
      FROM rainfall_records rr
      WHERE rr.tenant_id = ${tenantId}
        AND rr.record_date >= ${startDate}::date
        AND rr.record_date <= ${endDate}::date
      ORDER BY rr.record_date DESC, rr.created_at DESC
      LIMIT ${FETCH_LIMIT}
    `,
  )

const loadTransactionRows = async (
  tenantId: string,
  startDate: string,
  endDate: string,
  tenantContext: ReturnType<typeof normalizeTenantContext>,
) =>
  runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT
        th.transaction_date::text AS transaction_date,
        COALESCE(l.name, l.code, 'Unassigned') AS location,
        COALESCE(th.item_type, 'Unknown') AS item_type,
        COALESCE(th.transaction_type, 'deplete') AS transaction_type,
        ROUND(COALESCE(th.quantity, 0)::numeric, 4) AS quantity,
        COALESCE(NULLIF(th.unit, ''), 'kg') AS unit,
        ROUND(COALESCE(th.price, 0)::numeric, 2) AS price,
        ROUND(COALESCE(th.total_cost, 0)::numeric, 2) AS total_cost,
        COALESCE(th.user_id, 'system') AS user_id,
        COALESCE(th.notes, '') AS notes
      FROM transaction_history th
      LEFT JOIN locations l ON l.id = th.location_id
      WHERE th.tenant_id = ${tenantId}
        AND th.transaction_date >= ${startDate}::date
        AND th.transaction_date <= ${endDate}::date
      ORDER BY th.transaction_date DESC, th.id DESC
      LIMIT ${FETCH_LIMIT}
    `,
  )

const loadInventoryRows = async (
  tenantId: string,
  tenantContext: ReturnType<typeof normalizeTenantContext>,
) =>
  runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT
        COALESCE(ci.item_type, 'Unknown') AS item_type,
        COALESCE(l.name, l.code, 'Unassigned') AS location,
        ROUND(COALESCE(ci.quantity, 0)::numeric, 4) AS quantity,
        COALESCE(NULLIF(ci.unit, ''), 'kg') AS unit,
        ROUND(COALESCE(ci.avg_price, 0)::numeric, 2) AS avg_price,
        ROUND(COALESCE(ci.total_cost, 0)::numeric, 2) AS total_cost
      FROM current_inventory ci
      LEFT JOIN locations l ON l.id = ci.location_id
      WHERE ci.tenant_id = ${tenantId}
      ORDER BY ci.item_type ASC, location ASC
      LIMIT ${FETCH_LIMIT}
    `,
  )

const loadLaborRows = async (
  tenantId: string,
  startDate: string,
  endDate: string,
  tenantContext: ReturnType<typeof normalizeTenantContext>,
) => {
  const supportsLocation = await tableHasColumn(tenantContext, "labor_transactions", "location_id")
  return runTenantQuery(
    sql,
    tenantContext,
    supportsLocation
      ? sql`
          SELECT
            lt.deployment_date::text AS deployment_date,
            COALESCE(l.name, l.code, 'Unassigned') AS location,
            COALESCE(lt.code, '') AS code,
            ROUND(COALESCE(lt.hf_laborers, 0)::numeric, 2) AS estate_laborers,
            ROUND(COALESCE(lt.hf_cost_per_laborer, 0)::numeric, 2) AS estate_cost_per_laborer,
            ROUND(COALESCE(lt.outside_laborers, 0)::numeric, 2) AS outside_laborers,
            ROUND(COALESCE(lt.outside_cost_per_laborer, 0)::numeric, 2) AS outside_cost_per_laborer,
            ROUND(COALESCE(lt.total_cost, 0)::numeric, 2) AS total_cost,
            COALESCE(lt.notes, '') AS notes
          FROM labor_transactions lt
          LEFT JOIN locations l ON l.id = lt.location_id
          WHERE lt.tenant_id = ${tenantId}
            AND lt.deployment_date >= ${startDate}::date
            AND lt.deployment_date <= ${endDate}::date
          ORDER BY lt.deployment_date DESC, lt.id DESC
          LIMIT ${FETCH_LIMIT}
        `
      : sql`
          SELECT
            lt.deployment_date::text AS deployment_date,
            'Unassigned' AS location,
            COALESCE(lt.code, '') AS code,
            ROUND(COALESCE(lt.hf_laborers, 0)::numeric, 2) AS estate_laborers,
            ROUND(COALESCE(lt.hf_cost_per_laborer, 0)::numeric, 2) AS estate_cost_per_laborer,
            ROUND(COALESCE(lt.outside_laborers, 0)::numeric, 2) AS outside_laborers,
            ROUND(COALESCE(lt.outside_cost_per_laborer, 0)::numeric, 2) AS outside_cost_per_laborer,
            ROUND(COALESCE(lt.total_cost, 0)::numeric, 2) AS total_cost,
            COALESCE(lt.notes, '') AS notes
          FROM labor_transactions lt
          WHERE lt.tenant_id = ${tenantId}
            AND lt.deployment_date >= ${startDate}::date
            AND lt.deployment_date <= ${endDate}::date
          ORDER BY lt.deployment_date DESC, lt.id DESC
          LIMIT ${FETCH_LIMIT}
        `,
  )
}

const loadExpenseRows = async (
  tenantId: string,
  startDate: string,
  endDate: string,
  tenantContext: ReturnType<typeof normalizeTenantContext>,
) => {
  const supportsLocation = await tableHasColumn(tenantContext, "expense_transactions", "location_id")
  return runTenantQuery(
    sql,
    tenantContext,
    supportsLocation
      ? sql`
          SELECT
            et.entry_date::text AS entry_date,
            COALESCE(l.name, l.code, 'Unassigned') AS location,
            COALESCE(et.code, '') AS code,
            ROUND(COALESCE(et.total_amount, 0)::numeric, 2) AS total_amount,
            COALESCE(et.notes, '') AS notes
          FROM expense_transactions et
          LEFT JOIN locations l ON l.id = et.location_id
          WHERE et.tenant_id = ${tenantId}
            AND et.entry_date >= ${startDate}::date
            AND et.entry_date <= ${endDate}::date
          ORDER BY et.entry_date DESC, et.id DESC
          LIMIT ${FETCH_LIMIT}
        `
      : sql`
          SELECT
            et.entry_date::text AS entry_date,
            'Unassigned' AS location,
            COALESCE(et.code, '') AS code,
            ROUND(COALESCE(et.total_amount, 0)::numeric, 2) AS total_amount,
            COALESCE(et.notes, '') AS notes
          FROM expense_transactions et
          WHERE et.tenant_id = ${tenantId}
            AND et.entry_date >= ${startDate}::date
            AND et.entry_date <= ${endDate}::date
          ORDER BY et.entry_date DESC, et.id DESC
          LIMIT ${FETCH_LIMIT}
        `,
  )
}

const loadReconciliationRows = async (
  tenantId: string,
  startDate: string,
  endDate: string,
  tenantContext: ReturnType<typeof normalizeTenantContext>,
) =>
  runTenantQuery(
    sql,
    tenantContext,
    sql`
      WITH bag_weight AS (
        SELECT COALESCE(NULLIF(bag_weight_kg, 0), ${DEFAULT_BAG_WEIGHT_KG}) AS bag_weight_kg
        FROM tenants
        WHERE id = ${tenantId}
        LIMIT 1
      ),
      dispatch AS (
        SELECT
          COALESCE(NULLIF(d.lot_id, ''), 'UNSPECIFIED') AS lot_id,
          COALESCE(d.coffee_type, 'Unknown') AS coffee_type,
          COALESCE(d.bag_type, 'Unknown') AS bag_type,
          COALESCE(SUM(COALESCE(NULLIF(d.kgs_received, 0), d.bags_dispatched * bw.bag_weight_kg)), 0) AS dispatch_kgs
        FROM dispatch_records d
        CROSS JOIN bag_weight bw
        WHERE d.tenant_id = ${tenantId}
          AND d.dispatch_date >= ${startDate}::date
          AND d.dispatch_date <= ${endDate}::date
        GROUP BY 1, 2, 3
      ),
      sales AS (
        SELECT
          COALESCE(NULLIF(s.lot_id, ''), 'UNSPECIFIED') AS lot_id,
          COALESCE(s.coffee_type, 'Unknown') AS coffee_type,
          COALESCE(s.bag_type, 'Unknown') AS bag_type,
          COALESCE(
            SUM(
              COALESCE(
                NULLIF(s.kgs_received, 0),
                NULLIF(s.kgs, 0),
                NULLIF(s.weight_kgs, 0),
                NULLIF(s.kgs_sent, 0),
                s.bags_sold * bw.bag_weight_kg
              )
            ),
            0
          ) AS sold_kgs,
          COALESCE(SUM(COALESCE(s.revenue, 0)), 0) AS revenue
        FROM sales_records s
        CROSS JOIN bag_weight bw
        WHERE s.tenant_id = ${tenantId}
          AND s.sale_date >= ${startDate}::date
          AND s.sale_date <= ${endDate}::date
        GROUP BY 1, 2, 3
      )
      SELECT
        COALESCE(d.lot_id, s.lot_id) AS lot_id,
        COALESCE(d.coffee_type, s.coffee_type) AS coffee_type,
        COALESCE(d.bag_type, s.bag_type) AS bag_type,
        ROUND(COALESCE(d.dispatch_kgs, 0)::numeric, 2) AS dispatch_kgs,
        ROUND(COALESCE(s.sold_kgs, 0)::numeric, 2) AS sold_kgs,
        ROUND((COALESCE(d.dispatch_kgs, 0) - COALESCE(s.sold_kgs, 0))::numeric, 2) AS balance_kgs,
        ROUND(COALESCE(s.revenue, 0)::numeric, 2) AS revenue
      FROM dispatch d
      FULL OUTER JOIN sales s
        ON d.lot_id = s.lot_id
        AND d.coffee_type = s.coffee_type
        AND d.bag_type = s.bag_type
      ORDER BY lot_id ASC, coffee_type ASC, bag_type ASC
      LIMIT ${FETCH_LIMIT}
    `,
  )

const loadReceivablesRows = async (
  tenantId: string,
  startDate: string,
  endDate: string,
  tenantContext: ReturnType<typeof normalizeTenantContext>,
) =>
  runTenantQuery(
    sql,
    tenantContext,
    sql`
      SELECT
        COALESCE(r.buyer_name, 'Unknown Buyer') AS buyer_name,
        COALESCE(r.invoice_no, 'N/A') AS invoice_no,
        r.invoice_date::text AS invoice_date,
        r.due_date::text AS due_date,
        ROUND(COALESCE(r.amount, 0)::numeric, 2) AS amount,
        COALESCE(r.status, 'unpaid') AS status,
        GREATEST(0, (CURRENT_DATE - COALESCE(r.due_date, r.invoice_date))::int) AS days_past_due,
        CASE
          WHEN COALESCE(r.status, 'unpaid') = 'paid' THEN 'paid'
          WHEN CURRENT_DATE <= COALESCE(r.due_date, r.invoice_date) THEN 'current'
          WHEN CURRENT_DATE - COALESCE(r.due_date, r.invoice_date) <= 30 THEN '1-30'
          WHEN CURRENT_DATE - COALESCE(r.due_date, r.invoice_date) <= 60 THEN '31-60'
          WHEN CURRENT_DATE - COALESCE(r.due_date, r.invoice_date) <= 90 THEN '61-90'
          ELSE '90+'
        END AS aging_bucket
      FROM receivables r
      WHERE r.tenant_id = ${tenantId}
        AND r.invoice_date >= ${startDate}::date
        AND r.invoice_date <= ${endDate}::date
      ORDER BY r.invoice_date DESC, r.created_at DESC
      LIMIT ${FETCH_LIMIT}
    `,
  )

const loadPnlRows = async (
  tenantId: string,
  startDate: string,
  endDate: string,
  tenantContext: ReturnType<typeof normalizeTenantContext>,
) =>
  runTenantQuery(
    sql,
    tenantContext,
    sql`
      WITH months AS (
        SELECT date_trunc('month', gs)::date AS month_start
        FROM generate_series(${startDate}::date, ${endDate}::date, interval '1 month') gs
      ),
      sales AS (
        SELECT date_trunc('month', sale_date)::date AS month_start, COALESCE(SUM(COALESCE(revenue, 0)), 0) AS sales_revenue
        FROM sales_records
        WHERE tenant_id = ${tenantId}
          AND sale_date >= ${startDate}::date
          AND sale_date <= ${endDate}::date
        GROUP BY 1
      ),
      labor AS (
        SELECT date_trunc('month', deployment_date)::date AS month_start, COALESCE(SUM(COALESCE(total_cost, 0)), 0) AS labor_cost
        FROM labor_transactions
        WHERE tenant_id = ${tenantId}
          AND deployment_date >= ${startDate}::date
          AND deployment_date <= ${endDate}::date
        GROUP BY 1
      ),
      expense AS (
        SELECT date_trunc('month', entry_date)::date AS month_start, COALESCE(SUM(COALESCE(total_amount, 0)), 0) AS expense_cost
        FROM expense_transactions
        WHERE tenant_id = ${tenantId}
          AND entry_date >= ${startDate}::date
          AND entry_date <= ${endDate}::date
        GROUP BY 1
      )
      SELECT
        to_char(m.month_start, 'YYYY-MM') AS month,
        ROUND(COALESCE(s.sales_revenue, 0)::numeric, 2) AS sales_revenue,
        ROUND(COALESCE(l.labor_cost, 0)::numeric, 2) AS labor_cost,
        ROUND(COALESCE(e.expense_cost, 0)::numeric, 2) AS other_expenses,
        ROUND((COALESCE(l.labor_cost, 0) + COALESCE(e.expense_cost, 0))::numeric, 2) AS total_cost,
        ROUND((COALESCE(s.sales_revenue, 0) - (COALESCE(l.labor_cost, 0) + COALESCE(e.expense_cost, 0)))::numeric, 2) AS gross_margin
      FROM months m
      LEFT JOIN sales s ON s.month_start = m.month_start
      LEFT JOIN labor l ON l.month_start = m.month_start
      LEFT JOIN expense e ON e.month_start = m.month_start
      ORDER BY m.month_start ASC
      LIMIT ${FETCH_LIMIT}
    `,
  )

const loadDatasetRows = async (
  dataset: ExportDatasetId,
  tenantId: string,
  startDate: string,
  endDate: string,
  tenantContext: ReturnType<typeof normalizeTenantContext>,
) => {
  switch (dataset) {
    case "processing":
      return loadProcessingRows(tenantId, startDate, endDate, tenantContext)
    case "dispatch":
      return loadDispatchRows(tenantId, startDate, endDate, tenantContext)
    case "sales":
      return loadSalesRows(tenantId, startDate, endDate, tenantContext)
    case "pepper":
      return loadPepperRows(tenantId, startDate, endDate, tenantContext)
    case "rainfall":
      return loadRainfallRows(tenantId, startDate, endDate, tenantContext)
    case "transactions":
      return loadTransactionRows(tenantId, startDate, endDate, tenantContext)
    case "inventory":
      return loadInventoryRows(tenantId, tenantContext)
    case "labor":
      return loadLaborRows(tenantId, startDate, endDate, tenantContext)
    case "expenses":
      return loadExpenseRows(tenantId, startDate, endDate, tenantContext)
    case "reconciliation":
      return loadReconciliationRows(tenantId, startDate, endDate, tenantContext)
    case "receivables-aging":
      return loadReceivablesRows(tenantId, startDate, endDate, tenantContext)
    case "pnl-monthly":
      return loadPnlRows(tenantId, startDate, endDate, tenantContext)
    default:
      return []
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const dataset = String(searchParams.get("dataset") || "").trim().toLowerCase() as ExportDatasetId
    if (!dataset || !DATASET_TO_MODULES[dataset]) {
      return NextResponse.json(
        {
          success: false,
          error: `dataset must be one of: ${DATASET_LABELS}`,
        },
        { status: 400 },
      )
    }

    const sessionUser = await requireAnyModuleAccess(DATASET_TO_MODULES[dataset])
    const tenantId = parseTenantId(searchParams.get("tenantId"), sessionUser.tenantId, sessionUser.role)
    if (!tenantId) {
      return NextResponse.json({ success: false, error: "tenantId is required" }, { status: 400 })
    }

    const fiscalYear = getCurrentFiscalYear()
    const startDate = parseDate(searchParams.get("startDate"), fiscalYear.startDate)
    const endDate = parseDate(searchParams.get("endDate"), fiscalYear.endDate)
    if (!startDate || !endDate) {
      return NextResponse.json({ success: false, error: "startDate and endDate must be YYYY-MM-DD" }, { status: 400 })
    }
    if (datasetUsesDateRange(dataset) && startDate > endDate) {
      return NextResponse.json({ success: false, error: "startDate must be before or equal to endDate" }, { status: 400 })
    }

    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)
    const rows = await loadDatasetRows(dataset, tenantId, startDate, endDate, tenantContext)
    const truncated = rows.length > MAX_ROWS
    const exportRows = truncated ? rows.slice(0, MAX_ROWS) : rows

    const format = String(searchParams.get("format") || "csv").trim().toLowerCase()
    const filename = datasetUsesDateRange(dataset)
      ? `${dataset}-${startDate}-to-${endDate}.csv`
      : `${dataset}-snapshot.csv`

    if (format === "json") {
      return NextResponse.json({
        success: true,
        dataset,
        tenantId,
        startDate,
        endDate,
        count: exportRows.length,
        truncated,
        maxRows: MAX_ROWS,
        records: exportRows,
      })
    }

    const csv = toCsv(exportRows as Array<Record<string, unknown>>)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Export-Truncated": truncated ? "1" : "0",
        "X-Export-Max-Rows": String(MAX_ROWS),
        "X-Export-Returned-Rows": String(exportRows.length),
      },
    })
  } catch (error: any) {
    console.error("Error exporting operations data:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }

    const message = String(error?.message || "Failed to export operations data")
    const relationHints: Record<string, string> = {
      receivables: "Receivables table is not available. Run scripts/47-receivables.sql first.",
      processing_records: "Processing table is not available for this tenant database.",
      dispatch_records: "Dispatch table is not available for this tenant database.",
      sales_records: "Sales table is not available for this tenant database.",
      rainfall_records: "Rainfall table is not available for this tenant database.",
      pepper_records: "Pepper table is not available for this tenant database.",
      transaction_history: "Transactions table is not available for this tenant database.",
      current_inventory: "Inventory table is not available for this tenant database.",
      labor_transactions: "Labor table is not available for this tenant database.",
      expense_transactions: "Expense table is not available for this tenant database.",
    }

    for (const [relationName, hint] of Object.entries(relationHints)) {
      if (message.includes(`relation "${relationName}" does not exist`)) {
        return NextResponse.json({ success: false, error: hint }, { status: 503 })
      }
    }

    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
