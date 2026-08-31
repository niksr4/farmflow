import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Editing a saved record opens that record, in a dialog, where you clicked it.
 *
 * Reported by HoneyFarm 2026-08-31: pressing Edit on an expense in History appeared to do nothing.
 * It had filled the entry form — in a different section, which the writer was not looking at — so
 * recovering meant navigating back and finding it. Nobody designed that. The edit path reused
 * whatever the entry path already had, on a screen where the entry path lived somewhere else.
 *
 * Every tab that lists saved records has the same shape, so every one of them has the same trap.
 * That is why this is a counted list and not a note in a style guide: the rule is only worth
 * anything if it is the same rule in all six places, and the way it fails is one screen at a time.
 *
 * TO FIX ONE: render the entry form into a `const formNode`, render it inline only when adding,
 * and pass the SAME node to EditRecordDialog when editing. Not a copy — an edit form that has
 * drifted from the entry form is how a field comes to save on one screen and not the other, which
 * this codebase has already paid for twice (the expense block picker, the pay basis on the roster).
 * Then delete the file from the list below.
 *
 * THIS LIST MUST ONLY EVER SHRINK.
 */
const EDIT_NOT_YET_IN_A_DIALOG = [
  "components/labor-deployment-tab.tsx",
  "components/picking-log-tab.tsx",
  "components/rainfall-tab.tsx",
  "components/sales-tab.tsx",
  "components/worker-ledger-tab.tsx",
]

/** Tabs that list saved records and offer an edit. */
const RECORD_TABS = [
  "components/other-expenses-tab.tsx",
  ...EDIT_NOT_YET_IN_A_DIALOG,
]

const read = (path: string) => readFileSync(resolve(__dirname, "..", path), "utf8")

const opensInADialog = (source: string) => /EditRecordDialog/.test(source)

describe("edit opens the record", () => {
  it("the shared dialog exists and is the one thing callers reach for", () => {
    const shell = read("components/ui/edit-record-dialog.tsx")
    expect(shell).toContain("export function EditRecordDialog")
    // The point of the shell is the shared frame. If a caller needs something it cannot express,
    // widen the shell rather than hand-rolling a Dialog beside it.
    expect(shell).toContain("max-h-[90vh]")
  })

  it("expenses use it — the reported bug stays fixed", () => {
    const source = read("components/other-expenses-tab.tsx")
    expect(opensInADialog(source)).toBe(true)
    // The same node in both frames, not two forms.
    expect(source).toContain("const expenseFormNode")
    expect(source).toContain("{isAdding && !editingId ? expenseFormNode : null}")
    expect(source).toContain("{expenseFormNode}")
  })

  it("no tab drops off the list without being converted", () => {
    const converted = EDIT_NOT_YET_IN_A_DIALOG.filter((file) => opensInADialog(read(file)))
    expect(
      converted,
      "these now use EditRecordDialog — delete them from EDIT_NOT_YET_IN_A_DIALOG so the list keeps meaning something",
    ).toEqual([])
  })

  it("counts the tabs still to convert, so the number is visible rather than assumed", () => {
    // 5 of 6 on 2026-08-31. If this number goes UP, a new record tab was written without the rule.
    expect(EDIT_NOT_YET_IN_A_DIALOG.length).toBeLessThanOrEqual(5)
    expect(RECORD_TABS.length).toBe(6)
  })
})
