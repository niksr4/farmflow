export type InventoryItemView = {
  name: string
  quantity: number
  unit: string
  avg_price?: number
  total_cost?: number
}

export type InventoryTransactionView = {
  id: string
  itemType: string
  quantity: number
  transactionType: "Depleting" | "Restocking" | "Item Deleted" | "Unit Change" | string
  notes: string
  date: string
  user: string
  unit: string
  price?: number
  totalCost?: number
}
