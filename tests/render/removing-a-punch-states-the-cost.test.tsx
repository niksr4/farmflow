import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import AttendanceReportTab from "@/components/attendance-report-tab"
import { MIN_REASON_LENGTH, payrollEffectOfDay } from "@/lib/attendance-record-removal"

/**
 * REMOVING A MIS-ENROLLED PUNCH, WITH THE COST STATED BEFORE THE REASON IS ASKED FOR.
 *
 * The endpoint for this shipped with no caller, which in this codebase is the "built but
 * unadopted" trap: Saina at HoneyFarm sat on October payroll for Rs 988 she did not earn because
 * nothing could call the route. This is the screen that calls it.
 *
 * ⚠ THE FIGURE IN THE DIALOG IS THE ONE ASSERTION THAT MATTERS. It must be what PAYROLL stops
 * paying, which for an unallocated biometric day is the worker's day rate -- NOT the allocated
 * cost, which is Rs 0 for exactly those days. Measured on production: Saina's two days have
 * allocated_cost 0 and a daily_rate of 494, and payroll pays 2 x 494 = Rs 988 through
 * `COALESCE(salary_total, muster_total, days_present * daily_rate)`.
 *
 * A dialog that read the allocated cost would offer to remove the day and report "Rs 0" -- true
 * about the cost reports, false about the wage, and the wage is the only number anybody checks
 * afterwards. That is this project's defining failure shape pointed at its own fix.
 */

/** Saina's real shape on production, with her figures. */
const sainaDay = {
  date: "2026-10-13",
  attendanceRecordId: "rec-saina-1",
  source: "biometric",
  // Nothing was allocated, so the cost reports show zero for this day...
  allocatedFraction: 0,
  // ...while payroll pays the day rate. The route computes this; the mirror is in lib/.
  payrollEffect: payrollEffectOfDay({ allocatedCost: 0, dailyRate: 494 }),
  checkInClock: "08:11",
  checkOutClock: "17:56",
  checkIn: "2026-10-13T02:41:00.000Z",
  checkOut: "2026-10-13T12:26:00.000Z",
  hours: 9.75,
  status: "full",
  rescanIgnored: false,
}

const summaryPayload = {
  success: true,
  workers: [
    {
      workerId: "w-saina",
      name: "Saina",
      workerType: "casuals",
      estate: "Honeyfarm",
      dailyRate: 494,
      daysPresent: 1,
      clockedDays: 1,
      fullDays: 1,
      halfDays: 0,
      shortDays: 0,
      openDays: 0,
      totalHours: 9.75,
      allocatedDays: 0,
      allocatedCost: 0,
      unallocatedDays: 1,
      days: [sainaDay],
    },
  ],
  totals: {
    workers: 1,
    daysPresent: 1,
    totalHours: 9.75,
    clockedDays: 1,
    allocatedDays: 0,
    allocatedCost: 0,
    unallocatedDays: 1,
  },
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (String(url).includes("/api/attendance/summary")) {
      return Promise.resolve({ ok: true, json: async () => summaryPayload } as Response)
    }
    if (String(url).includes("/api/attendance/records/")) {
      return Promise.resolve({ ok: true, json: async () => ({ success: true }) } as Response)
    }
    return Promise.resolve({ ok: true, json: async () => ({ success: true }) } as Response)
  })
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/**
 * Load the report and open Saina's day rows.
 *
 * The tab has three views and defaults to "Monthly grid". The per-day rows carrying clocks and the
 * removal control live in "Hours & allocation", so the view has to be switched first -- the first
 * version of this test looked for the Show button on a screen that does not have one.
 */
const openDays = async (role: string) => {
  const user = userEvent.setup()
  render(<AttendanceReportTab role={role} />)
  await user.click(screen.getByRole("button", { name: /hours & allocation/i }))
  await user.click(screen.getByRole("button", { name: /show/i }))
  const nameCell = await screen.findByText("Saina")
  await user.click(nameCell)
  return user
}

describe("removing a punch from the monthly report", () => {
  it("offers the control to an estate admin", async () => {
    await openDays("admin")
    expect(
      await screen.findByRole("button", { name: /Remove the attendance record for Saina on 2026-10-13/i }),
    ).toBeTruthy()
  })

  it("does not offer it to a writer", async () => {
    await openDays("user")
    await screen.findByText("Saina")
    /**
     * A writer who ticked the wrong person can still untick them on the muster, because that row
     * has no check-in. Only a real punch needs this door, and only an admin may open it. The route
     * re-checks, so this is the affordance rather than the gate.
     */
    expect(screen.queryByRole("button", { name: /Remove the attendance record/i })).toBeNull()
  })

  it("flags the shape of a mis-enrolment on the row itself", async () => {
    await openDays("admin")
    // Punched by a terminal, allocated by nobody. That combination is what a wrong finger leaves.
    expect(await screen.findByText(/punched but never allocated/i)).toBeTruthy()
  })

  it("states what PAYROLL stops paying, not the allocated cost", async () => {
    const user = await openDays("admin")
    await user.click(
      await screen.findByRole("button", { name: /Remove the attendance record for Saina/i }),
    )

    const dialog = await screen.findByRole("dialog")
    // Rs 494 is the day rate payroll pays for this unallocated day.
    expect(within(dialog).getByText(/Payroll will stop paying ₹494 for this day/i)).toBeTruthy()
    // And it must NOT report the allocated cost, which is zero for exactly this case.
    expect(within(dialog).queryByText(/₹0 for this day/i)).toBeNull()
    expect(within(dialog).getByText(/paid at the worker's day rate/i)).toBeTruthy()
  })

  it("refuses to remove anything until a reason is written", async () => {
    const user = await openDays("admin")
    await user.click(
      await screen.findByRole("button", { name: /Remove the attendance record for Saina/i }),
    )
    const dialog = await screen.findByRole("dialog")
    const confirm = within(dialog).getByRole("button", { name: /Remove the record/i })

    expect(confirm).toHaveProperty("disabled", true)

    // Still refused below the shared threshold, so the client cannot offer what the route rejects.
    await user.type(within(dialog).getByRole("textbox"), "x".repeat(MIN_REASON_LENGTH - 1))
    expect(confirm).toHaveProperty("disabled", true)

    const deleteCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes("/records/"))
    expect(deleteCalls).toHaveLength(0)
  })

  it("sends the reason to the audited endpoint once a reason is given", async () => {
    const user = await openDays("admin")
    await user.click(
      await screen.findByRole("button", { name: /Remove the attendance record for Saina/i }),
    )
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByRole("textbox"), "Mis-enrolled finger, device code 31")
    await user.click(within(dialog).getByRole("button", { name: /Remove the record/i }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/api/attendance/records/"))
      expect(call).toBeTruthy()
      expect(String(call![0])).toContain("rec-saina-1")
      const init = call![1] as RequestInit
      expect(init.method).toBe("DELETE")
      expect(JSON.parse(String(init.body))).toEqual({ reason: "Mis-enrolled finger, device code 31" })
    })
  })

  it("says so when the server refuses, rather than appearing to have worked", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes("/api/attendance/summary")) {
        return Promise.resolve({ ok: true, json: async () => summaryPayload } as Response)
      }
      return Promise.resolve({
        ok: false,
        json: async () => ({ success: false, error: "Insufficient role" }),
      } as Response)
    })

    const user = await openDays("admin")
    await user.click(
      await screen.findByRole("button", { name: /Remove the attendance record for Saina/i }),
    )
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByRole("textbox"), "Mis-enrolled finger")
    await user.click(within(dialog).getByRole("button", { name: /Remove the record/i }))

    /**
     * ⚠ SCOPED TO THE DIALOG, and that is the whole assertion.
     *
     * `screen.findByText` matches anywhere in the document, so this passed while the message was
     * rendered by the page BEHIND the modal overlay -- invisible to the writer, and off-screen
     * entirely on a phone. A removal that silently did not happen is indistinguishable from one
     * that did until the next payroll run disagrees, so "the error exists in the DOM" is not the
     * property worth testing; "the person who pressed the button can see it" is.
     */
    expect(await within(dialog).findByText(/Insufficient role/i)).toBeTruthy()
    // And the dialog stays open, so there is somewhere for that message to live.
    expect(screen.getByRole("dialog")).toBeTruthy()
  })
})

describe("payrollEffectOfDay", () => {
  it("uses the allocation when there is one", () => {
    expect(payrollEffectOfDay({ allocatedCost: 460, dailyRate: 494 })).toBe(460)
  })

  it("falls back to the day rate when nothing was allocated", () => {
    // Saina's case, and the only one where the two figures disagree.
    expect(payrollEffectOfDay({ allocatedCost: 0, dailyRate: 494 })).toBe(494)
  })

  it("is zero only when the worker has no rate either", () => {
    // A worker with no rate costs Rs 0 in payroll, which is its own reported problem.
    expect(payrollEffectOfDay({ allocatedCost: 0, dailyRate: null })).toBe(0)
  })

  it("never adds the two together", () => {
    // payroll-summary guards its fallback with NOT EXISTS against labour_assignments, so a day
    // contributes its allocation or the day rate, never both.
    expect(payrollEffectOfDay({ allocatedCost: 460, dailyRate: 494 })).toBeLessThan(460 + 494)
  })
})
