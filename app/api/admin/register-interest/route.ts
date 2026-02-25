import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireOwnerRole } from "@/lib/tenant"
import { requireAdminSession } from "@/lib/server/mfa"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error)
  return message.includes(`relation "${relation}" does not exist`)
}

const adminErrorResponse = (error: any, fallback: string) => {
  const message = error?.message || fallback
  const status = ["MFA required", "Admin role required", "Unauthorized"].includes(message) ? 403 : 500
  return NextResponse.json({ success: false, error: message }, { status })
}

type InterestRecord = {
  id: string
  created_at: string
  source: string | null
  ip_address: string | null
  user_agent: string | null
  metadata: Record<string, any> | null
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    requireOwnerRole(sessionUser.role)
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const limitRaw = Number.parseInt(String(searchParams.get("limit") || "200"), 10)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200
    const tenantContext = normalizeTenantContext(undefined, "owner")

    let rows: InterestRecord[] = []
    try {
      rows = (await runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT id, created_at, source, ip_address, user_agent, metadata
          FROM security_events
          WHERE event_type = 'landing_register_interest'
          ORDER BY created_at DESC
          LIMIT ${limit}
        `,
      )) as InterestRecord[]
    } catch (error) {
      if (!isMissingRelation(error, "security_events")) {
        throw error
      }
      return NextResponse.json({ success: true, records: [] })
    }

    const records = (rows || []).map((row: any) => {
      const metadata =
        row?.metadata && typeof row.metadata === "string"
          ? (() => {
              try {
                return JSON.parse(row.metadata)
              } catch {
                return null
              }
            })()
          : row?.metadata && typeof row.metadata === "object"
            ? row.metadata
            : null

      return {
        id: String(row.id),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        source: row.source ? String(row.source) : null,
        ipAddress: row.ip_address ? String(row.ip_address) : null,
        userAgent: row.user_agent ? String(row.user_agent) : null,
        metadata,
      }
    })

    return NextResponse.json({ success: true, records })
  } catch (error: any) {
    console.error("Error fetching register-interest records:", error)
    return adminErrorResponse(error, "Failed to fetch register-interest records")
  }
}
