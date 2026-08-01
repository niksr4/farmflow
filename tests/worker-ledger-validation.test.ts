import { describe, expect, it } from "vitest"
import {
  isWorkerLedgerDraftValid,
  validateWorkerLedgerDraft,
} from "../lib/worker-ledger-validation"

const draft = (overrides: Partial<Parameters<typeof validateWorkerLedgerDraft>[0]> = {}) => ({
  workerId: "w1",
  entryType: "advance",
  amount: "500",
  ...overrides,
})

describe("validateWorkerLedgerDraft", () => {
  it("accepts a complete draft", () => {
    expect(validateWorkerLedgerDraft(draft())).toEqual({ valid: true, reason: null })
  })

  it("requires a worker on the add form", () => {
    expect(validateWorkerLedgerDraft(draft({ workerId: "" })).valid).toBe(false)
  })

  it("does not require a worker on the edit row, which has no picker", () => {
    const result = validateWorkerLedgerDraft(draft({ workerId: undefined }), {
      requireWorker: false,
    })
    expect(result.valid).toBe(true)
  })

  it("requires an entry type", () => {
    expect(validateWorkerLedgerDraft(draft({ entryType: "" })).valid).toBe(false)
  })

  // The reported bug (NIK-13): the edit row had no guard, so these three shapes were
  // saveable. A zero or null advance silently corrupts the worker's payable balance.
  it("rejects an emptied amount, which used to save as 0", () => {
    const result = validateWorkerLedgerDraft(draft({ amount: "" }))
    expect(result.valid).toBe(false)
    expect(result.reason).toBe("Enter an amount.")
  })

  it("rejects a non-numeric amount, which used to save as null", () => {
    // Number("abc") is NaN, and JSON.stringify turns NaN into null.
    const result = validateWorkerLedgerDraft(draft({ amount: "abc" }))
    expect(result.valid).toBe(false)
    expect(result.reason).toBe("Amount must be a number.")
  })

  it("rejects zero and negative amounts", () => {
    expect(validateWorkerLedgerDraft(draft({ amount: "0" })).valid).toBe(false)
    expect(validateWorkerLedgerDraft(draft({ amount: "-100" })).valid).toBe(false)
  })

  it("rejects whitespace-only input rather than coercing it to zero", () => {
    expect(validateWorkerLedgerDraft(draft({ amount: "   " })).valid).toBe(false)
  })

  it("accepts a decimal amount", () => {
    expect(validateWorkerLedgerDraft(draft({ amount: "250.50" })).valid).toBe(true)
  })

  it("gives a usable reason for every rejection", () => {
    for (const bad of [
      draft({ workerId: "" }),
      draft({ entryType: "" }),
      draft({ amount: "" }),
      draft({ amount: "abc" }),
      draft({ amount: "0" }),
    ]) {
      const result = validateWorkerLedgerDraft(bad)
      expect(result.valid).toBe(false)
      expect(result.reason).toBeTruthy()
    }
  })
})

describe("add and edit paths agree", () => {
  // The whole point of sharing the predicate: anything the add form refuses, the edit row
  // must refuse too (worker aside), which is exactly where they had drifted apart.
  it("refuses on the edit row whatever the add form refuses", () => {
    for (const amount of ["", "abc", "0", "-5", "   "]) {
      expect(isWorkerLedgerDraftValid(draft({ amount }))).toBe(false)
      expect(isWorkerLedgerDraftValid(draft({ amount }), { requireWorker: false })).toBe(false)
    }
  })
})
