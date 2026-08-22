import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * Opening a record to edit must set every field from that record, including to empty.
 *
 * These forms deliberately keep some state between NEW entries -- a writer filing ten expenses
 * against one block should not repick it ten times -- and `resetForm` leaves the location alone
 * for exactly that reason. The bug is applying the same leniency when opening an EXISTING row:
 *
 *   other-expenses-tab did `if (deployment.locationId) setFormLocationId(deployment.locationId)`.
 *   Edit an expense on HF A/C, then edit one with no block, and the second showed -- and saved --
 *   HF A/C. Cost silently re-attributed to a block it never touched, with nothing on screen to
 *   suggest anything had happened.
 *
 * dispatch-tab got this right: `setSelectedLocationId(resolvedLocationId || "")`, unconditionally.
 */
const files = {
  expenses: readFileSync("components/other-expenses-tab.tsx", "utf8"),
  dispatch: readFileSync("components/dispatch-tab.tsx", "utf8"),
}

describe("an edit handler sets the location unconditionally", () => {
  it("expenses no longer inherits the previously edited row's block", () => {
    const startEdit = files.expenses.slice(
      files.expenses.indexOf("const startEdit"),
      files.expenses.indexOf("setEditingId(deployment.id)"),
    )
    expect(startEdit).toContain("setFormLocationId(deployment.locationId ||")
    // The guarded form is the bug: it leaves the previous row's value in place.
    expect(startEdit).not.toMatch(/if \(deployment\.locationId\)\s*setFormLocationId/)
  })

  it("dispatch already did, and must keep doing", () => {
    const handleEdit = files.dispatch.slice(
      files.dispatch.indexOf("const handleEdit"),
      files.dispatch.indexOf("const handleDelete"),
    )
    expect(handleEdit).toContain('setSelectedLocationId(resolvedLocationId || "")')
    expect(handleEdit).not.toMatch(/if \([\w.]*location[\w.]*\)\s*setSelectedLocationId/i)
  })
})

describe("dispatch restores every field it can edit", () => {
  // Listed explicitly because a missing one is invisible: the field simply shows the last
  // record's value, which looks like data rather than a leak.
  const handleEdit = files.dispatch.slice(
    files.dispatch.indexOf("const handleEdit"),
    files.dispatch.indexOf("const handleDelete"),
  )
  it.each(["setDate", "setSelectedLocationId", "setCoffeeType", "setBagType", "setBagsDispatched", "setKgsReceived", "setNotes"])(
    "%s is called when opening a record",
    (setter) => {
      expect(handleEdit).toContain(setter)
    },
  )
})
