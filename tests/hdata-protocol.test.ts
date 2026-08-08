import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import {
  HDATA_ACK_HEADER,
  HDATA_ACK_VALUE,
  isValidHdataSerial,
  parseHdataDeviceInfo,
  parseHdataEnrollment,
  parseHdataEnvelope,
  parseHdataPunch,
  parseHdataTimestamp,
} from "../lib/hdata-protocol"

/**
 * Rebuild the wire format: [4-byte LE length][JSON][optional trailing binary].
 *
 * Allocates and copies rather than using Buffer.concat, whose @types/node signature wants
 * Uint8Array<ArrayBuffer> and rejects Buffer here. 0xab is arbitrary filler standing in for the
 * fingerprint template that follows the JSON on an enrolment push.
 */
const wire = (json: unknown, trailing = 0) => {
  const body = Buffer.from(JSON.stringify(json), "utf8")
  const out = Buffer.alloc(4 + body.length + trailing, 0xab)
  out.writeUInt32LE(body.length, 0)
  out.set(body, 4)
  return out
}

// Captured verbatim from serial AMDB25062800863 on 2026-08-04.
const REAL_PUNCH = {
  fk_bin_data_lib: "FKDataHS102",
  io_mode: 16777216,
  io_time: "20260804145302",
  log_image: null,
  user_id: "1",
  verify_mode: 268435456,
}

describe("hdata envelope", () => {
  it("extracts JSON from the framed body", () => {
    const { json, trailingBinaryBytes } = parseHdataEnvelope(wire(REAL_PUNCH))
    expect(json).toMatchObject({ user_id: "1", io_time: "20260804145302" })
    expect(trailingBinaryBytes).toBe(0)
  })

  it("reports trailing binary without letting it corrupt the JSON", () => {
    // The enrolment push appends a raw fingerprint template after the JSON.
    const { json, trailingBinaryBytes } = parseHdataEnvelope(wire({ user_id: "7" }, 900))
    expect(json).toMatchObject({ user_id: "7" })
    expect(trailingBinaryBytes).toBe(900)
  })

  it("never throws on junk, truncation or an empty body", () => {
    expect(parseHdataEnvelope(Buffer.alloc(0)).json).toBeNull()
    expect(parseHdataEnvelope(Buffer.from([0x01, 0x02, 0x03])).json).toBeNull()
    expect(parseHdataEnvelope(Buffer.from('\x88\x00\x00\x00{"user_id":', "binary")).json).toBeNull()
  })
})

describe("hdata timestamps", () => {
  it("parses the device's naive local wall-clock format", () => {
    expect(parseHdataTimestamp("20260804145302")).toEqual({
      rawDateTime: "2026-08-04 14:53:02",
      attendanceDate: "2026-08-04",
    })
  })

  it("rejects malformed or impossible clock values", () => {
    // A bad clock writes attendance to the wrong day, and the dedup index keys on the
    // timestamp — so a silently-accepted garbage value never self-corrects.
    for (const bad of ["", "2026080414530", "202608041453021", "abcdefghijklmn", "20261304145302", "20260832145302", "20260804255302", "20260229145302"]) {
      expect(parseHdataTimestamp(bad), `should reject ${bad}`).toBeNull()
    }
  })

  it("accepts a real leap day", () => {
    expect(parseHdataTimestamp("20280229145302")?.attendanceDate).toBe("2028-02-29")
  })
})

describe("hdata punch", () => {
  it("converts a real captured punch into the shared ParsedBiometricPunch shape", () => {
    // Matching the ADMS shape is what lets the existing dedup, worker mapping and attendance
    // roll-up be reused rather than reimplemented for this protocol.
    expect(parseHdataPunch(REAL_PUNCH)).toEqual({
      deviceUserCode: "1",
      rawDateTime: "2026-08-04 14:53:02",
      attendanceDate: "2026-08-04",
      status: "16777216",
      verify: "268435456",
    })
  })

  it("rejects a record with no user or no usable time", () => {
    expect(parseHdataPunch({ io_time: "20260804145302" })).toBeNull()
    expect(parseHdataPunch({ user_id: "1" })).toBeNull()
    expect(parseHdataPunch({ user_id: "", io_time: "20260804145302" })).toBeNull()
    expect(parseHdataPunch(null)).toBeNull()
  })

  it("carries the mode bitfields through as opaque values", () => {
    // Their meaning is not established; recording them costs nothing, and guessing at in/out
    // direction would invent semantics the device has not confirmed.
    const p = parseHdataPunch({ ...REAL_PUNCH, io_mode: 0, verify_mode: null })
    expect(p?.status).toBe("0")
    expect(p?.verify).toBeNull()
  })
})

describe("hdata enrolment and device info", () => {
  it("picks up the name typed on the keypad", () => {
    expect(parseHdataEnrollment({ user_id: "1", user_name: "Nikhil" })).toEqual({
      deviceUserCode: "1",
      userName: "Nikhil",
    })
  })

  it("tolerates an enrolment with no name", () => {
    expect(parseHdataEnrollment({ user_id: "9", user_name: "" })).toEqual({ deviceUserCode: "9", userName: null })
  })

  it("reads the receive_cmd device counters", () => {
    const info = parseHdataDeviceInfo({
      fk_info: { firmware: "A107A2Y2Kbio01bc v1.17", user_count: 1, fp_count: 1, all_log_count: 0 },
      fk_name: "fk_device",
      fk_time: "20260804145005",
    })
    expect(info).toMatchObject({
      firmware: "A107A2Y2Kbio01bc v1.17",
      userCount: 1,
      fingerprintCount: 1,
      pendingLogCount: 0,
      deviceTime: "2026-08-04 14:50:05",
    })
  })
})

describe("serial validation", () => {
  it("accepts the real serial and rejects injection-shaped input", () => {
    expect(isValidHdataSerial("AMDB25062800863")).toBe(true)
    expect(isValidHdataSerial("")).toBe(false)
    expect(isValidHdataSerial("a b")).toBe(false)
    expect(isValidHdataSerial("x".repeat(61))).toBe(false)
  })
})

describe("hdata route hardening", () => {
  const src = readFileSync(resolve(process.cwd(), "app/hdata.aspx/route.ts"), "utf8")

  it("acks with the header the device actually requires", () => {
    // Established empirically: one punch was re-sent 95 times against seven body-shaped acks.
    // Only `response_code: OK` as a HEADER stops the retries.
    expect(HDATA_ACK_HEADER).toBe("response_code")
    expect(HDATA_ACK_VALUE).toBe("OK")
    expect(src).toContain("HDATA_ACK_HEADER")
  })

  it("never acks an unrecognised device", () => {
    // Telling an unknown serial its upload succeeded would let it discard real punches.
    const reject = src.slice(src.indexOf("const rejectUnrecognizedDevice"), src.indexOf("export async function POST"))
    expect(reject).not.toContain("HDATA_ACK_VALUE")
    expect(reject).toContain("404")
  })

  it("does not run ingest under the RLS-bypassing owner role", () => {
    expect(src).not.toMatch(/["']owner["']/)
    expect(src).toContain("BIOMETRIC_DEVICE_ROLE")
  })

  it("rate-limits by IP and before reading the body", () => {
    expect(src).toContain("biometricIp")
    expect(src.indexOf('checkRateLimit("biometricIp"')).toBeLessThan(src.indexOf("await request.arrayBuffer()"))
  })

  it("bounds the security_events row written for an unknown serial", () => {
    expect(src).toContain("biometricUnknownSerial")
  })
})
