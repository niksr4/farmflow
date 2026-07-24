import { type NextRequest, NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { canDeleteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { repairCurrentInventoryUpsertConstraints } from "@/lib/server/current-inventory-constraints"
import { logRouteMutationFailure } from "@/lib/server/route-error-events"
import { resolveTenantUserUuid } from "@/lib/server/tenant-user"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  let tenantId: string | null = null
  try {
    const sessionUser = await requireModuleAccess("transactions")
    if (!canDeleteModule(sessionUser.role, "transactions")) {
      return NextResponse.json({ success: false, message: "Insufficient role" }, { status: 403 })
    }
    tenantId = sessionUser.tenantId
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const tenantUserUuid = await resolveTenantUserUuid(sessionUser)
    const body = await request.json()
    const { transactions } = body

    if (!Array.isArray(transactions)) {
      return NextResponse.json(
        {
          success: false,
          message: "Transactions must be an array"
        },
        { status: 400 }
      )
    }

    if (transactions.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Refusing to replace all transactions with an empty array — this would wipe transaction_history and current_inventory for the tenant with no way to restore them.",
        },
        { status: 400 },
      )
    }

    const existingCountRows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT COUNT(*)::int AS count
        FROM transaction_history
        WHERE tenant_id = ${tenantContext.tenantId}
      `,
    )
    const existingCount = Number((existingCountRows as Array<{ count: number }>)?.[0]?.count) || 0

    // Delete all existing transactions and reset inventory before re-insert
    await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        DELETE FROM transaction_history
        WHERE tenant_id = ${tenantContext.tenantId}
      `,
    )

    await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        DELETE FROM current_inventory
        WHERE tenant_id = ${tenantContext.tenantId}
      `,
    )

    await repairCurrentInventoryUpsertConstraints(tenantContext)
    
    const sortedTransactions = [...transactions].sort((a, b) => {
      const dateA = a?.transaction_date ? new Date(a.transaction_date).getTime() : 0
      const dateB = b?.transaction_date ? new Date(b.transaction_date).getTime() : 0
      return dateA - dateB
    })

    // Insert all transactions (ascending by date to keep average-cost math stable)
    for (const txn of sortedTransactions) {
      const resolvedLocationId = typeof txn.location_id === "string" ? txn.location_id.trim() : ""
      const locationValue = resolvedLocationId && resolvedLocationId !== "unassigned" ? resolvedLocationId : null

      await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          INSERT INTO transaction_history (
            item_type, quantity, transaction_type, notes,
            transaction_date, user_id, user_uuid, price, total_cost,
            tenant_id, location_id, unit
          )
          VALUES (
            ${txn.item_type},
            ${txn.quantity},
            ${txn.transaction_type},
            ${txn.notes || ""},
            ${txn.transaction_date || new Date().toISOString()},
            ${txn.user_id || "system"},
            ${tenantUserUuid},
            ${txn.price || 0},
            ${txn.total_cost || 0},
            ${tenantContext.tenantId},
            ${locationValue},
            ${txn.unit || "kg"}
          )
        `,
      )
    }

    // Fetch updated transactions
    const updatedTransactions = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT
          id,
          item_type,
          quantity,
          transaction_type,
          notes,
          transaction_date,
          user_id,
          price,
          total_cost,
          location_id
        FROM transaction_history
        WHERE tenant_id = ${tenantContext.tenantId}
        ORDER BY transaction_date DESC
        LIMIT 1000
      `,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "upsert",
      entityType: "transaction_history",
      entityId: null,
      before: { count: existingCount },
      after: { count: updatedTransactions.length },
    })

    return NextResponse.json({
      success: true,
      transactions: updatedTransactions,
      count: updatedTransactions.length,
    })
  } catch (error: any) {
    console.error("❌ Error in batch update:", error)
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, message: "Module access disabled" }, { status: 403 })
    }
    await logRouteMutationFailure({
      tenantId,
      source: "api/transactions-neon-batch",
      endpoint: "/api/transactions-neon/batch",
      action: "batch_replace_transactions",
      error,
    })
    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Failed to batch update transactions",
        error: error?.toString() || String(error),
      },
      { status: 500 }
    )
  }
}
