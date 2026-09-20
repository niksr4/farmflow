import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The worker money panel, mounted — guarding the exact regression this batch found and fixed.
 *
 * lib/worker-ledger-validation.ts's `validateWorkerLedgerDraft` was written on 2026-08-02 (NIK-13)
 * specifically so the add form and the inline edit row could not drift apart on what counts as a
 * valid entry — and it worked, right up until the whole screen it validated (worker-ledger-tab.tsx)
 * was deleted on 2026-09-08 and replaced by this file. The replacement reimplemented an equivalent
 * `Number.isFinite(amount) && amount > 0` check inline in both `submitUnguarded` and
 * `saveEditUnguarded`, rather than importing the shared, already-tested predicate — so the module
 * this repo built to prevent exactly this kind of drift sat orphaned (zero call sites) for over a
 * month while a second, hand-copied version of its logic quietly took its place. Harmless today
 * only because both copies happened to still agree; nothing would have caught it if they hadn't.
 *
 * This suite mounts the real component (not the validator in isolation — tests/worker-ledger-
 * validation.test.ts already covers that thoroughly) and asserts the toast text shown on an
 * invalid submit is the shared validator's own wording ("Enter an amount." / "Amount must be a
 * number.", not the old generic "Enter an amount greater than zero"). That distinction is the only
 * externally-observable proof the component is actually calling the shared function rather than a
 * second copy of its logic — a passing unit test on the lib file alone cannot show that.
 */

const toastError = vi.fn()
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }))

import WorkerMoneyPanel from "@/components/workers/worker-money-panel"

type LedgerEntryFixture = {
  id: string
  entryType: string
  amount: number
  entryDate: string
  description: string | null
  recoverOverPeriods: number
}

function mockLedger(entries: LedgerEntryFixture[] = []) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })
    if (url.startsWith("/api/worker-ledger")) {
      return json({
        success: true,
        entries,
        retentionHeldToDate: 0,
        outstandingAdvanceToDate: entries.reduce((sum, e) => sum + (e.entryType === "advance" ? e.amount : 0), 0),
      })
    }
    if (url.startsWith("/api/worker-pay-rules")) {
      return json({ success: true, effectiveRule: null, workerRule: null })
    }
    return json({ success: true })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

beforeEach(() => {
  toastError.mockClear()
})

describe("add form uses the shared validator, not a private copy", () => {
  it("shows the shared validator's own message for an emptied amount", async () => {
    mockLedger()
    const user = userEvent.setup()
    render(<WorkerMoneyPanel workerId="w1" workerName="Asha" dailyRate={500} canAdmin />)

    await user.click(await screen.findByRole("button", { name: /record/i }))
    // entryType defaults to "advance" and amount defaults to "" — submitting immediately is
    // exactly the emptied-amount shape NIK-13 fixed.
    await user.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Enter an amount."))
  })

  it("shows the shared validator's own message for a non-numeric amount", async () => {
    mockLedger()
    const user = userEvent.setup()
    render(<WorkerMoneyPanel workerId="w1" workerName="Asha" dailyRate={500} canAdmin />)

    await user.click(await screen.findByRole("button", { name: /record/i }))
    const amountInput = screen.getByLabelText(/^amount$/i)
    await user.type(amountInput, "abc")
    await user.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Amount must be a number."))
  })

  it("accepts a valid amount without complaint", async () => {
    const fetchMock = mockLedger()
    const user = userEvent.setup()
    render(<WorkerMoneyPanel workerId="w1" workerName="Asha" dailyRate={500} canAdmin />)

    await user.click(await screen.findByRole("button", { name: /record/i }))
    await user.type(screen.getByLabelText(/^amount$/i), "500")
    await user.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/worker-ledger",
        expect.objectContaining({ method: "POST" }),
      ),
    )
    expect(toastError).not.toHaveBeenCalled()
  })
})

describe("edit row uses the shared validator with requireWorker:false", () => {
  it("rejects an emptied amount on save, with the shared validator's own wording", async () => {
    mockLedger([
      { id: "e1", entryType: "advance", amount: 500, entryDate: "2026-09-10", description: null, recoverOverPeriods: 1 },
    ])
    const user = userEvent.setup()
    render(<WorkerMoneyPanel workerId="w1" workerName="Asha" dailyRate={500} canAdmin />)

    await user.click(await screen.findByRole("button", { name: /edit this advance/i }))
    const amountInput = screen.getByLabelText(/^amount$/i)
    await user.clear(amountInput)
    await user.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Enter an amount."))
    // The edit row has no worker picker — requireWorker:false must not itself block the save.
    expect(toastError).not.toHaveBeenCalledWith("Select a worker.")
  })
})
