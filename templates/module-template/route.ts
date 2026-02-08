import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

export async function GET() {
  try {
    const sessionUser = await requireModuleAccess("__MODULE_ID__")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT *
        FROM __MODULE_TABLE__
        WHERE tenant_id = ${tenantContext.tenantId}
        ORDER BY record_date DESC
      `,
    )

    return NextResponse.json({ success: true, records: rows || [] })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("__MODULE_ID__")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const payload = await request.json()

    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO __MODULE_TABLE__ (tenant_id, location_id, record_date, metric_a, metric_b, notes)
        VALUES (${tenantContext.tenantId}, ${payload.location_id}, ${payload.record_date}, ${payload.metric_a}, ${payload.metric_b}, ${payload.notes || ""})
        RETURNING *
      `,
    )

    return NextResponse.json({ success: true, record: result[0] })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}
