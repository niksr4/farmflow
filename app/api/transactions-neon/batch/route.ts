import { type NextRequest, NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery, runTenantTransaction } from "@/lib/server/tenant-db"
import { canDeleteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { repairCurrentInventoryUpsertConstraints } from "@/lib/server/current-inventory-constraints"
import { logRouteMutationFailure } from "@/lib/server/route-error-events"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"
import { resolveTenantUserUuid } from "@/lib/server/tenant-user"

export const dynamic = "force-dynamic"

// The whole replace ships as one transaction, so the batch has to fit in a single request.
const MAX_BATCH_TRANSACTIONS = 5000

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

    if (transactions.length > MAX_BATCH_TRANSACTIONS) {
      return NextResponse.json(
        {
          success: false,
          message: `Refusing to replace ${transactions.length} transactions in one request (limit ${MAX_BATCH_TRANSACTIONS}). The replace runs as a single transaction so a failure cannot leave the ledger half-written, and a batch this large risks exceeding the request size limit. Split the import into smaller batches.`,
        },
        { status: 413 },
      )
    }

    // Global DDL self-healing on the shared current_inventory constraints. Runs on adminSql and
    // must sit outside the data transaction below; hoisted above the delete so the ON CONFLICT
    // upsert in the AFTER INSERT trigger has the constraint it needs.
    await repairCurrentInventoryUpsertConstraints(tenantContext)

    const sortedTransactions = [...transactions].sort((a, b) => {
      const dateA = a?.transaction_date ? new Date(a.transaction_date).getTime() : 0
      const dateB = b?.transaction_date ? new Date(b.transaction_date).getTime() : 0
      return dateA - dateB
    })

    // Wipe-and-replace in ONE transaction. Previously the two deletes and every insert ran as
    // separate transactions, so a failure partway through the insert loop committed the delete
    // and only some of the rows — permanent, unrecoverable partial loss of the tenant's whole
    // inventory ledger. Inserts stay ordered by date so the average-cost trigger math replays
    // the same way it did originally.
    await runTenantTransaction(accountsSql, tenantContext, (txn) => [
      txn`
        DELETE FROM transaction_history
        WHERE tenant_id = ${tenantContext.tenantId}
      `,
      txn`
        DELETE FROM current_inventory
        WHERE tenant_id = ${tenantContext.tenantId}
      `,
      ...sortedTransactions.map((t) => {
        const resolvedLocationId = typeof t.location_id === "string" ? t.location_id.trim() : ""
        const locationValue =
          resolvedLocationId && resolvedLocationId !== "unassigned" ? resolvedLocationId : null

        return txn`
          INSERT INTO transaction_history (
            item_type, quantity, transaction_type, notes,
            transaction_date, user_id, user_uuid, price, total_cost,
            tenant_id, location_id, unit
          )
          VALUES (
            ${t.item_type},
            ${t.quantity},
            ${t.transaction_type},
            ${t.notes || ""},
            ${t.transaction_date || new Date().toISOString()},
            ${t.user_id || "system"},
            ${tenantUserUuid},
            ${t.price || 0},
            ${t.total_cost || 0},
            ${tenantContext.tenantId},
            ${locationValue},
            ${t.unit || "kg"}
          )
        `
      }),
    ])

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
        message: sanitizeRouteError(error, "Failed to batch update transactions"),
      },
      { status: 500 }
    )
  }
}
