// Single source of truth for what counts as booked P&L revenue/outflow.
// finance-balance-sheet and exports/ops (pnl-monthly) each compute their own
// version of this; they drifted (the export omitted other_sales_records).
// Route-specific queries can still vary in shape (aggregate vs. grouped by
// month, graceful degradation on missing tables, extra memo lines) — but the
// definition and arithmetic below must stay identical in both places.

export const PNL_REVENUE_TABLES = ["sales_records", "other_sales_records"] as const
export const PNL_OUTFLOW_TABLES = ["labor_transactions", "expense_transactions"] as const

export type PnlTotalsInput = {
  salesRevenue: number
  otherSalesRevenue: number
  laborCost: number
  expenseCost: number
}

export type PnlTotals = {
  totalRevenue: number
  totalOutflow: number
  netMargin: number
}

export function computeNetPnl(input: PnlTotalsInput): PnlTotals {
  const totalRevenue = input.salesRevenue + input.otherSalesRevenue
  const totalOutflow = input.laborCost + input.expenseCost
  return {
    totalRevenue,
    totalOutflow,
    netMargin: totalRevenue - totalOutflow,
  }
}
