import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const attendance = readFileSync("components/attendance-tab.tsx", "utf8")
const roster = readFileSync("components/worker-profiles-tab.tsx", "utf8")
const workerCreate = readFileSync("app/api/attendance/workers/route.ts", "utf8")
const workerUpdate = readFileSync("app/api/attendance/workers/[id]/route.ts", "utf8")

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "")

describe("nobody is present until someone says so", () => {
  /**
   * Today used to open with every worker pre-ticked. The same reasoning had already been rejected
   * for past dates in this very function: pre-ticked rows are one Save away from becoming real
   * attendance, and therefore real wages, for a day nobody mustered. Open it, get distracted, hit
   * Save, and twenty-one people are paid -- with nothing on screen looking wrong afterwards.
   */
  it("presence comes from what is stored, never from the roster", () => {
    const body = strip(attendance)
    expect(body).toContain("setPresentWorkerIds(fetchedPresent)")
    expect(body).not.toContain("setPresentWorkerIds(fetchedWorkers.map((w) => w.id))")
  })

  it("keeps a one-tap way to say everyone came", () => {
    // Defaulting to absent must not turn a common day into forty taps.
    expect(attendance).toContain("onClick={() => setPresentWorkerIds(workers.map((w) => w.id))}")
    expect(attendance).toMatch(/All present/)
  })

  it("no longer tracks which date it auto-ticked, because it never does", () => {
    expect(attendance).not.toContain("autoSelectedDate")
  })
})

describe("a contract crew can be added from the roster, not only the muster", () => {
  /**
   * The Worker Roster calls itself the shared roster feeding Attendance, Picking, Ledger and
   * Payroll, and could display a crew and edit its rate -- but never create one. The only way in
   * was an inline form on a different tab, which nobody would guess.
   *
   * Laxmi paid Rs 1,07,650 for 111 man-days of outside labour this season with no crew on the
   * roster, so the first contract job after their cutover has nowhere to go.
   */
  it("offers the choice", () => {
    expect(strip(roster)).toContain('{ kind: "gang" as const, label: "Contract crew" }')
  })

  it("asks for a headcount, and names the row a crew name", () => {
    const body = strip(roster)
    expect(body).toContain('label="Headcount *"')
    expect(body).toContain('form.kind === "gang" ? "Crew name *" : "Full name *"')
  })

  it("sends both, or the route would file it as one person", () => {
    const body = strip(roster)
    expect(body).toContain("kind: form.kind,")
    expect(body).toContain('headcount: form.kind === "gang" ? Number(form.headcount) : undefined,')
  })

  it("will not submit a crew with no headcount", () => {
    expect(strip(roster)).toContain('form.kind === "gang" && !(Number(form.headcount) >= 1)')
  })
})

describe("a crew's size is editable, like everything else that is creatable", () => {
  it("the update route accepts it", () => {
    expect(workerUpdate).toContain("const rawHeadcount = body?.headcount")
    expect(workerUpdate).toContain("headcount        = CASE WHEN")
  })

  it("and refuses to give an individual one", () => {
    // A headcount on an individual would send their pay to the contract-labour column of
    // labour_cost, splitting the P&L wrongly.
    expect(workerUpdate).toContain("AND kind = 'gang'")
  })

  it("the create route still validates it", () => {
    expect(workerCreate).toContain("A crew needs a headcount of at least 1")
  })

  it("the edit row shows the field for a crew", () => {
    expect(strip(roster)).toContain('{w.kind === "gang" && (')
    expect(strip(roster)).toContain("editForm.headcount")
  })
})
