import { checkRateLimit } from "@/lib/rate-limit"
import { extractClientIp } from "@/lib/server/request-security"
import { ADMS_OK_RESPONSE } from "@/lib/biometric-attendance"

// ADMS command-execution acknowledgment. FarmFlow doesn't push remote commands to devices in
// v1, so this is a no-op ack that keeps the device from treating the exchange as a failure.
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  // No database work happens here, but it is still a public, unauthenticated route that returns
  // 200 to anyone — so it bills a function invocation per call. It shares the per-IP bucket with
  // the rest of /iclock rather than getting its own, so this cannot be used as a cheap way to
  // exhaust that budget out from under the endpoints that actually matter.
  const ipLimit = await checkRateLimit("biometricIp", extractClientIp(request.headers) || "unknown").catch(
    () => null,
  )
  if (ipLimit && !ipLimit.success) {
    return new Response("", { status: 429, headers: { "Content-Type": "text/plain; charset=utf-8" } })
  }

  return new Response(ADMS_OK_RESPONSE, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } })
}
