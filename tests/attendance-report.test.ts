import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import {
  attendanceReportToCsv,
  buildAttendanceReport,
  computeWorkDuration,
  formatDuration,
  summariseAttendanceReport,
} from "../lib/attendance-report"

describe("work duration", () => {
  it("computes a normal shift", () => {
    expect(computeWorkDuration("07:57:32", "16:49:27")).toBe("08:51")
  })

  it("is 00:00 when the worker never punched out", () => {
    // The case that motivated the ingest change: present, finish unknown — NOT a zero-hour shift.
    expect(computeWorkDuration("07:55:42", null)).toBe("00:00")
  })

  it("is 00:00 for an absent worker", () => {
    expect(computeWorkDuration(null, null)).toBe("00:00")
  })

  it("never returns a negative or wrapped duration", () => {
    // Should be impossible from ingest (check_in is a MIN, check_out a MAX over one day), but a
    // manually-edited record could produce it and a report is the wrong place to find out.
    expect(computeWorkDuration("16:00:00", "08:00:00")).toBe("00:00")
    expect(computeWorkDuration("08:00:00", "08:00:00")).toBe("00:00")
  })

  it("ignores malformed times rather than throwing", () => {
    expect(computeWorkDuration("not-a-time", "16:00:00")).toBe("00:00")
    expect(computeWorkDuration("25:00:00", "26:00:00")).toBe("00:00")
  })

  it("formats durations as HH:MM, matching the report it replaces", () => {
    expect(formatDuration(8 * 3600 + 52 * 60)).toBe("08:52")
    expect(formatDuration(0)).toBe("00:00")
    expect(formatDuration(-5)).toBe("00:00")
    expect(formatDuration(36 * 3600)).toBe("36:00")
  })
})

describe("report rows", () => {
  const roster = [
    { employeeCode: "1", employeeName: "Bopaiah", checkIn: "07:55:42", checkOut: null },
    { employeeCode: "2", employeeName: "Muthu", checkIn: "07:57:32", checkOut: "16:49:27" },
    { employeeCode: "3", employeeName: "Chandra", checkIn: null, checkOut: null },
  ]

  it("reproduces the SmartOffice treatment of a missing punch-out", () => {
    // Bopaiah is row 1 of the real 22-Jul-2026 report: in at 07:55:42, out 00:00, duration
    // 00:00, and still Present.
    const [bopaiah] = buildAttendanceReport(roster)
    expect(bopaiah).toMatchObject({
      serial: 1,
      employeeCode: "1",
      employeeName: "Bopaiah",
      inTime: "07:55:42",
      outTime: "00:00",
      workDuration: "00:00",
      status: "P",
      missingCheckOut: true,
    })
  })

  it("computes a full shift", () => {
    const [, muthu] = buildAttendanceReport(roster)
    expect(muthu).toMatchObject({ inTime: "07:57:32", outTime: "16:49:27", workDuration: "08:51", status: "P" })
    expect(muthu.missingCheckOut).toBe(false)
  })

  it("lists absent workers rather than omitting them", () => {
    // The entire point of the report: absentees are the rows the estate acts on.
    const [, , chandra] = buildAttendanceReport(roster)
    expect(chandra).toMatchObject({ inTime: "00:00", outTime: "00:00", status: "A", missingCheckOut: false })
  })

  it("shows a dash when a worker has no device code mapped yet", () => {
    const [row] = buildAttendanceReport([{ employeeCode: null, employeeName: "Unmapped", checkIn: null, checkOut: null }])
    expect(row.employeeCode).toBe("—")
  })

  it("numbers rows sequentially from 1", () => {
    expect(buildAttendanceReport(roster).map((r) => r.serial)).toEqual([1, 2, 3])
  })
})

describe("summary", () => {
  it("counts present, absent and missing punch-outs separately", () => {
    const rows = buildAttendanceReport([
      { employeeCode: "1", employeeName: "A", checkIn: "08:00:00", checkOut: null },
      { employeeCode: "2", employeeName: "B", checkIn: "08:00:00", checkOut: "17:00:00" },
      { employeeCode: "3", employeeName: "C", checkIn: null, checkOut: null },
      { employeeCode: "4", employeeName: "D", checkIn: null, checkOut: null },
    ])
    expect(summariseAttendanceReport(rows)).toEqual({ total: 4, present: 2, absent: 2, missingCheckOut: 1 })
  })
})

describe("csv export", () => {
  it("emits a header row and one line per worker", () => {
    const rows = buildAttendanceReport([
      { employeeCode: "1", employeeName: "Bopaiah", checkIn: "07:55:42", checkOut: null },
    ])
    const csv = attendanceReportToCsv(rows, "2026-08-04")
    expect(csv).toContain("Daily Attendance Report,2026-08-04")
    expect(csv).toContain("S.No,EmployeeCode,EmployeeName,InTime,OutTime,WorkDuration,Status")
    expect(csv).toContain("1,1,Bopaiah,07:55:42,00:00,00:00,P")
  })

  it("quotes names containing commas so columns cannot shift", () => {
    const rows = buildAttendanceReport([
      { employeeCode: "9", employeeName: "Rao, Sumant", checkIn: null, checkOut: null },
    ])
    expect(attendanceReportToCsv(rows, "2026-08-04")).toContain('"Rao, Sumant"')
  })
})

describe("report route: scoping guards", () => {
  const src = readFileSync(resolve(process.cwd(), "app/api/attendance/report/route.ts"), "utf8")

  it("keeps a worker who has a record for the date even after being deactivated", () => {
    // Filtering on active alone made past reports change retroactively. Verified against
    // production: "Shafeekul A" worked 2026-07-03, was later removed, and had silently vanished
    // from that day's report (20 rows vs 21 with the fix).
    expect(src).toContain("w.active = TRUE OR r.id IS NOT NULL")
  })

  it("applies the estate filter like every other attendance endpoint", () => {
    // Medappa Estates has two estates; without this the report listed workers from both
    // regardless of the header selection.
    expect(src).toContain("resolveActiveEstate")
    expect(src).toContain("SELECTED_ESTATE_COOKIE")
    expect(src).toContain("${estateClause}")
  })

  it("keeps the always-NULL-shows convention for unassigned workers", () => {
    expect(src).toContain("w.location_id IS NULL OR")
  })
})

describe("the report is reachable from the UI", () => {
  it("is linked from the attendance tab", () => {
    // It existed for days but only opened if you typed the URL, so in practice it did not exist.
    const tab = readFileSync(resolve(process.cwd(), "components/attendance-tab.tsx"), "utf8")
    expect(tab).toContain("/attendance-report?date=")
  })
})

describe("report tiles drill down", () => {
  const page = readFileSync(resolve(process.cwd(), "app/attendance-report/page.tsx"), "utf8")
  const tile = readFileSync(resolve(process.cwd(), "components/ui/stat-tile.tsx"), "utf8")

  it("filters the table rather than only counting", () => {
    // "24 absent" is a number; the useful action is "who?".
    expect(page).toContain("const visibleRows = rows.filter")
    expect(page).toContain("visibleRows.map((row)")
  })

  it("lets the active tile be tapped again to clear", () => {
    // Otherwise there is no way back to the full list without reloading.
    expect(page).toContain("cur === next ? \"all\" : next")
  })

  it("explains an empty bucket instead of rendering bare headers", () => {
    expect(page).toContain("No workers in this view")
  })

  it("shows terminal health so \"0 present\" is not ambiguous", () => {
    // Nobody turned up and the device stopped talking look identical without this.
    expect(page).toContain("Fingerprint terminals")
    expect(page).toContain("buffered on the device")
  })

  it("keeps StatTile non-interactive unless a handler is passed", () => {
    // Every other tab uses this component as a static tile; none should become focusable.
    expect(tile).toContain("if (!onClick)")
    expect(tile).toContain("aria-pressed")
  })
})

describe("CSV export matches the on-screen filter", () => {
  const page = readFileSync(resolve(process.cwd(), "app/attendance-report/page.tsx"), "utf8")

  it("exports the visible rows, not the whole day", () => {
    // Filtering to 24 absentees and downloading all 45 is a silent mismatch between what is on
    // screen and what gets acted on — the subset IS the point of the filter.
    expect(page).toContain("attendanceReportToCsv(visibleRows")
    expect(page).not.toContain("format=csv")
  })

  it("names the file after the active filter", () => {
    expect(page).toContain('filter === "all" ? "" : `-${filter}`')
  })

  it("disables the button when the current view is empty", () => {
    expect(page).toContain("disabled={!visibleRows.length}")
  })
})
