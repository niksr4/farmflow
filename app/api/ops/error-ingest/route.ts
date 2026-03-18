import { NextResponse } from "next/server"
import { logAppErrorEvent } from "@/lib/server/error-events"

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

    const authHeader = request.headers.get("authorization") || ""
    const headerToken = request.headers.get("x-agent-token") || ""
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
    const providedToken = headerToken || bearerToken

    if (providedToken !== token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (body === null) {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 })
    }

    const events = toEvents(body)
    if (!events.length) {
      return NextResponse.json({ success: false, error: "Provide at least one event object" }, { status: 400 })
    }
    if (events.length > MAX_EVENTS_PER_REQUEST) {
      return NextResponse.json(
        { success: false, error: `Too many events. Limit is ${MAX_EVENTS_PER_REQUEST} per request.` },
        { status: 413 },
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
      return NextResponse.json({ success: false, error: "At least one event must include a message" }, { status: 400 })
    }

    return NextResponse.json({ success: true, inserted })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to ingest events" }, { status: 500 })
  }
}
