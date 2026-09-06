import { describe, expect, it } from "vitest"

import { shouldAlertForSilence } from "@/lib/server/agents/biometric-health-agent"

/**
 * An alert that arrives every morning is an alert nobody reads.
 *
 * The rule was "12+ hours of silence", justified in the file as: an estate cutting power at night
 * "must not page anyone — half a day of total silence is not explicable by either". Six in the
 * evening to half seven the next morning is thirteen and a half hours, and the cron runs at 02:00
 * UTC, which is 07:30 in Kodagu. So on any estate that switches the muster shed off overnight it
 * fired daily, and after a weekend it fired at sixty-odd hours.
 *
 * HoneyFarm got exactly that on 2026-09-06: "silent for 15h", on a terminal that was working.
 *
 * The question is not how long it has been quiet. It is whether it missed a day the estate was
 * working — because that is the day attendance went uncaptured.
 */
const alert = (hoursSilent: number, seenLastWorkingDay: boolean | null) =>
  shouldAlertForSilence({ hoursSilent, seenLastWorkingDay, silenceHours: 12 })

describe("normal estate rhythm is not an incident", () => {
  it("stays quiet overnight, which is what broke this", () => {
    // Shed off at 18:00, checked at 07:30. Thirteen and a half hours, and completely normal.
    expect(alert(13.5, true)).toBe(false)
  })

  it("stays quiet across a weekend", () => {
    // Off Saturday evening, checked Monday morning. Seen on Saturday, the last working day.
    expect(alert(61, true)).toBe(false)
  })

  it("stays quiet on the real HoneyFarm reading that triggered the false alarm", () => {
    // 23h silent on a Sunday, last seen Saturday. The old rule alerted; nothing was wrong.
    expect(alert(23, true)).toBe(false)
  })

  it("is quiet during the working day itself", () => {
    expect(alert(2, true)).toBe(false)
  })
})

describe("a terminal that missed a working day is worth an email", () => {
  it("alerts when it was not seen at all on the last working day", () => {
    expect(alert(30, false)).toBe(true)
  })

  it("still needs the hours floor, so a brief morning gap is not an incident", () => {
    // Registered-and-configured-this-morning, or a short outage during the roll.
    expect(alert(4, false)).toBe(false)
  })
})

describe("the backstop covers estates this model does not fit", () => {
  it("alerts past three days whatever the working-day answer says", () => {
    // An estate that works Sundays, or a pattern nobody has described yet. Three days of total
    // silence is not a weekend anywhere.
    expect(alert(80, true)).toBe(true)
  })

  it("and treats an unknown working-day answer as healthy below that", () => {
    // null means the query could not decide -- a device with no last_seen, or a gap in the series.
    // Failing open matters here: a monitoring check that pages on its own uncertainty gets muted.
    expect(alert(20, null)).toBe(false)
    expect(alert(90, null)).toBe(true)
  })
})
