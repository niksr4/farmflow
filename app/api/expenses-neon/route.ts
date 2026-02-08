import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"
import { canDeleteModule, canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"

export async function GET(request: Request) {
  try {
    console.log("📡 Fetching all expense transactions from accounts_db...")
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const all = searchParams.get("all") === "true"
    const limitParam = searchParams.get("limit")
    const offsetParam = searchParams.get("offset")
    const limit = !all && limitParam ? Math.min(Math.max(Number.parseInt(limitParam, 10) || 0, 1), 500) : null
    const offset = !all && offsetParam ? Math.max(Number.parseInt(offsetParam, 10) || 0, 0) : 0

    const queryList = [
      accountsSql`
        SELECT COUNT(*)::int as count
        FROM expense_transactions
        WHERE tenant_id = ${tenantContext.tenantId}
      `,
      accountsSql`
        SELECT COALESCE(SUM(total_amount), 0) as total
        FROM expense_transactions
        WHERE tenant_id = ${tenantContext.tenantId}
      `,
      limit
        ? accountsSql`
            SELECT 
              et.id,
              et.entry_date as date,
              et.code,
              COALESCE(aa.activity, et.code) as reference,
              et.total_amount as amount,
              et.notes
            FROM expense_transactions et
            LEFT JOIN account_activities aa
              ON et.code = aa.code
              AND aa.tenant_id = ${tenantContext.tenantId}
            WHERE et.tenant_id = ${tenantContext.tenantId}
            ORDER BY et.entry_date DESC
            LIMIT ${limit} OFFSET ${offset}
          `
        : accountsSql`
            SELECT 
              et.id,
              et.entry_date as date,
              et.code,
              COALESCE(aa.activity, et.code) as reference,
              et.total_amount as amount,
              et.notes
            FROM expense_transactions et
            LEFT JOIN account_activities aa
              ON et.code = aa.code
              AND aa.tenant_id = ${tenantContext.tenantId}
            WHERE et.tenant_id = ${tenantContext.tenantId}
            ORDER BY et.entry_date DESC
          `,
    ]

    const [totalCountResult, totalAmountResult, result] = await runTenantQueries(accountsSql, tenantContext, queryList)

    const totalCount = Number(totalCountResult[0]?.count) || 0
    const totalAmount = Number(totalAmountResult[0]?.total) || 0

    console.log("📊 Sample raw result:", JSON.stringify(result[0], null, 2))

    // Transform the data to match the expected format
    const deployments = result.map((row: any) => ({
      id: row.id,
      date: row.date,
      code: row.code,
      reference: row.reference, // Use the reference from the JOIN
      amount: Number.parseFloat(row.amount),
      notes: row.notes || "",
      user: "system",
    }))

    console.log(`✅ Found ${deployments.length} expense transactions`)
    if (deployments.length > 0) {
      console.log("📋 First deployment:", JSON.stringify(deployments[0], null, 2))
    }

    return NextResponse.json({
      success: true,
      deployments,
      totalCount,
      totalAmount,
    })
  } catch (error: any) {
    console.error("❌ Error fetching expenses:", error.message)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled", deployments: [] }, { status: 403 })
    }
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        deployments: [],
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
    const { date, code, reference, amount, notes, user } = body

    console.log("➕ Adding new expense:", { code, reference, amount })

    const result = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        INSERT INTO expense_transactions (
          entry_date,
          code,
          total_amount,
          notes,
          tenant_id
        ) VALUES (
          ${date}::timestamp,
          ${code},
          ${amount},
          ${notes || ""},
          ${tenantContext.tenantId}
        )
        RETURNING id
      `,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "create",
      entityType: "expense_transactions",
      entityId: result?.[0]?.id,
      after: {
        entry_date: date,
        code,
        total_amount: amount,
        notes,
      },
    })

    console.log("✅ Expense added successfully with ID:", result[0].id)

    return NextResponse.json({
      success: true,
      id: result[0].id,
    })
  } catch (error: any) {
    console.error("❌ Error adding expense:", error.message)
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
    const { id, date, code, reference, amount, notes } = body

    console.log("📝 Updating expense:", id, { code, reference, amount })

    const existing = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT *
        FROM expense_transactions
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        UPDATE expense_transactions
        SET
          entry_date = ${date}::timestamp,
          code = ${code},
          total_amount = ${amount},
          notes = ${notes || ""},
          tenant_id = ${tenantContext.tenantId}
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "update",
      entityType: "expense_transactions",
      entityId: id,
      before: existing?.[0] ?? null,
      after: {
        entry_date: date,
        code,
        total_amount: amount,
        notes,
      },
    })

    console.log("✅ Expense updated successfully")

    return NextResponse.json({
      success: true,
    })
  } catch (error: any) {
    console.error("❌ Error updating expense:", error.message)
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
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    const sessionUser = await requireModuleAccess("accounts")
    if (!canDeleteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    if (!id) {
      return NextResponse.json({ success: false, error: "ID is required" }, { status: 400 })
    }

    console.log("🗑️ Deleting expense:", id)

    const existing = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT *
        FROM expense_transactions
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        DELETE FROM expense_transactions
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "delete",
      entityType: "expense_transactions",
      entityId: existing?.[0]?.id ?? id,
      before: existing?.[0] ?? null,
    })

    console.log("✅ Expense deleted successfully")

    return NextResponse.json({
      success: true,
    })
  } catch (error: any) {
    console.error("❌ Error deleting expense:", error.message)
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
