import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"
import { canDeleteModule, canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const isMissingColumnError = (error: unknown, columnName: string) => {
  const code = String((error as any)?.code || "")
  const message = String((error as any)?.message || "")
  return code === "42703" || message.includes(`column "${columnName}" does not exist`)
}

const normalizeLocationId = (value: unknown) => {
  const normalized = String(value || "").trim()
  if (!normalized) return null
  return UUID_PATTERN.test(normalized) ? normalized : "invalid"
}

async function tableHasLocationColumn(tableName: string) {
  const rows = await accountsSql`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
      AND column_name = 'location_id'
    LIMIT 1
  `
  return Array.isArray(rows) && rows.length > 0
}

async function validateLocationForTenant(
  tenantContext: { tenantId: string; role: string },
  locationId: string | null,
) {
  if (!locationId) return null
  const rows = await runTenantQuery(
    accountsSql,
    tenantContext,
    accountsSql`
      SELECT id
      FROM locations
      WHERE id = ${locationId}::uuid
        AND tenant_id = ${tenantContext.tenantId}
      LIMIT 1
    `,
  )
  return rows?.length ? locationId : null
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const requestedLocationId = normalizeLocationId(searchParams.get("locationId"))
    if (requestedLocationId === "invalid") {
      return NextResponse.json({ success: false, error: "Invalid locationId" }, { status: 400 })
    }
    const supportsLocation = await tableHasLocationColumn("expense_transactions")
    const validLocationId = supportsLocation
      ? await validateLocationForTenant(tenantContext, requestedLocationId)
      : null
    if (supportsLocation && requestedLocationId && !validLocationId) {
      return NextResponse.json({ success: false, error: "Selected location is invalid for this tenant" }, { status: 400 })
    }
    const locationFilterClause =
      supportsLocation && validLocationId ? accountsSql` AND et.location_id = ${validLocationId}::uuid` : accountsSql``
    const all = searchParams.get("all") === "true"
    const limitParam = searchParams.get("limit")
    const offsetParam = searchParams.get("offset")
    const limit = !all && limitParam ? Math.min(Math.max(Number.parseInt(limitParam, 10) || 0, 1), 500) : null
    const offset = !all && offsetParam ? Math.max(Number.parseInt(offsetParam, 10) || 0, 0) : 0

    const deploymentRowsQuery = supportsLocation
      ? limit
        ? accountsSql`
            SELECT 
              et.id,
              et.entry_date as date,
              et.code,
              COALESCE(aa.activity, et.code) as reference,
              et.total_amount as amount,
              et.notes,
              et.location_id
            FROM expense_transactions et
            LEFT JOIN account_activities aa
              ON et.code = aa.code
              AND aa.tenant_id = ${tenantContext.tenantId}
            WHERE et.tenant_id = ${tenantContext.tenantId}
              ${locationFilterClause}
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
              et.notes,
              et.location_id
            FROM expense_transactions et
            LEFT JOIN account_activities aa
              ON et.code = aa.code
              AND aa.tenant_id = ${tenantContext.tenantId}
            WHERE et.tenant_id = ${tenantContext.tenantId}
              ${locationFilterClause}
            ORDER BY et.entry_date DESC
          `
      : limit
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
          `

    const queryList = [
      accountsSql`
        SELECT COUNT(*)::int as count
        FROM expense_transactions et
        WHERE et.tenant_id = ${tenantContext.tenantId}
          ${locationFilterClause}
      `,
      accountsSql`
        SELECT COALESCE(SUM(total_amount), 0) as total
        FROM expense_transactions et
        WHERE et.tenant_id = ${tenantContext.tenantId}
          ${locationFilterClause}
      `,
      deploymentRowsQuery,
    ]

    const [totalCountResult, totalAmountResult, result] = await runTenantQueries(accountsSql, tenantContext, queryList)

    const totalCount = Number(totalCountResult[0]?.count) || 0
    const totalAmount = Number(totalAmountResult[0]?.total) || 0


    // Transform the data to match the expected format
    const deployments = result.map((row: any) => ({
      id: row.id,
      date: row.date,
      code: row.code,
      reference: row.reference, // Use the reference from the JOIN
      amount: Number.parseFloat(row.amount),
      notes: row.notes || "",
      locationId: supportsLocation && row.location_id ? String(row.location_id) : null,
      user: "system",
    }))

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
    const { date, code, amount, notes } = body
    const requestedLocationId = normalizeLocationId(body?.locationId)
    if (requestedLocationId === "invalid") {
      return NextResponse.json({ success: false, error: "Invalid locationId" }, { status: 400 })
    }
    const supportsLocation = await tableHasLocationColumn("expense_transactions")
    const validLocationId = supportsLocation
      ? await validateLocationForTenant(tenantContext, requestedLocationId)
      : null
    if (supportsLocation && requestedLocationId && !validLocationId) {
      return NextResponse.json({ success: false, error: "Selected location is invalid for this tenant" }, { status: 400 })
    }
    const locationDedupClause = supportsLocation
      ? accountsSql` AND location_id IS NOT DISTINCT FROM ${validLocationId}::uuid`
      : accountsSql``

    // De-dupe accidental rapid double-submit from UI (same payload within the last 90 seconds).
    try {
      const duplicateRows = await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          SELECT id
          FROM expense_transactions
          WHERE tenant_id = ${tenantContext.tenantId}
            AND entry_date::date = ${date}::date
            AND code = ${code}
            AND COALESCE(total_amount, 0) = ${amount}
            AND COALESCE(notes, '') = ${notes || ""}
            ${locationDedupClause}
            AND created_at >= (CURRENT_TIMESTAMP - INTERVAL '90 seconds')
          ORDER BY id DESC
          LIMIT 1
        `,
      )
      if (duplicateRows?.length) {
        return NextResponse.json({
          success: true,
          id: duplicateRows[0].id,
          deduped: true,
          message: "Duplicate submission detected and ignored.",
        })
      }
    } catch (dedupeError) {
      if (!isMissingColumnError(dedupeError, "created_at")) {
        throw dedupeError
      }
    }

    const result = supportsLocation
      ? await runTenantQuery(
          accountsSql,
          tenantContext,
          accountsSql`
            INSERT INTO expense_transactions (
              entry_date,
              code,
              total_amount,
              notes,
              location_id,
              tenant_id
            ) VALUES (
              ${date}::timestamp,
              ${code},
              ${amount},
              ${notes || ""},
              ${validLocationId}::uuid,
              ${tenantContext.tenantId}
            )
            RETURNING id
          `,
        )
      : await runTenantQuery(
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
        location_id: supportsLocation ? validLocationId : null,
      },
    })


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
    const { id, date, code, amount, notes } = body
    const requestedLocationId = normalizeLocationId(body?.locationId)
    if (requestedLocationId === "invalid") {
      return NextResponse.json({ success: false, error: "Invalid locationId" }, { status: 400 })
    }
    const supportsLocation = await tableHasLocationColumn("expense_transactions")
    const validLocationId = supportsLocation
      ? await validateLocationForTenant(tenantContext, requestedLocationId)
      : null
    if (supportsLocation && requestedLocationId && !validLocationId) {
      return NextResponse.json({ success: false, error: "Selected location is invalid for this tenant" }, { status: 400 })
    }


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

    if (supportsLocation) {
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
            location_id = ${validLocationId}::uuid,
            tenant_id = ${tenantContext.tenantId}
          WHERE id = ${id}
            AND tenant_id = ${tenantContext.tenantId}
        `,
      )
    } else {
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
    }

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
        location_id: supportsLocation ? validLocationId : null,
      },
    })


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
