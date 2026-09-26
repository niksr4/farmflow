import { describe, expect, it } from "vitest"
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * A cost code you can type is a cost code that can be refused.
 *
 * `expense_transactions` carries FOREIGN KEY (code, tenant_id) REFERENCES account_activities, so
 * the database has always refused a code it does not already hold. The expenses form did not know
 * that: its "Type of cost" box committed every keystroke straight to formData.code, under a
 * comment asserting "expenses allow ad-hoc codes that aren't in the saved list yet". The field
 * promised something the schema forbids, and the only place it surfaced was a save failure after
 * the whole form had been filled in.
 *
 * HoneyFarm hit it on 2026-09-03 — six failed saves in eight minutes. Laxmi hit it on 2026-09-25,
 * typing "fertilizer", which is what the placeholder ("e.g. Fertiliser, Fuel") had been
 * suggesting. Two of four tenants in three weeks, both on a word the box invited.
 *
 * Labour got this right from the start. These tests hold both forms to labour's standard.
 */

const read = (file: string) => readFileSync(resolve(__dirname, "..", file), "utf8")

/**
 * DERIVED, not a hand-kept pair. Any file importing resolveActivityFromQuery is by definition a
 * form where somebody chooses an activity code, so a third one added tomorrow is covered tomorrow
 * rather than quietly exempt.
 */
const pickerForms = () =>
  execSync(
    `git grep -l 'resolveActivityFromQuery' -- 'components/*' 'app/*' | grep -v '^lib/' || true`,
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean)

describe("an activity code must already exist", () => {
  it("finds the picker forms by what they import, not by a list kept here", () => {
    const forms = pickerForms()
    expect(forms).toContain("components/other-expenses-tab.tsx")
    expect(forms).toContain("components/labor-deployment-tab.tsx")
  })

  it("every picker form refuses an unresolved code before it submits", () => {
    /**
     * The shape, not a name: resolve the in-flight query, then look the result up in `activities`,
     * then bail when that lookup comes back empty. A form that skipped the last step sent its code
     * to Postgres and got back a foreign-key violation — which is what the user actually saw.
     */
    const missing = pickerForms().filter((file) => {
      const src = read(file)
      const looksUpActivity = /activities\.find\(\s*\(\s*a\w*\s*\)\s*=>\s*a\w*\.code\.toLowerCase\(\)\s*===/.test(src)
      const bailsWhenUnmatched = /if\s*\(\s*!\s*matchingActivity\s*\)/.test(src)
      return !(looksUpActivity && bailsWhenUnmatched)
    })
    expect(missing, "gate submit on a resolved activity, the way labour does").toEqual([])
  })

  it("the expenses code box does not commit raw keystrokes as the code", () => {
    /**
     * The precise defect. Its onChange used to read:
     *
     *   setCodeQuery(value)
     *   setFormData((prev) => ({ ...prev, code: value }))
     *
     * so "fertilizer" became the code the moment it was typed. Typing must only drive the SEARCH;
     * the code is set by choosing something real. Asserting on the onChange body rather than on
     * the file, because setFormData({ code }) is legitimate elsewhere in the same component.
     */
    const src = read("components/other-expenses-tab.tsx")
    const codeInput = src.slice(src.indexOf('id="expense-code"'))
    const onChangeBody = codeInput.slice(codeInput.indexOf("onChange="), codeInput.indexOf("onFocus="))
    /**
     * Comments stripped first. The onChange now carries a comment QUOTING the old broken line so
     * the next reader knows what not to reinstate — and the first version of this assertion
     * matched that quotation and failed against the fixed code. A guard satisfied by a mention is
     * not a guard, and that cuts both ways.
     */
    const code = onChangeBody
      .split("\n")
      .filter((line) => {
        const t = line.trim()
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*")
      })
      .join("\n")
    expect(
      /setFormData\([\s\S]*?\bcode:/.test(code),
      "typing must search, not commit — only a resolved activity sets the code",
    ).toBe(false)
  })

  it("an unmatched search cannot fall back to the code it replaced", () => {
    /**
     * THE BUG THE FIRST VERSION OF THIS FIX INTRODUCED.
     *
     * Select 136. Type "fertilizer". Look away. The warning appears — but formData.code is still
     * 136 and codeQuery has been cleared, so submit resolved to 136 and saved the expense under a
     * code the writer had visibly replaced. A valid-but-unintended code is worse than a refused
     * one: nothing downstream can tell it was not meant.
     *
     * Asserts the guard runs BEFORE the fallback. Ordering is the whole property — the same check
     * placed after `effectiveCode` is computed would never be reached, because the fallback has
     * already produced a code that matches.
     */
    const src = read("components/other-expenses-tab.tsx")
    const submit = src.slice(src.indexOf("handleSubmitUnguarded"))
    const unmatchedGuard = submit.search(/if\s*\(\s*unmatchedCodeQuery\s*&&\s*!\s*pendingCodeResolution\s*\)/)
    const fallback = submit.search(/const\s+effectiveCode\s*=/)

    expect(unmatchedGuard, "submit must refuse a typed code that matched nothing").toBeGreaterThan(-1)
    expect(fallback).toBeGreaterThan(-1)
    expect(unmatchedGuard, "the refusal must come before the fallback, or it never fires").toBeLessThan(fallback)
  })

  it("the unmatched warning does not outlive the thing it warns about", () => {
    // Picking a valid code answers the warning; resetForm starts a new entry. Neither cleared it,
    // so "fertilizer is not one of your cost codes" sat above a correctly-filled field, and then
    // above the next expense too.
    const src = read("components/other-expenses-tab.tsx")
    for (const fn of ["const handleCodeChange", "const resetForm"]) {
      const body = src.slice(src.indexOf(fn), src.indexOf(fn) + 400)
      expect(body, `${fn} must clear unmatchedCodeQuery`).toMatch(/setUnmatchedCodeQuery\(\s*null\s*\)/)
    }
  })

  it("the placeholder does not invite a word that cannot be a code", () => {
    // "e.g. Fertiliser, Fuel" is what taught two estates to type a plain English word. Neither
    // "Fertiliser" nor "Fuel" is an activity code in any tenant.
    /**
     * Bounded to THIS input's closing tag. Unbounded, the slice ran to end-of-file, so deleting
     * the cost-code placeholder entirely would have found the Notes field's placeholder further
     * down and passed — the guard would have survived the thing it exists to prevent.
     *
     * My tamper test missed it because I changed the placeholder's VALUE and never removed it.
     * Caught by CodeRabbit on PR #40, quoting this repo's own rule back at it: "A guard must be
     * tamper-tested: break the thing it guards and watch it fail."
     */
    const src = read("components/other-expenses-tab.tsx")
    const fromInput = src.slice(src.indexOf('id="expense-code"'))
    const codeInput = fromInput.slice(0, fromInput.indexOf("/>") + 2)
    const placeholder = /placeholder="([^"]*)"/.exec(codeInput)?.[1] ?? ""
    expect(placeholder.length, "the cost-code box still needs to say what it wants").toBeGreaterThan(0)
    expect(placeholder).not.toMatch(/fertilis|fertiliz|fuel/i)
  })
})
