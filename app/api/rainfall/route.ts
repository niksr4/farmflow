import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { canDeleteModule, canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"

const parseWholeNonNegative = (value: unknown) => {
  if (value === undefined || value === null || value === "") return 0
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric < 0) return null
  return numeric
}

export async function GET(_request: NextRequest) {
  try {
    const sessionUser = await requireModuleAccess("rainfall")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const records = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT * FROM rainfall_records 
        WHERE tenant_id = ${tenantContext.tenantId}
        ORDER BY record_date DESC
      `,
    )
    return NextResponse.json({ success: true, records })
  } catch (error: any) {
    console.error("[v0] Error fetching rainfall records:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await requireModuleAccess("rainfall")
    if (!canWriteModule(sessionUser.role, "rainfall")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { record_date, inches, cents, notes } = await request.json()

    if (!record_date) {
      return NextResponse.json({ success: false, error: "Date is required" }, { status: 400 })
    }

    const inchesValue = parseWholeNonNegative(inches)
    if (inchesValue === null) {
      return NextResponse.json({ success: false, error: "Inches must be a whole number (0 or more)" }, { status: 400 })
    }
    const centsValue = parseWholeNonNegative(cents)
    if (centsValue === null || centsValue > 99) {
      return NextResponse.json(
        { success: false, error: "Cents/points must be a whole number between 0 and 99" },
        { status: 400 },
      )
    }
    if (inchesValue === 0 && centsValue === 0) {
      return NextResponse.json(
        { success: false, error: "Rainfall amount must be greater than 0 (at least 1 point / 0.01 inch)" },
        { status: 400 },
      )
    }

    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO rainfall_records (record_date, inches, cents, notes, user_id, tenant_id)
        VALUES (
          ${record_date},
          ${inchesValue},
          ${centsValue},
          ${notes || ""},
          ${sessionUser.username || "system"},
          ${tenantContext.tenantId}
        )
        RETURNING *
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "create",
      entityType: "rainfall_records",
      entityId: result?.[0]?.id,
      after: result?.[0] ?? null,
    })

    return NextResponse.json({ success: true, record: result[0] })
  } catch (error: any) {
    console.error("[v0] Error saving rainfall record:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    const sessionUser = await requireModuleAccess("rainfall")
    if (!canDeleteModule(sessionUser.role, "rainfall")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    if (!id) {
      return NextResponse.json({ success: false, error: "ID is required" }, { status: 400 })
    }

    const existing = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT *
        FROM rainfall_records
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    await runTenantQuery(
      sql,
      tenantContext,
      sql`DELETE FROM rainfall_records WHERE id = ${id} AND tenant_id = ${tenantContext.tenantId}`,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "delete",
      entityType: "rainfall_records",
      entityId: existing?.[0]?.id ?? id,
      before: existing?.[0] ?? null,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[v0] Error deleting rainfall record:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
