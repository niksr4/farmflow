/**
 * Shapes the Dispatch tab reads and writes.
 *
 * Moved out of components/dispatch-tab.tsx unchanged on 2026-09-21. Types only -- no runtime
 * code, so importing this cannot change behaviour.
 */

export interface DispatchRecord {
  id?: number
  dispatch_date: string
  location_id?: string | null
  location_name?: string | null
  location_code?: string | null
  estate?: string | null
  lot_id?: string | null
  coffee_type: string
  bag_type: string
  bags_dispatched: number
  kgs_received?: number | null
  price_per_bag?: number
  buyer_name?: string
  notes: string | null
  created_by: string
}

export interface DispatchSummaryRow {
  coffee_type: string
  bag_type: string
  bags_dispatched: number
  kgs_received: number
}

export interface LocationOption {
  id: string
  name: string
  code: string
}

export interface BagTotals {
  arabica_dry_parchment_bags: number
  arabica_dry_cherry_bags: number
  robusta_dry_parchment_bags: number
  robusta_dry_cherry_bags: number
}

export type LocationScope = "all" | "location" | "legacy_pool"

export type DispatchTabProps = {
  showDataToolsControls?: boolean
}
