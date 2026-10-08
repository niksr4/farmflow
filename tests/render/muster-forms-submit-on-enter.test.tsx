import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * ENTER SUBMITS THE MUSTER'S MONEY FORMS. It did not, and nothing said so.
 *
 * Both of these were a `<div>` with an `onClick` Save. Typing an amount and pressing Enter did
 * nothing at all — no save, no error, no hint that the key was ignored — and on a phone the
 * keyboard's own action key was equally inert. These are the two screens where somebody is standing
 * in front of a worker either agreeing what gets held back or handing over cash.
 *
 * ── WHY A RENDER TEST AND NOT A SOURCE SCAN ───────────────────────────────────────────────────
 *
 * `<form onSubmit=…>` in the source proves nothing on its own. The submit still has to reach the
 * handler, which needs a `type="submit"` button inside that form — and `components/ui/button.tsx`
 * spreads props onto a bare `<button>` with NO default type, so an untyped `<Button>` inside a form
 * is already a submit and an untyped Cancel would fire the save. Grepping for the form tag would
 * have passed on every intermediate state of this change, including the broken ones.
 *
 * tests/render/single-flight-submit.test.tsx proves the HOOK handles a double submit correctly.
 * This proves the muster's forms are wired to it. Neither implies the other: the hook was correct
 * and documented for weeks while these two forms did not use it.
 */

const toastError = vi.fn()
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { role: "owner", name: "Nik" } }) }))

import PayRuleForm from "@/components/workers/pay-rule-form"
import WorkerMoneyPanel from "@/components/workers/worker-money-panel"
import WorkerProfilesTab from "@/components/worker-profiles-tab"

type Write = { url: string; method: string; body: unknown }

/** Records every mutating call, so "did Enter save?" is answered by the request, not by a spinner. */
function mockApi() {
  const writes: Write[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method || "GET").toUpperCase()
    if (method !== "GET") {
      writes.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null })
    }
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })

    if (url.startsWith("/api/worker-ledger")) {
      return json({ success: true, entries: [], retentionHeldToDate: 0, outstandingAdvanceToDate: 0 })
    }
    if (url.startsWith("/api/worker-pay-rules")) {
      return json({ success: true, effectiveRule: null, workerRule: null })
    }
    if (url.startsWith("/api/attendance/workers")) {
      return json({ success: true, workers: [] })
    }
    if (url.startsWith("/api/attendance")) {
      return json({ success: true, workers: [], records: [], assignments: [] })
    }
    if (url.startsWith("/api/locations")) {
      return json({ success: true, locations: [] })
    }
    return json({ success: true })
  })
  vi.stubGlobal("fetch", fetchMock)
  return writes
}

const writesTo = (writes: Write[], path: string) => writes.filter((w) => w.url.startsWith(path))

beforeEach(() => {
  toastError.mockClear()
})

describe("the pay-rule form saves on Enter", () => {
  it("posts the rule when Enter is pressed in a field", async () => {
    const writes = mockApi()
    const onSaved = vi.fn()
    const user = userEvent.setup()

    render(<PayRuleForm workerId="w1" dailyRate={600} onSaved={onSaved} onCancel={() => {}} />)

    // "In force from" is the one field present whatever the rule modes are, so this does not
    // depend on driving a Radix select to reach a text input.
    await user.type(screen.getByLabelText("In force from"), "{Enter}")

    await waitFor(() => expect(writesTo(writes, "/api/worker-pay-rules").length).toBe(1))
    expect(writesTo(writes, "/api/worker-pay-rules")[0].method).toBe("POST")
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it("still has a Save button that does the same thing", async () => {
    // Enter is an addition, not a replacement. A form whose button stopped working would pass the
    // test above.
    const writes = mockApi()
    const user = userEvent.setup()

    render(<PayRuleForm workerId="w1" dailyRate={600} onSaved={vi.fn()} onCancel={() => {}} />)
    await user.click(screen.getByRole("button", { name: /save rule for this worker/i }))

    await waitFor(() => expect(writesTo(writes, "/api/worker-pay-rules").length).toBe(1))
  })

  it("does not save when Cancel is pressed, which a mistyped button type would do", async () => {
    /**
     * THE FAILURE MODE OF THIS CHANGE, not of the old code. Inside a <form>, an untyped <Button>
     * submits, because ui/button.tsx sets no default type. Cancel therefore had to be given
     * type="button" explicitly, and if anybody drops it the dismiss action starts writing a rule.
     */
    const writes = mockApi()
    const onCancel = vi.fn()
    const user = userEvent.setup()

    render(<PayRuleForm workerId="w1" dailyRate={600} onSaved={vi.fn()} onCancel={onCancel} />)
    await user.click(screen.getByRole("button", { name: /^cancel$/i }))

    expect(onCancel).toHaveBeenCalled()
    expect(writesTo(writes, "/api/worker-pay-rules")).toEqual([])
  })
})

describe("the add-worker form saves on Enter", () => {
  /**
   * ⚠ THIS COMPONENT WAS MOUNTED BY NO TEST AT ALL before this file — 1,399 lines, eleven suites
   * reading it as source text, none of them rendering it. So wrapping its add form in a <form> was
   * the one change in this batch that typecheck alone would have had to vouch for, and typecheck
   * only proves the JSX is balanced, not that a submit reaches the handler or that the kind toggle
   * inside the form did not become one.
   */
  it("posts the worker when Enter is pressed in the autofocused name field", async () => {
    const writes = mockApi()
    const user = userEvent.setup()

    render(<WorkerProfilesTab />)
    await user.click(await screen.findByRole("button", { name: /add worker/i }))
    await user.type(screen.getByLabelText(/full name/i), "Ravi Kumar{Enter}")

    const posts = await waitFor(() => {
      const found = writesTo(writes, "/api/attendance/workers").filter((w) => w.method === "POST")
      expect(found.length).toBe(1)
      return found
    })
    expect((posts[0].body as { name: unknown }).name).toBe("Ravi Kumar")
  })

  it("does not post on Enter while the name is empty, since the submit stays disabled", async () => {
    // The silent-nothing case. A disabled submit cannot fire, so Enter on a blank form is inert by
    // construction rather than by a `return` nobody can see.
    const writes = mockApi()
    const user = userEvent.setup()

    render(<WorkerProfilesTab />)
    await user.click(await screen.findByRole("button", { name: /add worker/i }))
    await user.type(screen.getByLabelText(/full name/i), "{Enter}")

    expect(writesTo(writes, "/api/attendance/workers").filter((w) => w.method === "POST")).toEqual([])
  })

  it("keeps the person/crew toggle a toggle, not a submit", async () => {
    /**
     * The specific hazard of putting a <form> around this block: the Person / Contract crew toggle
     * is a bare <button> inside it. It carries type="button" already, and if that is ever dropped,
     * choosing "Contract crew" would submit a half-filled worker instead of switching the form.
     */
    const writes = mockApi()
    const user = userEvent.setup()

    render(<WorkerProfilesTab />)
    await user.click(await screen.findByRole("button", { name: /add worker/i }))
    await user.type(screen.getByLabelText(/full name/i), "Rathi & Team")
    await user.click(screen.getByRole("button", { name: /contract crew/i }))

    expect(writesTo(writes, "/api/attendance/workers").filter((w) => w.method === "POST")).toEqual([])
    // And it really did switch: the crew form asks for a headcount. Exact label, because
    // FieldLabel's tooltip trigger is also named "Headcount * help" and /headcount/i matches both.
    expect(screen.getByLabelText("Headcount *")).toBeInTheDocument()
  })
})

describe("the advance form saves on Enter", () => {
  it("posts the entry when Enter is pressed in the amount field", async () => {
    const writes = mockApi()
    const user = userEvent.setup()

    render(<WorkerMoneyPanel workerId="w1" workerName="Asha" dailyRate={500} canAdmin />)
    await user.click(await screen.findByRole("button", { name: /record/i }))
    await user.type(screen.getByLabelText("Amount"), "2000{Enter}")

    const posts = await waitFor(() => {
      const found = writesTo(writes, "/api/worker-ledger").filter((w) => w.method === "POST")
      expect(found.length).toBe(1)
      return found
    })
    expect((posts[0].body as { amount: unknown }).amount).toBe(2000)
  })

  it("does not save when Cancel is pressed", async () => {
    const writes = mockApi()
    const user = userEvent.setup()

    render(<WorkerMoneyPanel workerId="w1" workerName="Asha" dailyRate={500} canAdmin />)
    await user.click(await screen.findByRole("button", { name: /record/i }))
    await user.type(screen.getByLabelText("Amount"), "2000")
    await user.click(screen.getByRole("button", { name: /^cancel$/i }))

    expect(writesTo(writes, "/api/worker-ledger").filter((w) => w.method === "POST")).toEqual([])
  })
})
