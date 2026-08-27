import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { WORKER_TYPES, isPaidDaily } from "../lib/worker-types"

const source = readFileSync(resolve(__dirname, "../components/worker-profiles-tab.tsx"), "utf8")

/**
 * A worker is paid either by the day or by the month, never both.
 *
 * The database says so (scripts/141, attendance_workers_one_pay_basis) because a row carrying both
 * would be costed twice -- once by the muster multiplying the day rate, once by the monthly charge.
 * So every surface that offers a pay field has to offer the right one for the type.
 *
 * THE REASON THIS IS A TEST AND NOT A COMMENT. The roster has FOUR places that offer a pay field --
 * the add form, a mobile collapsible card, a desktop table row, and the bulk-edit table -- and when
 * the field learned to follow the worker type, one of them was missed. Editing a staff member on a
 * phone asked for a monthly salary; editing the same person on a laptop asked for a day rate they
 * cannot have. Nothing failed, nothing was logged, the two screens simply disagreed. Counting the
 * guards is the only thing that notices a fifth surface arriving unguarded.
 */
describe("every pay field follows the worker type", () => {
  it("guards each editor that renders a daily rate", () => {
    // Four surfaces, four guards. If this count changes, one was added or removed -- decide
    // deliberately which, rather than letting one of them quietly go unguarded.
    const guards = source.match(/isPaidDaily\(/g) ?? []
    expect(guards.length).toBe(4)
  })

  it("never renders a bare daily-rate input outside a guard", () => {
    // Each dailyRate input must sit in a ternary whose test is isPaidDaily. Checking the text
    // immediately before each occurrence is crude but catches the actual regression: a new input
    // pasted in without the surrounding condition.
    const positions: number[] = []
    const needle = "editForm.dailyRate"
    let at = source.indexOf(needle)
    while (at !== -1) {
      positions.push(at)
      at = source.indexOf(needle, at + 1)
    }
    // One is the save payload, the rest are inputs; every input must have a guard close above it.
    const unguarded = positions.filter((pos) => {
      const preceding = source.slice(Math.max(0, pos - 600), pos)
      const isPayload = preceding.includes("dailyRate:") && preceding.includes("monthlyWage:")
      return !isPayload && !preceding.includes("isPaidDaily(editForm.workerType)")
    })
    expect(unguarded).toEqual([])
  })

  it("offers a monthly field wherever it offers a daily one", () => {
    const daily = (source.match(/editForm\.dailyRate/g) ?? []).length
    const monthly = (source.match(/editForm\.monthlyWage/g) ?? []).length
    // Both appear once in the save payload and once per editor, so they must match exactly.
    expect(monthly).toBe(daily)
  })
})

describe("who is paid monthly", () => {
  it("staff, staff_pf and proprietors have no daily rate", () => {
    expect(isPaidDaily("staff")).toBe(false)
    expect(isPaidDaily("staff_pf")).toBe(false)
    expect(isPaidDaily("proprietor")).toBe(false)
  })

  it("everyone else earns by the day", () => {
    for (const t of WORKER_TYPES) {
      if (t.value === "staff" || t.value === "staff_pf" || t.value === "proprietor") continue
      expect(isPaidDaily(t.value)).toBe(true)
    }
  })

  it("an unknown or missing type is treated as daily", () => {
    // Assuming monthly would hide a genuinely missing rate; assuming daily surfaces it.
    expect(isPaidDaily(null)).toBe(true)
    expect(isPaidDaily("")).toBe(true)
    expect(isPaidDaily("something_new")).toBe(true)
  })
})
