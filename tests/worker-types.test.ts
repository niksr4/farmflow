import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { WORKER_TYPES, WORKER_TYPE_VALUES, isPaidDaily, isWorkerType, workerTypeLabel } from "@/lib/worker-types"

/**
 * Worker types describe how someone is paid, not their employment status. permanent / seasonal /
 * contractor answered a human-resources question; the muster needs to know how the money works,
 * and a permanent writer on a monthly salary and a permanent field hand on a daily wage are both
 * "permanent" and could not be more different to it.
 */
describe("the vocabulary an estate actually uses", () => {
  it("offers the four HoneyFarm's payroll uses, plus proprietor", () => {
    for (const v of ["staff", "chkroll_pf", "casuals", "seasonal_assam", "proprietor"]) {
      expect(WORKER_TYPE_VALUES, v).toContain(v)
    }
  })

  it("keeps the old three, because 57 rows still hold them", () => {
    // Laxmi 12+8, Medappa 23+10+1, Estate Mock 3. Dropping these would invalidate real data and
    // leave the picker unable to show a row's own value.
    for (const v of ["permanent", "seasonal", "contractor"]) {
      expect(WORKER_TYPE_VALUES, v).toContain(v)
    }
  })

  it("marks the old ones as old, so nobody picks one for a new worker by accident", () => {
    for (const v of ["permanent", "seasonal", "contractor"]) {
      expect(workerTypeLabel(v)).toMatch(/\(old\)/)
    }
  })
})

describe("who earns a daily wage", () => {
  /**
   * This is the distinction that makes the type worth having. Staff are paid monthly and a
   * proprietor is not paid a day rate at all, so a blank daily_rate on those rows is the correct
   * state -- not missing data, and not something to nag about.
   */
  it("staff and proprietors do not", () => {
    expect(isPaidDaily("staff")).toBe(false)
    expect(isPaidDaily("proprietor")).toBe(false)
  })

  it("everyone else does", () => {
    for (const v of ["chkroll_pf", "casuals", "seasonal_assam", "permanent", "seasonal", "contractor"]) {
      expect(isPaidDaily(v), v).toBe(true)
    }
  })

  it("an unknown type is assumed to be paid daily, which is the safe default", () => {
    // Wrongly nagging about a rate is recoverable; silently not costing someone's day is not.
    expect(isPaidDaily("something_new")).toBe(true)
  })
})

describe("the list is defined once", () => {
  /**
   * It used to live in three places: a const in the [id] route, a second array in the create
   * route, and a hand-written union in the component. That is the shape that has already cost this
   * codebase three silent bugs -- see lib/activity-contracts.ts.
   */
  const idRoute = readFileSync("app/api/attendance/workers/[id]/route.ts", "utf8")
  const createRoute = readFileSync("app/api/attendance/workers/route.ts", "utf8")
  const roster = readFileSync("components/worker-profiles-tab.tsx", "utf8")

  it("neither route carries its own copy", () => {
    for (const [name, src] of [["[id]", idRoute], ["create", createRoute]] as const) {
      expect(src, `${name} route still lists types inline`).not.toMatch(/\["permanent", "seasonal", "contractor"\]/)
      expect(src, `${name} route does not use the shared guard`).toContain("isWorkerType")
    }
  })

  it("the roster imports the type rather than redeclaring it", () => {
    expect(roster).not.toContain('type WorkerType = "permanent"')
    expect(roster).toMatch(/import \{[^}]*WORKER_TYPES[^}]*\} from "@\/lib\/worker-types"/)
  })

  it("every dropdown is built from the list, so adding a type reaches all of them", () => {
    // Three pickers: the add form, the edit row, and the muster's inline add.
    expect((roster.match(/WORKER_TYPES\.map/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})

describe("validation accepts what the picker offers", () => {
  it("every offered value passes the guard", () => {
    for (const t of WORKER_TYPES) expect(isWorkerType(t.value), t.value).toBe(true)
  })

  it("and junk does not", () => {
    for (const v of ["", "staffer", null, undefined, 7]) expect(isWorkerType(v)).toBe(false)
  })
})

describe("the actions column cannot scroll away", () => {
  /**
   * Editing a row swaps eight display cells for eight inputs, which widens the table past the
   * viewport inside its overflow-x-auto wrapper and pushed Save and Cancel off the right edge --
   * reachable only by finding a horizontal scrollbar under a row that had just grown taller.
   */
  const roster = readFileSync("components/worker-profiles-tab.tsx", "utf8")

  it("is pinned in the header and every row state", () => {
    // Header, read-only row, row-edit row, bulk-edit row. A row state that forgets the pin puts
    // its actions somewhere different as you scroll, which is worse than none of them having it.
    expect((roster.match(/sticky right-0/g) ?? []).length).toBe(4)
  })

  it("and is opaque, so scrolling cells pass underneath rather than through", () => {
    const pinned = roster.split("sticky right-0").slice(1)
    for (const chunk of pinned) expect(chunk.slice(0, 120)).toMatch(/bg-(background|muted)/)
  })
})
