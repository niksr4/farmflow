// ADMS (Automatic Data Master Server) protocol helpers — the push protocol implemented
// by ZKTeco and most Indian OEM clone WiFi biometric terminals (eSSL, Realtime, etc.).
// Pure parsing/validation only; DB-touching logic lives in lib/server/biometric-attendance.ts.

export const ATTENDANCE_SCHEMA_ERROR_HELP = "Biometric attendance schema missing. Run scripts/106-biometric-attendance.sql."

// ADMS's TIME field is naive local wall-clock (no timezone marker). The device clock is set to
// farm-local time, so the date substring is already the correct calendar date — no conversion
// needed there. This constant is only used to convert the full datetime into a TIMESTAMPTZ.
// FarmFlow is India-only today; make this per-tenant if that ever changes.
export const BIOMETRIC_DEVICE_TIMEZONE = "Asia/Kolkata"

// Heartbeats (GET /iclock/getrequest) arrive roughly every 30s while a device is online —
// 5 minutes of silence is a safe "genuinely offline" threshold for dashboard/UI badges.
export const HEARTBEAT_STALE_AFTER_MS = 5 * 60_000

// Devices that never receive the literal "OK" back will retry indefinitely, so every ADMS
// response must be this exact plain-text body.
export const ADMS_OK_RESPONSE = "OK"

/**
 * The app.role GUC used for ingest once a device's serial has resolved to a tenant.
 *
 * Deliberately NOT "owner". The RLS policy in scripts/98 reads
 * `current_setting('app.role') = 'owner' OR tenant_id = current_setting('app.tenant_id')`,
 * so "owner" disables row-level security outright. Ingest ran that way originally, which meant
 * the only thing keeping an unauthenticated, internet-facing endpoint inside one tenant was a
 * hand-written `tenant_id = ...` on every statement. Those filters are all present and correct,
 * but with the policy bypassed there is no backstop the day one is forgotten.
 *
 * Any non-"owner" value re-arms the policy; "device" is just the honest label. Resolving the
 * serial itself still needs owner, because that lookup is cross-tenant by definition — see
 * resolveTenantByDeviceSerial in lib/server/biometric-attendance.ts.
 */
export const BIOMETRIC_DEVICE_ROLE = "device"

// Generous cap for a single ATTLOG push (a batch of buffered punches after downtime).
export const MAX_ADMS_BODY_BYTES = 256 * 1024

const SERIAL_NUMBER_PATTERN = /^[A-Za-z0-9_-]{1,60}$/

export const isValidSerialNumber = (value: unknown): value is string => SERIAL_NUMBER_PATTERN.test(String(value ?? ""))

export const normalizeSerialNumber = (value: unknown) => String(value ?? "").trim()

export const isMissingBiometricSchemaError = (error: unknown) => {
  const message = String((error as Error)?.message || error || "")
  return message.includes('relation "biometric_devices"') || message.includes('relation "biometric_punches"')
}

export const normalizeBiometricSchemaError = (error: unknown) => {
  if (isMissingBiometricSchemaError(error)) {
    return new Error(ATTENDANCE_SCHEMA_ERROR_HELP)
  }
  if (error instanceof Error) return error
  return new Error(String(error || "Biometric attendance request failed"))
}

export type ParsedBiometricPunch = {
  deviceUserCode: string
  rawDateTime: string
  attendanceDate: string
  status: string | null
  verify: string | null
}

const extractAttendanceDate = (rawDateTime: string): string | null => {
  const match = rawDateTime.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

const parseAttlogLine = (line: string): ParsedBiometricPunch | null => {
  const trimmed = line.trim()
  if (!trimmed) return null

  // Standard ADMS ATTLOG format: tab-separated PIN, TIME ("YYYY-MM-DD HH:MM:SS"), STATUS, VERIFY, ...
  const tabFields = trimmed
    .split("\t")
    .map((field) => field.trim())
    .filter((field) => field.length > 0)

  if (tabFields.length >= 2) {
    const [deviceUserCode, rawDateTime, status, verify] = tabFields
    const attendanceDate = extractAttendanceDate(rawDateTime)
    if (!deviceUserCode || !attendanceDate) return null
    return { deviceUserCode, rawDateTime, attendanceDate, status: status || null, verify: verify || null }
  }

  // Defensive fallback for malformed/space-delimited lines from non-standard firmware.
  const match = trimmed.match(/^(\S+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*(.*)$/)
  if (!match) return null

  const [, deviceUserCode, rawDateTime, rest] = match
  const attendanceDate = extractAttendanceDate(rawDateTime)
  if (!attendanceDate) return null

  const restFields = rest.split(/\s+/).filter(Boolean)
  return {
    deviceUserCode,
    rawDateTime,
    attendanceDate,
    status: restFields[0] || null,
    verify: restFields[1] || null,
  }
}

export const parseAttlogBody = (rawText: string): ParsedBiometricPunch[] =>
  String(rawText || "")
    .split(/\r?\n/)
    .map(parseAttlogLine)
    .filter((punch): punch is ParsedBiometricPunch => punch !== null)
