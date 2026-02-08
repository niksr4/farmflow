export interface Transaction {
  id?: number
  item_type: string
  quantity: number
  transaction_type: "restock" | "deplete"
  notes?: string
  transaction_date?: string
  user_id: string
  price?: number
  total_cost?: number
  unit?: string
  location_id?: string | null
  location_name?: string
  location_code?: string
}

export interface InventoryItem {
  name: string
  quantity: number
  unit: string
  avg_price?: number
  total_cost?: number
  location_id?: string | null
}
