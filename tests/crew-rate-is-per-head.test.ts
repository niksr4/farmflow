import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * labour_cost values a crew as `rate * headcount * day_fraction` (scripts/118). So the rate a
 * user types for a contract crew is PER PERSON. Typing the crew's total instead bills the
 * headcount times over -- Rathi & Team at 8 would turn Rs 4,800 into Rs 38,400 -- and nothing
 * about the number looks wrong afterwards.
 *
 * Medappa entered theirs correctly, but nothing on screen told them to. These pin the wording
 * that does.
 */
const profiles = readFileSync("components/worker-profiles-tab.tsx", "utf8")
const attendance = readFileSync("components/attendance-tab.tsx", "utf8")
const view = readFileSync("scripts/118-rates-follow-the-work.sql", "utf8")

describe("the crew rate is per head, and every screen says so", () => {
  it("is what the view actually computes", () => {
    expect(view).toContain("rate * headcount")
  })

  it("the quick-add names the unit", () => {
    expect(attendance).toContain('"Rate/head ₹"')
  })

  it("worker profiles says PER PERSON rather than just 'daily wage'", () => {
    expect(profiles).toContain("PER PERSON")
  })

  it("the inline edit input names the unit for a crew", () => {
    expect(profiles).toContain('w.kind === "gang" ? "Daily rate per person"')
  })
})

describe("a crew is visibly a crew", () => {
  // Without this the row reads as one person on Rs 600 a day, and its true cost is invisible.
  it("shows the headcount and the resulting day cost", () => {
    expect(profiles).toContain("Crew of ")
    expect(profiles).toMatch(/Number\(w\.dailyRate\) \* Number\(w\.headcount\)/)
  })

  it("carries kind and headcount through the fetch, or it cannot tell", () => {
    expect(profiles).toContain('kind: w.kind === "gang" ? "gang" : "individual"')
    expect(profiles).toContain("headcount: w.headcount != null")
  })
})
