import { after } from "next/server"
import { accountsSql, isDbConfigured } from "@/lib/server/db"
import { buildRateLimitBatch, checkRateLimit } from "@/lib/rate-limit"
import { normalizeTenantContext } from "@/lib/server/tenant-db"
import { extractClientIp } from "@/lib/server/request-security"
import { logSecurityEvent } from "@/lib/server/security-events"
import { logAppErrorEvent } from "@/lib/server/error-events"
import { parseContentLengthHeader } from "@/lib/request-limits"
import { BIOMETRIC_DEVICE_ROLE } from "@/lib/biometric-attendance"
import {
  HDATA_ACK_HEADER,
  HDATA_ACK_VALUE,
  HDATA_REQUEST_CODES,
  MAX_HDATA_BODY_BYTES,
  isValidHdataSerial,
  parseHdataEnrollment,
  parseHdataEnvelope,
  parseHdataPunch,
} from "@/lib/hdata-protocol"
import {
  recordEnrollment,
  recordPunchesAndUpsertAttendance,
  resolveHeartbeatGate,
  resolveTenantByDeviceSerial,
  touchDeviceLastSeen,
} from "@/lib/server/biometric-attendance"

/**
 * hdata push endpoint — BioMax N-WL20 and related OEM terminals.
 *
 * The path is fixed by device firmware (not configurable on the terminal), which is why this
 * sits at the app root rather than under /api. It is therefore OUTSIDE the proxy.ts matcher and
 * gets no session gate — the same position, and the same threat model, as /iclock.
 *
 * See lib/hdata-protocol.ts for the wire format. The one thing that must not change casually:
 * every success response carries `response_code: OK`, or the device treats the upload as failed
 * and re-sends it forever.
 */
export const dynamic = "force-dynamic"

const ack = () =>
  new Response("", {
    status: 200,
    headers: { [HDATA_ACK_HEADER]: HDATA_ACK_VALUE, "Content-Type": "text/plain; charset=utf-8" },
  })

/**
 * Refuse without acking, so the device retries rather than discarding the batch.
 *
 * Deliberately does NOT send response_code: OK — an unrecognised device must not be told its
 * upload succeeded. The security_events write sits behind its own per-IP bucket because serials
 * are guessable (vendor prefix + manufacture date + sequence), and one row per rejection would
 * otherwise be an unauthenticated, attacker-controlled write primitive.
 */
const rejectUnrecognizedDevice = async (
  request: Request,
  serialNumber: string,
  clientIp: string,
  requestCode: string,
) => {
  const unknownLimit = await checkRateLimit("biometricUnknownSerial", clientIp).catch(() => null)
  if (!unknownLimit || unknownLimit.success) {
    await logSecurityEvent({
      tenantId: null,
      eventType: "biometric_device_unrecognized",
      severity: "warning",
      source: "hdata",
      ipAddress: clientIp === "unknown" ? null : clientIp,
      userAgent: request.headers.get("user-agent"),
      metadata: { serialNumber, requestCode, protocol: "hdata" },
    }).catch(() => undefined)
  }
  return new Response("", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } })
}

export async function POST(request: Request) {
  if (!isDbConfigured) return new Response("", { status: 503 })

  // Protocol metadata lives in headers, not the query string or the body.
  const serialNumber = String(request.headers.get("dev_id") || "").trim()
  const requestCode = String(request.headers.get("request_code") || "").trim().toLowerCase()
  const clientIp = extractClientIp(request.headers) || "unknown"

  const contentLength = parseContentLengthHeader(request.headers.get("content-length"))
  if (contentLength !== null && contentLength > MAX_HDATA_BODY_BYTES) {
    return new Response("", { status: 413 })
  }

  /**
   * RATE LIMITS AND THE DEVICE LOOKUP IN ONE ROUND TRIP.
   *
   * These were three sequential calls to Neon in ap-southeast-1 before any work began, on the
   * busiest endpoint in the application: 5.4 hours of total span time in the week to 2026-09-12 at
   * a p95 of 2,678 ms, against 303 real punches — about 96% empty heartbeats. Sentry raised the
   * shape as "Consecutive HTTP POST".
   *
   * An earlier attempt cached the serial lookup for 15 seconds instead. That was a security hole:
   * a cache hit skips the `active = TRUE` in the query, nothing downstream re-checks it, and the
   * device route toggles `active` on a PUT — so a deactivated terminal could keep writing
   * attendance until the entry expired, on any warm instance. Batching gets the same latency with
   * the authorisation check live on every request.
   *
   * Limits are still checked BEFORE the body is read: buffering up to MAX_HDATA_BODY_BYTES before
   * deciding whether the caller may send it does the expensive half of the work regardless. The
   * per-IP ceiling remains load-bearing because the per-serial bucket is keyed on attacker-supplied
   * input, and rotating a serial would otherwise mint a fresh bucket every request.
   */
  const gate = await resolveHeartbeatGate(
    accountsSql,
    buildRateLimitBatch([
      { key: "biometricIp", identifier: clientIp },
      { key: "biometricPunch", identifier: serialNumber || clientIp },
    ]),
    serialNumber,
  ).catch(() => null)

  if (gate && [...gate.limits.values()].some((result) => !result.success)) {
    return new Response("", { status: 429 })
  }

  if (!isValidHdataSerial(serialNumber)) {
    return rejectUnrecognizedDevice(request, serialNumber, clientIp, requestCode)
  }

  // Null gate means the batch itself failed — fall back to the single lookup rather than refusing
  // a device because the database hiccupped. Rate limiting fails open here exactly as before.
  const resolved = gate
    ? gate.device
    : await resolveTenantByDeviceSerial(accountsSql, serialNumber).catch(() => null)
  if (!resolved) {
    return rejectUnrecognizedDevice(request, serialNumber, clientIp, requestCode)
  }

  // Non-owner role: RLS stays armed for everything downstream. Only the serial lookup above is
  // cross-tenant, and it is the sole place that needs owner rights. See BIOMETRIC_DEVICE_ROLE.
  const tenantContext = normalizeTenantContext(resolved.tenantId, BIOMETRIC_DEVICE_ROLE)

  try {
    /**
     * OFF THE CRITICAL PATH. last_seen_at powers one label on the device settings screen; making
     * every heartbeat wait for it bought nothing and cost a round trip on the busiest endpoint here.
     *
     * `after()` rather than a floating promise: a serverless function can freeze the moment it
     * responds, so an un-awaited write is not merely late, it may never run. after() is the
     * platform's contract for "finish this before you freeze".
     */
    // RETURNS the promise. A callback that discards it reports itself finished the moment the
    // request starts, so the instance may freeze before the write lands — which is exactly the
    // failure after() exists to prevent, reintroduced by a stray `void`.
    after(() => touchDeviceLastSeen(accountsSql, tenantContext, resolved.deviceId).catch(() => undefined))

    // An enrolment carries the name typed on the terminal keypad -- the only place a device code
    // is ever human-readable. Recorded (not acted on) so the mapping panel can suggest it. The
    // fingerprint template alongside it is still discarded; we have no use for biometric data and
    // no wish to store it.
    if (requestCode === HDATA_REQUEST_CODES.realtimeEnroll) {
      const body = Buffer.from(await request.arrayBuffer())
      const enrollment = parseHdataEnrollment(parseHdataEnvelope(body).json)
      if (enrollment) {
        await recordEnrollment(
          accountsSql,
          tenantContext,
          enrollment.deviceUserCode,
          enrollment.userName,
          serialNumber,
        ).catch((error) => {
          // Never withhold the ack for this: a device that does not receive response_code: OK
          // re-sends forever, and an unrecorded name is a cosmetic loss next to a resend storm.
          logAppErrorEvent({
            tenantId: resolved.tenantId,
            source: "hdata",
            endpoint: "/hdata.aspx",
            errorCode: "hdata_enrollment_record_failed",
            severity: "warning",
            message: error instanceof Error ? error.message : String(error),
            metadata: { serialNumber, deviceUserCode: enrollment.deviceUserCode },
          }).catch(() => undefined)
        })
      }
      return ack()
    }

    // Only a punch produces attendance. receive_cmd is an idle poll -- acked and dropped, because
    // a device that does not receive response_code: OK re-sends indefinitely.
    if (requestCode !== HDATA_REQUEST_CODES.realtimeGlog) {
      return ack()
    }

    const body = Buffer.from(await request.arrayBuffer())
    if (body.length > MAX_HDATA_BODY_BYTES) return new Response("", { status: 413 })

    const punch = parseHdataPunch(parseHdataEnvelope(body).json)
    if (!punch) {
      // Ack anyway: an unparseable record will never parse on retry, so withholding the ack
      // only pins the device in a permanent resend loop against a payload we cannot use.
      await logAppErrorEvent({
        tenantId: resolved.tenantId,
        source: "hdata",
        endpoint: "/hdata.aspx",
        errorCode: "hdata_punch_unparseable",
        severity: "warning",
        message: "realtime_glog payload could not be parsed into a punch",
        metadata: { serialNumber, bodyLength: body.length },
      }).catch(() => undefined)
      return ack()
    }

    await recordPunchesAndUpsertAttendance(accountsSql, tenantContext, resolved.deviceId, serialNumber, [punch])
    return ack()
  } catch (error) {
    await logAppErrorEvent({
      tenantId: resolved.tenantId,
      source: "hdata",
      endpoint: "/hdata.aspx",
      errorCode: "hdata_processing_failed",
      severity: "error",
      message: error instanceof Error ? error.message : String(error),
      metadata: { serialNumber, requestCode },
    }).catch(() => undefined)
    // No ack, so the device retries. The unique dedup index on biometric_punches makes that safe
    // rather than duplicating, and losing a punch to a transient DB blip is the worse outcome.
    return new Response("", { status: 500 })
  }
}

// The firmware has only ever been observed to POST, but it advertises GET in its Accept header.
// Routing GET through the same handler is cheaper than discovering later that a firmware
// revision polls with one.
export async function GET(request: Request) {
  return POST(request)
}
