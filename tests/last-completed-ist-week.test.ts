import { afterEach, describe, expect, it, vi } from "vitest"

import { lastCompletedIstWeek } from "../lib/date-utils"

/**
 * The weekly digest's window, asserted rather than grepped for.
 *
 * It was derived from `new Date().getDay()` -- the HOST's weekday. PR #38 then made the
 * orchestrator's "is it Monday?" check IST, so for the 5.5 hours between 18:30 UTC Sunday and
 * midnight the two halves of one decision disagreed: IST was already Monday, the orchestrator agreed
 * to run, and the host was still on Sunday.
 *
 * The exemption for that file in tests/today-is-the-estates-today.ts had predicted a version of
 * this -- "correct only because of WHEN it runs... if you reschedule that cron, fix this first" --
 * and was blind to what actually happened, because nobody rescheduled the cron. The other half of
 * the comparison moved instead. An exemption justified by a relationship between two files cannot
 * see one of them change.
 *
 * Raised by CodeRabbit on PR #38.
 *
 * Every case fixes the instant and asserts the exact dates under more than one process timezone,
 * because CI sets no TZ and a shape-only assertion (`/\d{4}-\d{2}-\d{2}/`) passes in every zone --
 * which is precisely why this survived.
 */

const withTz = (tz: string, at: string, fn: () => void) => {
  const original = process.env.TZ
  process.env.TZ = tz
  vi.useFakeTimers()
  vi.setSystemTime(new Date(at))
  try {
    fn()
  } finally {
    vi.useRealTimers()
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  }
}

afterEach(() => vi.useRealTimers())

const ZONES = ["UTC", "Asia/Kolkata", "America/New_York", "Africa/Nairobi"]

describe("lastCompletedIstWeek", () => {
  it("returns the week that just ended, from the Monday the cron actually fires", () => {
    // 02:00 UTC Monday = 07:30 IST Monday, the real schedule. Mon 21 Sep to Sun 27 Sep.
    for (const tz of ZONES) {
      withTz(tz, "2026-09-28T02:00:00Z", () => {
        expect(lastCompletedIstWeek(), tz).toEqual({ weekStart: "2026-09-21", weekEnd: "2026-09-27" })
      })
    }
  })

  it("THE BUG: 19:00 UTC Sunday is already Monday in IST, and must give the same week", () => {
    /**
     * The window a manual re-trigger can land in. Before the fix this produced two different wrong
     * answers depending on the host zone:
     *
     *   TZ=UTC            09-14 -> 09-20   the week BEFORE the completed one (13 days back)
     *   TZ=Asia/Kolkata   09-20 -> 09-27   off by one day (IST midnight rendered as a UTC date)
     *
     * Both real, neither right, and the UTC one is what production would have sent.
     */
    for (const tz of ZONES) {
      withTz(tz, "2026-09-27T19:00:00Z", () => {
        expect(lastCompletedIstWeek(), tz).toEqual({ weekStart: "2026-09-21", weekEnd: "2026-09-27" })
      })
    }
  })

  it("is stable across the whole IST Monday, however the host reads the clock", () => {
    // Every instant that is Monday in IST must name the same completed week. 18:30 UTC Sunday is the
    // first, 18:29 UTC Monday the last.
    for (const at of ["2026-09-27T18:30:00Z", "2026-09-28T00:00:00Z", "2026-09-28T12:00:00Z", "2026-09-28T18:29:00Z"]) {
      for (const tz of ZONES) {
        withTz(tz, at, () => {
          expect(lastCompletedIstWeek(), `${at} / ${tz}`).toEqual({
            weekStart: "2026-09-21",
            weekEnd: "2026-09-27",
          })
        })
      }
    }
  })

  it("moves on at the next IST Monday, not before", () => {
    // 18:29 UTC Monday is still Monday IST; one minute later it is Tuesday, and the answer holds
    // until the following Monday. Guards against an off-by-one that would repeat a week.
    withTz("UTC", "2026-09-28T18:31:00Z", () => {
      expect(lastCompletedIstWeek()).toEqual({ weekStart: "2026-09-21", weekEnd: "2026-09-27" })
    })
    withTz("UTC", "2026-10-04T19:00:00Z", () => {
      // Sunday 19:00 UTC = Monday 5 Oct IST -> the week just ended is 28 Sep to 4 Oct.
      expect(lastCompletedIstWeek()).toEqual({ weekStart: "2026-09-28", weekEnd: "2026-10-04" })
    })
  })

  it("always spans exactly seven days, Monday to Sunday", () => {
    // The old code could produce an 8-day span (Sunday to Sunday) depending on the host zone, which
    // double-counts one day's figures into the email.
    for (const at of ["2026-09-28T02:00:00Z", "2026-09-27T19:00:00Z", "2026-10-01T09:00:00Z", "2026-12-31T23:00:00Z"]) {
      withTz("UTC", at, () => {
        const { weekStart, weekEnd } = lastCompletedIstWeek()
        const start = new Date(`${weekStart}T00:00:00Z`)
        const end = new Date(`${weekEnd}T00:00:00Z`)
        expect((end.getTime() - start.getTime()) / 86_400_000, `span at ${at}`).toBe(6)
        expect(start.getUTCDay(), `starts Monday at ${at}`).toBe(1)
        expect(end.getUTCDay(), `ends Sunday at ${at}`).toBe(0)
      })
    }
  })

  it("crosses a year boundary without inventing a week", () => {
    // 2027-01-04 is a Monday. The week just ended is 28 Dec to 3 Jan, spanning the year.
    withTz("UTC", "2027-01-04T02:00:00Z", () => {
      expect(lastCompletedIstWeek()).toEqual({ weekStart: "2026-12-28", weekEnd: "2027-01-03" })
    })
  })
})
