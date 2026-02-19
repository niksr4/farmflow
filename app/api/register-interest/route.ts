import { NextResponse } from "next/server"
import { logSecurityEvent } from "@/lib/server/security-events"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const sanitize = (value: unknown, limit: number) => String(value || "").trim().slice(0, limit)

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = sanitize(body?.name, 120)
    const email = sanitize(body?.email, 160).toLowerCase()
    const organization = sanitize(body?.organization, 180)
    const estateSize = sanitize(body?.estateSize, 120)
    const notes = sanitize(body?.notes, 1200)

    if (!name || !email) {
      return NextResponse.json({ success: false, error: "Name and email are required" }, { status: 400 })
    }
    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ success: false, error: "Enter a valid email address" }, { status: 400 })
    }

    const headers = request.headers
    const ipAddress = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || null
    const userAgent = headers.get("user-agent") || null

    await logSecurityEvent({
      eventType: "landing_register_interest",
      severity: "info",
      source: "landing-page",
      ipAddress,
      userAgent,
      metadata: {
        name,
        email,
        organization,
        estateSize,
        notes,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Register interest error:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to register interest" },
      { status: 500 },
    )
  }
}
