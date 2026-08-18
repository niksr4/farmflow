import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { canDeleteModule, canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { buildMissingAccountActivitySuggestions } from "@/lib/account-activity-suggestions"

export const dynamic = "force-dynamic"
export const revalidate = 0

const normalizeCode = (value: unknown) => String(value || "").trim().toUpperCase()
const normalizeReference = (value: unknown) => String(value || "").trim()
const MAX_ACTIVITY_CODE_LENGTH = 10

const isMissingRelation = (error: unknown, tableName: string) => {
  const message = String((error as any)?.message || "")
  return message.includes(`relation "${tableName}" does not exist`)
}

export async function GET(_request: Request) {
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
            aa.module_hint,
            aa.tracks_inventory,
            COALESCE(lt.usage_count, 0)::int AS labor_count,
            COALESCE(et.usage_count, 0)::int AS expense_count,
            -- The muster is the third place a code gets used. Without it the UI counts a
            -- heavily-used code as unused and offers a Delete button that the DELETE handler
            -- then refuses -- an error the estate did nothing to deserve.
            COALESCE(la.usage_count, 0)::int AS assignment_count
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
          LEFT JOIN (
            SELECT activity_code AS code, COUNT(*)::int AS usage_count
            FROM labour_assignments
            WHERE tenant_id = ${tenantContext.tenantId}
            GROUP BY activity_code
          ) la ON la.code = aa.code
          WHERE aa.tenant_id = ${tenantContext.tenantId}
          ORDER BY aa.code ASC
        `,
      )
    } catch (error) {
      if (
        !isMissingRelation(error, "labor_transactions") &&
        !isMissingRelation(error, "expense_transactions") &&
        !isMissingRelation(error, "labour_assignments")
      ) {
        throw error
      }
      result = await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          SELECT
            code,
            activity as reference,
            module_hint,
            tracks_inventory,
            0::int AS labor_count,
            0::int AS expense_count,
            0::int AS assignment_count
          FROM account_activities
          WHERE tenant_id = ${tenantContext.tenantId}
          ORDER BY code ASC
        `,
      )
    }

    return NextResponse.json({
      success: true,
      activities: result,
      suggestions: buildMissingAccountActivitySuggestions((result || []).map((row: any) => row.code)),
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
    if (!canWriteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json()
    const code = normalizeCode(body?.code)
    const activity = normalizeReference(body?.activity)
    if (!code || !activity) {
      return NextResponse.json({ success: false, error: "code and activity are required" }, { status: 400 })
    }
    if (code.length > MAX_ACTIVITY_CODE_LENGTH) {
      return NextResponse.json(
        { success: false, error: `code must be ${MAX_ACTIVITY_CODE_LENGTH} characters or fewer` },
        { status: 400 },
      )
    }


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
    if (!canWriteModule(sessionUser.role, "accounts")) {
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

    // The code itself is not editable. It is the identifier every record is filed under, and
    // the rename that used to live here rewrote history to match: it copied the code to a new
    // row and then UPDATEd labor_transactions and expense_transactions to point at it, so
    // "what did 151 cost last season" silently changed answer. That is the opposite of a single
    // source of truth, and the estate asked for it to stop.
    //
    // It had also grown a hole. The cascade knew about labor_transactions and
    // expense_transactions but never labour_assignments, which did not exist when it was
    // written -- so on a muster tenant a rename left every allocation pointing at a code that
    // no longer existed. Refusing the rename closes that without having to maintain the
    // cascade across a growing number of tables.
    //
    // The description stays editable: it is a label, not an identifier, and fixing a typo in
    // it changes no record's meaning.
    if (nextCode !== currentCode) {
      return NextResponse.json(
        {
          success: false,
          error:
            "An activity code cannot be renamed — every record filed under it would have to be rewritten. Add a new code and stop using this one instead. The description can still be edited.",
        },
        { status: 409 },
      )
    }

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
    if (!canDeleteModule(sessionUser.role, "accounts")) {
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

    // The muster is the third place a code gets used, and it was missing from this guard --
    // so on a tenant using labour_assignments a code could be deleted out from under live
    // allocations, leaving the muster pointing at a code the picker no longer offers.
    let assignmentUsageCount = 0
    try {
      const assignmentRows = await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          SELECT COUNT(*)::int AS count
          FROM labour_assignments
          WHERE tenant_id = ${tenantContext.tenantId}
            AND activity_code = ${code}
        `,
      )
      assignmentUsageCount = Number(assignmentRows?.[0]?.count) || 0
    } catch (error) {
      if (!isMissingRelation(error, "labour_assignments")) {
        throw error
      }
    }

    if (laborUsageCount > 0 || expenseUsageCount > 0 || assignmentUsageCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This activity code is already used in labour, expense or muster records. Edit its description instead of deleting it.",
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
