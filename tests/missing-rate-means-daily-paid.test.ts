import { readdirSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * "Missing daily rate" must only ever mean someone who is supposed to have one.
 *
 * Reported by HoneyFarm 2026-09-01: the muster warned about N workers missing a daily rate, and
 * they were the staff and staff_pf people who are paid a monthly salary. They have no daily rate
 * BY DESIGN -- the database forbids carrying both (scripts/141, attendance_workers_one_pay_basis).
 * The banner was telling the estate to go and fix six rows that were already correct.
 *
 * That is worse than a cosmetic slip. A warning that is wrong about things you know are fine is a
 * warning you learn to dismiss, and the next one -- about a worker who genuinely has no rate, on
 * whom the muster will silently cost ₹0 -- gets dismissed with it.
 *
 * TWO PLACES ASKED THIS QUESTION and both got it wrong the same way: the muster's own banner and
 * the payroll summary's flag. Hence a count rather than two behavioural checks -- this is the same
 * shape as the pay-field bug, where three of four editors followed the worker type and the fourth
 * did not, and the same shape as the ON CONFLICT that was right in five places and wrong in one.
 */

const ROOTS = ["app/api", "components", "lib"]

const walk = (dir: string): string[] => {
  const full = resolve(__dirname, "..", dir)
  const out: string[] = []
  const visit = (d: string) => {
    for (const entry of readdirSync(d)) {
      const p = resolve(d, entry)
      if (statSync(p).isDirectory()) visit(p)
      else if (/\.tsx?$/.test(entry)) out.push(p)
    }
  }
  visit(full)
  return out
}

/** Every line that tests a rate for absence — the shape that needs the worker-type guard. */
const rateAbsenceChecks = () => {
  const found: Array<{ file: string; line: string }> = []
  for (const dir of ROOTS) {
    for (const file of walk(dir)) {
      const source = readFileSync(file, "utf8")
      for (const line of source.split("\n")) {
        if (!/daily_?[rR]ate\s*={2,3}\s*null|daily_rate\s+IS\s+NULL/.test(line)) continue
        // A null-safe CONVERSION is not a missing-rate CHECK. app/api/attendance/summary writes
        // `dailyRate: row.daily_rate === null ? null : Number(row.daily_rate)` -- it is passing the
        // value through, not deciding anything about the worker, and demanding a pay-basis guard
        // there would be noise. The tell is the ternary handing back the value itself.
        if (/\?\s*null\s*:/.test(line)) continue
        {
          found.push({ file: file.slice(file.indexOf(dir)), line: line.trim() })
        }
      }
    }
  }
  return found
}

describe("only daily-paid workers can be missing a daily rate", () => {
  it("every rate-absence check is qualified by the worker type", () => {
    // The guard may sit on the same line or immediately around it, so the file must at least
    // import the shared predicate — a file testing for a null rate with no notion of pay basis
    // cannot be asking the right question.
    const unguarded = rateAbsenceChecks().filter(({ file }) => {
      const source = readFileSync(resolve(__dirname, "..", file), "utf8")
      return !source.includes("isPaidDaily")
    })
    expect(
      unguarded.map((u) => `${u.file}: ${u.line}`),
      "these count a missing daily rate without asking whether the worker is paid daily at all",
    ).toEqual([])
  })

  it("finds the checks at all, so a rename cannot disarm this silently", () => {
    expect(rateAbsenceChecks().length).toBeGreaterThanOrEqual(2)
  })
})

describe("the mobile home button says what the tab is called", () => {
  it("says Muster, not Labour", () => {
    // Desktop said "Log Muster" and the phone still said "Log Labour" — the same button, two
    // names, on the one screen a writer uses every morning.
    const i18n = readFileSync(resolve(__dirname, "../lib/i18n.ts"), "utf8")
    expect(i18n).toContain('logLabour: "Log Muster"')
    expect(i18n).not.toContain('logLabour: "Log Labour"')
  })
})
