"use client"

import { useState, useEffect, useCallback } from "react"
import type { InventoryItemView, InventoryTransactionView } from "@/lib/inventory-view-types"
import { useAuth } from "@/hooks/use-auth"

export interface InventorySummary {
  total_inventory_value: number
  total_items: number
  total_quantity: number
}

export function useInventoryData() {
  const { user } = useAuth()
  const [inventory, setInventory] = useState<InventoryItemView[]>([])
  const [summary, setSummary] = useState<InventorySummary>({
    total_inventory_value: 0,
    total_items: 0,
    total_quantity: 0,
  })
  const [transactions, setTransactions] = useState<InventoryTransactionView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<Date | null>(null)

  const refreshData = useCallback(async (force = false) => {
    try {
      setLoading(true)
      setError(null)

      const [inventoryRes, transactionsRes] = await Promise.all([
        fetch("/api/inventory-neon", { cache: force ? "no-store" : "default" }),
        fetch("/api/transactions-neon?limit=500", { cache: force ? "no-store" : "default" }),
      ])

      if (!inventoryRes.ok || !transactionsRes.ok) {
        throw new Error("Failed to fetch data")
      }

      const inventoryData = await inventoryRes.json()
      const transactionsData = await transactionsRes.json()


      if (inventoryData.success) {
        setInventory(inventoryData.inventory || [])
        setSummary(inventoryData.summary || { total_inventory_value: 0, total_items: 0, total_quantity: 0 })
      }

      if (transactionsData.success && Array.isArray(transactionsData.transactions)) {
        const mappedTransactions = transactionsData.transactions.map((t: any) => {
          let transactionType: InventoryTransactionView["transactionType"] = "Depleting"
          const typeStr = String(t.transaction_type || "").toLowerCase()

          if (typeStr === "restock" || typeStr === "restocking") {
            transactionType = "Restocking"
          } else if (typeStr === "deplete" || typeStr === "depleting") {
            transactionType = "Depleting"
          } else if (typeStr === "item deleted") {
            transactionType = "Item Deleted"
          } else if (typeStr === "unit change") {
            transactionType = "Unit Change"
          }

          return {
            id: String(t.id),
            itemType: String(t.item_type),
            quantity: Number(t.quantity) || 0,
            transactionType,
            notes: String(t.notes || ""),
            date: t.transaction_date
              ? new Date(t.transaction_date).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "",
            user: String(t.user_id || "unknown"),
            unit: String(t.unit || "kg"),
            price: t.price ? Number(t.price) : undefined,
            totalCost: t.total_cost ? Number(t.total_cost) : undefined,
          }
        })

        setTransactions(mappedTransactions)
      }

      setLastSync(new Date())
    } catch (err: any) {
      console.error("[CLIENT] ❌ Error refreshing data:", err)
      setError(err.message || "Failed to load data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshData()
  }, [refreshData])

  const addTransaction = async (transaction: Omit<InventoryTransactionView, "id" | "date">) => {
    try {

      let transactionType = "deplete"
      if (transaction.transactionType === "Restocking") {
        transactionType = "restock"
      }

      const response = await fetch("/api/transactions-neon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_type: transaction.itemType,
          quantity: transaction.quantity,
          transaction_type: transactionType,
          notes: transaction.notes,
          user_id: transaction.user,
          price: transaction.price || 0,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to add transaction")
      }

      await refreshData(true)
      return true
    } catch (err: any) {
      console.error("[CLIENT] ❌ Error adding transaction:", err)
      throw err
    }
  }

  const addNewItem = async (item: { name: string; quantity: number; unit: string; price: number; user: string }) => {
    try {

      const response = await fetch("/api/inventory-neon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_type: item.name,
          quantity: item.quantity,
          unit: item.unit,
          price: item.price,
          user_id: item.user,
          notes: `New item added: ${item.name}`,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to add item")
      }

      await refreshData(true)
      return true
    } catch (err: any) {
      console.error("[CLIENT] ❌ Error adding item:", err)
      throw err
    }
  }

  const updateTransaction = async (transaction: InventoryTransactionView) => {
    try {

      let transactionType = "deplete"
      if (transaction.transactionType === "Restocking") {
        transactionType = "restock"
      }

      const response = await fetch("/api/transactions-neon/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: transaction.id,
          item_type: transaction.itemType,
          quantity: transaction.quantity,
          transaction_type: transactionType,
          notes: transaction.notes,
          price: transaction.price || 0,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to update transaction")
      }

      await refreshData(true)
      return true
    } catch (err: any) {
      console.error("[CLIENT] ❌ Error updating transaction:", err)
      throw err
    }
  }

  const batchUpdate = async (updatedTransactions: InventoryTransactionView[]) => {
    if (updatedTransactions.length > 0) {
      return updateTransaction(updatedTransactions[0])
    }
    return false
  }

  return {
    inventory,
    summary,
    transactions,
    addTransaction,
    addNewItem,
    updateTransaction,
    batchUpdate,
    refreshData,
    loading,
    error,
    lastSync,
  }
}
