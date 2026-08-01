/**
 * Validation shared by the worker-ledger add form and the inline edit row.
 *
 * These two paths write the same record through the same shape but disagreed on what was
 * acceptable. The add form's button was gated on `workerId && entryType && Number(amount) > 0`;
 * the edit row's Save was gated on nothing but `saving`, and `handleSaveEdit` sent
 * `Number(editForm.amount)` straight through. An emptied amount became `Number("") === 0`, and
 * a non-numeric one became NaN — which `JSON.stringify` turns into `null`. Either writes a
 * ledger entry that the add form would have refused, and a zero/null advance or deduction
 * quietly corrupts a worker's payable balance.
 *
 * One predicate, used by both.
 */

export type WorkerLedgerDraft = {
  /** Absent on the edit path — the row's worker is fixed and cannot be changed. */
  workerId?: string
  entryType: string
  amount: string
}

export type WorkerLedgerValidation = { valid: boolean; reason: string | null }

/**
 * `requireWorker` is false for the inline edit row, which does not offer a worker picker.
 * Everything else is identical, deliberately — divergence here is the bug this replaces.
 */
export function validateWorkerLedgerDraft(
  draft: WorkerLedgerDraft,
  { requireWorker = true }: { requireWorker?: boolean } = {},
): WorkerLedgerValidation {
  if (requireWorker && !String(draft.workerId || "").trim()) {
    return { valid: false, reason: "Select a worker." }
  }
  if (!String(draft.entryType || "").trim()) {
    return { valid: false, reason: "Select an entry type." }
  }

  const raw = String(draft.amount ?? "").trim()
  if (!raw) return { valid: false, reason: "Enter an amount." }

  const amount = Number(raw)
  if (!Number.isFinite(amount)) return { valid: false, reason: "Amount must be a number." }
  if (amount <= 0) return { valid: false, reason: "Amount must be greater than zero." }

  return { valid: true, reason: null }
}

export const isWorkerLedgerDraftValid = (
  draft: WorkerLedgerDraft,
  options?: { requireWorker?: boolean },
): boolean => validateWorkerLedgerDraft(draft, options).valid
