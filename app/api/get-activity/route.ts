import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { requireAdminRole } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"

export async function GET(request: Request) {
  try {
    console.log("📡 Fetching all activity codes from accounts_db...")
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const result = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT code, activity as reference
        FROM account_activities
        WHERE tenant_id = ${tenantContext.tenantId}
        ORDER BY code ASC
      `,
    )

    console.log(`✅ Found ${result.length} activity codes`)

    return NextResponse.json({
      success: true,
      activities: result,
    })
  } catch (error: any) {
    console.error("❌ Error fetching activity codes:", error.message)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled", activities: [] }, { status: 403 })
    }
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        activities: [],
      },
      { status: 500 },
    )
  }
}

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
    const { code, activity } = body

    console.log("➕ Adding new activity:", { code, activity })

    // Check if code already exists
    const existing = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT code FROM account_activities
        WHERE code = ${code} AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    if (existing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Activity code already exists",
        },
        { status: 400 },
      )
    }

    await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        INSERT INTO account_activities (code, activity, tenant_id)
        VALUES (${code}, ${activity}, ${tenantContext.tenantId})
      `,
    )

    console.log("✅ Activity added successfully")

    await logAuditEvent(accountsSql, sessionUser, {
      action: "create",
      entityType: "account_activities",
      entityId: code,
      after: { code, activity },
    })

    return NextResponse.json({
      success: true,
    })
  } catch (error: any) {
    console.error("❌ Error adding activity:", error.message)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    )
  }
}
