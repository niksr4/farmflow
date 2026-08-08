import { accountsSql, isDbConfigured } from "@/lib/server/db"
import { checkRateLimit } from "@/lib/rate-limit"
import { normalizeTenantContext } from "@/lib/server/tenant-db"
import { extractClientIp } from "@/lib/server/request-security"
import { logSecurityEvent } from "@/lib/server/security-events"
import { logAppErrorEvent } from "@/lib/server/error-events"
import { parseContentLengthHeader } from "@/lib/request-limits"
import {
  ADMS_OK_RESPONSE,
  BIOMETRIC_DEVICE_ROLE,
  MAX_ADMS_BODY_BYTES,
  isValidSerialNumber,
  normalizeSerialNumber,
  parseAttlogBody,
} from "@/lib/biometric-attendance"
import {
  recordPunchesAndUpsertAttendance,
  resolveTenantByDeviceSerial,
  touchDeviceLastSeen,
} from "@/lib/server/biometric-attendance"

// ADMS protocol endpoint. Path is fixed by device firmware (not configurable), and devices
// require the literal text "OK" back or they retry indefinitely — see lib/biometric-attendance.ts.
export const dynamic = "force-dynamic"

const plainText = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } })

/**
 * 404 an unrecognized serial, logging it at most a few times per hour per IP.
 *
 * Serials are guessable (vendor prefix + manufacture date + batch sequence), so an enumerator
 * can walk the space. Writing one security_events row per rejection handed that attacker an
 * unbounded, unauthenticated write primitive; charging the biometricUnknownSerial bucket keeps
 * the detection signal while bounding the volume. A registered device never reaches this path.
 */
const rejectUnrecognizedDevice = async (
  request: Request,
  source: string,
  serialNumber: string,
  clientIp: string,
  metadata?: Record<string, unknown>,
) => {
  const unknownLimit = await checkRateLimit("biometricUnknownSerial", clientIp).catch(() => null)
  if (!unknownLimit || unknownLimit.success) {
    await logSecurityEvent({
      tenantId: null,
      eventType: "biometric_device_unrecognized",
      severity: "warning",
      source,
      ipAddress: clientIp === "unknown" ? null : clientIp,
      userAgent: request.headers.get("user-agent"),
      metadata: { serialNumber, ...metadata },
    }).catch(() => undefined)
  }
  return plainText("", 404)
}

export async function GET(request: Request) {
  if (!isDbConfigured) return plainText("", 503)

  const { searchParams } = new URL(request.url)
  const serialNumber = normalizeSerialNumber(searchParams.get("SN"))
  const clientIp = extractClientIp(request.headers) || "unknown"

  const ipLimit = await checkRateLimit("biometricIp", clientIp).catch(() => null)
  if (ipLimit && !ipLimit.success) return plainText("", 429)

  const rateLimit = await checkRateLimit("biometricHeartbeat", serialNumber || clientIp).catch(() => null)
  if (rateLimit && !rateLimit.success) return plainText("", 429)

  if (!isValidSerialNumber(serialNumber)) {
    return rejectUnrecognizedDevice(request, "iclock/cdata:GET", serialNumber, clientIp)
  }

  const resolved = await resolveTenantByDeviceSerial(accountsSql, serialNumber).catch(() => null)
  if (!resolved) {
    return rejectUnrecognizedDevice(request, "iclock/cdata:GET", serialNumber, clientIp)
  }

  const tenantContext = normalizeTenantContext(resolved.tenantId, BIOMETRIC_DEVICE_ROLE)
  await touchDeviceLastSeen(accountsSql, tenantContext, resolved.deviceId).catch(() => undefined)

  // Minimal handshake ack — we aren't pushing device-side config in v1.
  return plainText(ADMS_OK_RESPONSE)
}

export async function POST(request: Request) {
  if (!isDbConfigured) return plainText("", 503)

  const { searchParams } = new URL(request.url)
  const serialNumber = normalizeSerialNumber(searchParams.get("SN"))
  const table = String(searchParams.get("table") || "").toUpperCase()
  const clientIp = extractClientIp(request.headers) || "unknown"

  const contentLength = parseContentLengthHeader(request.headers.get("content-length"))
  if (contentLength !== null && contentLength > MAX_ADMS_BODY_BYTES) {
    return plainText("", 413)
  }

  // Both limits are checked BEFORE the body is read. Previously request.text() ran first, so an
  // unauthenticated caller could make the function download and buffer up to MAX_ADMS_BODY_BYTES
  // on every request and only then be told 429 — the expensive half of the work happened whether
  // or not the caller was allowed to do it.
  const ipLimit = await checkRateLimit("biometricIp", clientIp).catch(() => null)
  if (ipLimit && !ipLimit.success) return plainText("", 429)

  const rateLimit = await checkRateLimit("biometricPunch", serialNumber || clientIp).catch(() => null)
  if (rateLimit && !rateLimit.success) return plainText("", 429)

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return plainText("", 400)
  }
  if (rawBody.length > MAX_ADMS_BODY_BYTES) {
    return plainText("", 413)
  }

  if (!isValidSerialNumber(serialNumber)) {
    return rejectUnrecognizedDevice(request, "iclock/cdata:POST", serialNumber, clientIp, { table })
  }

  const resolved = await resolveTenantByDeviceSerial(accountsSql, serialNumber).catch(() => null)
  if (!resolved) {
    return rejectUnrecognizedDevice(request, "iclock/cdata:POST", serialNumber, clientIp, { table })
  }

  const tenantContext = normalizeTenantContext(resolved.tenantId, BIOMETRIC_DEVICE_ROLE)

  try {
    await touchDeviceLastSeen(accountsSql, tenantContext, resolved.deviceId).catch(() => undefined)

    if (table !== "ATTLOG") {
      // Other ADMS tables (OPERLOG, user/fingerprint templates) aren't processed in v1 — ack
      // so the device doesn't treat this as a failure and retry.
      return plainText(ADMS_OK_RESPONSE)
    }

    const punches = parseAttlogBody(rawBody)
    await recordPunchesAndUpsertAttendance(accountsSql, tenantContext, resolved.deviceId, serialNumber, punches)

    return plainText(ADMS_OK_RESPONSE)
  } catch (error) {
    await logAppErrorEvent({
      tenantId: resolved.tenantId,
      source: "iclock/cdata",
      endpoint: "/iclock/cdata",
      errorCode: "biometric_punch_processing_failed",
      severity: "error",
      message: error instanceof Error ? error.message : String(error),
      metadata: { serialNumber, table },
    }).catch(() => undefined)
    // Deliberately NOT "OK" — the device will retry this batch later, and the unique dedup
    // index in biometric_punches makes that retry safe rather than losing punches to a
    // transient failure.
    return plainText("", 500)
  }
}
