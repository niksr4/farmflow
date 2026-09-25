import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The device heartbeat does not pay four round trips to say nothing.
 *
 * THE MEASUREMENT THIS EXISTS FOR, from Sentry's weekly report for the week to 2026-09-12:
 *
 *   POST /hdata.aspx     p95 2,678 ms     total span time 5.4 HOURS
 *   biometric_punches    303 rows in those seven days, from two terminals
 *
 * 5.4 hours at that p95 is roughly seven thousand requests against three hundred real punches, so
 * about 96% were empty heartbeats — and each one made FOUR SEQUENTIAL calls to Neon in
 * ap-southeast-1 before doing any work at all: a per-IP rate check, a per-serial rate check, the
 * serial-to-tenant lookup, and a last_seen_at write. Sentry flagged the shape as "Consecutive
 * HTTP POST"; the uniform ~2 s p95 across /api/attendance, /punches, /devices and /unmapped-codes
 * is the same latency showing up wherever round trips are chained.
 *
 * Nothing here was failing. It is the busiest endpoint in the application spending its time on
 * questions whose answers had not changed.
 */

const ROOT = resolve(__dirname, "..")
const route = readFileSync(resolve(ROOT, "app/hdata.aspx/route.ts"), "utf8")
const lib = readFileSync(resolve(ROOT, "lib/server/biometric-attendance.ts"), "utf8")
const rateLimit = readFileSync(resolve(ROOT, "lib/rate-limit.ts"), "utf8")

describe("the gate is one round trip, and it is live every time", () => {
  it("settles both rate limits and the device lookup together", () => {
    const postAt = route.indexOf("export async function POST")
    const hot = route.slice(postAt, route.indexOf("if (!resolved)", postAt))
    expect(hot.length).toBeGreaterThan(200)
    expect(hot).toContain("resolveHeartbeatGate(")
    expect(hot).toMatch(/key: "biometricIp"/)
    expect(hot).toMatch(/key: "biometricPunch"/)
  })

  it("still refuses when EITHER bucket is over", () => {
    // The failure mode of a batch is checking one and forgetting the other. The per-IP ceiling is
    // load-bearing because the per-serial bucket is keyed on attacker-supplied input.
    expect(route).toMatch(/\[\.\.\.gate\.limits\.values\(\)\]\.some\(\(result\) => !result\.success\)/)
    expect(route).toContain("status: 429")
  })

  it("THERE IS NO CACHE in front of the device lookup", () => {
    /**
     * ⚠ THE HOLE THIS CLOSES, and I opened it. The first attempt at cutting the heartbeat's round
     * trips cached serial→tenant for 15 seconds. A cache hit skips the `active = TRUE` in the
     * query, nothing downstream re-checks it, and the device route toggles `active` on a PUT that
     * invalidated nothing — so a DEACTIVATED TERMINAL COULD KEEP WRITING ATTENDANCE until the
     * entry expired, on any warm instance that had cached it.
     *
     * Invalidating on the PUT would have narrowed it, not closed it: the cache is per-instance, so
     * other instances would have served the stale answer regardless. Batching gets the same
     * latency with the authorisation check live on every single request.
     *
     * A cache in front of an authorisation decision has to be justified against the worst case.
     * Raised by Greptile on PR #15, 2026-09-13.
     */
    expect(lib).not.toContain("deviceCache")
    expect(lib).not.toContain("DEVICE_CACHE_TTL_MS")
    const gate = lib.slice(lib.indexOf("export async function resolveHeartbeatGate"))
    expect(gate.slice(0, 1800), "the live query must still filter on active").toContain("AND active = TRUE")
  })

  it("keeps the counting and the limit comparison in lib/rate-limit.ts", () => {
    // Only the EXECUTION moved into the batch; a second copy of the window arithmetic living in
    // the biometric file is how the two would drift.
    expect(rateLimit).toContain("export function buildRateLimitBatch")
    const gate = lib.slice(lib.indexOf("export async function resolveHeartbeatGate"))
    expect(gate.slice(0, 1800)).toContain("rateLimit.interpret(")
    expect(gate.slice(0, 1800)).not.toMatch(/LIMITS\[/)
  })

  it("builds its VALUES list from placeholders, never from interpolated text", () => {
    /**
     * `identifier` is a device serial or client IP — attacker-supplied, and on this path NOT YET
     * VALIDATED, because rate limiting deliberately runs before validation. The first version
     * hand-escaped quotes into the SQL string. The escaping may even have been right; it is not a
     * thing to be right about by hand.
     */
    const fn = rateLimit.slice(rateLimit.indexOf("export function buildRateLimitBatch"))
    const body = fn.slice(0, fn.indexOf("export async function checkRateLimit("))
    expect(body).toMatch(/params\.push\(r\.dbKey, r\.windowStart, r\.windowMs\)/)
    expect(body, "hand-escaped quotes are back").not.toMatch(/replace\(\/'\/g/)
  })

  it("falls back to a plain lookup if the batch itself fails", () => {
    // A database hiccup must not refuse a real terminal. Rate limiting fails open here exactly as
    // it did before the batch.
    expect(route).toMatch(/const resolved = gate\s*\n?\s*\? gate\.device/)
    expect(route).toContain("resolveTenantByDeviceSerial(accountsSql, serialNumber)")
  })
})

describe("last_seen_at does not hold up the response", () => {
  it("RETURNS the promise to after(), rather than discarding it", () => {
    /**
     * `after(() => { void p })` reports itself finished the instant the request starts, so the
     * instance can freeze before the write lands — which is precisely the failure after() exists
     * to prevent, reintroduced by a stray `void`. Raised by Greptile on PR #15.
     */
    expect(route).toMatch(/after\(\(\) => touchDeviceLastSeen\(/)
    expect(route).not.toMatch(/after\(\(\) => \{\s*void touchDeviceLastSeen/)
  })

  it("uses after(), not a floating promise", () => {
    expect(route).toContain('import { after } from "next/server"')
  })

  it("still swallows its own failure, because a cosmetic write must not fail a punch", () => {
    const block = route.slice(route.indexOf("after(() => touchDeviceLastSeen"))
    expect(block.slice(0, 200)).toContain("catch(() => undefined)")
  })
})

describe("the monthly grid never exports a month it is not showing", () => {
  const monthlyGrid = readFileSync(resolve(ROOT, "components/attendance-monthly-grid.tsx"), "utf8")

  it("an aborted request does not clear the loading flag", () => {
    /**
     * ⚠ THE WINDOW A COMMENT OF MINE DENIED EXISTED. The catch returns early for an AbortError but
     * `finally` still runs, so changing month twice quickly went: request A aborted → finally sets
     * loading false → request B still in flight → month A's grid under month B's heading, every
     * control enabled. Printing there produces a correct-looking sheet for the wrong month.
     *
     * A superseded request has nothing to say about whether the screen is still loading.
     */
    expect(monthlyGrid).toMatch(/if \(!signal\?\.aborted\) setLoading\(false\)/)
  })

  it("tracks which month the rows belong to", () => {
    expect(monthlyGrid).toContain("loadedMonth")
    expect(monthlyGrid).toMatch(/const showsPickedMonth = rows\.length > 0 && loadedMonth === month && !loading/)
  })

  it("gates BOTH the workbook and the print button on it", () => {
    // Either one produces a document; both have to describe the heading above them.
    expect((monthlyGrid.match(/disabled=\{!showsPickedMonth/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })
})

describe("every attendance report exports a formatted workbook, not just a CSV", () => {
  /**
   * lib/spreadsheet.ts has produced bordered, frozen-header, bolded-total workbooks for four other
   * tabs for months. The attendance reports — the sheets an estate office actually prints and
   * files — were the ones still handing out raw comma-separated text.
   *
   * All three now offer Excel. Each builds FROM the rows it already shows rather than assembling a
   * second time, because two builders drift and the one that drifts unnoticed is always the file
   * somebody filed.
   */
  const daily = readFileSync(resolve(ROOT, "app/attendance-report/page.tsx"), "utf8")
  const monthly = readFileSync(resolve(ROOT, "components/attendance-monthly-grid.tsx"), "utf8")

  it("the daily sheet builds one", () => {
    expect(daily).toContain("buildXlsxArrayBufferFromCsv")
    expect(daily).toContain("XLSX_MIME_TYPE")
  })

  it("and builds it from the VISIBLE rows, like the CSV beside it", () => {
    /**
     * The server's csv format returns the whole roster. The screen shows whatever the filter
     * selected — 24 absentees out of 45 — and the subset is the thing somebody acts on. An export
     * that quietly widened back to everyone would be a different document with the same name.
     */
    const block = daily.slice(daily.indexOf("Download Excel") - 1800, daily.indexOf("Download Excel"))
    expect(block).toContain("attendanceReportToCsv(visibleRows")
    expect(block).not.toContain("format=csv")
  })

  it("the monthly grid builds one", () => {
    expect(monthly).toContain("buildXlsxArrayBufferFromCsv")
    expect(monthly).toMatch(/attendance-\$\{month\}\.xlsx/)
  })

  it("and a failed workbook does not blank the grid", () => {
    // The CSV button next to it still works; an export is not worth losing the screen over.
    const fn = monthly.slice(monthly.indexOf("const downloadXlsx"))
    expect(fn.slice(0, 1400)).toMatch(/catch \{/)
  })

  it("offers Print / PDF rather than shipping a PDF renderer", () => {
    /**
     * The browser's print dialogue saves to PDF on every platform these estates use, honours the
     * print stylesheet, and needs no headless browser on the server. Adding one to produce a file
     * the browser already produces would be a great deal of machinery for a worse result.
     *
     * The yearly summary carries the same button; it is asserted on its own branch rather than
     * here, because this branch is cut from main and that file has not landed yet. Asserting on
     * code that is not present would fail for a reason that has nothing to do with this change.
     */
    expect(monthly).toContain("window.print()")
  })
})
