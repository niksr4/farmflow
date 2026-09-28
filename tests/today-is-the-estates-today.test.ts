import { afterEach, describe, expect, it, vi } from "vitest"
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { estateTodayDate, istClock, istDate, istNowParts, istTodayParts, todayIso } from "@/lib/date-utils"
import { getCurrentFiscalYear } from "@/lib/fiscal-year-utils"

/**
 * "What day is it" has ONE answer at a FarmFlow estate, and it is not the viewer's.
 *
 * HoneyFarm's owner ran the app from Africa (IST - 3:30) in September 2026. The punch-time half of
 * this was reported and fixed (PR #28). The DATE half was not: components/attendance-report-tab.tsx
 * derived "today" as new Date().toISOString().slice(0,10), which is the UTC date, so between 00:00
 * and 05:30 IST every caller read YESTERDAY -- and that window is exactly when an estate office is
 * open, because the muster is a dawn job. The same file's firstOfMonth() read the VIEWER's month
 * off a local Date, so the two ends of one date range could disagree about which month it was.
 *
 * lib/date-utils.ts has carried the rule in a docstring since it was written:
 * "Never use toISOString().slice(0,10) for calendar dates."
 *
 * These assert the CLOCK and the DATE, not their shape. A /\d{4}-\d{2}-\d{2}/ assertion passes in
 * every timezone, which is precisely why it cannot see any of the above.
 */

afterEach(() => {
  vi.useRealTimers()
})

describe("the estate's today", () => {
  it("is the IST date even when the instant is still yesterday in UTC", () => {
    // 2026-09-20 20:00 UTC == 2026-09-21 01:30 IST. The estate's day has turned; UTC's has not.
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-20T20:00:00Z"))

    expect(todayIso()).toBe("2026-09-21")
    // The shape the fix removed, spelled out so the difference is visible rather than asserted about.
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-09-20")
  })

  it("is the IST date even when the instant is already tomorrow in UTC", () => {
    // 2026-09-21 19:00 IST is still the 21st; nowhere east of IST should push it to the 22nd.
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-21T13:30:00Z"))
    expect(todayIso()).toBe("2026-09-21")
  })

  it("renders an instant as an IST wall clock, not the viewer's", () => {
    // The reported bug, exactly: an 08:01 IST punch read 04:31 on a phone 3.5 hours behind.
    expect(istClock("2026-09-21T02:31:00Z")).toBe("08:01")
    expect(istClock(new Date("2026-09-20T20:00:00Z"))).toBe("01:30")
  })

  it("gives calendar parts on the estate's clock, with month 1-12", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-20T20:00:00Z")) // 2026-09-21 01:30 IST
    expect(istTodayParts()).toEqual({ year: 2026, month: 9, day: 21 })
    // 1-12, deliberately: a helper whose job is preventing date mistakes must not ship an
    // off-by-one of its own. Date.getMonth() would say 8 here.
    expect(istTodayParts().month).not.toBe(new Date().getMonth())
  })

  /**
   * The two Major defects CodeRabbit found on PR #33, asserted as behaviour.
   *
   * Both are DECISIONS rather than labels, which is why they mattered: one picks the financial
   * year every money report defaults to, the other picks which coffee season you are looking at.
   */
  it("rolls the fiscal year on the estate's 1 April, not the host's", () => {
    vi.useFakeTimers()
    // 19:00 UTC on 31 March == 00:30 IST on 1 April. The estate is in FY 26/27.
    vi.setSystemTime(new Date("2026-03-31T19:00:00Z"))
    expect(getCurrentFiscalYear().label).toBe("FY 26/27")
    expect(getCurrentFiscalYear().startDate).toBe("2026-04-01")

    // And it must NOT roll early: 18:00 UTC is 23:30 IST on 31 March, still FY 25/26.
    vi.setSystemTime(new Date("2026-03-31T18:00:00Z"))
    expect(getCurrentFiscalYear().label).toBe("FY 25/26")
  })

  it("gives the estate's weekday and hour, not the host's", () => {
    /**
     * The FIFTH signature. lib/season-utils.ts decided when to show the "Ready to log this week's
     * work?" prompt from new Date().getDay() and .getHours(), against windows that are estate
     * times (Mon 10-1, Fri 4-6, Sat 9-11 IST). The guard shipped on 09-23 enumerated
     * getFullYear/getMonth/getDate and so could not see it; the scanner found it the next day.
     */
    vi.useFakeTimers()
    // Sunday 2026-09-20 20:00 UTC == MONDAY 01:30 IST. The weekday itself differs, not just the hour.
    vi.setSystemTime(new Date("2026-09-20T20:00:00Z"))
    expect(istNowParts().weekday).toBe(1) // Monday at the estate
    expect(new Date().getUTCDay()).toBe(0) // still Sunday in UTC
    expect(istNowParts().hour).toBe(1)

    // Midnight IST must be hour 0, not 24 — en-GB with hour12:false emits "24" and that would
    // silently fail every `hour >= 9 && hour <= 11` style window.
    vi.setSystemTime(new Date("2026-09-20T18:30:00Z")) // 00:00 IST
    expect(istNowParts().hour).toBe(0)
  })

  it("survives a missing or unparseable instant instead of throwing", () => {
    expect(istClock(null as unknown as string)).toBe("--:--")
    expect(istClock("not a date")).toBe("--:--")
  })

  it("is the ONLY derivation of today — there is no viewer-local sibling to pick by mistake", async () => {
    /**
     * This assertion used to say the opposite. On 2026-09-21 it read "todayIso() is the right
     * default for a personal UI control; istTodayIso() is the right answer for anything naming an
     * estate's working day", and pinned that distinction deliberately.
     *
     * That was a guess, never checked against the callers. Classifying all 25 on 2026-09-23 found
     * that NONE is a personal UI control -- they are sale_date, invoice_date, entry_date, expense
     * date, muster queries, a payroll period, a pay rule's effectiveFrom, and two cutover
     * comparisons that decide whether labour is written to the muster or the legacy path. The
     * viewer-local semantic had no consumer, so the two collapsed into one.
     *
     * Exported as a single name on purpose: two functions differing by 5.5 hours with names this
     * similar is a trap, not a choice.
     */
    const dateUtils = await import("@/lib/date-utils")
    expect(Object.keys(dateUtils)).not.toContain("istTodayIso")
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

/**
 * Derived scan, not a hand-kept list of files.
 *
 * Keys on the ONE shape that is always wrong: "now", converted to UTC, then sliced to a date.
 * Deliberately does NOT flag `new Date(\`${x}T00:00:00Z\`).toISOString().slice(0,10)` -- that is
 * UTC-anchored calendar arithmetic (lib/payroll-period.ts, components/payroll-summary-tab.tsx) and
 * is correct by construction, because the zone never enters. A scan that flagged those too would
 * be noise, and noise is how a real hit gets allowlisted.
 *
 * ⚠ THE PATTERN USES [[:space:]], NOT \s. `git grep -E` is POSIX ERE, which has no \s -- the first
 * version of this guard used \s* and therefore required a literal "s" after the comma, matched
 * nothing, and passed against a deliberately broken tree. It was caught by tamper-testing it, not
 * by reading it. If you edit this regex, break something and watch it fail before trusting it.
 */
/**
 * FIVE SIGNATURES, ONE BUG. The 2026-09-21 sweep looked for two of these and shipped three fixes;
 * CodeRabbit then found two Major defects on 09-23 wearing the third, in code that sweep had
 * touched. `getCurrentFiscalYear()` returned FY 25/26 at 2026-03-31T19:00Z when the estate was
 * already in FY 26/27, and the Season P&L preset offered last year's whole coffee season to a
 * viewer west of IST on 1 October. Sixteen occurrences existed; the sweep found none of them.
 *
 * The lesson is in the regex, not the fix: a guard that enumerates the shapes it has already seen
 * will keep passing while the same defect arrives in a new one.
 *
 * Proven twice more since: the VARIABLE form (const now = new Date() on one line, now.getMonth() on
 * another) survived three sweeps, and getDay/getHours was not in the list at all until the scanner
 * found lib/season-utils.ts on 09-24 — one day after this guard shipped.
 */
const WRONG_CLOCK_SHAPES = [
  // "now", converted to UTC, sliced to a date.
  String.raw`new Date\(\)\.toISOString\(\)\.slice\(0,[[:space:]]*10\)`,
  // The same thing via split — missed by the first version of this guard.
  String.raw`new Date\(\)\.toISOString\(\)\.split\(`,
  // "now", read on the HOST's calendar: browser for a client component, UTC on Vercel.
  String.raw`new Date\(\)\.(getFullYear|getMonth|getDate|getDay|getHours|getMinutes)\(\)`,
]

/**
 * The VARIABLE form of the shape above — `const now = new Date()` on one line, `now.getMonth()` on
 * another. A single-line regex cannot see it, which is why it survived three separate sweeps: the
 * 09-21 pass, the 09-23 pass that fixed the inline form, and the rainfall-tab fix inside that same
 * pass, where converting the file HALF way left the totals on the browser's calendar while the
 * export range and heatmap moved to IST. CodeRabbit caught that one as Major.
 *
 * Detected by parsing rather than grepping, because that is what the shape requires.
 */
const findVariableForm = (src: string): number[] => {
  const lines = src.split("\n")
  const out: number[] = []
  lines.forEach((line, i) => {
    // The `: Date` is optional and load-bearing. Without it, `const now: Date = new Date()` slips
    // past and the guard silently accepts the very access it exists to reject.
    const decl = /\b(?:const|let|var)\s+(\w+)\s*(?::\s*Date\s*)?=\s*new Date\(\)\s*$/.exec(
      line.trim().replace(/;$/, ""),
    )
    if (!decl) return
    const name = decl[1]
    const window = lines.slice(i + 1, i + 15).join("\n")
    if (new RegExp(String.raw`\b${name}\.(getFullYear|getMonth|getDate|getDay|getHours|getMinutes)\(\)`).test(window)) out.push(i + 1)
  })
  return out
}
const UTC_TODAY_SHAPE = WRONG_CLOCK_SHAPES.join("|")

/**
 * Comment lines are stripped, for the same reason check-dead-imports strips import lines: a guard
 * satisfied by a MENTION is not a guard. The first run of this scan flagged the comment in
 * app/api/worker-pay-rules/route.ts that explains the fix, because the comment necessarily quotes
 * the broken shape. Describing a bug must not count as committing it.
 */
const isComment = (line: string) => {
  const code = line.split(":").slice(2).join(":").trim()
  return code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")
}

const scan = () => {
  const out = execSync(
    `git grep -n -E '${UTC_TODAY_SHAPE}' -- 'app/*' 'components/*' 'lib/*' 'hooks/*' || true`,
    { encoding: "utf8" },
  ).trim()
  return out ? out.split("\n").filter((line) => !isComment(line)) : []
}

/**
 * Known remaining sites, each with the reason it is not worth a fix TODAY. Every one of these is
 * still technically the wrong date for ~5.5 hours a day; none of them reaches a number anybody is
 * paid or charged. THIS LIST MUST ONLY EVER SHRINK.
 */
const ACCEPTED: Record<string, { count: number; why: string }> = {
  "app/api/coffee-news/route.ts": { count: 1, why: "cache key for a news feed — a day-early key costs one refetch" },
  "app/api/receivables/route.ts": { count: 1, why: "overdue cutoffs, but receivables is enterprise-tier with 0 rows in prod" },
  "app/api/weather/rainfall-context/route.ts": { count: 1, why: "forecast context window, not a recorded figure" },
  "app/api/yield-forecast/route.ts": { count: 1, why: "named todayUtc and compared only against other UTC-parsed dates; enterprise-tier, 0 rows" },
  "components/tenant-settings-page.tsx": { count: 1, why: "date in a download filename" },
  "components/inventory-system.tsx": { count: 2, why: "dates in two CSV download filenames" },
  "components/admin/utils.ts": { count: 1, why: "DEFAULT_WEEKLY_START, an admin date-picker seed the operator immediately overrides" },
}

/** Direct-form occurrences per file, from the same scan the checks below use. */
/**
 * Direct-form occurrences per file, counting MATCHES rather than matching LINES.
 *
 * `git grep -n` emits one result per line, so a line carrying two wrong-clock expressions counted
 * as one -- and then both count checks passed while the file held one more offender than the list
 * admitted. Turning a file-based allowlist into a count-based one and then counting the wrong
 * thing leaves the same hole one level down, which is a tidy demonstration that "count-based" is
 * only as good as what gets counted.
 *
 * Raised by CodeRabbit on PR #48.
 */
/**
 * ⚠ THE SAME PATTERN STRING CANNOT GO TO BOTH `git grep -E` AND `new RegExp`.
 *
 * git grep -E is POSIX ERE and spells whitespace `[[:space:]]`. A JS RegExp reads that as a
 * character class of `[`, `:`, `s`, `p`, `a`, `c`, `e` -- so the pattern matches nothing, and the
 * first version of the per-match counting below silently fell back to 1 hit per line via `?? 1`.
 * Which is to say: the fix for "counts lines, not matches" still counted lines, and nothing said so.
 *
 * This file already carries a warning about the mirror image of this (using `\s` in the git grep
 * pattern, which matched a literal "s" and passed against a deliberately broken tree). Same trap,
 * opposite direction, found the same way -- by a test that asserted the arithmetic.
 */
const toJsRegexSource = (posixEre: string) => posixEre.replace(/\[\[:space:\]\]/g, String.raw`\s`)

/**
 * Split out from directFormCounts so the arithmetic can be ASKED with synthetic lines.
 *
 * The first attempt at this tested a locally-built regex instead, which proved the pattern could
 * count two matches but not that the counter used it -- so replacing the count with a hard-coded 1
 * left every test green. Tamper 3 on PR #48 found that; the guard for "counts matches, not lines"
 * has to exercise the thing that counts.
 */
const countDirectFormMatches = (scanLines: string[]): Record<string, number> => {
  const counts: Record<string, number> = {}
  const perMatch = new RegExp(toJsRegexSource(UTC_TODAY_SHAPE), "g")
  for (const line of scanLines) {
    const file = line.split(":")[0]
    const code = line.split(":").slice(2).join(":")
    const hits = code.match(perMatch)?.length ?? 0
    /**
     * LOUD, not `?? 1`. Every line here came out of a git grep for this very pattern, so a JS
     * conversion that finds nothing means the two regex dialects have diverged -- and a silent
     * fallback of 1 is precisely what hid that. An allowlist guard that quietly undercounts is worse
     * than one that crashes.
     */
    if (hits === 0) {
      throw new Error(
        `directFormCounts: the JS conversion of UTC_TODAY_SHAPE matched nothing in a line git grep DID match.\n` +
          `The two regex dialects have diverged -- check toJsRegexSource for a POSIX class it does not translate.\n` +
          `  line: ${line}`,
      )
    }
    counts[file] = (counts[file] ?? 0) + hits
  }
  return counts
}

const directFormCounts = (): Record<string, number> => countDirectFormMatches(scan())

/**
 * Same rule, variable form — exempting OCCURRENCES, not files.
 *
 * A bare list of paths would wave through a *new* offender in an already-listed file, and the
 * staleness twin would still pass because the original occurrence is untouched. That is the
 * "hand-kept list of files is how the next instance hides" failure from CLAUDE.md, and the first
 * version of this list had it. Counts are used rather than line numbers so the guard survives
 * ordinary edits above the site while still failing the moment a file gains one more.
 *
 * THESE NUMBERS MUST ONLY EVER GO DOWN.
 */
const VARIABLE_FORM_ACCEPTED: Record<string, number> = {
  // Demo tenant only — never reaches a customer's books.
  "app/api/admin/seed-tenant/route.ts": 2,
  // Enterprise tier, 0 rows in production. Revisit the day a tenant is put on it.
  "components/receivables-tab.tsx": 1,
  // Billing is built but not enforcing; no invoice has ever been dated by this.
  "lib/billing.ts": 1,
  // Derives from a season end date that is already an explicit YYYY-MM-DD, not from "now".
  "app/api/dashboard/season-projection/route.ts": 1,
  /**
   * ⚠ lib/server/agents/weekly-digest-agent.ts USED TO BE EXEMPT HERE, and the entry is worth
   * remembering rather than just deleting. It read:
   *
   *   "Correct, but only because of WHEN it runs. The cron fires Monday 02:00 UTC = 07:30 IST, so
   *    the UTC weekday and the IST weekday agree at that instant... It would break if the schedule
   *    ever moved earlier than 18:30 UTC on a Sunday... but if you reschedule that cron, fix this
   *    first."
   *
   * Nobody rescheduled the cron. PR #38 changed the OTHER half of the comparison instead -- the
   * orchestrator's `isMonday` became IST -- so the two halves disagreed for those 5.5 hours and the
   * digest could report the week before the one that just ended. The exemption named the trigger it
   * expected and was blind to the one that happened.
   *
   * The lesson for anything added below: an exemption justified by "this cannot fire because of X"
   * has to say what makes X true, and X here was a relationship between two files rather than a
   * property of this one.
   */
}

describe("nobody reintroduces the UTC-date-for-today shape", () => {
  it("no source file derives today by slicing a UTC ISO string beyond what is accepted", () => {
    /**
     * OCCURRENCES, not files. This used to exempt whole PATHS -- so a file already on the list could
     * gain a second, third, fourth offender and the guard stayed green, and the staleness twin below
     * also stayed green because the original occurrence was untouched.
     *
     * That is the "hand-kept list of files is how the next instance hides" failure from CLAUDE.md.
     * The variable-form list beside this one was already count-based for exactly that reason; this
     * one was not, so the weaker half of the same guard was the half nobody had fixed.
     *
     * Raised by CodeRabbit on PR #34 as an outside-diff-range finding, which is why it sat unread.
     */
    const counts = directFormCounts()
    const over = Object.entries(counts)
      .filter(([file, n]) => n > (ACCEPTED[file]?.count ?? 0))
      .map(([file, n]) => `${file}: ${n} (accepted ${ACCEPTED[file]?.count ?? 0})`)
    expect(over, "use todayIso() from lib/date-utils -- it is IST, see the docstring there").toEqual([])
  })

  const variableFormCounts = (): Record<string, number> => {
    const files = execSync(`git ls-files '*.ts' '*.tsx'`, { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter((f) => !f.startsWith("tests/") && /^(app|components|lib|hooks)\//.test(f))

    const counts: Record<string, number> = {}
    for (const file of files) {
      const n = findVariableForm(readFileSync(resolve(__dirname, "..", file), "utf8")).length
      if (n > 0) counts[file] = n
    }
    return counts
  }

  it("no source file reads the host calendar off a `const now = new Date()` beyond what is accepted", () => {
    const counts = variableFormCounts()
    const over = Object.entries(counts)
      .filter(([file, n]) => n > (VARIABLE_FORM_ACCEPTED[file] ?? 0))
      .map(([file, n]) => `${file}: ${n} (accepted ${VARIABLE_FORM_ACCEPTED[file] ?? 0})`)
    expect(over, "derive the date from istTodayParts() or todayIso() — lib/date-utils").toEqual([])
  })

  it("every VARIABLE-FORM exemption is still needed, at the count claimed", () => {
    // The twin of the check below. It was missing entirely until a tamper test went green that
    // should have failed, and then it exempted whole FILES — so a second offender in an already
    // listed file was accepted and the staleness check still passed, because the first one was
    // untouched. Comparing counts closes both ends: fix one and this fails, add one and the
    // check above fails.
    const counts = variableFormCounts()
    const stale = Object.entries(VARIABLE_FORM_ACCEPTED)
      .filter(([file, n]) => (counts[file] ?? 0) < n)
      .map(([file, n]) => `${file}: accepted ${n}, found ${counts[file] ?? 0}`)
    expect(stale, "lower the number (or delete the entry) in VARIABLE_FORM_ACCEPTED").toEqual([])
  })

  it("counts two wrong-clock expressions on one line as two", () => {
    /**
     * `git grep -n` emits one result per LINE. So a line carrying two of these counted as one, and
     * both count checks passed while the file held one more offender than the list admitted -- the
     * file-based hole reappearing one level down, inside the fix for it.
     *
     * Raised by CodeRabbit on PR #48. Exercised through countDirectFormMatches rather than a
     * locally-built regex: the first version of this test proved the PATTERN could count two and
     * said nothing about whether the counter used it, so hard-coding the count to 1 left it green.
     */
    const twoOnOneLine =
      "lib/x.ts:9:  const a = new Date().toISOString().slice(0, 10), b = new Date().toISOString().slice(0, 10)"
    const oneOnEachOfTwoLines = [
      "lib/y.ts:3:  const a = new Date().toISOString().slice(0, 10)",
      "lib/y.ts:8:  const b = new Date().toISOString().slice(0, 10)",
    ]

    expect(countDirectFormMatches([twoOnOneLine]), "two expressions, one line").toEqual({ "lib/x.ts": 2 })
    expect(countDirectFormMatches(oneOnEachOfTwoLines), "one each, two lines").toEqual({ "lib/y.ts": 2 })
    // The two shapes must be indistinguishable to the allowlist -- which is the whole point.
    expect(countDirectFormMatches([twoOnOneLine])["lib/x.ts"]).toBe(
      countDirectFormMatches(oneOnEachOfTwoLines)["lib/y.ts"],
    )
  })

  it("every accepted entry is still a real occurrence, at the count claimed", () => {
    // Without this, a file that gets fixed leaves a stale exemption behind, and the next genuine
    // offender in that file is silently permitted. An allowlist that cannot expire is a hole.
    //
    // Counts, not presence: fixing ONE of two occurrences in a listed file used to leave the
    // exemption intact at its original breadth, so the slot the fix freed up was silently available
    // to the next offender. Comparing counts closes both ends -- fix one and this fails, add one and
    // the check above fails.
    const counts = directFormCounts()
    const stale = Object.entries(ACCEPTED)
      .filter(([file, { count }]) => (counts[file] ?? 0) < count)
      .map(([file, { count }]) => `${file}: accepted ${count}, found ${counts[file] ?? 0}`)
    expect(stale, "lower the number (or delete the entry) in ACCEPTED").toEqual([])
  })
})

/**
 * THE SIXTH SIGNATURE: RENDERING, not deriving.
 *
 * Everything above catches how "now" is DERIVED -- toISOString().slice, getMonth(), the variable
 * form. None of it can see how a correct instant is PRINTED, and CLAUDE.md names that as the same
 * class in the same breath: "toLocaleTimeString() and toLocaleDateString() all use the VIEWER's
 * timezone unless given an explicit one."
 *
 * Nine live sites had it, and the tell is that several passed `"en-IN"` and read as though that
 * settled the question. It does not. A locale picks the FORMAT; only `timeZone` picks the OFFSET.
 * The clearest was the estate search: lib/server/assistant-search.ts formats each row's date in
 * Asia/Kolkata on the server, and components/universal-search.tsx re-parsed that string as UTC
 * midnight and re-rendered it in the viewer's zone -- undoing, in the browser, a fix the server had
 * already made.
 *
 * PAREN-MATCHED, NOT LINE-MATCHED. weather-tab.tsx's was written across three lines with the
 * options object on its own, so a line-scoped regex would have called it zoned-or-unzoned depending
 * purely on where the author put a newline. This walks to the closing paren and asks about the
 * whole call.
 */
const LOCALE_FORMAT_CALL = /toLocale(?:Date|Time)String\s*\(/g

/**
 * Comments are removed first, including JSX `{/* … *\/}` blocks.
 *
 * Not optional: balance-sheet-tab.tsx carries a comment reading "istClock, not
 * toLocaleTimeString("en-IN")" -- the note explaining a previous fix of exactly this bug. The first
 * run of this scan flagged it. A guard that fails on the DESCRIPTION of a bug is the mirror of one
 * that passes on a mention, and both make the list lie.
 */
const stripComments = (src: string): string =>
  src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^[ \t]*\/\/.*$/gm, "")

/** Unzoned toLocale*String calls per file, counting CALLS rather than lines. */
const unzonedLocaleFormatCounts = (): Record<string, number> => {
  const files = execSync("git ls-files app components lib hooks", { encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
  const counts: Record<string, number> = {}
  for (const file of files) {
    const src = stripComments(readFileSync(resolve(process.cwd(), file), "utf8"))
    LOCALE_FORMAT_CALL.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = LOCALE_FORMAT_CALL.exec(src)) !== null) {
      // Walk to the matching close paren so a multi-line options object stays inside the call.
      let i = match.index + match[0].length - 1
      let depth = 0
      for (; i < src.length; i += 1) {
        if (src[i] === "(") depth += 1
        else if (src[i] === ")") {
          depth -= 1
          if (depth === 0) break
        }
      }
      if (!src.slice(match.index, i + 1).includes("timeZone")) {
        counts[file] = (counts[file] ?? 0) + 1
      }
    }
  }
  return counts
}

/**
 * The calls that are RIGHT to leave viewer-local, with the reason each one is.
 *
 * The distinction is whose event it is. A timestamp the viewer's own browser produced belongs in
 * the viewer's clock; anything that happened AT THE ESTATE does not. THESE NUMBERS MUST ONLY GO DOWN.
 */
const VIEWER_LOCAL_BY_DESIGN: Record<string, { count: number; why: string }> = {
  "components/inventory-system.tsx": { count: 1, why: "'Synced HH:MM' — when THIS browser last synced, so the viewer's clock is the correct one" },
  "components/inventory-system/data-tools-panel.tsx": { count: 1, why: "when an export failed in this tab — a local browser event" },
  "components/inventory-system/record-movement-panel.tsx": { count: 1, why: "when a write failed in this tab — a local browser event" },
  "components/accounts/labour-cost-summary.tsx": { count: 2, why: "parses at T12:00:00, so a ±5:30 render shift cannot cross a day boundary" },
  "lib/server/agents/daily-digest-agent.ts": { count: 2, why: "parsed local and formatted local, so the pair round-trips in any host zone" },
}

describe("an estate date is printed on the estate's calendar", () => {
  it("has no unzoned toLocale*String call outside the accepted set", () => {
    const counts = unzonedLocaleFormatCounts()
    const offenders = Object.entries(counts)
      .filter(([file, n]) => n > (VIEWER_LOCAL_BY_DESIGN[file]?.count ?? 0))
      .map(([file, n]) => `${file}: ${n} unzoned (accepted ${VIEWER_LOCAL_BY_DESIGN[file]?.count ?? 0})`)
    expect(
      offenders,
      "pass { timeZone: 'Asia/Kolkata' }, or use istDate()/istClock()/formatDateOnly(). " +
        "A locale like 'en-IN' picks the format, NOT the offset.",
    ).toEqual([])
  })

  it("every accepted entry is still a real occurrence, at the count claimed", () => {
    // The staleness twin, same as ACCEPTED above: a fixed file must not leave its exemption behind
    // for the next offender to inherit.
    const counts = unzonedLocaleFormatCounts()
    const stale = Object.entries(VIEWER_LOCAL_BY_DESIGN)
      .filter(([file, { count }]) => (counts[file] ?? 0) < count)
      .map(([file, { count }]) => `${file}: accepted ${count}, found ${counts[file] ?? 0}`)
    expect(stale, "lower the number (or delete the entry) in VIEWER_LOCAL_BY_DESIGN").toEqual([])
  })

  it("sees a call whose options object is on another line", () => {
    // weather-tab.tsx's was written exactly this way. A line-scoped scan would have read the first
    // line only, found no timeZone on it, and been right by accident -- and would equally have
    // MISSED a zoned call whose timeZone sat on line two.
    const across = `x.toLocaleDateString("en-IN", {\n  weekday: "short",\n})`
    const zonedAcross = `x.toLocaleDateString("en-IN", {\n  timeZone: "Asia/Kolkata",\n})`
    const countIn = (src: string) => {
      LOCALE_FORMAT_CALL.lastIndex = 0
      const m = LOCALE_FORMAT_CALL.exec(src)!
      let i = m.index + m[0].length - 1, depth = 0
      for (; i < src.length; i += 1) {
        if (src[i] === "(") depth += 1
        else if (src[i] === ")") { depth -= 1; if (depth === 0) break }
      }
      return src.slice(m.index, i + 1).includes("timeZone")
    }
    expect(countIn(across), "unzoned across lines must read as unzoned").toBe(false)
    expect(countIn(zonedAcross), "zoned across lines must read as zoned").toBe(true)
  })

  it("does not count a comment describing the bug as committing it", () => {
    const src = `{/* istClock, not toLocaleTimeString("en-IN"): a locale is not an offset */}\nconst x = 1`
    expect(stripComments(src)).not.toContain("toLocaleTimeString(")
  })
})

describe("istDate renders the estate's calendar date", () => {
  it("gives the IST date for an instant that is still yesterday in UTC", () => {
    // 2026-09-20 20:00 UTC == 2026-09-21 01:30 IST.
    expect(istDate("2026-09-20T20:00:00Z", { day: "numeric", month: "short" })).toBe("21 Sept")
  })

  it("does not shift for a viewer west of Greenwich", () => {
    // The off-by-one this replaces: new Date("2026-11-15") is UTC midnight, and printing its local
    // parts at UTC-5 reads 14 Nov. Asserted as the instant, since TZ is the runner's accident.
    expect(istDate("2026-11-15T00:00:00Z", { day: "numeric", month: "short" })).toBe("15 Nov")
  })

  it("survives a missing or unparseable value instead of throwing", () => {
    expect(istDate(null)).toBe("--")
    expect(istDate("not a date")).toBe("--")
  })
})

/**
 * THE SEVENTH SIGNATURE: date-fns.
 *
 * `format(d, "yyyy-MM-dd")`, `startOfWeek(d)`, `isToday(d)` all read a Date's LOCAL parts, so
 * seeding any of them with `new Date()` puts the screen on the VIEWER's calendar. Nothing above
 * could see it: it is not toISOString, not a getMonth() access, and not a toLocale* call.
 *
 * Nineteen sites had it across thirteen files, including three that decide a WRITTEN date --
 * processing's process_date default, sales' default sale date, and the muster's selected day. The
 * muster is the same tab the original Africa report came from: its week strip was built from
 * `startOfWeek(new Date())`, so for a viewer west of India between 00:00 and 05:30 IST it showed
 * the week that had already ended, with the estate's actual today not on it at all.
 *
 * `isToday`/`isFuture`/`isPast` are banned outright rather than counted. They take no reference
 * date, so there is no correct way to call them here -- they are always the host's opinion.
 */
const HOST_RELATIVE_PREDICATES = /\bimport\s*\{[^}]*\b(isToday|isFuture|isPast|isYesterday|isTomorrow)\b[^}]*\}\s*from\s*["']date-fns["']/
const DATE_FNS_ON_NOW = /\b(format|startOfWeek|endOfWeek|startOfMonth|endOfMonth|startOfDay|addDays|subDays|addWeeks|subWeeks|addMonths|subMonths|addYears|subYears|differenceInDays|differenceInCalendarDays)\s*\(\s*new Date\(\)/g

/**
 * Download filenames only. A CSV named with the viewer's date is a cosmetic mismatch on a file the
 * user is holding, not a figure anybody is paid on -- the same carve-out ACCEPTED already makes for
 * the toISOString form. THESE NUMBERS MUST ONLY EVER GO DOWN.
 */
const DATE_FNS_ON_NOW_ACCEPTED: Record<string, { count: number; why: string }> = {
  "components/pepper-tab.tsx": { count: 1, why: "date inside a CSV download filename" },
  "components/processing-tab.tsx": { count: 1, why: "date inside a CSV download filename" },
  "lib/date-utils.ts": { count: 1, why: "inside todayIso() itself — the IST-correct implementation everything else calls" },
}

const dateFnsOnNowCounts = (): Record<string, number> => {
  const files = execSync("git ls-files app components lib hooks", { encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
  const counts: Record<string, number> = {}
  for (const file of files) {
    const src = stripComments(readFileSync(resolve(process.cwd(), file), "utf8"))
    const hits = src.match(DATE_FNS_ON_NOW)?.length ?? 0
    if (hits) counts[file] = hits
  }
  return counts
}

describe("date-fns is never handed the host's now", () => {
  it("has no new Date() flowing into a date-fns call outside the accepted set", () => {
    const counts = dateFnsOnNowCounts()
    const offenders = Object.entries(counts)
      .filter(([file, n]) => n > (DATE_FNS_ON_NOW_ACCEPTED[file]?.count ?? 0))
      .map(([file, n]) => `${file}: ${n} (accepted ${DATE_FNS_ON_NOW_ACCEPTED[file]?.count ?? 0})`)
    expect(offenders, "use estateTodayDate() or todayIso() — date-fns reads LOCAL parts").toEqual([])
  })

  it("every accepted entry is still a real occurrence, at the count claimed", () => {
    const counts = dateFnsOnNowCounts()
    const stale = Object.entries(DATE_FNS_ON_NOW_ACCEPTED)
      .filter(([file, { count }]) => (counts[file] ?? 0) < count)
      .map(([file, { count }]) => `${file}: accepted ${count}, found ${counts[file] ?? 0}`)
    expect(stale, "lower the number (or delete the entry) in DATE_FNS_ON_NOW_ACCEPTED").toEqual([])
  })

  it("nothing imports a host-relative date predicate", () => {
    const files = execSync("git ls-files app components lib hooks", { encoding: "utf8" })
      .split("\n")
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    const offenders = files.filter((f) =>
      HOST_RELATIVE_PREDICATES.test(stripComments(readFileSync(resolve(process.cwd(), f), "utf8"))),
    )
    expect(
      offenders,
      "isToday/isFuture/isPast take no reference date, so they are always the HOST's opinion. " +
        "Compare YYYY-MM-DD strings against todayIso() instead.",
    ).toEqual([])
  })

  it("estateTodayDate is the estate's day, and survives a date-fns round trip", () => {
    vi.useFakeTimers()
    // 2026-09-20 20:00 UTC == 2026-09-21 01:30 IST. The estate is on the 21st; UTC is on the 20th.
    vi.setSystemTime(new Date("2026-09-20T20:00:00Z"))
    // The round trip that matters: this is exactly what the muster does to pick a day.
    const roundTripped = `${estateTodayDate().getFullYear()}-${String(estateTodayDate().getMonth() + 1).padStart(2, "0")}-${String(estateTodayDate().getDate()).padStart(2, "0")}`
    expect(roundTripped, "date-fns reads these same local parts").toBe(todayIso())
    expect(roundTripped).toBe("2026-09-21")
  })
})
