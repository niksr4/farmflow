import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import {
  ATTENDANCE_SCHEMA_ERROR_HELP,
  isValidSerialNumber,
  normalizeBiometricSchemaError,
  normalizeSerialNumber,
  parseAttlogBody,
} from "../lib/biometric-attendance"

describe("parseAttlogBody", () => {
  it("parses standard tab-separated ATTLOG lines", () => {
    const body = "1\t2026-07-22 07:55:42\t0\t1\n2\t2026-07-22 16:49:27\t1\t1"
    const punches = parseAttlogBody(body)
    expect(punches).toHaveLength(2)
    expect(punches[0]).toEqual({
      deviceUserCode: "1",
      rawDateTime: "2026-07-22 07:55:42",
      attendanceDate: "2026-07-22",
      status: "0",
      verify: "1",
    })
    expect(punches[1].deviceUserCode).toBe("2")
  })

  it("derives the attendance date as the local calendar date with no timezone shift", () => {
    const punches = parseAttlogBody("42\t2026-07-22 23:58:10\t0\t1")
    expect(punches[0].attendanceDate).toBe("2026-07-22")
  })

  it("tolerates CRLF line endings and blank lines between records", () => {
    const body = "1\t2026-07-22 08:00:00\t0\t1\r\n\r\n2\t2026-07-22 08:05:00\t0\t1\r\n"
    const punches = parseAttlogBody(body)
    expect(punches).toHaveLength(2)
  })

  it("skips malformed or short lines instead of throwing", () => {
    const body = "garbage line with no time\n1\t2026-07-22 08:00:00\t0\t1\n\t\t\t"
    const punches = parseAttlogBody(body)
    expect(punches).toHaveLength(1)
    expect(punches[0].deviceUserCode).toBe("1")
  })

  it("falls back to whitespace parsing for non-tab-delimited lines", () => {
    const punches = parseAttlogBody("7 2026-07-22 09:15:30 0 1")
    expect(punches).toHaveLength(1)
    expect(punches[0]).toMatchObject({
      deviceUserCode: "7",
      attendanceDate: "2026-07-22",
      status: "0",
      verify: "1",
    })
  })

  it("returns an empty array for empty input", () => {
    expect(parseAttlogBody("")).toEqual([])
    expect(parseAttlogBody("   \n  \n")).toEqual([])
  })
})

describe("isValidSerialNumber", () => {
  it("accepts alphanumeric serials with hyphens/underscores", () => {
    expect(isValidSerialNumber("ABC123")).toBe(true)
    expect(isValidSerialNumber("essl-F22_001")).toBe(true)
  })

  it("rejects empty, oversized, or invalid-character serials", () => {
    expect(isValidSerialNumber("")).toBe(false)
    expect(isValidSerialNumber(" ")).toBe(false)
    expect(isValidSerialNumber("a".repeat(61))).toBe(false)
    expect(isValidSerialNumber("has spaces")).toBe(false)
    expect(isValidSerialNumber(undefined)).toBe(false)
  })
})

describe("normalizeSerialNumber", () => {
  it("trims whitespace and stringifies", () => {
    expect(normalizeSerialNumber("  ABC123  ")).toBe("ABC123")
    expect(normalizeSerialNumber(null)).toBe("")
    expect(normalizeSerialNumber(undefined)).toBe("")
  })
})

describe("normalizeBiometricSchemaError", () => {
  it("maps missing-relation errors to the schema help message", () => {
    const normalized = normalizeBiometricSchemaError(new Error('relation "biometric_devices" does not exist'))
    expect(normalized.message).toBe(ATTENDANCE_SCHEMA_ERROR_HELP)
  })

  it("passes through other errors unchanged", () => {
    const original = new Error("something else broke")
    expect(normalizeBiometricSchemaError(original)).toBe(original)
  })
})

describe("/iclock public surface hardening", () => {
  const routes = [
    "app/iclock/cdata/route.ts",
    "app/iclock/getrequest/route.ts",
    "app/iclock/devicecmd/route.ts",
  ]
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8")

  it("never runs ingest under the RLS-bypassing owner role", () => {
    // The policy in scripts/98 is `app.role = 'owner' OR tenant_id = app.tenant_id`, so "owner"
    // switches tenant isolation off entirely. These are unauthenticated, internet-facing routes
    // whose only credential is a guessable serial number; the hand-written tenant_id filters
    // must have the policy behind them, not instead of them. Cross-tenant serial lookup is the
    // sole exception and lives in lib/server/biometric-attendance.ts, not here.
    for (const route of routes) {
      expect(read(route), `${route} must not set app.role to owner`).not.toMatch(/["']owner["']/)
    }
  })

  it("rate-limits by client IP, not only by the attacker-supplied serial", () => {
    // Per-serial buckets are keyed on request input: rotate the serial, get a fresh bucket.
    for (const route of routes) {
      expect(read(route), `${route} must consult the per-IP bucket`).toContain("biometricIp")
    }
  })

  it("checks rate limits before reading the request body on the ingest path", () => {
    // request.text() buffers up to MAX_ADMS_BODY_BYTES (256KB). Doing that before the limit
    // check meant the expensive half of the work happened even for callers about to get a 429.
    const src = read("app/iclock/cdata/route.ts")
    const firstLimit = src.indexOf('checkRateLimit("biometricIp"', src.indexOf("export async function POST"))
    const bodyRead = src.indexOf("await request.text()")
    expect(firstLimit).toBeGreaterThan(-1)
    expect(bodyRead).toBeGreaterThan(-1)
    expect(firstLimit).toBeLessThan(bodyRead)
  })

  it("bounds the security_events row written for an unrecognised serial", () => {
    // One unbounded write per rejection is an unauthenticated write primitive when serials are
    // enumerable. The log must sit behind the unknown-serial bucket.
    for (const route of ["app/iclock/cdata/route.ts", "app/iclock/getrequest/route.ts"]) {
      const src = read(route)
      expect(src).toContain("biometricUnknownSerial")
      const gate = src.indexOf('checkRateLimit("biometricUnknownSerial"')
      const log = src.indexOf("logSecurityEvent")
      expect(gate).toBeLessThan(src.indexOf("logSecurityEvent", gate))
      expect(log).toBeGreaterThan(-1)
    }
  })
})
