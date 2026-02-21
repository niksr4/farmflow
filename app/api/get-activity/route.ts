import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { requireAdminRole } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"

const normalizeCode = (value: unknown) => String(value || "").trim().toUpperCase()
const normalizeReference = (value: unknown) => String(value || "").trim()

const isMissingRelation = (error: unknown, tableName: string) => {
  const message = String((error as any)?.message || "")
  return message.includes(`relation "${tableName}" does not exist`)
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    let result: any[] = []
    try {
      result = await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          SELECT
            aa.code,
            aa.activity as reference,
            COALESCE(lt.usage_count, 0)::int AS labor_count,
            COALESCE(et.usage_count, 0)::int AS expense_count
          FROM account_activities aa
          LEFT JOIN (
            SELECT code, COUNT(*)::int AS usage_count
            FROM labor_transactions
            WHERE tenant_id = ${tenantContext.tenantId}
            GROUP BY code
          ) lt ON lt.code = aa.code
          LEFT JOIN (
            SELECT code, COUNT(*)::int AS usage_count
            FROM expense_transactions
            WHERE tenant_id = ${tenantContext.tenantId}
            GROUP BY code
          ) et ON et.code = aa.code
          WHERE aa.tenant_id = ${tenantContext.tenantId}
          ORDER BY aa.code ASC
        `,
      )
    } catch (error) {
      if (!isMissingRelation(error, "labor_transactions") && !isMissingRelation(error, "expense_transactions")) {
        throw error
      }
      result = await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          SELECT
            code,
            activity as reference,
            0::int AS labor_count,
            0::int AS expense_count
          FROM account_activities
          WHERE tenant_id = ${tenantContext.tenantId}
          ORDER BY code ASC
        `,
      )
    }


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
    const code = normalizeCode(body?.code)
    const activity = normalizeReference(body?.activity)


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

export async function PUT(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    try {
      requireAdminRole(sessionUser.role)
    } catch {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json()
    const currentCode = normalizeCode(body?.code)
    const nextCode = normalizeCode(body?.nextCode || body?.code)
    const nextReference = normalizeReference(body?.reference || body?.activity)

    if (!currentCode || !nextCode || !nextReference) {
      return NextResponse.json(
        { success: false, error: "code, nextCode, and reference are required" },
        { status: 400 },
      )
    }

    const existingRows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT code, activity
        FROM account_activities
        WHERE tenant_id = ${tenantContext.tenantId}
          AND code = ${currentCode}
        LIMIT 1
      `,
    )

    if (!existingRows?.length) {
      return NextResponse.json({ success: false, error: "Activity code not found" }, { status: 404 })
    }

    if (nextCode !== currentCode) {
      const conflictRows = await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          SELECT code
          FROM account_activities
          WHERE tenant_id = ${tenantContext.tenantId}
            AND code = ${nextCode}
          LIMIT 1
        `,
      )
      if (conflictRows?.length) {
        return NextResponse.json({ success: false, error: "Activity code already exists" }, { status: 409 })
      }

      await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          INSERT INTO account_activities (code, activity, tenant_id)
          VALUES (${nextCode}, ${nextReference}, ${tenantContext.tenantId})
        `,
      )

      try {
        await runTenantQuery(
          accountsSql,
          tenantContext,
          accountsSql`
            UPDATE labor_transactions
            SET code = ${nextCode}
            WHERE tenant_id = ${tenantContext.tenantId}
              AND code = ${currentCode}
          `,
        )
      } catch (error) {
        if (!isMissingRelation(error, "labor_transactions")) {
          throw error
        }
      }

      try {
        await runTenantQuery(
          accountsSql,
          tenantContext,
          accountsSql`
            UPDATE expense_transactions
            SET code = ${nextCode}
            WHERE tenant_id = ${tenantContext.tenantId}
              AND code = ${currentCode}
          `,
        )
      } catch (error) {
        if (!isMissingRelation(error, "expense_transactions")) {
          throw error
        }
      }

      await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          DELETE FROM account_activities
          WHERE tenant_id = ${tenantContext.tenantId}
            AND code = ${currentCode}
        `,
      )
    } else {
      await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          UPDATE account_activities
          SET activity = ${nextReference}
          WHERE tenant_id = ${tenantContext.tenantId}
            AND code = ${currentCode}
        `,
      )
    }

    await logAuditEvent(accountsSql, sessionUser, {
      action: "update",
      entityType: "account_activities",
      entityId: currentCode,
      before: existingRows?.[0] ?? null,
      after: { code: nextCode, activity: nextReference },
    })

    return NextResponse.json({
      success: true,
      activity: {
        code: nextCode,
        reference: nextReference,
      },
    })
  } catch (error: any) {
    console.error("❌ Error updating activity codes:", error.message)
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

export async function DELETE(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    try {
      requireAdminRole(sessionUser.role)
    } catch {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const code = normalizeCode(searchParams.get("code"))

    if (!code) {
      return NextResponse.json({ success: false, error: "code is required" }, { status: 400 })
    }

    const existingRows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT code, activity
        FROM account_activities
        WHERE tenant_id = ${tenantContext.tenantId}
          AND code = ${code}
        LIMIT 1
      `,
    )

    if (!existingRows?.length) {
      return NextResponse.json({ success: false, error: "Activity code not found" }, { status: 404 })
    }

    let laborUsageCount = 0
    let expenseUsageCount = 0
    try {
      const laborRows = await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          SELECT COUNT(*)::int AS count
          FROM labor_transactions
          WHERE tenant_id = ${tenantContext.tenantId}
            AND code = ${code}
        `,
      )
      laborUsageCount = Number(laborRows?.[0]?.count) || 0
    } catch (error) {
      if (!isMissingRelation(error, "labor_transactions")) {
        throw error
      }
    }

    try {
      const expenseRows = await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          SELECT COUNT(*)::int AS count
          FROM expense_transactions
          WHERE tenant_id = ${tenantContext.tenantId}
            AND code = ${code}
        `,
      )
      expenseUsageCount = Number(expenseRows?.[0]?.count) || 0
    } catch (error) {
      if (!isMissingRelation(error, "expense_transactions")) {
        throw error
      }
    }

    if (laborUsageCount > 0 || expenseUsageCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "This activity code is already used in labor/expense records. Edit it instead of deleting.",
        },
        { status: 409 },
      )
    }

    await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        DELETE FROM account_activities
        WHERE tenant_id = ${tenantContext.tenantId}
          AND code = ${code}
      `,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "delete",
      entityType: "account_activities",
      entityId: code,
      before: existingRows?.[0] ?? null,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("❌ Error deleting activity codes:", error.message)
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
