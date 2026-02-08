"use client"

import { useMemo } from "react"
import type { InventoryTransactionView } from "@/lib/inventory-view-types"
import { ITEM_BASE_PRICES } from "@/lib/pricing"

export type InventoryValue = {
  quantity: number
  totalValue: number
  avgPrice: number
}

export function useInventoryValuation(transactions: InventoryTransactionView[]): Record<string, InventoryValue> {
  const valuation = useMemo(() => {
    if (!transactions || transactions.length === 0) {
      return {}
    }

    const stock: Record<string, { layers: { qty: number; price: number }[] }> = {}

    // Process transactions from oldest to newest to build up stock layers
    const sortedTransactions = [...transactions].reverse()

    for (const tx of sortedTransactions) {
      const { itemType, quantity, transactionType, price } = tx

      if (!stock[itemType]) {
        stock[itemType] = { layers: [] }
      }

      if (transactionType === "Restocking") {
        // For any restocking, historical or new, add a layer.
        // Use the transaction's price if it exists.
        // Otherwise, fall back to the new base price map.
        // This effectively values all un-priced historical stock at the new base price.
        const layerPrice = price ?? ITEM_BASE_PRICES[itemType] ?? 0
        stock[itemType].layers.push({ qty: quantity, price: layerPrice })
      } else if (transactionType === "Depleting") {
        let depletedAmount = quantity
        // Deplete from the oldest layers first (FIFO)
        while (depletedAmount > 0 && stock[itemType].layers.length > 0) {
          const oldestLayer = stock[itemType].layers[0]
          if (oldestLayer.qty <= depletedAmount) {
            // This depletion consumes the entire oldest layer
            depletedAmount -= oldestLayer.qty
            stock[itemType].layers.shift() // Remove the layer
          } else {
            // This depletion only consumes part of the oldest layer
            oldestLayer.qty -= depletedAmount
            depletedAmount = 0
          }
        }
      } else if (transactionType === "Item Deleted") {
        // If an item is deleted, clear its stock layers
        stock[itemType].layers = []
      }
      // 'Unit Change' does not affect quantity or value, so we ignore it here.
    }

    // Now, calculate the final values from the remaining layers
    const finalValues: Record<string, InventoryValue> = {}
    for (const itemName in stock) {
      const itemStock = stock[itemName]
      const totalQuantity = itemStock.layers.reduce((sum, layer) => sum + layer.qty, 0)
      const totalValue = itemStock.layers.reduce((sum, layer) => sum + layer.qty * layer.price, 0)
      const avgPrice = totalQuantity > 0 ? totalValue / totalQuantity : 0

      if (totalQuantity > 0) {
        finalValues[itemName] = {
          quantity: totalQuantity,
          totalValue,
          avgPrice,
        }
      }
    }

    return finalValues
  }, [transactions])

  return valuation
}
