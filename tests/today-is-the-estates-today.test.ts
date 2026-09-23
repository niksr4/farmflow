import { afterEach, describe, expect, it, vi } from "vitest"
import { execSync } from "node:child_process"
import { istClock, todayIso } from "@/lib/date-utils"

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
const UTC_TODAY_SHAPE = String.raw`new Date\(\)\.toISOString\(\)\.slice\(0,[[:space:]]*10\)`

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
}

describe("nobody reintroduces the UTC-date-for-today shape", () => {
  it("no NEW source file derives today by slicing a UTC ISO string", () => {
    const unexpected = scan().filter((line) => !Object.keys(ACCEPTED).some((file) => line.startsWith(`${file}:`)))
    expect(unexpected, "use todayIso() from lib/date-utils -- it is IST, see the docstring there").toEqual([])
  })

  it("every accepted entry is still a real occurrence", () => {
    // Without this, a file that gets fixed leaves a stale exemption behind, and the next genuine
    // offender in that file is silently permitted. An allowlist that cannot expire is a hole.
    const hit = scan()
    const stale = Object.keys(ACCEPTED).filter((file) => !hit.some((line) => line.startsWith(`${file}:`)))
    expect(stale, "these no longer match — delete them from ACCEPTED").toEqual([])
  })
})
