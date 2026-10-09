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
}

/** Records every mutating call so "did Restore restore?" is answered by the request. */
function mockApi(inactive = [CHITRA]) {
  const writes: Array<{ url: string; method: string }> = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method || "GET").toUpperCase()
    if (method !== "GET") writes.push({ url, method })
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })

    if (url.startsWith("/api/attendance/workers?state=inactive")) {
      return json({ success: true, workers: inactive })
    }
    if (url.startsWith("/api/attendance/workers")) return json({ success: true })
    if (url.startsWith("/api/attendance")) return json({ success: true, workers: [], records: [], assignments: [] })
    if (url.startsWith("/api/locations")) return json({ success: true, locations: [] })
    if (url.startsWith("/api/worker-pay-rules")) return json({ success: true, effectiveRule: null, workerRule: null })
    return json({ success: true })
  })
  vi.stubGlobal("fetch", fetchMock)
  return writes
}

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
    const writes = mockApi()
    const user = userEvent.setup()
    render(<WorkerProfilesTab />)
    await user.click(await screen.findByRole("button", { name: /no longer on the roster/i }))
    await user.click(await screen.findByRole("button", { name: /^restore$/i }))

    await waitFor(() => expect(writes.length).toBe(1))
    expect(writes[0]).toEqual({ url: "/api/attendance/workers/w-chitra", method: "PATCH" })
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Chitra is back on the roster"))
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
    // Four of the five tenants are in this state and must see no new chrome at all.
    mockApi([])
    render(<WorkerProfilesTab />)
    await waitFor(() => expect(screen.queryByText(/No longer on the roster/)).not.toBeInTheDocument())
  })
})
