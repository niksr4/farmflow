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

describe("the two rate limits share one round trip", () => {
  it("the hot path batches them", () => {
    // From the POST handler to the serial validation — the work every heartbeat pays for before
    // anything is known about it. Anchored on the function, not on a name that also appears in the
    // import block, which is what made the first version of this slice empty and vacuously green.
    const postAt = route.indexOf("export async function POST")
    const hot = route.slice(postAt, route.indexOf("if (!isValidHdataSerial", postAt))
    expect(hot.length).toBeGreaterThan(200)
    expect(hot).toContain("checkRateLimits([")
    expect(hot).toMatch(/key: "biometricIp"/)
    expect(hot).toMatch(/key: "biometricPunch"/)
  })

  it("and still refuses when EITHER bucket is over", () => {
    /**
     * The failure mode of a batch is checking one and forgetting the other. The per-IP ceiling is
     * load-bearing precisely because the per-serial bucket is keyed on attacker-supplied input —
     * rotating the serial mints a fresh bucket every request, so per-serial limiting alone bounds
     * nothing.
     */
    expect(route).toMatch(/\[\.\.\.limits\.values\(\)\]\.some\(\(result\) => !result\.success\)/)
    expect(route).toContain("status: 429")
  })

  it("builds its VALUES list from placeholders, never from interpolated text", () => {
    /**
     * `identifier` is a device serial or a client IP — attacker-supplied, and on this path the
     * serial has NOT been validated yet, because rate limiting deliberately runs before validation.
     * The first version of this function hand-escaped quotes into the SQL string. The escaping may
     * even have been correct; it is not a thing to be correct about by hand.
     */
    const fn = rateLimit.slice(rateLimit.indexOf("export async function checkRateLimits"))
    const body = fn.slice(0, fn.indexOf("export async function checkRateLimit("))
    expect(body).toMatch(/params\.push\(r\.dbKey, r\.windowStart, r\.windowMs\)/)
    expect(body).toMatch(/\$\$\{params\.length - 2\}|\$\$\{params\.length/)
    expect(body, "hand-escaped quotes are back").not.toMatch(/replace\(\/'\/g/)
  })

  it("fails closed for a sensitive bucket, exactly as the single-key path does", () => {
    // Auth buckets must not silently fail open. A batch cannot tell the caller which bucket broke,
    // so if any of them is sensitive the strictest rule has to win.
    const fn = rateLimit.slice(rateLimit.indexOf("export async function checkRateLimits"))
    expect(fn.slice(0, 4000)).toContain("isSensitiveRateLimitKey")
    expect(fn.slice(0, 4000)).toContain("RateLimitUnavailableError")
  })
})

describe("the serial lookup is cached, briefly", () => {
  it("caches a hit", () => {
    expect(lib).toContain("deviceCache")
    expect(lib).toMatch(/expiresAt: Date\.now\(\) \+ DEVICE_CACHE_TTL_MS/)
  })

  it("NEVER caches a miss", () => {
    /**
     * An unknown serial must keep being asked about. Caching the absence means a device registered
     * a moment ago is refused until the entry expires — a setup step that appears to fail, then
     * works if you wait, which is the worst kind of intermittent.
     */
    const fn = lib.slice(lib.indexOf("async function resolveTenantByDeviceSerialUncached"))
    const body = fn.slice(0, fn.indexOf("export async function touchDeviceLastSeen"))
    const nullReturn = body.indexOf("if (!rows.length) return null")
    expect(nullReturn).toBeGreaterThan(-1)
    // The only deviceCache.set in this function comes AFTER the null return.
    expect(body.indexOf("deviceCache.set")).toBeGreaterThan(nullReturn)
  })

  it("keeps the window to seconds, because it gates which tenant a device may write to", () => {
    /**
     * This is an authorisation decision, not a data read. A stale entry means a deactivated device
     * keeps writing for the length of the TTL, so the number is deliberately small — and there is
     * an explicit way to drop an entry when a device changes.
     */
    const ttl = Number(lib.match(/const DEVICE_CACHE_TTL_MS = ([\d_]+)/)?.[1]?.replace(/_/g, ""))
    expect(ttl).toBeGreaterThan(0)
    expect(ttl, "a cache in front of an authorisation check must expire in seconds").toBeLessThanOrEqual(30_000)
    expect(lib).toContain("export function forgetDeviceSerial")
  })
})

describe("last_seen_at does not hold up the response", () => {
  it("runs after the response rather than before it", () => {
    expect(route).toMatch(/after\(\(\) => \{[\s\S]{0,120}touchDeviceLastSeen/)
  })

  it("uses after(), not a floating promise", () => {
    /**
     * A serverless function can freeze the instant it responds, so an un-awaited write is not
     * merely late — it may never run at all, and "device last seen" would quietly stop updating.
     * after() is the platform's contract for finishing work before the freeze.
     */
    expect(route).toContain('import { after } from "next/server"')
  })

  it("still swallows its own failure, because a cosmetic write must not fail a punch", () => {
    const block = route.slice(route.indexOf("after(() => {"))
    expect(block.slice(0, 300)).toContain("catch(() => undefined)")
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
