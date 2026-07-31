/**
 * Offline write-queue types and message parsing.
 *
 * The service worker owns the queue of writes made while offline and reports its state back
 * to the page as a CustomEvent. Everything arriving here crosses a process boundary from a
 * worker that may be running an older deployed build than the page — a stale service worker
 * can outlive several app releases — so the payload is parsed defensively rather than trusted
 * to match the current shape. A missing or renamed field must degrade to a zero, never throw
 * inside the event listener and take the dashboard down with it.
 *
 * Kept free of React so the parsing can be tested directly.
 */

export const WRITE_QUEUE_STATUS_EVENT = "farmflow:write-queue-status"

export type WriteQueueBlockedEntry = {
  id: number
  method: string
  pathname: string
  url: string
  queuedAt: number
  attempts: number
  lastError: string
  lastStatus: number | null
  blockedReason: string
}

export type WriteQueueStatusSnapshot = {
  pendingCount: number
  blockedAuthCount: number
  blockedReviewCount: number
  blockedAuthEntries: WriteQueueBlockedEntry[]
  blockedReviewEntries: WriteQueueBlockedEntry[]
  updatedAt: number
}

export const EMPTY_WRITE_QUEUE_STATUS: WriteQueueStatusSnapshot = {
  pendingCount: 0,
  blockedAuthCount: 0,
  blockedReviewCount: 0,
  blockedAuthEntries: [],
  blockedReviewEntries: [],
  updatedAt: 0,
}

/** Entries with no usable id are dropped — every action the UI offers is keyed on it. */
export function parseWriteQueueEntries(value: unknown): WriteQueueBlockedEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      const source = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {}
      return {
        id: Number(source.id || 0),
        method: String(source.method || "POST").toUpperCase(),
        pathname: String(source.pathname || ""),
        url: String(source.url || ""),
        queuedAt: Number(source.queuedAt || 0),
        attempts: Number(source.attempts || 0),
        lastError: String(source.lastError || ""),
        lastStatus: source.lastStatus == null ? null : Number(source.lastStatus || 0),
        blockedReason: String(source.blockedReason || ""),
      }
    })
    .filter((entry) => entry.id > 0 && Number.isFinite(entry.id))
}

/**
 * `blockedCount`/`reviewCount` are the field names an older service worker build used; they
 * are still accepted so a client running against a stale worker shows real numbers instead
 * of silently reporting an empty queue.
 */
export function parseWriteQueueStatus(
  detail: Record<string, unknown> | null | undefined,
  now: number = Date.now(),
): WriteQueueStatusSnapshot {
  const source = detail && typeof detail === "object" ? detail : {}
  const count = (value: unknown): number => {
    const parsed = Number(value || 0)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }
  return {
    pendingCount: count(source.pendingCount),
    blockedAuthCount: count(source.blockedAuthCount ?? source.blockedCount),
    blockedReviewCount: count(source.blockedReviewCount ?? source.reviewCount),
    blockedAuthEntries: parseWriteQueueEntries(source.blockedAuthEntries),
    blockedReviewEntries: parseWriteQueueEntries(source.blockedReviewEntries),
    updatedAt: Number(source.updatedAt || now),
  }
}
