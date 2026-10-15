import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

describe("attendance worker routes refuse input they would otherwise silently drop", () => {
  const edit = read("app/api/attendance/workers/[id]/route.ts")
  const create = read("app/api/attendance/workers/route.ts")
  const report = read("app/api/attendance/report/route.ts")

  it("PUT answers 400 for an unrecognised worker type instead of wiping the stored one", () => {
    expect(edit).toContain("That worker type is not recognised")
    expect(edit).toMatch(/rawWorkerType !== ""\s*&&\s*!isWorkerType\(rawWorkerType\)/)
  })

  it("PUT answers 400 for an unrecognised gender instead of saving nothing", () => {
    expect(edit).toContain("Gender must be female, male or other")
  })

  it("POST refuses a negative daily rate, as PUT already does", () => {
    expect(create).toMatch(/dailyRate !== null && dailyRate < 0/)
  })

  it("the daily report never ends up with a blank report date", () => {
    expect(report).toContain("rows[0]?.report_date || requested || todayIso()")
  })
})
