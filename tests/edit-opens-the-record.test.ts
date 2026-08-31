import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Editing a saved record must not make you go and find it.
 *
 * Reported by HoneyFarm 2026-08-31: pressing Edit on an expense in History appeared to do nothing.
 * It had filled the entry form — in a different section, which the writer was not looking at — so
 * recovering meant working out for yourself that you should navigate back.
 *
 * THE RULE IS NOT "USE A DIALOG". It is that the record opens where you are. Two mechanisms
 * satisfy that and both are correct:
 *
 *   in-place  the table row itself becomes editable — right for a short row of fields
 *   dialog    EditRecordDialog over the current screen — right for a long form
 *
 * A first draft of this file listed five tabs as needing conversion to a dialog. That was wrong,
 * and worth recording: picking-log and worker-ledger already edit the row in place, and forcing a
 * dialog onto a four-field row would have made them worse in the name of consistency. Counting
 * sites is only useful when the thing being counted is the actual rule — otherwise the ratchet
 * manufactures work and calls it rigour.
 *
 * WHAT IS LEFT. Two tabs navigate you to the form's own section instead of opening the record
 * where you clicked. That is not the invisible failure expenses had — you do end up somewhere
 * useful — but you lose your place in the list, which on a long records table means finding your
 * row again afterwards. They are listed below to be converted, not because they are broken.
 *
 * THIS LIST MUST ONLY EVER SHRINK.
 */
const EDIT_NAVIGATES_AWAY = [
  "components/sales-tab.tsx",
  "components/rainfall-tab.tsx",
]

/** Opens the record over the current screen. */
const OPENS_IN_A_DIALOG = ["components/other-expenses-tab.tsx", "components/labor-deployment-tab.tsx"]

/** Turns the row itself into the editor. Equally correct; do not "fix" these. */
const EDITS_THE_ROW_IN_PLACE = ["components/picking-log-tab.tsx", "components/worker-ledger-tab.tsx"]

const read = (path: string) => readFileSync(resolve(__dirname, "..", path), "utf8")

describe("edit opens the record where you are", () => {
  it("there is one dialog shell, so callers do not each invent a frame", () => {
    const shell = read("components/ui/edit-record-dialog.tsx")
    expect(shell).toContain("export function EditRecordDialog")
    // ui/dialog exports no header or description, which is why every caller was improvising one.
    expect(shell).toContain("max-h-[90vh]")
  })

  it("every converted tab opens in the dialog", () => {
    for (const file of OPENS_IN_A_DIALOG) {
      expect(read(file), `${file} should open the record in EditRecordDialog`).toContain("EditRecordDialog")
    }
  })

  it("expenses keep one form node in two frames — the reported bug stays fixed", () => {
    const source = read("components/other-expenses-tab.tsx")
    // One form node in two frames, never two forms. A drifted edit form is how a field comes to
    // save on one screen and not the other — paid for twice already in this codebase.
    expect(source).toContain("const expenseFormNode")
    expect(source).toContain("{isAdding && !editingId ? expenseFormNode : null}")
  })

  it("the in-place editors still edit in place", () => {
    // Guards against someone reading the rule as "always a dialog" and converting these.
    for (const file of EDITS_THE_ROW_IN_PLACE) {
      expect(read(file), `${file} should still render an editable row`).toMatch(/editingId === \w+\.id \? \(/)
    }
  })

  it("no tab drops off the to-convert list without being converted", () => {
    const converted = EDIT_NAVIGATES_AWAY.filter((file) => read(file).includes("EditRecordDialog"))
    expect(
      converted,
      "these now use EditRecordDialog — delete them from EDIT_NAVIGATES_AWAY so the list keeps meaning something",
    ).toEqual([])
  })

  it("every tab that lists records is accounted for in exactly one bucket", () => {
    // The bucket a tab is in is a decision someone made. A tab in none of them is a tab whose edit
    // behaviour nobody has looked at — which is how expenses stayed broken for months.
    const all = [...OPENS_IN_A_DIALOG, ...EDITS_THE_ROW_IN_PLACE, ...EDIT_NAVIGATES_AWAY]
    expect(new Set(all).size).toBe(all.length)
    expect(all.length).toBe(6)
  })
})
