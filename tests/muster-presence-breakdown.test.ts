import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { WORKER_TYPES, workerTypeLabel, workerTypeShortLabel } from "@/lib/worker-types"

/**
 * What kind of day is it — the question an owner opens the muster to answer.
 *
 * "21 in" says how many turned up and nothing about the shape of the morning. Eight seasonal
 * pickers with two staff is a different day from thirteen casuals, and until now the only way to
 * see that was to read the roll row by row.
 *
 * WHAT THIS IS DELIBERATELY NOT: another copy of the total. Present and Absent tiles were removed
 * from this screen once already — the note in attendance-tab.tsx explains that "0 in / 21 out" sat
 * forty pixels above them and the save bar said it a third time, costing ~65px of a 664px phone
 * screen, which is a worker row. Three copies of one number is noise where the roll should be. So
 * this adds the breakdown only, on the line under the count that already exists.
 */
const tab = readFileSync(resolve(__dirname, "../components/attendance-tab.tsx"), "utf8")

describe("short labels are for a count line, not a dropdown", () => {
  it("every worker type has one", () => {
    for (const t of WORKER_TYPES) {
      expect(workerTypeShortLabel(t.value), t.value).toBeTruthy()
      expect(workerTypeShortLabel(t.value).length, `${t.value} is too long to sit in a chip`).toBeLessThanOrEqual(12)
    }
  })

  it("drops the pay basis the dropdown needs", () => {
    // "Staff — paid monthly 2 · Chkroll / PF 5 · Seasonal / Assam 11" is a paragraph.
    expect(workerTypeLabel("staff")).toContain("paid monthly")
    expect(workerTypeShortLabel("staff")).toBe("Staff")
    expect(workerTypeShortLabel("chkroll_pf")).toBe("Chkroll")
    expect(workerTypeShortLabel("seasonal_assam")).toBe("Seasonal")
  })

  it("names an unset type rather than dropping the person", () => {
    // Seshagiri has one active worker with a null worker_type. They are still standing on the
    // estate, so they belong in the count under some heading.
    expect(workerTypeShortLabel(null)).toBe("Unspecified")
    expect(workerTypeShortLabel("")).toBe("Unspecified")
    expect(workerTypeShortLabel("something_new")).toBe("something new")
  })
})

describe("the breakdown counts people, not rows", () => {
  it("expands a gang by its headcount", () => {
    // A contract crew is one roster row carrying eleven people. Counting rows says "1" for a
    // field full of workers.
    expect(tab).toContain('worker.kind === "gang" ? Math.max(1, Number(worker.headcount) || 1) : 1')
  })

  it("says so when heads and entries disagree, instead of showing two silent numbers", () => {
    expect(tab).toContain("presenceByType.totalHeads !== presentCount")
    expect(tab).toContain("people · {presentCount} entries")
  })

  it("shows only the categories actually present", () => {
    // A fixed list prints "Seasonal 0" for the eight months nobody seasonal is here, and a column
    // of zeroes gets read once and then never again.
    expect(tab).toContain("presenceByType.rows.length > 0")
    expect(tab).not.toMatch(/WORKER_TYPES\.map\([^)]*presen/i)
  })

  it("orders by size, so the biggest group is read first", () => {
    expect(tab).toContain("b.count - a.count || a.label.localeCompare(b.label)")
  })
})

describe("it does not reintroduce the tiles that were removed", () => {
  it("adds no second Present tile", () => {
    // The count line above it already renders `{presentCount} in`; the save bar renders it again.
    expect((tab.match(/label: "Present"/g) ?? []).length).toBe(0)
    expect((tab.match(/\{presentCount\} in/g) ?? []).length).toBe(1)
  })

  it("sits inline rather than in a bordered panel", () => {
    const block = tab.slice(tab.indexOf("presenceByType.rows.length > 0"), tab.indexOf("presenceByType.rows.map") + 400)
    expect(block).not.toContain("rounded-xl border")
  })
})
