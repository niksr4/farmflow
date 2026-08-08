import { accountsSql, isDbConfigured } from "@/lib/server/db"
import { checkRateLimit } from "@/lib/rate-limit"
import { normalizeTenantContext } from "@/lib/server/tenant-db"
import { extractClientIp } from "@/lib/server/request-security"
import { logSecurityEvent } from "@/lib/server/security-events"
import {
  ADMS_OK_RESPONSE,
  BIOMETRIC_DEVICE_ROLE,
  isValidSerialNumber,
  normalizeSerialNumber,
} from "@/lib/biometric-attendance"
import { resolveTenantByDeviceSerial, touchDeviceLastSeen } from "@/lib/server/biometric-attendance"

// ADMS heartbeat — devices poll this roughly every 30s while online. Keep this cheap: a single
// last_seen_at touch, no other writes, so the chatty poll never becomes a load problem.
export const dynamic = "force-dynamic"

const plainText = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } })

export async function GET(request: Request) {
  if (!isDbConfigured) return plainText("", 503)

  const { searchParams } = new URL(request.url)
  const serialNumber = normalizeSerialNumber(searchParams.get("SN"))
  const clientIp = extractClientIp(request.headers) || "unknown"

  // Per-IP ceiling first. The per-serial limit below is keyed on attacker-supplied input, so on
  // its own it bounds nothing — rotating the serial mints a fresh bucket on every request.
  const ipLimit = await checkRateLimit("biometricIp", clientIp).catch(() => null)
  if (ipLimit && !ipLimit.success) return plainText("", 429)

  const rateLimit = await checkRateLimit("biometricHeartbeat", serialNumber || clientIp).catch(() => null)
  if (rateLimit && !rateLimit.success) return plainText("", 429)

  if (!isValidSerialNumber(serialNumber)) return plainText("", 400)

  const resolved = await resolveTenantByDeviceSerial(accountsSql, serialNumber).catch(() => null)
  if (!resolved) {
    // Charged only when a serial fails to resolve, so a registered terminal never touches this
    // bucket and cannot be locked out by it. Gating the log write on the same check is
    // deliberate: one security_events row per rejection was unbounded, attacker-controlled
    // table growth on a public endpoint.
    const unknownLimit = await checkRateLimit("biometricUnknownSerial", clientIp).catch(() => null)
    if (!unknownLimit || unknownLimit.success) {
      await logSecurityEvent({
        tenantId: null,
        eventType: "biometric_device_unrecognized",
        severity: "warning",
        source: "iclock/getrequest",
        ipAddress: clientIp === "unknown" ? null : clientIp,
        userAgent: request.headers.get("user-agent"),
        metadata: { serialNumber },
      }).catch(() => undefined)
    }
    return plainText("", 404)
  }

  const tenantContext = normalizeTenantContext(resolved.tenantId, BIOMETRIC_DEVICE_ROLE)
  await touchDeviceLastSeen(accountsSql, tenantContext, resolved.deviceId).catch(() => undefined)

  return plainText(ADMS_OK_RESPONSE)
}
