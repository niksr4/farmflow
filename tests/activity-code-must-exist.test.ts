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
      /**
       * TWO WAYS TO SATISFY THIS, and both are real: do the lookup inline (labour still does), or
       * delegate to decideExpenseCode (expenses now does, because the inline version shipped wrong
       * twice and this scan could not see either failure -- see tests/expense-code-decision.ts).
       *
       * Accepting only the inline shape would have made moving the logic into a tested pure
       * function look like a regression, which is how a guard starts arguing against the fix.
       */
      const delegates = /decideExpenseCode\s*\(/.test(
        src.split("\n").filter((line) => !/^\s*import\b/.test(line)).join("\n"),
      )
      const looksUpActivity = /activities\.find\(\s*\(\s*a\w*\s*\)\s*=>\s*a\w*\.code\.toLowerCase\(\)\s*===/.test(src)
      const bailsWhenUnmatched = /if\s*\(\s*!\s*matchingActivity\s*\)/.test(src)
      return !(delegates || (looksUpActivity && bailsWhenUnmatched))
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

  /**
   * ⚠ A SCAN USED TO LIVE HERE CALLED "an unmatched search cannot fall back to the code it
   * replaced". It asserted that a refusal on `!pendingCodeResolution` appeared above the line
   * computing `effectiveCode` -- ordering being the property, since the same check placed after the
   * fallback could never fire.
   *
   * It is gone rather than ported, because the thing it was reaching for is now expressible. The
   * decision is a pure function, and tests/expense-code-decision.ts asks it directly. That is
   * strictly stronger: the scan could only see whether a guard was positioned above a fallback, and
   * was blind to WHICH inputs the guard consulted -- which is precisely how the second bug shipped
   * with this file green. The replacement covers the settled query and the one still in the box,
   * the ambiguous partial, and the emptied-on-focus case, none of which a position check can state.
   *
   * Noted at this length because the repo guide warns that one such replacement was weaker than the
   * scan it replaced, so the comparison is worth writing down rather than assuming.
   */

  it("submits through the decision function rather than reimplementing it inline", () => {
    /**
     * Not a tidiness assertion. Both versions of this logic were wrong while it lived inline, and
     * the scan guarding it could not see either failure -- so the contract in
     * tests/expense-code-decision.ts is only worth anything if the form routes through the thing it
     * tests.
     *
     * A CALL, not a mention: import lines stripped, and matched with an open paren. This repo has
     * a live example of the weaker form, where a test asserted toContain("formatLocationLabel")
     * and passed on the import line of a component that never called it.
     */
    const src = read("components/other-expenses-tab.tsx")
    const withoutImports = src
      .split("\n")
      .filter((line) => !/^\s*import\b/.test(line))
      .join("\n")
    expect(/decideExpenseCode\s*\(/.test(withoutImports)).toBe(true)
  })

  it("stops before saving when the decision is a refusal", () => {
    /**
     * CALLING the decision and OBEYING it are two different claims, and the test above only makes
     * the first. A caller that read the refusal and then persisted anyway would satisfy it, which
     * is the whole failure mode: the decision function is now well tested, so the remaining place
     * a wrong code can reach the database is a caller that ignores the answer.
     *
     * Keyed on `.outcome === "refuse"` and on the persistence calls, because those are the
     * function's contract and the data boundary respectively. Deliberately NOT keyed on
     * `codeDecision` or `matchingActivity`: those are local names I chose today, and pinning to
     * them is the identifier fragility that broke the previous version of this file's guard.
     *
     * Raised by CodeRabbit on PR #41.
     */
    const src = read("components/other-expenses-tab.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")

    /**
     * BRACE-MATCHED, not regex-matched. Two earlier attempts at this were vacuous:
     *
     *   /if\s*\([^)]*\.outcome === "refuse"[\s\S]*?\breturn\b/
     *
     * `[^)]*` swallows anything before the comparison, so `if (false && d.outcome === "refuse")`
     * still matched -- a branch that can never run read as a branch that returns. And `[\s\S]*?`
     * finds the next `return` ANYWHERE below, so deleting the branch's own return matched a later
     * one instead. A regex cannot express "this block returns"; walking the braces can.
     */
    const condition = /if\s*\(\s*(\w+)\.outcome\s*===\s*["']refuse["']\s*\)\s*\{/.exec(src)
    expect(condition, "the refusal must be branched on directly, with nothing gating it").not.toBeNull()

    const openBrace = src.indexOf("{", condition!.index)
    let depth = 0
    let closeBrace = -1
    for (let i = openBrace; i < src.length; i += 1) {
      if (src[i] === "{") depth += 1
      else if (src[i] === "}") {
        depth -= 1
        if (depth === 0) {
          closeBrace = i
          break
        }
      }
    }
    expect(closeBrace, "could not find the end of the refusal branch").toBeGreaterThan(openBrace)
    expect(
      /\breturn\b/.test(src.slice(openBrace, closeBrace)),
      "the refusal branch must return, or submit carries on and writes the committed code",
    ).toBe(true)

    const persistence = ["addDeployment", "updateDeployment"]
      .map((name) => src.indexOf(`${name}(`))
      .filter((index) => index >= 0)
    expect(persistence, "expected at least one persistence call to bound the refusal against").not.toHaveLength(0)
    expect(closeBrace, "the refusal has to be decided before anything is written").toBeLessThan(
      Math.min(...persistence),
    )
  })

  it("abandons a scheduled blur commit when the form is reset", () => {
    /**
     * The blur commit is deferred 150ms so a suggestion click lands first. Uncancellable, it
     * outlived the form session: type a resolvable code, hit Cancel, and 150ms later the callback
     * called handleCodeChange and put that code into the NEXT expense -- a cost code the writer
     * never chose for the entry it ends up on.
     *
     * Three parts, because any one alone leaves the hole open: the timer is held somewhere
     * cancellable, resetForm cancels it, and the deferred write goes through that same handle.
     */
    const src = read("components/other-expenses-tab.tsx")
    const stripped = src
      .split("\n")
      .filter((line) => {
        const t = line.trim()
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*")
      })
      .join("\n")

    expect(/blurCommitRef\s*=\s*useRef/.test(stripped), "hold the timer where it can be cleared").toBe(true)
    expect(/blurCommitRef\.current\s*=\s*setTimeout/.test(stripped), "schedule through that handle").toBe(true)

    const reset = stripped.slice(stripped.indexOf("const resetForm"))
    const resetBody = reset.slice(0, reset.indexOf("clearDraft()"))
    expect(
      /cancelBlurCommit\(\)|clearTimeout/.test(resetBody),
      "resetForm must cancel the pending commit, or it lands on the next expense",
    ).toBe(true)
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
