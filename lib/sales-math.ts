export const STOCK_EPSILON_KGS = 0.001

type NumberLike = number | string | null | undefined

const toNumber = (value: NumberLike) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export type DispatchLike = {
  kgs_received?: NumberLike
  bags_dispatched?: NumberLike
}

export type SaleLike = {
  sold_kgs?: NumberLike
  kgs_received?: NumberLike
  kgs?: NumberLike
  weight_kgs?: NumberLike
  kgs_sent?: NumberLike
  bags_sold?: NumberLike
}

export const resolveDispatchReceivedKgs = (row: DispatchLike, bagWeightKg: number) => {
  const received = toNumber(row.kgs_received)
  if (received > 0) return received
  return toNumber(row.bags_dispatched) * bagWeightKg
}

export const resolveSalesKgs = (row: SaleLike, bagWeightKg: number) => {
  const sold = toNumber(row.sold_kgs)
  if (sold > 0) return sold

  const kgsReceived = toNumber(row.kgs_received)
  if (kgsReceived > 0) return kgsReceived

  const kgs = toNumber(row.kgs)
  if (kgs > 0) return kgs

  const weightKgs = toNumber(row.weight_kgs)
  if (weightKgs > 0) return weightKgs

  const kgsSent = toNumber(row.kgs_sent)
  if (kgsSent > 0) return kgsSent

  return toNumber(row.bags_sold) * bagWeightKg
}

export const computeRemainingKgs = (receivedKgs: NumberLike, soldKgs: NumberLike) => {
  return toNumber(receivedKgs) - toNumber(soldKgs)
}

export const hasSufficientStock = (
  receivedKgs: NumberLike,
  soldKgs: NumberLike,
  requestedKgs: NumberLike,
  epsilon = STOCK_EPSILON_KGS,
) => {
  const remaining = computeRemainingKgs(receivedKgs, soldKgs)
  return toNumber(requestedKgs) <= remaining + epsilon
}

export const summarizeSlotStock = (
  dispatchRows: DispatchLike[],
  salesRows: SaleLike[],
  bagWeightKg: number,
) => {
  const receivedKgs = dispatchRows.reduce((sum, row) => sum + resolveDispatchReceivedKgs(row, bagWeightKg), 0)
  const soldKgs = salesRows.reduce((sum, row) => sum + resolveSalesKgs(row, bagWeightKg), 0)
  const rawRemainingKgs = computeRemainingKgs(receivedKgs, soldKgs)
  return {
    receivedKgs,
    soldKgs,
    rawRemainingKgs,
    remainingKgs: Math.max(0, rawRemainingKgs),
  }
}

