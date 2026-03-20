import "server-only"

import { sql } from "@/lib/server/db"
import { getFiscalYearDateRange, getCurrentFiscalYear } from "@/lib/fiscal-year-utils"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

type TenantContext = ReturnType<typeof normalizeTenantContext>

type InventoryItem = {
  name: string
  quantity: number
  unit: string
}

type TransactionSummary = {
  itemType: string
  quantity: number
  transactionType: string
  date: string
  totalCost?: number
}

type TransactionHistoryRow = {
  item_type: string
  quantity: number
  transaction_type: string
  transaction_date: string
  total_cost?: number
}

interface DataSummaryInput {
  inventory: InventoryItem[]
  transactions: TransactionSummary[]
  transactionHistory: TransactionHistoryRow[]
  laborData: Array<{
    deployment_date: string
    hf_laborers: number
    hf_cost_per_laborer: number
    outside_laborers: number
    outside_cost_per_laborer: number
    total_cost: number
    code: string
  }>
  processingData: Record<
    string,
    Array<{
      process_date: string
      crop_today: number
      ripe_today: number
      dry_p_bags: number
      dry_cherry_bags: number
    }>
  >
  rainfallData: Array<{ record_date: string; inches: number; cents: number }>
  expenseData: Array<{ entry_date: string; code: string; total_amount: number }>
  dispatchData: Array<{ dispatch_date: string; location: string; coffee_type: string; bag_type: string; bags_dispatched: number }>
  salesData: Array<{
    sale_date: string
    coffee_type: string
    bag_type: string
    weight_kgs: number
    price_per_kg: number
    total_revenue: number
    buyer_name: string
  }>
  fiscalYear: string
}

export async function buildTenantAiDataSummary(input: {
  tenantId: string
  role: string
  inventory?: InventoryItem[]
  transactions?: Array<{
    item_type?: string
    quantity?: number
    transaction_type?: string
    transaction_date?: string
    total_cost?: number
  }>
}) {
  const tenantContext = normalizeTenantContext(input.tenantId, input.role)
  const fiscalYear = getCurrentFiscalYear()
  const { startDate, endDate } = getFiscalYearDateRange(fiscalYear)

  const [inventorySnapshot, laborData, processingData, rainfallData, expenseData, dispatchData, salesData, transactionHistory] =
    await Promise.all([
      input.inventory && input.inventory.length > 0 ? Promise.resolve(input.inventory) : fetchInventorySnapshot(tenantContext),
      fetchLaborData(startDate, endDate, tenantContext),
      fetchProcessingData(startDate, endDate, tenantContext),
      fetchRainfallData(tenantContext),
      fetchExpenseData(startDate, endDate, tenantContext),
      fetchDispatchData(startDate, endDate, tenantContext),
      fetchSalesData(startDate, endDate, tenantContext),
      fetchTransactionHistory(startDate, endDate, tenantContext),
    ])

  const normalizedTransactions = (input.transactions || []).map((transaction) => ({
    itemType: String(transaction.item_type || ""),
    quantity: Number(transaction.quantity) || 0,
    transactionType: String(transaction.transaction_type || ""),
    date: String(transaction.transaction_date || ""),
    totalCost: transaction.total_cost ? Number(transaction.total_cost) : 0,
  }))

  return {
    fiscalYearLabel: fiscalYear.label,
    dataSummary: buildDataSummary({
      inventory: inventorySnapshot,
      transactions: normalizedTransactions,
      laborData,
      processingData,
      rainfallData,
      expenseData,
      dispatchData,
      salesData,
      fiscalYear: fiscalYear.label,
      transactionHistory,
    }),
  }
}

async function fetchInventorySnapshot(tenantContext: TenantContext): Promise<InventoryItem[]> {
  try {
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT item_type, COALESCE(unit, 'kg') AS unit, COALESCE(SUM(quantity), 0) AS quantity
        FROM current_inventory
        WHERE tenant_id = ${tenantContext.tenantId}
        GROUP BY item_type, unit
        ORDER BY item_type ASC
        LIMIT 300
      `,
    )

    return rows.map((row) => ({
      name: String(row.item_type || ""),
      quantity: Number(row.quantity) || 0,
      unit: String(row.unit || "kg"),
    }))
  } catch (error) {
    console.error("Error fetching AI inventory snapshot:", error)
    return []
  }
}

async function fetchLaborData(startDate: string, endDate: string, tenantContext: TenantContext) {
  try {
    return await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT deployment_date, hf_laborers, hf_cost_per_laborer, outside_laborers, outside_cost_per_laborer, total_cost, code, notes
        FROM labor_transactions
        WHERE deployment_date >= ${startDate} AND deployment_date <= ${endDate}
          AND tenant_id = ${tenantContext.tenantId}
        ORDER BY deployment_date DESC
        LIMIT 100
      `,
    )
  } catch (error) {
    console.error("Error fetching labor data:", error)
    return []
  }
}

async function fetchProcessingData(startDate: string, endDate: string, tenantContext: TenantContext) {
  try {
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT
          pr.process_date,
          pr.crop_today,
          pr.ripe_today,
          pr.green_today,
          pr.float_today,
          pr.wet_parchment,
          pr.dry_parch,
          pr.dry_cherry,
          pr.dry_p_bags,
          pr.dry_cherry_bags,
          pr.dry_p_bags_todate,
          pr.dry_cherry_bags_todate,
          pr.coffee_type,
          l.name AS location_name
        FROM processing_records pr
        JOIN locations l ON l.id = pr.location_id
        WHERE pr.process_date >= ${startDate}::date AND pr.process_date <= ${endDate}::date
          AND pr.tenant_id = ${tenantContext.tenantId}
        ORDER BY pr.process_date DESC
        LIMIT 500
      `,
    )

    const grouped: Record<string, typeof rows> = {}
    for (const row of rows) {
      const key = `${row.location_name} ${row.coffee_type}`.trim()
      if (!grouped[key]) {
        grouped[key] = []
      }
      grouped[key].push(row)
    }
    return grouped
  } catch (error) {
    console.error("Error fetching processing data:", error)
    return {}
  }
}

async function fetchRainfallData(tenantContext: TenantContext) {
  try {
    const currentYear = new Date().getFullYear()
    return await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT record_date, inches, cents
        FROM rainfall_records
        WHERE EXTRACT(YEAR FROM record_date) = ${currentYear}
          AND tenant_id = ${tenantContext.tenantId}
        ORDER BY record_date DESC
        LIMIT 365
      `,
    )
  } catch (error) {
    console.error("Error fetching rainfall data:", error)
    return []
  }
}

async function fetchExpenseData(startDate: string, endDate: string, tenantContext: TenantContext) {
  try {
    return await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT entry_date, code, total_amount, notes
        FROM expense_transactions
        WHERE entry_date >= ${startDate} AND entry_date <= ${endDate}
          AND tenant_id = ${tenantContext.tenantId}
        ORDER BY entry_date DESC
        LIMIT 100
      `,
    )
  } catch (error) {
    console.error("Error fetching expense data:", error)
    return []
  }
}

async function fetchDispatchData(startDate: string, endDate: string, tenantContext: TenantContext) {
  try {
    return await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT
          dr.dispatch_date,
          COALESCE(l.name, l.code, dr.estate, 'Unknown') AS location,
          dr.coffee_type,
          dr.bag_type,
          dr.bags_dispatched
        FROM dispatch_records dr
        LEFT JOIN locations l ON l.id = dr.location_id
        WHERE dr.dispatch_date >= ${startDate} AND dr.dispatch_date <= ${endDate}
          AND dr.tenant_id = ${tenantContext.tenantId}
        ORDER BY dr.dispatch_date DESC
        LIMIT 200
      `,
    )
  } catch (error) {
    console.error("Error fetching dispatch data:", error)
    return []
  }
}

async function fetchSalesData(startDate: string, endDate: string, tenantContext: TenantContext) {
  try {
    return await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT sale_date, coffee_type, bag_type, kgs AS weight_kgs, price_per_bag AS price_per_kg, revenue AS total_revenue, buyer_name
        FROM sales_records
        WHERE sale_date >= ${startDate} AND sale_date <= ${endDate}
          AND tenant_id = ${tenantContext.tenantId}
        ORDER BY sale_date DESC
        LIMIT 200
      `,
    )
  } catch (error) {
    console.error("Error fetching sales data:", error)
    return []
  }
}

async function fetchTransactionHistory(startDate: string, endDate: string, tenantContext: TenantContext): Promise<TransactionHistoryRow[]> {
  try {
    return await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT item_type, quantity, transaction_type, transaction_date, total_cost
        FROM transaction_history
        WHERE transaction_date >= ${startDate} AND transaction_date <= ${endDate}
          AND tenant_id = ${tenantContext.tenantId}
        ORDER BY transaction_date DESC
        LIMIT 500
      `,
    )
  } catch (error) {
    console.error("Error fetching transaction history:", error)
    return []
  }
}

function buildDataSummary(data: DataSummaryInput): string {
  const sections: string[] = []

  sections.push(`## Fiscal Year: ${data.fiscalYear}`)
  sections.push(`## Analysis Date: ${new Date().toLocaleDateString("en-IN")}`)

  const history =
    data.transactionHistory && data.transactionHistory.length > 0
      ? data.transactionHistory.map((transaction) => ({
          itemType: String(transaction.item_type),
          quantity: Number(transaction.quantity) || 0,
          transactionType: String(transaction.transaction_type || ""),
          date: String(transaction.transaction_date || ""),
          totalCost: transaction.total_cost ? Number(transaction.total_cost) : 0,
        }))
      : data.transactions

  if (data.inventory.length > 0) {
    const lowStock = data.inventory.filter((item) => item.quantity < 10)
    sections.push("\n## Current Inventory Snapshot")
    sections.push(`- Total items tracked: ${data.inventory.length}`)
    sections.push(`- Low stock items (<10 units): ${lowStock.length}`)
  }

  if (history.length > 0) {
    const restocking = history.filter((transaction) => transaction.transactionType.toLowerCase().includes("restock"))
    const depleting = history.filter((transaction) => transaction.transactionType.toLowerCase().includes("deplet"))
    const totalRestockCost = restocking.reduce((sum, transaction) => sum + (Number(transaction.totalCost) || 0), 0)
    const totalDepleteQty = depleting.reduce((sum, transaction) => sum + (Number(transaction.quantity) || 0), 0)

    sections.push("\n## Transaction History Patterns")
    sections.push(`- Total transactions analyzed: ${history.length}`)
    sections.push(`- Restocking transactions: ${restocking.length} (Total cost: ₹${totalRestockCost.toLocaleString()})`)
    sections.push(`- Depleting transactions: ${depleting.length} (Total quantity: ${totalDepleteQty.toFixed(2)})`)
  }

  if (data.processingData && Object.keys(data.processingData).length > 0) {
    let totalAllCrop = 0
    let totalAllDryP = 0
    let totalAllDryCherry = 0

    sections.push("\n## Coffee Processing Summary")

    for (const [location, records] of Object.entries(data.processingData)) {
      if (!records || records.length === 0) continue
      const totalCrop = records.reduce((sum, record) => sum + (Number(record.crop_today) || 0), 0)
      const totalRipe = records.reduce((sum, record) => sum + (Number(record.ripe_today) || 0), 0)
      const totalDryPBags = records.reduce((sum, record) => sum + (Number(record.dry_p_bags) || 0), 0)
      const totalDryCherryBags = records.reduce((sum, record) => sum + (Number(record.dry_cherry_bags) || 0), 0)

      totalAllCrop += totalCrop
      totalAllDryP += totalDryPBags
      totalAllDryCherry += totalDryCherryBags

      sections.push(`\n### ${location}`)
      sections.push(`- Processing days: ${records.length}`)
      sections.push(`- Total crop: ${totalCrop.toFixed(2)} kg, Ripe: ${totalRipe.toFixed(2)} kg`)
      sections.push(`- Dry Parchment Bags: ${totalDryPBags.toFixed(2)}, Dry Cherry Bags: ${totalDryCherryBags.toFixed(2)}`)
    }

    sections.push("\n### Overall Processing Totals")
    sections.push(`- Total crop processed: ${totalAllCrop.toFixed(2)} kg`)
    sections.push(`- Total Dry Parchment Bags: ${totalAllDryP.toFixed(2)}, Total Dry Cherry Bags: ${totalAllDryCherry.toFixed(2)}`)
  }

  if (data.dispatchData.length > 0) {
    const totalBagsDispatched = data.dispatchData.reduce((sum, dispatch) => sum + (Number(dispatch.bags_dispatched) || 0), 0)
    sections.push("\n## Dispatch Summary")
    sections.push(`- Total dispatch entries: ${data.dispatchData.length}`)
    sections.push(`- Total bags dispatched: ${totalBagsDispatched.toFixed(2)}`)
  }

  if (data.salesData.length > 0) {
    const totalRevenue = data.salesData.reduce((sum, sale) => sum + (Number(sale.total_revenue) || 0), 0)
    sections.push("\n## Sales Summary")
    sections.push(`- Total sales entries: ${data.salesData.length}`)
    sections.push(`- Total revenue: ₹${totalRevenue.toLocaleString()}`)
  }

  if (data.expenseData.length > 0) {
    const totalExpenses = data.expenseData.reduce((sum, expense) => sum + (Number(expense.total_amount) || 0), 0)
    sections.push("\n## Other Expenses Summary")
    sections.push(`- Total other expenses: ₹${totalExpenses.toLocaleString()}`)
    sections.push(`- Number of expense entries: ${data.expenseData.length}`)
  }

  if (data.laborData.length > 0) {
    const totalCost = data.laborData.reduce((sum, labor) => sum + (Number(labor.total_cost) || 0), 0)
    sections.push("\n## Labor Deployment Summary")
    sections.push(`- Total labor entries: ${data.laborData.length}`)
    sections.push(`- Total labor cost: ₹${totalCost.toLocaleString()}`)
  }

  if (data.rainfallData.length > 0) {
    const totalRainfall = data.rainfallData.reduce((sum, rainfall) => sum + (Number(rainfall.inches) || 0) + (Number(rainfall.cents) || 0) / 100, 0)
    sections.push("\n## Rainfall Data")
    sections.push(`- Total rainfall this year: ${totalRainfall.toFixed(2)} inches`)
    sections.push(`- Recording days: ${data.rainfallData.length}`)
  }

  return sections.join("\n")
}
