import { describe, expect, it } from "vitest"

import { decideExpenseCode } from "../lib/activity-code-match"

/**
 * The cost-code decision, asked directly instead of grepped for.
 *
 * This logic shipped wrong twice in one day, on 2026-09-26, and neither failure was caught by the
 * tests guarding it:
 *
 *  1. An unmatched search fell back to the code it replaced. Select 136, type "fertilizer", look
 *     away, save: the warning showed, and 136 is what got stored.
 *  2. The fix for (1) consulted only the SETTLED unmatched value, which the blur callback writes
 *     150ms after focus leaves. Tapping Save straight from the open keyboard beats that timer, so
 *     the guard never ran and 136 got stored again.
 *
 * Both were found by CodeRabbit. The test written for (2) scanned the submit handler for a mention
 * of `codeQuery` -- which the handler already contained on an unrelated line -- so deleting the fix
 * left it green. That is the failure the repo guide calls "asserting a mention, not a call", one
 * step worse: asserting a mention, not a behaviour.
 *
 * A valid-but-unintended code is the damage to avoid, not merely an invalid one. Postgres refuses
 * an unknown code outright (expense_transactions has FOREIGN KEY (code, tenant_id)); a real code
 * the writer did not choose is stored, rolled into the estate's cost report, and undetectable after
 * the fact.
 */

const ACTIVITIES = [
  { code: "136", reference: "Arabica Lime/Manuring" },
  { code: "156", reference: "Robusta Liming/Manuring" },
  { code: "182", reference: "Pepper Manuring" },
  { code: "245", reference: "Organic Compost Manure" },
  { code: "122", reference: "Electricity" },
]

const decide = (over: Partial<Parameters<typeof decideExpenseCode>[0]>) =>
  decideExpenseCode({
    liveQuery: null,
    settledUnmatched: null,
    committedCode: "",
    activities: ACTIVITIES,
    ...over,
  })

describe("decideExpenseCode", () => {
  it("uses a code the writer selected earlier when the box is not being edited", () => {
    const d = decide({ committedCode: "136" })
    expect(d.outcome).toBe("use")
    expect(d.outcome === "use" && d.activity.code).toBe("136")
  })

  it("resolves a search that is still open, so Save straight after typing works", () => {
    // The whole reason the blur commit is raced rather than waited for: typing 122 and hitting Save
    // must file electricity, not refuse because the 150ms timer has not fired.
    const d = decide({ liveQuery: "122", committedCode: "" })
    expect(d.outcome === "use" && d.activity.reference).toBe("Electricity")
  })

  it("resolves a search by name, not only by number", () => {
    const d = decide({ liveQuery: "electricity" })
    expect(d.outcome === "use" && d.activity.code).toBe("122")
  })

  describe("an unmatched search never falls back to the code it replaced", () => {
    it("refuses when the blur callback has already settled the query as unmatched", () => {
      // Bug 1: warning on screen, 136 still in formData, 136 stored.
      const d = decide({ liveQuery: null, settledUnmatched: "fertilizer", committedCode: "136" })
      expect(d.outcome).toBe("refuse")
      expect(d.outcome === "refuse" && d.typed).toBe("fertilizer")
    })

    it("refuses when the query is STILL IN THE BOX and the blur callback has not run yet", () => {
      /**
       * Bug 2, and the one that shipped. This is the mobile path: the keyboard is open, the writer
       * taps Save, and 150ms has not elapsed. settledUnmatched is null because the callback is
       * still pending, so a guard reading only that value waves this through.
       */
      const d = decide({ liveQuery: "fertilizer", settledUnmatched: null, committedCode: "136" })
      expect(d.outcome, "Save can beat the 150ms blur commit, and usually does on a phone").toBe("refuse")
      expect(d.outcome === "refuse" && d.typed).toBe("fertilizer")
    })

    it("refuses whitespace-padded unresolvable text the same way", () => {
      const d = decide({ liveQuery: "  fertilizer  ", committedCode: "136" })
      expect(d.outcome).toBe("refuse")
      expect(d.outcome === "refuse" && d.typed).toBe("fertilizer")
    })

    it("names the typed text in the refusal, not the code being protected", () => {
      // The writer needs to be told which word was rejected. Reporting "136" would describe the
      // code they had already replaced and read as though a valid selection was refused.
      const d = decide({ liveQuery: "fertilizer", committedCode: "136" })
      expect(d.outcome === "refuse" && d.typed).not.toBe("136")
    })

    it("refuses an ambiguous partial rather than guessing between two codes", () => {
      // "Manuring" matches 136, 156 and 182. Picking one would be a valid-but-unintended code,
      // which is the exact damage class this function exists to prevent.
      const d = decide({ liveQuery: "manur", committedCode: "245" })
      expect(d.outcome).toBe("refuse")
    })
  })

  describe("clearing the box is not the same as typing something wrong", () => {
    it("an emptied search falls back to the committed code rather than refusing", () => {
      // Focusing the field sets the query to "" (it is a search box, so focus clears it). That
      // must not be read as an unmatched entry, or focusing and looking away would refuse a code
      // the writer had already chosen and never touched.
      const d = decide({ liveQuery: "", committedCode: "136" })
      expect(d.outcome === "use" && d.activity.code).toBe("136")
    })

    it("and with nothing committed either, it asks for a code without quoting one", () => {
      const d = decide({ liveQuery: "", committedCode: "" })
      expect(d.outcome).toBe("refuse")
      expect(d.outcome === "refuse" && d.typed, "there is no typed text to quote back").toBeNull()
    })
  })

  it("refuses a committed code that is no longer in the activity list", () => {
    // Codes can be deleted under Activity Codes while a form is open, and a draft is restored from
    // localStorage across sessions. The database would refuse this on the foreign key; refusing it
    // here is the difference between a named field error and "Failed to process expense".
    const d = decide({ committedCode: "999" })
    expect(d.outcome).toBe("refuse")
    expect(d.outcome === "refuse" && d.typed).toBe("999")
  })

  it("matches a committed code case-insensitively", () => {
    const d = decide({ committedCode: "ELECTRICITY", activities: [{ code: "electricity", reference: "Power" }] })
    expect(d.outcome).toBe("use")
  })

  it("prefers the open search over the committed code, because it is the newer intent", () => {
    // Selecting 136 and then searching 122 and saving must file 122. Preferring the committed code
    // would silently discard the thing the writer just did.
    const d = decide({ liveQuery: "122", committedCode: "136" })
    expect(d.outcome === "use" && d.activity.code).toBe("122")
  })

  it("refuses everything when the estate has no codes at all", () => {
    const d = decide({ liveQuery: "136", committedCode: "136", activities: [] })
    expect(d.outcome).toBe("refuse")
  })
})
