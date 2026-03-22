import { NextResponse } from "next/server"
import { logAppErrorEvent } from "@/lib/server/error-events"
import { buildRateLimitHeaders, checkRateLimit, isRateLimitUnavailableError } from "@/lib/rate-limit"
import { extractClientIp, extractSharedSecretToken, sharedSecretMatches } from "@/lib/server/request-security"
import { logServerError, redactForLogs } from "@/lib/server/safe-logging"

export const dynamic = "force-dynamic"
const MAX_EVENTS_PER_REQUEST = 50

const getIngestToken = () => {
  const token = process.env.LOG_INGEST_TOKEN
  return token || null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

const toEvents = (body: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(body)) return body.filter(isRecord)
  if (isRecord(body) && Array.isArray(body.events)) return body.events.filter(isRecord)
  return isRecord(body) ? [body] : []
}

export async function POST(request: Request) {
  try {
    const token = getIngestToken()
    if (!token) {
      return NextResponse.json({ success: false, error: "LOG_INGEST_TOKEN is not configured" }, { status: 503 })
    }

    const providedToken = extractSharedSecretToken(request.headers)
    if (!sharedSecretMatches(token, providedToken)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const ipAddress = extractClientIp(request.headers)
    let rateHeaders: Record<string, string> = {}
    try {
      const rateLimit = await checkRateLimit("opsErrorIngest", `ops-error-ingest:${String(ipAddress || "unknown")}`)
      rateHeaders = buildRateLimitHeaders(rateLimit)
      if (!rateLimit.success) {
        return NextResponse.json(
          { success: false, error: "Rate limit exceeded" },
          { status: 429, headers: rateHeaders },
        )
      }
    } catch (error) {
      if (isRateLimitUnavailableError(error)) {
        return NextResponse.json(
          { success: false, error: "Error ingest is temporarily unavailable. Please try again shortly." },
          { status: 503 },
        )
      }
      throw error
    }

    const body = await request.json().catch(() => null)
    if (body === null) {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400, headers: rateHeaders })
    }

    const events = toEvents(body)
    if (!events.length) {
      return NextResponse.json({ success: false, error: "Provide at least one event object" }, { status: 400, headers: rateHeaders })
    }
    if (events.length > MAX_EVENTS_PER_REQUEST) {
      return NextResponse.json(
        { success: false, error: `Too many events. Limit is ${MAX_EVENTS_PER_REQUEST} per request.` },
        { status: 413, headers: rateHeaders },
      )
    }

    let inserted = 0
    for (const event of events) {
      const message = String(event?.message || "").trim()
      if (!message) continue
      await logAppErrorEvent({
        tenantId: event?.tenantId ? String(event.tenantId) : null,
        source: String(event?.source || "external"),
        endpoint: event?.endpoint ? String(event.endpoint) : null,
        errorCode: event?.errorCode ? String(event.errorCode) : null,
        severity: ["warning", "error", "critical"].includes(String(event?.severity || ""))
          ? (String(event.severity) as "warning" | "error" | "critical")
          : "error",
        message,
        fingerprint: event?.fingerprint ? String(event.fingerprint) : null,
        metadata: isRecord(event?.metadata) ? event.metadata : {},
      })
      inserted += 1
    }

    if (inserted === 0) {
      return NextResponse.json(
        { success: false, error: "At least one event must include a message" },
        { status: 400, headers: rateHeaders },
      )
    }

    return NextResponse.json({ success: true, inserted }, { headers: rateHeaders })
  } catch (error: unknown) {
    logServerError("Failed to ingest app error events", {
      error,
      body: redactForLogs({ endpoint: "/api/ops/error-ingest" }),
    })
    return NextResponse.json({ success: false, error: "Failed to ingest events" }, { status: 500 })
  }
}
