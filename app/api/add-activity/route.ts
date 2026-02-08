import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { requireAdminRole } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    try {
      requireAdminRole(sessionUser.role)
    } catch {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json()
    const { code, reference } = body

    if (!code || !reference) {
      return NextResponse.json(
        { success: false, error: "Code and reference are required" },
        { status: 400 },
      )
    }

    // Check if code already exists
    const existingActivity = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT code FROM account_activities
        WHERE code = ${code} AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    if (existingActivity.length > 0) {
      return NextResponse.json({ success: false, error: "Activity code already exists" }, { status: 400 })
    }

    // Insert new activity
    await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        INSERT INTO account_activities (code, activity, tenant_id)
        VALUES (${code}, ${reference}, ${tenantContext.tenantId})
      `,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "create",
      entityType: "account_activities",
      entityId: code,
      after: { code, activity: reference },
    })

    return NextResponse.json({ success: true, message: "Activity added successfully" })
  } catch (error) {
    console.error("Error adding activity:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to add activity",
      },
      { status: 500 },
    )
  }
}
