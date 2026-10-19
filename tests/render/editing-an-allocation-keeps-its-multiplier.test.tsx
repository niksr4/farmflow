import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

/**
 * CORRECTING AN ALLOCATION MUST NOT QUIETLY HALVE WHAT IT PAYS.
 *
 * ⚠ A GUARD I ADDED IN #99 WAS VACUOUS FROM THE ONLY CALLER THAT EXISTS. The PUT protects
 * pay_multiplier and the three gang charges with `CASE WHEN <value> IS NOT undefined THEN ... ELSE
 * <column> END` -- a read-before-write that only helps a caller which OMITS the key. This panel
 * posts all four on every save, so the CASE was always true.
 *
 * And it could not have prefilled them even if it tried: GET /api/attendance did not SELECT
 * pay_multiplier, driver_charge, supervisor_charge or vehicle_charge. They were write-only
 * columns, saved by POST and visible nowhere. `useState(1)` and `useState("")` were the only
 * values the panel could have.
 *
 * So editing a "Holiday 2x" row to fix its block reset the multiplier to 1 and HALVED total_cost,
 * silently. The only tell on screen was the Holiday 2x button coming back unhighlighted.
 *
 * ── WHY A RENDER TEST ─────────────────────────────────────────────────────────────────────────
 *
 * A source scan cannot see this. The route's CASE WHEN is present and correct-looking; the panel's
 * useState is present and correct-looking; the type declared the fields optional so typecheck was
 * green while `undefined` flowed through. Every mechanical signal said fine. The only thing that
 * can tell is mounting the panel on a saved row and reading what it posts.
 *
 * On prod today all 4,414 allocations have pay_multiplier = 1, so nothing is mis-stated yet -- but
 * 116 have already been edited, so the path is live and "Holiday 2x" is one tap.
 */

import WorkerAllocation from "@/components/attendance/worker-allocation"

const locations = [{ id: "loc-1", name: "Arabica Block", estate: "Tirtha", kind: "block" }] as any
const activities = [{ code: "101", activity: "Weeding" }] as any

/** An allocation as GET /api/attendance now returns it: a holiday double-pay day on a gang of 8. */
const savedHolidayRow = {
  id: "asg-1",
  activityCode: "101",
  locationId: "loc-1",
  dayFraction: 1,
  lumpSum: null,
  payMultiplier: 2,
  driverCharge: 300,
  supervisorCharge: 250,
  vehicleCharge: 1200,
  headcount: 8,
}

function mountEditing(editing: any, extra: Record<string, unknown> = {}) {
  // Typed parameter, or onAdd.mock.calls is a zero-length tuple and indexing it is a type error.
  const onAdd = vi.fn(async (_payload: Record<string, unknown>) => true)
  render(
    <WorkerAllocation
      workerEstate="Tirtha"
      locations={locations}
      activities={activities}
      saving={false}
      editing={editing}
      headcount={11}
      isGang
      workerRate={450}
      dayAlreadyUsed={0}
      onAdd={onAdd}
      onClose={() => {}}
      {...extra}
    />,
  )
  return onAdd
}

describe("editing an allocation", () => {
  it("posts the multiplier the row was saved with, not 1", async () => {
    const onAdd = mountEditing(savedHolidayRow)
    await userEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(onAdd).toHaveBeenCalledTimes(1)
    const payload = onAdd.mock.calls[0][0] as any
    expect(
      payload.payMultiplier,
      "the saved row was Holiday 2x. Posting 1 halves total_cost, and the route's CASE WHEN " +
        "cannot save you because this caller always sends the key.",
    ).toBe(2)
  })

  it("keeps the gang's driver, supervisor and vehicle charges", async () => {
    const onAdd = mountEditing(savedHolidayRow)
    await userEvent.click(screen.getByRole("button", { name: "Save" }))

    const payload = onAdd.mock.calls[0][0] as any
    expect(payload.driverCharge).toBe(300)
    expect(payload.supervisorCharge).toBe(250)
    expect(payload.vehicleCharge).toBe(1200)
  })

  it("keeps the crew that turned out, not the gang's roster size", async () => {
    // 8 of 11 came. Reading `headcount` (the roster) made every edit say 11.
    const onAdd = mountEditing(savedHolidayRow)
    await userEvent.click(screen.getByRole("button", { name: "Save" }))

    const payload = onAdd.mock.calls[0][0] as any
    expect(payload.headcount, "the roster is 11; this job had 8").toBe(8)
  })

  it("shows the saved row as Holiday 2x, so the screen agrees with the data", async () => {
    mountEditing(savedHolidayRow)
    const holiday = screen.getByRole("button", { name: /Holiday 2x/i })
    expect(
      holiday.getAttribute("aria-pressed") === "true" ||
        /border-emerald|bg-emerald/.test(holiday.className),
      "opening a Holiday 2x allocation for edit showed 'Full' as selected, which is the one " +
        "visible symptom of this bug",
    ).toBe(true)
  })

  it("still defaults a NEW allocation to a single normal day", async () => {
    /**
     * Asserted from RENDERED STATE, not from a posted payload. submit() returns early on a blank
     * activityCode, and Radix's Select does not open under jsdom, so there is no way to reach a
     * submit for a fresh entry here. The property that matters is the same either way: a new
     * allocation must not inherit a multiplier or a charge from anywhere.
     */
    mountEditing(null)

    const full = screen.getByRole("button", { name: /^Full$/i })
    expect(
      full.getAttribute("aria-pressed") === "true" ||
        /border-emerald|bg-emerald/.test(full.className),
      "a fresh allocation must open on a single normal day",
    ).toBe(true)

    const holiday = screen.getByRole("button", { name: /Holiday 2x/i })
    expect(
      holiday.getAttribute("aria-pressed") === "true" ||
        /border-emerald|bg-emerald/.test(holiday.className),
      "a fresh allocation must not open on Holiday 2x",
    ).toBe(false)

    // And the three gang charges start empty rather than carrying a previous row's figures.
    for (const label of [/driver/i, /supervisor/i, /vehicle/i]) {
      const field = screen.queryByLabelText(label) ?? screen.queryByPlaceholderText(label)
      if (field) expect((field as HTMLInputElement).value).toBe("")
    }
  })
})
