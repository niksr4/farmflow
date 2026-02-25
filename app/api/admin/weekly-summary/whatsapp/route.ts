import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireOwnerRole } from "@/lib/tenant"
import { requireAdminSession } from "@/lib/server/mfa"
import { sendWhatsAppAlert } from "@/lib/server/whatsapp-alerts"

const MAX_MESSAGE_LENGTH = 3800

const toTenantName = async (tenantId: string) => {
  if (!sql) return null
  const rowsResult = await sql`
    SELECT name
    FROM tenants
    WHERE id = ${tenantId}::uuid
    LIMIT 1
  `
  const rows = Array.isArray(rowsResult)
    ? rowsResult
    : Array.isArray((rowsResult as any)?.rows)
      ? (rowsResult as any).rows
      : []
  if (!rows.length) return null
  return String(rows[0].name || "").trim() || null
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    requireOwnerRole(sessionUser.role)

    const body = await request.json().catch(() => ({}))
    const tenantId = String(body?.tenantId || "").trim()
    const message = String(body?.message || "").trim()
    const recipients = body?.to

    if (!tenantId) {
      return NextResponse.json({ success: false, error: "tenantId is required" }, { status: 400 })
    }
    if (!message) {
      return NextResponse.json({ success: false, error: "message is required" }, { status: 400 })
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { success: false, error: `message exceeds ${MAX_MESSAGE_LENGTH} characters` },
        { status: 400 },
      )
    }

    const tenantName = await toTenantName(tenantId)
    if (!tenantName) {
      return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 })
    }

    const result = await sendWhatsAppAlert({
      text: message,
      to: Array.isArray(recipients) || typeof recipients === "string" ? recipients : null,
    })

    return NextResponse.json({
      success: result.sent,
      tenantId,
      tenantName,
      notification: result,
    })
  } catch (error: any) {
    console.error("Error sending weekly summary to WhatsApp:", error)
    const message = error?.message || "Failed to send weekly summary"
    const status = /owner/i.test(message) ? 403 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
