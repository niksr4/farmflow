import { NextResponse } from "next/server"
import { logAppErrorEvent } from "@/lib/server/error-events"

export const dynamic = "force-dynamic"

const getIngestToken = () => {
  const token = process.env.LOG_INGEST_TOKEN
  return token || null
}

const toEvents = (body: any) => {
  if (Array.isArray(body)) return body
  if (body?.events && Array.isArray(body.events)) return body.events
  return [body]
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

    const body = await request.json()
    const events = toEvents(body)

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
        metadata: event?.metadata && typeof event.metadata === "object" ? event.metadata : {},
      })
      inserted += 1
    }

    return NextResponse.json({ success: true, inserted })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to ingest events" }, { status: 500 })
  }
}
