import { afterEach, describe, expect, it, vi } from "vitest"
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { istClock, istNowParts, istTodayParts, todayIso } from "@/lib/date-utils"
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
const ACCEPTED: Record<string, string> = {
  "app/api/coffee-news/route.ts": "cache key for a news feed — a day-early key costs one refetch",
  "app/api/receivables/route.ts": "overdue cutoffs, but receivables is enterprise-tier with 0 rows in prod",
  "app/api/weather/rainfall-context/route.ts": "forecast context window, not a recorded figure",
  "app/api/yield-forecast/route.ts": "named todayUtc and compared only against other UTC-parsed dates; enterprise-tier, 0 rows",
  "components/tenant-settings-page.tsx": "date in a download filename",
  "components/inventory-system.tsx": "dates in two CSV download filenames",
  "components/admin/utils.ts": "DEFAULT_WEEKLY_START, an admin date-picker seed the operator immediately overrides",
}

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
   * Correct, but only because of WHEN it runs. The cron fires Monday 02:00 UTC = 07:30 IST, so the
   * UTC weekday and the IST weekday agree at that instant and "last Monday" comes out right. It
   * would break if the schedule ever moved earlier than 18:30 UTC on a Sunday. Left alone rather
   * than changed, because touching digest windowing to fix a bug that cannot currently fire is the
   * worse trade — but if you reschedule that cron, fix this first.
   */
  "lib/server/agents/weekly-digest-agent.ts": 1,
}

describe("nobody reintroduces the UTC-date-for-today shape", () => {
  it("no NEW source file derives today by slicing a UTC ISO string", () => {
    const unexpected = scan().filter((line) => !Object.keys(ACCEPTED).some((file) => line.startsWith(`${file}:`)))
    expect(unexpected, "use todayIso() from lib/date-utils -- it is IST, see the docstring there").toEqual([])
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

  it("every accepted entry is still a real occurrence", () => {
    // Without this, a file that gets fixed leaves a stale exemption behind, and the next genuine
    // offender in that file is silently permitted. An allowlist that cannot expire is a hole.
    const hit = scan()
    const stale = Object.keys(ACCEPTED).filter((file) => !hit.some((line) => line.startsWith(`${file}:`)))
    expect(stale, "these no longer match — delete them from ACCEPTED").toEqual([])
  })
})
