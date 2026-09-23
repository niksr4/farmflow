/**
 * Shapes the Sales tab reads and writes.
 *
 * Moved out of components/sales-tab.tsx unchanged on 2026-09-21. Types only -- no runtime code,
 * so importing this cannot change behaviour.
 */

export interface SalesRecord {
  id?: number
  sale_date: string
  batch_no: string
  location_id?: string | null
  location_name?: string | null
  location_code?: string | null
  estate?: string | null
  lot_id?: string | null
  coffee_type: string | null
  bag_type: string | null
  buyer_name?: string | null
  bags_sold: number
  price_per_bag: number
  revenue: number
  kgs_received?: number | null
  kgs?: number | null
  weight_kgs?: number | null
  kgs_sent?: number | null
  bank_account: string | null
  notes: string | null
}

export interface DispatchSummaryRow {
  coffee_type: string
  bag_type: string
  bags_dispatched: number
  kgs_received: number
}

export interface SalesSummaryRow {
  coffee_type: string
  bag_type: string
  bags_sold: number
  kgs_sold?: number
  revenue: number
}

export interface LocationOption {
  id: string
  name: string
  code: string
}

export type LocationScope = "all" | "location" | "legacy_pool"
export type SalesTotals = { totalBagsSold: number; totalKgsSold: number; totalRevenue: number }

export type InventoryTotals = { bags: number; kgs: number }
export type InventoryBreakdown = { cherry: InventoryTotals; parchment: InventoryTotals; total: InventoryTotals }

export type SalesWorkspaceView = "coffee" | "other-sales"

export type SalesTabProps = {
  showDataToolsControls?: boolean
  coffeeSalesEnabled?: boolean
  otherSalesEnabled?: boolean
  activeWorkspaceView?: SalesWorkspaceView
  onWorkspaceViewChange?: (view: SalesWorkspaceView) => void
}

export type OtherSalesTotals = { totalRevenue: number; totalCount: number }
