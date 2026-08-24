import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * Anything a person can set when creating a record, they must be able to see and change afterwards.
 *
 * `gender` broke this and was worse than it looked: it was on the worker create form, absent from
 * both edit surfaces, and displayed nowhere at all. It was write-only -- recordable once, never
 * visible, never correctable. INDICOFS 4.6.3G asks the estate to *demonstrate* workforce data, and
 * a value you cannot read back is not evidence of anything. The API had accepted it on update the
 * whole time; only the UI was missing.
 *
 * This walks the worker form's own field list rather than a list written here, so a field added to
 * the form tomorrow is covered without anyone remembering to add it.
 */
const src = readFileSync("components/worker-profiles-tab.tsx", "utf8")

const formFields = (() => {
  const m = src.match(/const EMPTY_FORM = \{([\s\S]*?)\n\}/)
  if (!m) throw new Error("EMPTY_FORM not found — this guard needs it to know the field list")
  return [...m[1].matchAll(/^\s*(\w+):/gm)].map((x) => x[1])
})()

// locationId is carried on the row but set through the estate picker, not a field of its own.
//
// `kind` is a deliberate exception, and the reason is in the view rather than the form:
// labour_cost joins attendance_workers and branches on `w.kind`, so flipping a worker between
// person and crew does not change them going forward -- it silently reclassifies every day they
// have ever worked between the estate-labour and contract-labour columns of the P&L. Nobody
// pressing a toggle on a roster row expects to restate a season.
//
// So a mis-created row is fixed by deactivating it and adding the right one, which loses nothing:
// if it has no history there is nothing to lose, and if it has history that history is exactly
// what must not move. Headcount, which does change legitimately as a crew grows, IS editable.
const NOT_A_FORM_INPUT = new Set(["locationId", "kind"])

describe("every field on the create form is editable afterwards", () => {
  it("finds the form's fields to check", () => {
    expect(formFields.length).toBeGreaterThan(5)
    expect(formFields).toContain("gender")
  })

  it.each(formFields.filter((f) => !NOT_A_FORM_INPUT.has(f)))("%s can be edited", (field) => {
    const setOnCreate = new RegExp(`setForm\\(\\(f\\) => \\(\\{ \\.\\.\\.f, ${field}:`).test(src)
    if (!setOnCreate) return // not offered at create either; nothing to honour
    const setOnEdit = new RegExp(`setEditForm\\(\\(f\\) => \\(\\{ \\.\\.\\.f, ${field}:`).test(src)
    expect(setOnEdit, `"${field}" can be set when creating a worker but never changed afterwards`).toBe(true)
  })

  it.each(formFields.filter((f) => !NOT_A_FORM_INPUT.has(f)))("%s is sent on save", (field) => {
    const setOnCreate = new RegExp(`setForm\\(\\(f\\) => \\(\\{ \\.\\.\\.f, ${field}:`).test(src)
    if (!setOnCreate) return
    const save = src.slice(src.indexOf("const handleSaveEdit"), src.indexOf("const handleSaveEdit") + 1400)
    expect(save.includes(`${field}:`), `"${field}" has an edit control but is not in the PUT body`).toBe(true)
  })
})

describe("gender specifically, since it was write-only", () => {
  it("is shown on the desktop table, not only settable", () => {
    expect(src).toContain("<TableHead className=\"hidden lg:table-cell\">Gender</TableHead>")
    expect(src).toContain("formatGender(w.gender)")
  })

  it("is shown on the mobile card too", () => {
    expect(src).toMatch(/MobileField label="Gender"/)
  })

  it("is still described as irrelevant to pay, which is the point of recording it", () => {
    expect(src).toMatch(/no effect on pay|never an input to pay|Never an input to pay/i)
  })
})
