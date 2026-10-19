import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * OPENING A COST ROW FOR EDIT MUST NOT ATTRIBUTE IT TO A BLOCK IT NEVER TOUCHED.
 *
 * ⚠ TWO INDEPENDENT SYMPTOMS OF ONE MISTAKE, and one tab fixed it while the other did not.
 *
 * `if (row.locationId) setFormLocationId(row.locationId)` looks defensive and is the bug: when the
 * row has NO block, nothing is set, so the picker keeps whatever the PREVIOUS row left in state.
 * Editing a Citrus row and then a block-less one shows, and saves, Citrus. resetForm deliberately
 * does not clear it either -- a writer filing ten rows for one block should not repick it ten
 * times -- which is exactly what makes the conditional wrong when opening an existing row.
 *
 * And with no "whole estate" option in the picker, submit's "Location required" refusal demands an
 * answer the row never had. The easiest way out of that prompt is to pick a block.
 *
 * components/other-expenses-tab.tsx fixed both and wrote down why. components/labor-deployment-tab.tsx
 * carried both for 179 of Laxmi's 239 labour rows (75%), every one of them pre-cutover and so
 * still editable.
 */

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")

/**
 * DERIVED: every component that prefills a location picker when opening a saved row. Keyed on the
 * shape -- a setFormLocationId-style call inside an edit handler -- so a third cost tab is covered
 * the day it is written rather than when somebody remembers this file.
 */
const pickerComponents = (): string[] =>
  execFileSync("git", ["ls-files", "components"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".tsx"))
    .filter((f) => {
      const src = stripComments(readFileSync(f, "utf8"))
      return /setFormLocationId\s*\(/.test(src)
    })

describe("a cost row's block survives being edited", () => {
  const files = pickerComponents()

  it("finds the tabs that prefill a location picker, so this cannot scan nothing", () => {
    expect(
      files.length,
      "no component prefills a location picker -- the scan is broken, not the code",
    ).toBeGreaterThanOrEqual(2)
  })

  it.each(files)("%s sets the picker unconditionally when opening a row", (file) => {
    const src = stripComments(readFileSync(file, "utf8"))
    expect(
      /if\s*\([\w.]*locationId\s*\)\s*setFormLocationId/.test(src),
      `${file} sets the picker only when the row HAS a block, so a block-less row inherits the ` +
        "previous row's block from state and saving re-attributes the cost to it, silently.",
    ).toBe(false)
  })

  it.each(files)("%s offers an estate-wide choice, so a NULL block is pickable", (file) => {
    const src = stripComments(readFileSync(file, "utf8"))
    // Without it, "Location required" demands an answer a block-less row never had.
    expect(
      /LOCATION_ESTATE_WIDE/.test(src),
      `${file} has no estate-wide option, so correcting a row with no block forces the estate to ` +
        "invent one",
    ).toBe(true)
  })

  it.each(files)("%s maps the estate-wide sentinel back to null on save", (file) => {
    const src = stripComments(readFileSync(file, "utf8"))
    // The sentinel must never reach the database as a location id.
    expect(
      /locationId:\s*[\w.]*\s*&&\s*[\w.]*\s*!==\s*LOCATION_ESTATE_WIDE/.test(src),
      `${file} may post the sentinel string as a location id. It must become null.`,
    ).toBe(true)
  })
})
