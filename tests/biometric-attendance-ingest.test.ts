import { beforeEach, describe, expect, it, vi } from "vitest"

// The ingest path is a DB wrapper, so these tests assert the *shape* of what it asks Postgres to
// do rather than the results: how many statements it emits for a given batch, and that dates make
// the round trip as text. Both are regressions that only surface at scale or across a timezone,
// which is exactly when nobody is watching an attendance terminal.

const runTenantQuery = vi.fn()
const runTenantQueries = vi.fn()

vi.mock("@/lib/server/tenant-db", () => ({
  normalizeTenantContext: (tenantId: string | undefined, role: string) => ({ tenantId: tenantId ?? "", role }),
  runTenantQuery: (...args: unknown[]) => runTenantQuery(...args),
  runTenantQueries: (...args: unknown[]) => runTenantQueries(...args),
}))

// Static import is safe here: vitest hoists vi.mock above the import graph.
import { recordPunchesAndUpsertAttendance, reconcileUnmappedPunches } from "@/lib/server/biometric-attendance"

// Stand-in for the Neon tagged-template client: records the SQL text and interpolated values.
type CapturedQuery = { text: string; values: unknown[] }
const sql = ((strings: TemplateStringsArray, ...values: unknown[]): CapturedQuery => ({
  text: strings.join(" ? "),
  values,
})) as any

const tenantContext = { tenantId: "tenant-1", role: "owner" }

const punch = (code: string, rawDateTime: string) => ({
  deviceUserCode: code,
  rawDateTime,
  attendanceDate: rawDateTime.slice(0, 10),
  status: "0",
  verify: "1",
})

beforeEach(() => {
  runTenantQuery.mockReset()
  runTenantQueries.mockReset()
  runTenantQuery.mockResolvedValue([])
  runTenantQueries.mockResolvedValue([])
})

describe("recordPunchesAndUpsertAttendance", () => {
  it("emits the same two statements whether the batch holds 1 punch or 500", async () => {
    await recordPunchesAndUpsertAttendance(sql, tenantContext, "device-1", "SN1", [
      punch("1", "2026-07-22 08:00:00"),
    ])
    const smallBatch = runTenantQueries.mock.calls[0][2] as CapturedQuery[]

    runTenantQueries.mockClear()

    const many = Array.from({ length: 500 }, (_, i) =>
      punch(String(i), `2026-07-22 ${String(8 + (i % 10)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00`),
    )
    await recordPunchesAndUpsertAttendance(sql, tenantContext, "device-1", "SN1", many)
    const largeBatch = runTenantQueries.mock.calls[0][2] as CapturedQuery[]

    // The pre-fix shape was two statements per punch, shipped as one Neon HTTP transaction —
    // 1000 statements here, which times the function out and makes the device retry forever.
    expect(smallBatch).toHaveLength(2)
    expect(largeBatch).toHaveLength(2)
  })

  it("passes punches as arrays so batch size does not change the statement text", async () => {
    const many = Array.from({ length: 50 }, (_, i) => punch(String(i), `2026-07-22 08:${String(i % 60).padStart(2, "0")}:00`))
    await recordPunchesAndUpsertAttendance(sql, tenantContext, "device-1", "SN1", many)

    const [punchInsert] = runTenantQueries.mock.calls[0][2] as CapturedQuery[]
    expect(punchInsert.text).toContain("unnest")
    expect(punchInsert.values.some((value) => Array.isArray(value) && value.length === 50)).toBe(true)
  })

  it("groups by worker and date so one worker punching twice cannot hit ON CONFLICT twice", async () => {
    await recordPunchesAndUpsertAttendance(sql, tenantContext, "device-1", "SN1", [
      punch("7", "2026-07-22 08:00:00"),
      punch("7", "2026-07-22 17:30:00"),
    ])

    const [, attendanceUpsert] = runTenantQueries.mock.calls[0][2] as CapturedQuery[]
    // Without GROUP BY, Postgres rejects the whole batch with "ON CONFLICT DO UPDATE command
    // cannot affect row a second time" — i.e. a normal in/out day would fail to record at all.
    expect(attendanceUpsert.text).toContain("GROUP BY")
    expect(attendanceUpsert.text).toContain("MIN(")
    expect(attendanceUpsert.text).toContain("MAX(")
  })

  it("collapses exact duplicate punches inside a single push", async () => {
    const result = await recordPunchesAndUpsertAttendance(sql, tenantContext, "device-1", "SN1", [
      punch("1", "2026-07-22 08:00:00"),
      punch("1", "2026-07-22 08:00:00"),
      punch("2", "2026-07-22 08:01:00"),
    ])

    expect(result.recorded + result.unmapped).toBe(2)
  })

  it("does not touch the database for an empty batch", async () => {
    const result = await recordPunchesAndUpsertAttendance(sql, tenantContext, "device-1", "SN1", [])
    expect(runTenantQueries).not.toHaveBeenCalled()
    expect(result).toEqual({ recorded: 0, unmapped: 0 })
  })
})

describe("reconcileUnmappedPunches", () => {
  it("reads attendance_date back as text, not as a JS Date", async () => {
    runTenantQuery.mockResolvedValueOnce([{ attendance_date: "2026-07-22" }])

    await reconcileUnmappedPunches(sql, tenantContext, "42", "worker-1")

    const update = runTenantQuery.mock.calls[0][2] as CapturedQuery
    // Neon returns bare `date` columns as JS Date objects, so String(row.attendance_date) would
    // yield "Mon Jul 27 2026 00:00:00 GMT+0530 (India Standard Time)" and get fed straight back
    // into the next query as a date literal.
    expect(update.text).toContain("attendance_date::text")
  })

  it("backfills every affected date in one statement", async () => {
    const dates = Array.from({ length: 120 }, (_, i) => ({
      attendance_date: `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, "0")}`,
    }))
    runTenantQuery.mockResolvedValueOnce(dates)

    await reconcileUnmappedPunches(sql, tenantContext, "42", "worker-1")

    // One UPDATE to claim the punches, then exactly one INSERT covering all dates.
    expect(runTenantQuery).toHaveBeenCalledTimes(2)
    const backfill = runTenantQuery.mock.calls[1][2] as CapturedQuery
    expect(backfill.text).toContain("GROUP BY")
    expect(backfill.values.some((value) => Array.isArray(value))).toBe(true)
  })

  it("stops early when the code had no unmapped punches", async () => {
    runTenantQuery.mockResolvedValueOnce([])
    await reconcileUnmappedPunches(sql, tenantContext, "42", "worker-1")
    expect(runTenantQuery).toHaveBeenCalledTimes(1)
  })
})
