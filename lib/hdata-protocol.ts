/**
 * "hdata" push protocol — BioMax N-WL20 and related OEM terminals.
 *
 * This is NOT ZKTeco ADMS. There is no /iclock, no ATTLOG, no tab-separated body. The protocol
 * is undocumented; everything here was reverse-engineered from a live device on 2026-08-04
 * (serial AMDB25062800863, firmware A107A2Y2Kbio01bc v1.17) and nothing public describes it, so
 * the observed shapes are recorded in the comments rather than cited.
 *
 *   POST /hdata.aspx
 *   headers: dev_id (= serial), request_code, cmd_id, blk_no, blk_len
 *   body:    [4-byte little-endian length][JSON][optional trailing binary]
 *
 * Pure parsing only — no DB access — so the whole protocol is unit-testable without a device.
 * The DB side deliberately reuses lib/server/biometric-attendance.ts: a punch is converted into
 * the same ParsedBiometricPunch the ADMS path produces, so dedup, worker mapping and the
 * attendance roll-up are shared rather than reimplemented.
 */

import type { ParsedBiometricPunch } from "@/lib/biometric-attendance"

/** Path is fixed by device firmware and is not configurable on the terminal. */
export const HDATA_PATH = "/hdata.aspx"

/**
 * The acknowledgement.
 *
 * Established empirically, and it is the single most important fact in this file: the device
 * re-sent one punch 95 times and one enrolment 174 times against every body-shaped ack tried
 * (plain "OK", bare JSON, framed JSON, empty 200 — seven variants). Retries stopped only when
 * `response_code: OK` was returned as an HTTP HEADER, which fits a protocol that carries all of
 * its metadata in headers. A numeric "0" in that header does NOT work — it wants the literal
 * string. Get this wrong and the device never clears its buffer and re-uploads forever.
 */
export const HDATA_ACK_HEADER = "response_code"
export const HDATA_ACK_VALUE = "OK"

export const HDATA_REQUEST_CODES = {
  /** Idle poll, roughly every 20s. Body carries fk_info device counters. */
  receiveCmd: "receive_cmd",
  /** A punch. The only request_code that produces attendance. */
  realtimeGlog: "realtime_glog",
  /** A user was enrolled on the device. JSON, then the fingerprint template as binary. */
  realtimeEnroll: "realtime_enroll_data",
} as const

/** Device clock is naive local wall-clock, exactly like the ADMS TIME field. India-only today. */
export const HDATA_DEVICE_TIMEZONE = "Asia/Kolkata"

/** Generous ceiling for one push; the enrolment template is ~1KB, a punch ~140 bytes. */
export const MAX_HDATA_BODY_BYTES = 256 * 1024

const SERIAL_PATTERN = /^[A-Za-z0-9_-]{1,60}$/
export const isValidHdataSerial = (value: unknown): value is string => SERIAL_PATTERN.test(String(value ?? ""))

export type HdataEnvelope = {
  /** Parsed JSON payload, or null when the body carried none. */
  json: Record<string, unknown> | null
  /** Bytes after the JSON — the fingerprint template on enrolment. */
  trailingBinaryBytes: number
}

/**
 * Split the wire format into JSON and trailing binary.
 *
 * Locates the JSON by brace rather than trusting the 4-byte length prefix: the prefix has been
 * observed to describe the payload *after* it (0x88 = 136 on a 140-byte body), but a malformed
 * or truncated push would then send us reading past the end. Scanning for the object is
 * self-limiting and cannot run off the buffer.
 */
export function parseHdataEnvelope(body: Buffer): HdataEnvelope {
  if (!body || body.length === 0) return { json: null, trailingBinaryBytes: 0 }

  const start = body.indexOf(0x7b) // '{'
  const end = body.lastIndexOf(0x7d) // '}'
  if (start < 0 || end <= start) return { json: null, trailingBinaryBytes: 0 }

  let json: Record<string, unknown> | null = null
  try {
    const parsed = JSON.parse(body.subarray(start, end + 1).toString("utf8"))
    json = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    json = null
  }

  return { json, trailingBinaryBytes: Math.max(0, body.length - (end + 1)) }
}

/**
 * "20260804145302" -> { rawDateTime: "2026-08-04 14:53:02", attendanceDate: "2026-08-04" }
 *
 * Rejects anything that is not 14 digits or does not describe a real calendar time. A bad clock
 * writes attendance to the wrong day and the dedup index keys on the timestamp, so a silently
 * accepted garbage value is not self-correcting later.
 */
export function parseHdataTimestamp(value: unknown): { rawDateTime: string; attendanceDate: string } | null {
  const raw = String(value ?? "").trim()
  if (!/^\d{14}$/.test(raw)) return null

  const year = Number(raw.slice(0, 4))
  const month = Number(raw.slice(4, 6))
  const day = Number(raw.slice(6, 8))
  const hour = Number(raw.slice(8, 10))
  const minute = Number(raw.slice(10, 12))
  const second = Number(raw.slice(12, 14))

  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  if (hour > 23 || minute > 59 || second > 59) return null
  // Catches 31 February and friends: round-tripping through UTC keeps the components stable only
  // for a real date.
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null

  const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  return { rawDateTime: `${date} ${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}`, attendanceDate: date }
}

/**
 * Convert a realtime_glog payload into the same shape the ADMS path yields, so the existing
 * ingest (dedup index, worker mapping, attendance upsert) is reused rather than duplicated.
 *
 * Observed payload:
 *   {"user_id":"1","io_time":"20260804145302","io_mode":16777216,"verify_mode":268435456}
 *
 * io_mode/verify_mode are bitfield-looking values (0x01000000 / 0x10000000) whose meaning is not
 * established. They are carried through as opaque strings into raw_status/raw_verify rather than
 * interpreted — recording them costs nothing and guessing at in/out direction would be inventing
 * semantics the device has not confirmed.
 */
export function parseHdataPunch(json: Record<string, unknown> | null): ParsedBiometricPunch | null {
  if (!json) return null

  const deviceUserCode = String(json.user_id ?? "").trim()
  if (!deviceUserCode) return null

  const time = parseHdataTimestamp(json.io_time)
  if (!time) return null

  const asOptionalString = (value: unknown) =>
    value === null || value === undefined || value === "" ? null : String(value)

  return {
    deviceUserCode,
    rawDateTime: time.rawDateTime,
    attendanceDate: time.attendanceDate,
    status: asOptionalString(json.io_mode),
    verify: asOptionalString(json.verify_mode),
  }
}

export type HdataEnrollment = {
  deviceUserCode: string
  userName: string | null
}

/**
 * realtime_enroll_data carries the name typed on the keypad, which is the only place the device
 * ever tells us what a code is called. Worth surfacing: it turns an unmapped numeric code in the
 * mapping UI into "17 — Lakshmi" instead of just "17".
 */
export function parseHdataEnrollment(json: Record<string, unknown> | null): HdataEnrollment | null {
  if (!json) return null
  const deviceUserCode = String(json.user_id ?? "").trim()
  if (!deviceUserCode) return null
  const name = String(json.user_name ?? "").trim()
  return { deviceUserCode, userName: name || null }
}

export type HdataDeviceInfo = {
  firmware: string | null
  userCount: number | null
  fingerprintCount: number | null
  pendingLogCount: number | null
  deviceTime: string | null
}

/** receive_cmd body: { fk_info: {...}, fk_name, fk_time }. Useful for a device health panel. */
export function parseHdataDeviceInfo(json: Record<string, unknown> | null): HdataDeviceInfo | null {
  if (!json) return null
  const info = (json.fk_info ?? null) as Record<string, unknown> | null
  if (!info || typeof info !== "object") return null

  const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : null)
  const time = parseHdataTimestamp(json.fk_time)

  return {
    firmware: info.firmware ? String(info.firmware) : null,
    userCount: num(info.user_count),
    fingerprintCount: num(info.fp_count),
    pendingLogCount: num(info.all_log_count),
    deviceTime: time ? time.rawDateTime : null,
  }
}
