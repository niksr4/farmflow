import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * REMOVING A WORKER USED TO BE A ONE-WAY DOOR, and this is the suite for the way back.
 *
 * `DELETE /api/attendance/workers/[id]` is a soft delete — `active = FALSE`, so attendance and pay
 * history survive — but nothing in the product ever selected an inactive row again. The muster
 * roster filters `active = TRUE`, the Workers tab reads that same payload, and no toggle existed.
 * So a worker removed by a mis-tap was invisible to **every** role including the estate's own
 * admin, and the only recovery was a hand-written UPDATE against production.
 *
 * HoneyFarm, 2026-10-08: the writer marked attendance at 08:11, tapped the 28px remove icon on
 * Chitra at 10:38, and marked more attendance at 10:39. She vanished from the next morning's
 * muster with 33 attendance records still attached to her, and the estate had no way to tell what
 * had happened or undo it.
 *
 * Two behaviours are load-bearing here and neither is obvious from reading the component:
 *   1. The section must be REACHABLE — it is collapsed, so a passing "renders" test proves nothing.
 *   2. Restore must hit PATCH, not DELETE and not PUT. PATCH is the only verb that sets active
 *      back to TRUE, and it is gated on the same permission as removal so a writer cannot create a
 *      state only an admin can repair.
 */

const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: (...a: unknown[]) => toastSuccess(...a) },
}))
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { role: "owner", name: "Nik" } }) }))

import WorkerProfilesTab from "@/components/worker-profiles-tab"

const CHITRA = {
  id: "w-chitra",
  name: "Chitra",
  workerType: "chkroll_pf",
  dailyRate: 494,
  monthlyWage: null,
  estate: "Sidapur",
  deviceUserCode: "202",
  kind: "individual" as const,
  headcount: null,
  attendanceCount: 33,
  lastSeen: "2026-10-08",
  activeNamesake: null as string | null,
}

/**
 * A STATEFUL fake, not a canned response. The earlier version kept returning Chitra as inactive
 * after the PATCH, so "restores via PATCH" passed on the request alone and would have gone on
 * passing if the UI never moved her between the two lists. Here the PATCH mutates the fake's
 * roster, exactly as the server would, and the test can then assert where she ended up.
 */
function mockApi(inactive: Array<typeof CHITRA> = [CHITRA]) {
  const writes: Array<{ url: string; method: string }> = []
  const state = {
    inactive: [...inactive],
    active: [] as Array<typeof CHITRA>,
    /** Resolves once the inactive list has actually been served, so a test can assert on an
     *  EMPTY result without racing the request that produces it. */
    inactiveServed: 0,
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method || "GET").toUpperCase()
    if (method !== "GET") writes.push({ url, method })
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

    const restoreMatch = url.match(/^\/api\/attendance\/workers\/([^/?]+)/)
    if (restoreMatch && method === "PATCH") {
      const id = restoreMatch[1]
      const row = state.inactive.find((w) => w.id === id)
      if (row) {
        state.inactive = state.inactive.filter((w) => w.id !== id)
        state.active = [...state.active, row]
      }
      return json({ success: true })
    }
    if (restoreMatch && method === "DELETE") {
      const id = restoreMatch[1]
      const row = state.active.find((w) => w.id === id)
      if (row) {
        state.active = state.active.filter((w) => w.id !== id)
        state.inactive = [...state.inactive, row]
      }
      return json({ success: true })
    }

    if (url.startsWith("/api/attendance/workers?state=inactive")) {
      state.inactiveServed += 1
      return json({ success: true, workers: state.inactive })
    }
    if (url.startsWith("/api/attendance/workers")) return json({ success: true })
    if (url.startsWith("/api/attendance")) {
      return json({ success: true, workers: state.active, records: [], assignments: [] })
    }
    if (url.startsWith("/api/locations")) return json({ success: true, locations: [] })
    if (url.startsWith("/api/worker-pay-rules")) return json({ success: true, effectiveRule: null, workerRule: null })
    return json({ success: true })
  })
  vi.stubGlobal("fetch", fetchMock)
  return { writes, state, fetchMock }
}

/**
 * The roster is fetched with scope=all so a worker on another estate stays reachable. The recovery
 * list has to be cut the same way or a multi-estate tenant gets "she is in neither list".
 */
const inactiveRequests = (fetchMock: ReturnType<typeof mockApi>["fetchMock"]) =>
  fetchMock.mock.calls.filter(([u]) => String(u).includes("state=inactive"))

beforeEach(() => {
  toastError.mockClear()
  toastSuccess.mockClear()
})

describe("a worker taken off the roster can be found and put back", () => {
  it("announces that somebody is missing, with the count, without being opened", async () => {
    // The person who needs this does not know a worker is gone until the muster looks wrong, so
    // the count has to be visible while the section is still collapsed.
    mockApi()
    render(<WorkerProfilesTab />)
    expect(await screen.findByText("No longer on the roster (1)")).toBeInTheDocument()
    // …and the name is NOT on screen yet, which is what makes the next test meaningful.
    expect(screen.queryByText("Chitra")).not.toBeInTheDocument()
  })

  it("opens to show who it is, and why restoring beats re-typing the name", async () => {
    mockApi()
    const user = userEvent.setup()
    render(<WorkerProfilesTab />)
    await user.click(await screen.findByRole("button", { name: /no longer on the roster/i }))

    expect(await screen.findByText("Chitra")).toBeInTheDocument()
    // The history count is the argument against adding the name again: those records belong to
    // this row, and a fresh row starts empty.
    expect(screen.getByText(/33 days recorded/)).toBeInTheDocument()
    expect(screen.getByText(/Sidapur/)).toBeInTheDocument()
  })

  it("restores via PATCH — not DELETE, and not a full PUT edit", async () => {
    const { writes } = mockApi()
    const user = userEvent.setup()
    render(<WorkerProfilesTab />)
    await user.click(await screen.findByRole("button", { name: /no longer on the roster/i }))
    await user.click(await screen.findByRole("button", { name: /^restore$/i }))

    await waitFor(() => expect(writes.length).toBe(1))
    expect(writes[0]).toEqual({ url: "/api/attendance/workers/w-chitra", method: "PATCH" })
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Chitra is back on the roster"))
  })

  it("actually moves her — off the recovery list and back onto the roster", async () => {
    // The request going out is only half of it. Asserting the verb alone would still pass if the
    // UI never refreshed, leaving her listed as missing after a successful restore.
    const { state } = mockApi()
    const user = userEvent.setup()
    render(<WorkerProfilesTab />)
    await user.click(await screen.findByRole("button", { name: /no longer on the roster/i }))
    await user.click(await screen.findByRole("button", { name: /^restore$/i }))

    await waitFor(() => expect(state.active.map((w) => w.id)).toEqual(["w-chitra"]))
    expect(state.inactive).toEqual([])
    // …and the section empties out, because it only renders when it has contents.
    await waitFor(() => expect(screen.queryByText(/No longer on the roster/)).not.toBeInTheDocument())
  })

  it("refuses the restore when that name is already back on the roster", async () => {
    /**
     * PRODUCTION HAS SEVEN OF THESE, all at Medappa Estates: AMINA KHATUN active with 29
     * attendance records and working yesterday, AMINA KHATUN inactive with 4 from September. They
     * retyped names instead of editing and deactivated the mistakes. Restoring one would put two
     * identically-named people on the next muster and split the history between them, which is
     * worse than the one-way door this whole feature exists to fix.
     *
     * Said on the row rather than on click: a button that only fails when pressed is a worse
     * answer than one that explains itself.
     */
    mockApi([{ ...CHITRA, id: "w-amina", name: "AMINA KHATUN", activeNamesake: "AMINA KHATUN" }])
    const user = userEvent.setup()
    render(<WorkerProfilesTab />)
    await user.click(await screen.findByRole("button", { name: /no longer on the roster/i }))

    expect(await screen.findByText(/already on the roster under this name/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^restore$/i })).not.toBeInTheDocument()
  })

  it("puts a worker into the recovery list the moment they are deactivated", async () => {
    /**
     * The mis-tap flow. HoneyFarm's writer removed Chitra mid-session and kept working; if only
     * the roster refreshes, she leaves one list without arriving in the other and the undo is
     * invisible until a reload nobody has a reason to perform.
     */
    const { state, fetchMock } = mockApi([])
    state.active = [{ ...CHITRA, id: "w-ravi", name: "Ravi" }]
    vi.stubGlobal("confirm", () => true)
    const user = userEvent.setup()
    render(<WorkerProfilesTab />)

    await user.click(await screen.findByRole("button", { name: /deactivate/i }))
    await waitFor(() => expect(state.inactive.map((w) => w.id)).toEqual(["w-ravi"]))
    // Re-read, not a stale render: the inactive list must have been fetched again after the DELETE.
    await waitFor(() => expect(inactiveRequests(fetchMock).length).toBeGreaterThan(1))
    expect(await screen.findByText("No longer on the roster (1)")).toBeInTheDocument()
  })

  it("says the recovery list is broken rather than showing the same screen as 'nobody removed'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        const json = (b: unknown, status = 200) =>
          new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } })
        if (url.includes("state=inactive")) return json({ success: false, error: "boom" }, 500)
        if (url.startsWith("/api/attendance")) return json({ success: true, workers: [] })
        return json({ success: true })
      }),
    )
    render(<WorkerProfilesTab />)

    expect(await screen.findByText(/could not load workers taken off the roster/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument()
  })

  it("says so when the restore fails, instead of looking like it worked", async () => {
    mockApi()
    const user = userEvent.setup()
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const json = (b: unknown, status = 200) =>
          new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } })
        if ((init?.method || "GET").toUpperCase() === "PATCH") {
          return json({ success: false, error: "Insufficient role" }, 403)
        }
        if (url.startsWith("/api/attendance/workers?state=inactive")) return json({ success: true, workers: [CHITRA] })
        if (url.startsWith("/api/attendance")) return json({ success: true, workers: [] })
        return json({ success: true })
      }),
    )

    render(<WorkerProfilesTab />)
    await user.click(await screen.findByRole("button", { name: /no longer on the roster/i }))
    await user.click(await screen.findByRole("button", { name: /^restore$/i }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Insufficient role"))
  })

  it("stays out of the way entirely for an estate that has removed nobody", async () => {
    /**
     * ⚠ THIS ASSERTION IS ONLY WORTH ANYTHING AFTER THE RESPONSE LANDS. `inactiveWorkers` starts
     * empty, so the previous version of this test — a bare waitFor on absence — was satisfied by
     * the first render, before the request it was meant to be judging had even resolved. It would
     * have passed with the section hard-coded to render on any non-empty response.
     *
     * So: wait for the request to have been SERVED, then for the roster that loads alongside it,
     * and only then assert absence.
     */
    const { state, fetchMock } = mockApi([])
    render(<WorkerProfilesTab />)

    await waitFor(() => expect(state.inactiveServed).toBeGreaterThan(0))
    await waitFor(() => expect(inactiveRequests(fetchMock).length).toBeGreaterThan(0))
    await screen.findByText("Worker Roster")

    expect(screen.queryByText(/No longer on the roster/)).not.toBeInTheDocument()
    expect(screen.queryByText(/could not load workers/i)).not.toBeInTheDocument()
  })
})

/**
 * THE ROSTER'S OWN LOAD HAS THE SAME DEFECT THE RECOVERY LIST HAD, and it is the more dangerous
 * of the two. `fetchWorkers` reported only *thrown* errors; a 403 from the module gate or a 500
 * arrives as `success: false` over a good HTTP round trip, so the list stayed empty and the empty
 * branch renders "No workers yet — add your first worker".
 *
 * That sentence is an instruction. An estate with forty-one people following it creates duplicates
 * — the exact failure the restore path in this same file exists to prevent.
 */
describe("a roster that failed to load is not an empty roster", () => {
  const failing = (status: number, body: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        const json = (b: unknown, st = 200) =>
          new Response(JSON.stringify(b), { status: st, headers: { "content-type": "application/json" } })
        if (url.includes("state=inactive")) return json({ success: true, workers: [] })
        if (url.startsWith("/api/attendance")) return json(body, status)
        return json({ success: true })
      }),
    )

  it("never tells an estate to add their first worker when the load was refused", async () => {
    failing(403, { success: false, error: "Module access disabled" })
    render(<WorkerProfilesTab />)

    expect(await screen.findByText(/could not load the roster/i)).toBeInTheDocument()
    expect(screen.queryByText(/add your first worker/i)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument()
  })

  it("does not claim a headcount it does not have", async () => {
    // "0 active workers" is a measurement. On a refused load nothing was measured.
    failing(500, { success: false, error: "boom" })
    render(<WorkerProfilesTab />)

    await screen.findByText(/could not load the roster/i)
    expect(screen.queryByText(/0 active worker/i)).not.toBeInTheDocument()
  })

  it("will not let anyone be added while it cannot say who is already there", async () => {
    /**
     * The warning text alone is advice, not a guard. The database blocks an exact duplicate name,
     * so this is not about that -- it is about a VARIANT: an estate that cannot see Chitra adds
     * "Chitra K", the unique index has no objection, and they now have two people and a split
     * history. Exactly what #70 closed, reopened by a screen that admits it does not know the
     * roster and offers the button anyway.
     */
    failing(500, { success: false, error: "boom" })
    render(<WorkerProfilesTab />)

    await screen.findByText(/could not load the roster/i)
    const add = screen.getByRole("button", { name: /add worker/i })
    expect(add).toBeDisabled()
  })

  it("still shows the real empty state for an estate that genuinely has nobody", async () => {
    // The guard must not swallow the legitimate case: a new tenant SHOULD be told to add someone.
    failing(200, { success: true, workers: [] })
    render(<WorkerProfilesTab />)

    expect(await screen.findByText(/add your first worker/i)).toBeInTheDocument()
    expect(screen.queryByText(/could not load the roster/i)).not.toBeInTheDocument()
  })
})
