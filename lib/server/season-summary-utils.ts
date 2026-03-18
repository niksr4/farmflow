export const DEFAULT_BAG_WEIGHT_KG = 50
export const LOSS_ALERT_THRESHOLD = 0.03
export const COST_SPIKE_MULTIPLIER = 1.5

export const normalizeBagType = (value: string | null | undefined) =>
  String(value || "").toLowerCase().includes("cherry") ? "Dry Cherry" : "Dry Parchment"

export const toLocationBucket = (locationName?: string | null, locationCode?: string | null) => {
  const rawCode = String(locationCode || "").trim()
  const rawName = String(locationName || "").trim()
  const base = rawCode || rawName
  if (!base) return "Unknown"

  const normalized = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
  const tokens = normalized.split(" ")
  if (tokens.length >= 2) {
    const head = tokens[0]
    const tail = tokens[1]
    const looksLikeBranchCode = /^[A-Za-z]{2,5}$/.test(head) && /^[A-Za-z0-9]{1,5}$/.test(tail)
    if (looksLikeBranchCode) {
      return head.toUpperCase()
    }
  }

  return rawCode || rawName
}

export const resolveDispatchReceivedKgs = (row: Record<string, unknown>, _bagWeightKg: number) => {
  const received = Number(row.kgs_received) || 0
  if (received > 0) return received
  return 0
}

export const resolveSalesKgs = (row: Record<string, unknown>, bagWeightKg: number) => {
  const precomputed = Number(row.sold_kgs) || 0
  if (precomputed > 0) return precomputed
  const direct = Number(row.kgs) || Number(row.weight_kgs) || Number(row.kgs_sent) || Number(row.kgs_received)
  if (direct > 0) return direct
  const bags = Number(row.bags_sold) || 0
  return bags * bagWeightKg
}

export const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error)
  return message.includes(`relation "${relation}" does not exist`)
}
