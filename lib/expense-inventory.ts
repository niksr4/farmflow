import { normalizeInventoryItemType } from "./inventory-item-type"

export type InventoryAllocationSlot = {
  itemType: string
  locationId: string | null
  quantity: number
  unit?: string | null
}

export type InventoryAllocation = {
  itemType: string
  locationId: string | null
  quantity: number
  unit: string
}

const INVENTORY_EPSILON = 0.0001

const toRoundedQuantity = (value: number) => Number((Math.round((value + Number.EPSILON) * 10000) / 10000).toFixed(4))

const getSlotPriority = (slot: InventoryAllocationSlot, preferredLocationId?: string | null) => {
  if (preferredLocationId && slot.locationId === preferredLocationId) return 0
  if (slot.locationId === null) return preferredLocationId ? 1 : 0
  return preferredLocationId ? 2 : 1
}

export function allocateInventoryQuantity(
  slots: InventoryAllocationSlot[],
  requestedQuantity: number,
  preferredLocationId?: string | null,
): InventoryAllocation[] {
  const normalizedRequestedQuantity = toRoundedQuantity(Number(requestedQuantity) || 0)
  if (normalizedRequestedQuantity <= 0) {
    return []
  }

  const orderedSlots = [...slots]
    .map((slot) => ({
      ...slot,
      itemType: normalizeInventoryItemType(slot.itemType),
      quantity: toRoundedQuantity(Number(slot.quantity) || 0),
      unit: String(slot.unit || "kg"),
    }))
    .filter((slot) => slot.itemType && slot.quantity > INVENTORY_EPSILON)
    .sort((left, right) => {
      const priorityDifference = getSlotPriority(left, preferredLocationId) - getSlotPriority(right, preferredLocationId)
      if (priorityDifference !== 0) return priorityDifference
      if (right.quantity !== left.quantity) return right.quantity - left.quantity
      if (left.locationId === right.locationId) return left.itemType.localeCompare(right.itemType)
      if (left.locationId === null) return -1
      if (right.locationId === null) return 1
      return left.locationId.localeCompare(right.locationId)
    })

  const allocations: InventoryAllocation[] = []
  let remainingQuantity = normalizedRequestedQuantity

  for (const slot of orderedSlots) {
    if (remainingQuantity <= INVENTORY_EPSILON) {
      break
    }

    const allocatedQuantity = toRoundedQuantity(Math.min(slot.quantity, remainingQuantity))
    if (allocatedQuantity <= INVENTORY_EPSILON) {
      continue
    }

    allocations.push({
      itemType: slot.itemType,
      locationId: slot.locationId,
      quantity: allocatedQuantity,
      unit: slot.unit || "kg",
    })
    remainingQuantity = toRoundedQuantity(remainingQuantity - allocatedQuantity)
  }

  if (remainingQuantity > INVENTORY_EPSILON) {
    const sampleItemType = orderedSlots[0]?.itemType || "inventory item"
    throw new Error(`Insufficient stock for ${sampleItemType}`)
  }

  return allocations
}
