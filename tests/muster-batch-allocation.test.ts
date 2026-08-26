import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { isPaidDaily } from "../lib/worker-types"

const source = readFileSync(resolve(__dirname, "../components/attendance-tab.tsx"), "utf8")

/**
 * Batch mode ("Set the same work for several people") must not be escapable from inside a row.
 *
 * Reported 2026-08-26: with batch mode on, tapping "Set work" on one person still opened that
 * person's allocation sheet, silently abandoning the selection already made. Three separate row
 * controls opened the sheet and none of them knew batch mode existed.
 *
 * These are source assertions rather than a render test because what matters is the structural
 * property -- that no row control reaches the sheet except through the guard. A render test would
 * prove the three known buttons behave today and say nothing about the fourth one somebody adds.
 */
describe("batch allocation cannot be bypassed from a row", () => {
  it("routes every row-level allocation through the guarded opener", () => {
    // setAllocatingWorkerId is the raw state setter. Inside the roll it must only ever be reached
    // via openAllocation; the only legitimate direct uses are the guard itself, entering batch
    // mode, and closing the sheet.
    const directCalls = source.match(/setAllocatingWorkerId\(/g) ?? []
    expect(directCalls.length).toBe(3)

    // ...and the row controls call the guard instead.
    expect((source.match(/openAllocation\(worker\.id/g) ?? []).length).toBe(3)
  })

  it("the guard selects instead of opening while batch mode is on", () => {
    const guard = source.slice(source.indexOf("const openAllocation"), source.indexOf("const openAllocation") + 700)
    expect(guard).toContain("if (batchMode)")
    // It must return before touching the sheet state, not fall through to it.
    expect(guard.indexOf("setBatchIds")).toBeLessThan(guard.indexOf("setAllocatingWorkerId"))
    expect(guard).toContain("return")
  })

  it("hides the per-worker allocation affordances while batch mode is on", () => {
    // The work cell's "Set work" and the "Another job" row both gate on !batchMode, so the row is
    // purely a selection target and nothing invites a one-person action mid-selection.
    expect(source).toContain("musterRecordsLabour && !batchMode ?")
    expect(source).toContain("allocatingWorkerId !== worker.id && !batchMode &&")
  })
})

/**
 * "No work set" is a prompt to go and record something. It has to be clearable, so it can only
 * count people a day's work is actually expected from.
 */
describe("the unallocated-work flag only counts people who earn a daily wage", () => {
  it("excludes monthly staff via the shared predicate", () => {
    const block = source.slice(source.indexOf("const unallocatedCount"), source.indexOf("const unallocatedCount") + 600)
    expect(block).toContain("isPaidDaily")
    expect(source).toContain('import { isPaidDaily } from "@/lib/worker-types"')
  })

  it("agrees with the roster about who is paid daily", () => {
    // If these ever diverge the muster nags a salaried worker forever, which is unclearable.
    expect(isPaidDaily("staff")).toBe(false)
    expect(isPaidDaily("staff_pf")).toBe(false)
    expect(isPaidDaily("proprietor")).toBe(false)
    expect(isPaidDaily("casuals")).toBe(true)
    expect(isPaidDaily("chkroll_pf")).toBe(true)
    expect(isPaidDaily("seasonal_assam")).toBe(true)
    // An untyped worker is assumed to earn a daily wage: a missing type must not silence a real
    // omission, only a declared monthly one should.
    expect(isPaidDaily(null)).toBe(true)
    expect(isPaidDaily(undefined)).toBe(true)
  })

  it("reads workerType off the worker, which the route has always sent", () => {
    expect(source).toContain("workerType?: string | null")
    const route = readFileSync(resolve(__dirname, "../app/api/attendance/route.ts"), "utf8")
    expect(route).toContain("workerType: row.worker_type")
  })
})
