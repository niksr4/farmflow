import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The muster, mounted — the screen a writer opens every morning with dirty hands.
 *
 * WHY THIS ONE IS WORTH MOUNTING. Payroll is a table, so its defects are geometric and a source
 * counter can nearly reach them. The muster's are not: almost everything that has gone wrong here
 * was a COUNT or a CONDITION, computed correctly in a `useMemo` and then shown to the wrong estate,
 * or shown when it should have been silent. Reading the source proves the useMemo exists. It
 * cannot prove what appears on the screen when eleven people stand in a field as one roster row.
 *
 * Four real incidents this file pins down, each already fixed and each currently guarded by
 * nothing that renders:
 *
 *   1. Today used to open with every worker PRE-TICKED. One distracted Save and twenty-one people
 *      are paid for a day nobody mustered, with nothing afterwards looking wrong.
 *   2. A contract crew is one row carrying a headcount, so counting rows said "1" for eleven
 *      people. The roll and the wage bill disagreed quietly.
 *   3. "Cost today ₹0" and an amber "No work set" were shown to estates that only take attendance
 *      — a standing accusation about a feature they have not adopted, un-clearable by design.
 *   4. "No work set" and "missing daily rate" counted monthly staff, who have no daily rate BY
 *      DESIGN (the DB forbids both bases — scripts/141). HoneyFarm was told to go and fix six
 *      workers who were already correct.
 *
 * Every one of them is a warning that was WRONG rather than a warning that was missing, which is
 * the worse failure: it trains people to dismiss the amber that means something.
 */

const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
  },
}))
// posthog + Sentry at module scope; nothing here is asserting on analytics.
vi.mock("@/lib/track-action", () => ({
  trackRecordCreated: vi.fn(),
  trackAction: vi.fn(),
  trackActionFailed: vi.fn(),
}))

import AttendanceTab from "@/components/attendance-tab"

type Worker = {
  id: string
  name: string
  dailyRate: number | null
  deviceUserCode?: string | null
  locationId?: string | null
  kind?: "individual" | "gang"
  headcount?: number | null
  workerType?: string | null
}

const worker = (over: Partial<Worker> & { id: string; name: string }): Worker => ({
  dailyRate: 450,
  deviceUserCode: null,
  locationId: null,
  kind: "individual",
  headcount: null,
  workerType: "casuals",
  ...over,
})

type Snapshot = {
  workers?: Worker[]
  presentWorkerIds?: string[]
  assignments?: unknown[]
  presentRecords?: unknown[]
}

/**
 * Routes the three fetches the tab makes on mount. Anything else resolves empty rather than
 * throwing, so adding a fourth call does not fail this file for the wrong reason.
 */
function mockMuster(snapshot: Snapshot) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })

    if (url.startsWith("/api/attendance?")) {
      return json({
        success: true,
        workers: snapshot.workers ?? [],
        presentWorkerIds: snapshot.presentWorkerIds ?? [],
        weeklySummary: [],
        presentRecords: snapshot.presentRecords ?? [],
        assignments: snapshot.assignments ?? [],
        pickingWorkerIds: [],
        hasBiometricDevices: false,
        assignmentsFrom: null,
      })
    }
    if (url.startsWith("/api/locations")) return json({ success: true, locations: [] })
    if (url.startsWith("/api/get-activity")) return json({ success: true, activities: [] })
    return json({ success: true })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

async function openMuster(snapshot: Snapshot) {
  const user = userEvent.setup()
  const { container } = render(<AttendanceTab />)
  // The roll has arrived when the first name is on screen; before that everything is a skeleton.
  const firstName = snapshot.workers?.[0]?.name
  if (firstName) await screen.findByText(firstName)
  else await waitFor(() => expect(container.textContent).not.toBe(""))
  return { user, container }
}

/** "3 in" / "2 out" from the count row — the two figures the header actually commits to. */
function counts() {
  const inText = screen.getByText(/^\d+ in$/).textContent ?? ""
  const outNode = screen.queryByText(/^\d+ out$/)
  return {
    in: Number(inText.replace(/\D/g, "")),
    out: outNode ? Number((outNode.textContent ?? "").replace(/\D/g, "")) : 0,
  }
}

beforeEach(() => {
  toastError.mockClear()
  toastSuccess.mockClear()
})

describe("nobody is present until somebody says so", () => {
  it("opens today with every worker absent", async () => {
    /**
     * The reasoning for pre-ticking was that most people turn up, so marking the exceptions is
     * faster. It was already rejected for past dates in the same function, for a reason that
     * applies just as well to today: a pre-ticked row is one Save away from becoming real wages
     * for a day nobody mustered.
     *
     * Presence is a claim about who turned up. The app does not know that.
     */
    mockMuster({
      workers: [
        worker({ id: "a", name: "Manoj" }),
        worker({ id: "b", name: "Chandra" }),
        worker({ id: "c", name: "Suresh" }),
      ],
      presentWorkerIds: [],
    })
    await openMuster({ workers: [worker({ id: "a", name: "Manoj" })] })

    expect(counts()).toEqual({ in: 0, out: 3 })
  })

  it("offers nothing to save until the roll differs from what the server returned", async () => {
    /**
     * The save bar used to sit there permanently, so a saved-and-untouched roll still read
     * "Save · 21 present" — which looks like work outstanding on a day already recorded, and
     * trains people to press it again to find out.
     *
     * Asserting both halves in one test on purpose: "the button is absent" passes just as well
     * against a component that never renders it at all.
     */
    const workers = [worker({ id: "a", name: "Manoj" }), worker({ id: "b", name: "Chandra" })]
    mockMuster({ workers, presentWorkerIds: ["a"] })
    const { user } = await openMuster({ workers })

    expect(screen.queryByRole("button", { name: /Save ·/ })).toBeNull()

    await user.click(screen.getByText("Chandra"))
    expect(await screen.findByRole("button", { name: /Save · 2 present/ })).toBeInTheDocument()

    // Tapping back to the saved roll withdraws the offer again — it is a comparison, not a flag.
    await user.click(screen.getByText("Chandra"))
    await waitFor(() => expect(screen.queryByRole("button", { name: /Save ·/ })).toBeNull())
  })

  it("counts up as names are tapped", async () => {
    const workers = [
      worker({ id: "a", name: "Manoj" }),
      worker({ id: "b", name: "Chandra" }),
      worker({ id: "c", name: "Suresh" }),
    ]
    mockMuster({ workers, presentWorkerIds: [] })
    const { user } = await openMuster({ workers })

    await user.click(screen.getByText("Manoj"))
    await waitFor(() => expect(counts()).toEqual({ in: 1, out: 2 }))

    await user.click(screen.getByText("Chandra"))
    await waitFor(() => expect(counts()).toEqual({ in: 2, out: 1 }))

    // And back off again — presence is a toggle, not a ratchet.
    await user.click(screen.getByText("Manoj"))
    await waitFor(() => expect(counts()).toEqual({ in: 1, out: 2 }))
  })
})

describe("a crew is people, not a row", () => {
  it("says eleven people against one entry when a gang is present", async () => {
    /**
     * "9 in" against eleven people in a field is the kind of quiet disagreement that surfaces a
     * month later as a wage query. The count row counts ROWS because that is what the save writes;
     * the breakdown counts HEADS, and says so on the day the two differ.
     */
    const workers = [
      worker({ id: "gang", name: "Ponnappa crew", kind: "gang", headcount: 11, workerType: "seasonal_assam" }),
    ]
    mockMuster({ workers, presentWorkerIds: ["gang"] })
    await openMuster({ workers })

    expect(counts().in).toBe(1)
    expect(screen.getByText("11 people · 1 entries")).toBeInTheDocument()
  })

  it("stays quiet on an ordinary day, when the two agree", async () => {
    // On every other day saying it would be noise, and noise is what makes the real line invisible.
    const workers = [worker({ id: "a", name: "Manoj" }), worker({ id: "b", name: "Chandra" })]
    mockMuster({ workers, presentWorkerIds: ["a", "b"] })
    await openMuster({ workers })

    expect(counts().in).toBe(2)
    expect(screen.queryByText(/people · \d+ entries/)).toBeNull()
  })

  it("breaks the day down by category, biggest group first", async () => {
    // An owner reads "Casuals 11" before "Proprietor 1". A fixed list would print "Seasonal 0"
    // through the eight months nobody seasonal is on the estate.
    const workers = [
      worker({ id: "p", name: "Owner", workerType: "proprietor", dailyRate: null }),
      worker({ id: "g", name: "Field crew", kind: "gang", headcount: 11, workerType: "casuals" }),
    ]
    mockMuster({ workers, presentWorkerIds: ["p", "g"] })
    const { container } = await openMuster({ workers })

    const breakdown = container.querySelector("div.flex-wrap.items-baseline")
    expect(breakdown, "the category breakdown must render").not.toBeNull()
    const text = (breakdown as HTMLElement).textContent ?? ""
    expect(text).toContain("Casuals")
    expect(text).toContain("Proprietor")
    expect(text.indexOf("Casuals")).toBeLessThan(text.indexOf("Proprietor"))
  })
})

describe("an estate that only takes attendance is not nagged", () => {
  it("shows no cost tiles at all before any work is allocated", async () => {
    /**
     * Shown to an estate that does not allocate, "Cost today ₹0" is a permanent zero and an amber
     * "No work set" is an accusation that can never be cleared — about a feature they have not
     * adopted. Three of the four live tenants are in exactly this state.
     */
    const workers = [worker({ id: "a", name: "Manoj" }), worker({ id: "b", name: "Chandra" })]
    mockMuster({ workers, presentWorkerIds: ["a", "b"], assignments: [] })
    await openMuster({ workers })

    expect(screen.queryByText("Cost today")).toBeNull()
    expect(screen.queryByText("No work set")).toBeNull()
  })

  it("and shows them from the first job set, with the day's cost", async () => {
    const workers = [worker({ id: "a", name: "Manoj" }), worker({ id: "b", name: "Chandra" })]
    mockMuster({
      workers,
      presentWorkerIds: ["a", "b"],
      assignments: [
        {
          id: "j1", workerId: "a", activityCode: "P1", activityName: "Pruning",
          locationId: null, locationName: null, dayFraction: 1, rate: 450,
          headcount: 1, lumpSum: null, totalCost: 450,
        },
      ],
    })
    const { container } = await openMuster({ workers })

    const tile = screen.getByText("Cost today").closest("div")
    expect(within(tile as HTMLElement).getByText("₹450")).toBeInTheDocument()
    // Chandra is present with nothing booked — the one figure that changes behaviour.
    const stragglers = screen.getByText("No work set").closest("div")
    expect(within(stragglers as HTMLElement).getByText("1")).toBeInTheDocument()
    expect(container.textContent).toContain("Pruning")
  })
})

describe("the amber only appears where it can be acted on", () => {
  it("does not count monthly staff among the workers with no work set", async () => {
    /**
     * A staff member or proprietor is paid the same whether or not a job is booked against their
     * name. Counting them produced a "No work set" that could only be cleared by inventing an
     * allocation for somebody whose pay does not work that way.
     */
    const workers = [
      worker({ id: "casual", name: "Manoj", workerType: "casuals" }),
      worker({ id: "staff", name: "Writer", workerType: "staff", dailyRate: null }),
      worker({ id: "owner", name: "Proprietor", workerType: "proprietor", dailyRate: null }),
    ]
    mockMuster({
      workers,
      presentWorkerIds: ["casual", "staff", "owner"],
      assignments: [
        {
          id: "j1", workerId: "casual", activityCode: "P1", activityName: "Pruning",
          locationId: null, locationName: null, dayFraction: 1, rate: 450,
          headcount: 1, lumpSum: null, totalCost: 450,
        },
      ],
    })
    await openMuster({ workers })

    // All three are present; only the casual is expected to have work, and they do. So: zero.
    expect(counts().in).toBe(3)
    const stragglers = screen.getByText("No work set").closest("div")
    expect(within(stragglers as HTMLElement).getByText("0")).toBeInTheDocument()
  })

  it("does not count monthly staff as missing a daily rate", async () => {
    // The DB forbids both pay bases at once (scripts/141), so a rateless staff member is the
    // correct state. HoneyFarm was told to fix six workers who were already right.
    const workers = [
      worker({ id: "staff", name: "Writer", workerType: "staff", dailyRate: null }),
      worker({ id: "owner", name: "Proprietor", workerType: "proprietor", dailyRate: null }),
    ]
    mockMuster({ workers, presentWorkerIds: [] })
    await openMuster({ workers })

    expect(screen.queryByText(/missing daily rate/)).toBeNull()
  })

  it("but does count a daily worker with no rate, because that one is real", async () => {
    const workers = [
      worker({ id: "a", name: "Manoj", workerType: "casuals", dailyRate: null }),
      worker({ id: "b", name: "Writer", workerType: "staff", dailyRate: null }),
    ]
    mockMuster({ workers, presentWorkerIds: [] })
    await openMuster({ workers })

    expect(screen.getByText("1 worker missing daily rate")).toBeInTheDocument()
  })
})

describe("work already recorded is not deleted by a tap", () => {
  it("refuses to mark absent somebody who has a job booked", async () => {
    /**
     * Marking them absent would leave a payable with nobody on the muster to have earned it.
     * Refused rather than silently dropping the jobs — deleting money records as a side effect of
     * a tap is not a decision a screen gets to make.
     */
    const workers = [worker({ id: "a", name: "Manoj" })]
    mockMuster({
      workers,
      presentWorkerIds: ["a"],
      assignments: [
        {
          id: "j1", workerId: "a", activityCode: "P1", activityName: "Pruning",
          locationId: null, locationName: null, dayFraction: 1, rate: 450,
          headcount: 1, lumpSum: null, totalCost: 450,
        },
      ],
    })
    const { user } = await openMuster({ workers })

    expect(counts().in).toBe(1)
    await user.click(screen.getByText("Manoj"))

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(String(toastError.mock.calls[0][0])).toMatch(/Remove their work first/)
    // And they are still present. A refusal that half-applies is worse than either outcome.
    expect(counts().in).toBe(1)
  })

  it("names the number of jobs when there is more than one", async () => {
    const workers = [worker({ id: "a", name: "Manoj" })]
    const job = (id: string) => ({
      id, workerId: "a", activityCode: "P1", activityName: "Pruning",
      locationId: null, locationName: null, dayFraction: 0.5, rate: 450,
      headcount: 1, lumpSum: null, totalCost: 225,
    })
    mockMuster({ workers, presentWorkerIds: ["a"], assignments: [job("j1"), job("j2")] })
    const { user } = await openMuster({ workers })

    await user.click(screen.getByText("Manoj"))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(String(toastError.mock.calls[0][0])).toMatch(/Remove their 2 jobs first/)
  })
})

describe("a day booked past a full day is flagged on the row", () => {
  it("marks a worker whose jobs add up to more than one day", async () => {
    /**
     * Nothing on this screen ever added a person's day up, so two jobs at a full day each looked
     * exactly like two jobs — and three estates booked 135 worker-days nobody worked. New entries
     * cannot do this any more (scripts/145); the badge is for the days already recorded, so the
     * rows to correct can be seen rather than hunted one worker at a time.
     */
    const workers = [worker({ id: "a", name: "Manoj" })]
    const job = (id: string) => ({
      id, workerId: "a", activityCode: "P1", activityName: "Pruning",
      locationId: null, locationName: null, dayFraction: 1, rate: 450,
      headcount: 1, lumpSum: null, totalCost: 450,
    })
    mockMuster({ workers, presentWorkerIds: ["a"], assignments: [job("j1"), job("j2")] })
    await openMuster({ workers })

    expect(screen.getByText("2 days")).toBeInTheDocument()
  })

  it("leaves an ordinary full day unmarked", async () => {
    const workers = [worker({ id: "a", name: "Manoj" })]
    mockMuster({
      workers,
      presentWorkerIds: ["a"],
      assignments: [
        {
          id: "j1", workerId: "a", activityCode: "P1", activityName: "Pruning",
          locationId: null, locationName: null, dayFraction: 1, rate: 450,
          headcount: 1, lumpSum: null, totalCost: 450,
        },
      ],
    })
    await openMuster({ workers })

    expect(screen.queryByText(/^[\d.]+ days$/)).toBeNull()
  })
})

describe("a biometric punch shows its times, a manual mark shows the rate", () => {
  it("prints the in and out times for a scanned worker", async () => {
    const workers = [worker({ id: "a", name: "Manoj" })]
    mockMuster({
      workers,
      presentWorkerIds: ["a"],
      presentRecords: [
        {
          workerId: "a",
          // The instants, as the API sends them, and the IST clock it now sends alongside.
          // 02:30Z is 08:00 IST; 11:09Z is 16:39 IST.
          checkInTime: "2026-09-14T02:30:00.000Z",
          checkOutTime: "2026-09-14T11:09:00.000Z",
          checkInClock: "08:00",
          checkOutClock: "16:39",
          source: "biometric",
          overtimeHours: null,
        },
      ],
    })
    const { container } = await openMuster({ workers })

    /**
     * ⚠ THIS ASSERTION USED TO READ:
     *
     *     // Rendered in the runner's local zone, so assert the shape rather than the clock.
     *     expect(container.textContent).toMatch(/\d{1,2}:\d{2}\s?(am|pm)?\s*[–-]\s*\d{1,2}:\d{2}/)
     *
     * I wrote that comment, and it names the product bug while treating it as a test constraint to
     * work around. "Rendered in the runner's local zone" is exactly what HoneyFarm reported on
     * 2026-09-18: their muster showed 04:31 for an 08:01 punch, because the browser formatted the
     * instant in the VIEWER's timezone. A shape-only assertion passes in every zone, which is
     * precisely why it could not see it.
     *
     * The clock is now pinned in SQL, so the test can assert the time itself — and asserting the
     * time is what makes it fail if anyone formats the instant client-side again.
     */
    expect(container.textContent).toContain("08:00 – 16:39")
    expect(screen.queryByText("₹450/day")).toBeNull()
  })

  it("shows the punch as recorded at the estate, whatever timezone the phone is in", async () => {
    // The whole point: the muster must not change what it says because of who is looking. These
    // clock strings arrive already formatted, so no local-zone formatting can reach them.
    const original = process.env.TZ
    try {
      for (const tz of ["UTC", "Asia/Kolkata", "America/Los_Angeles"]) {
        process.env.TZ = tz
        const workers = [worker({ id: "a", name: "Manoj" })]
        mockMuster({
          workers,
          presentWorkerIds: ["a"],
          presentRecords: [
            {
              workerId: "a",
              checkInTime: "2026-09-14T02:30:00.000Z",
              checkOutTime: "2026-09-14T11:09:00.000Z",
              checkInClock: "08:00",
              checkOutClock: "16:39",
              source: "biometric",
              overtimeHours: null,
            },
          ],
        })
        const { container } = await openMuster({ workers })
        expect(container.textContent, `punch time moved in ${tz}`).toContain("08:00 – 16:39")
        cleanup() // three renders in one test; without this the next one finds two of every row
      }
    } finally {
      process.env.TZ = original
    }
  })

  it("prints the daily rate for a hand-marked worker", async () => {
    const workers = [worker({ id: "a", name: "Manoj", dailyRate: 450 })]
    mockMuster({ workers, presentWorkerIds: ["a"] })
    await openMuster({ workers })

    expect(screen.getByText("₹450/day")).toBeInTheDocument()
  })

  it("opens the overtime box already showing hours the day carries", async () => {
    // A recorded figure hidden behind a toggle nobody flipped is how a wage goes out wrong.
    const workers = [worker({ id: "a", name: "Manoj" })]
    mockMuster({
      workers,
      presentWorkerIds: ["a"],
      presentRecords: [
        { workerId: "a", checkInTime: null, checkOutTime: null, source: "manual", overtimeHours: 2 },
      ],
    })
    const { container } = await openMuster({ workers })

    const overtimeInput = container.querySelector('input[inputmode="decimal"]') as HTMLInputElement | null
    expect(overtimeInput, "the overtime field must be visible without being asked for").not.toBeNull()
    expect(overtimeInput?.value).toBe("2")
  })
})
