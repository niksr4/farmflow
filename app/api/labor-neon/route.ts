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
    const supportsLocation = await tableHasLocationColumn("labor_transactions")
    const validLocationId = supportsLocation
      ? await validateLocationForTenant(tenantContext, requestedLocationId)
      : null
    if (supportsLocation && requestedLocationId && !validLocationId) {
      return NextResponse.json({ success: false, error: "Selected location is invalid for this tenant" }, { status: 400 })
    }
    const locationFilterClause =
      supportsLocation && validLocationId ? accountsSql` AND location_id = ${validLocationId}::uuid` : accountsSql``
    const all = searchParams.get("all") === "true"
    const limitParam = searchParams.get("limit")
    const offsetParam = searchParams.get("offset")
    const limit = !all && limitParam ? Math.min(Math.max(Number.parseInt(limitParam, 10) || 0, 1), 500) : null
    const offset = !all && offsetParam ? Math.max(Number.parseInt(offsetParam, 10) || 0, 0) : 0

    const deploymentRowsQuery = supportsLocation
      ? limit
        ? accountsSql`
            SELECT 
              id,
              deployment_date as date,
              code,
              hf_laborers,
              hf_cost_per_laborer,
              outside_laborers,
              outside_cost_per_laborer,
              total_cost,
              notes,
              location_id
            FROM labor_transactions
            WHERE tenant_id = ${tenantContext.tenantId}
              ${locationFilterClause}
            ORDER BY deployment_date DESC
            LIMIT ${limit} OFFSET ${offset}
          `
        : accountsSql`
            SELECT 
              id,
              deployment_date as date,
              code,
              hf_laborers,
              hf_cost_per_laborer,
              outside_laborers,
              outside_cost_per_laborer,
              total_cost,
              notes,
              location_id
            FROM labor_transactions
            WHERE tenant_id = ${tenantContext.tenantId}
              ${locationFilterClause}
            ORDER BY deployment_date DESC
          `
      : limit
        ? accountsSql`
            SELECT 
              id,
              deployment_date as date,
              code,
              hf_laborers,
              hf_cost_per_laborer,
              outside_laborers,
              outside_cost_per_laborer,
              total_cost,
              notes
            FROM labor_transactions
            WHERE tenant_id = ${tenantContext.tenantId}
            ORDER BY deployment_date DESC
            LIMIT ${limit} OFFSET ${offset}
          `
        : accountsSql`
            SELECT 
              id,
              deployment_date as date,
              code,
              hf_laborers,
              hf_cost_per_laborer,
              outside_laborers,
              outside_cost_per_laborer,
              total_cost,
              notes
            FROM labor_transactions
            WHERE tenant_id = ${tenantContext.tenantId}
            ORDER BY deployment_date DESC
          `

    const queryList = [
      accountsSql`
        SELECT COUNT(*)::int as count
        FROM labor_transactions
        WHERE tenant_id = ${tenantContext.tenantId}
          ${locationFilterClause}
      `,
      accountsSql`
        SELECT COALESCE(SUM(total_cost), 0) as total
        FROM labor_transactions
        WHERE tenant_id = ${tenantContext.tenantId}
          ${locationFilterClause}
      `,
      deploymentRowsQuery,
    ]

    const [totalCountResult, totalCostResult, result] = await runTenantQueries(accountsSql, tenantContext, queryList)

    const totalCount = Number(totalCountResult[0]?.count) || 0
    const totalCost = Number(totalCostResult[0]?.total) || 0

    // Transform the data to match the expected format
    const deployments = result.map((row: any) => {
      const laborEntries = []

      // Add estate labor entry
      const hfLaborers = Number(row.hf_laborers) || 0
      const outsideLaborers = Number(row.outside_laborers) || 0
      const hfCostPerLaborer = Number.parseFloat(row.hf_cost_per_laborer || 0)
      const outsideCostPerLaborer = Number.parseFloat(row.outside_cost_per_laborer || 0)

      if (hfLaborers > 0) {
        laborEntries.push({
          name: "Estate Labor",
          laborCount: hfLaborers,
          costPerLabor: hfCostPerLaborer,
        })
      }

      // Add outside labor entry
      if (outsideLaborers > 0) {
        laborEntries.push({
          name: "Outside Labor",
          laborCount: outsideLaborers,
          costPerLabor: outsideCostPerLaborer,
        })
      }

      // Get reference from account_activities
      return {
        id: row.id,
        date: row.date,
        code: row.code,
        reference: "", // Will be filled by join or separate query
        laborEntries,
        totalCost: Number.parseFloat(row.total_cost),
        notes: row.notes || "",
        locationId: supportsLocation && row.location_id ? String(row.location_id) : null,
        user: "system",
      }
    })

    // Fetch references for all codes
    const codes = [...new Set(deployments.map((d) => String(d.code)))]
    if (codes.length > 0) {
      const references = await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          SELECT code, activity as reference
          FROM account_activities
          WHERE code = ANY(${codes})
            AND tenant_id = ${tenantContext.tenantId}
        `,
      )

      const referenceMap = new Map(references.map((r: any) => [r.code, r.reference]))

      deployments.forEach((d) => {
        d.reference = referenceMap.get(d.code) || d.code
      })
    }


    return NextResponse.json({
      success: true,
      deployments,
      totalCount,
      totalCost,
    })
  } catch (error: any) {
    console.error("❌ Error fetching labor deployments:", error.message)
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
    const { date, code, laborEntries, notes } = body

    const requestedLocationId = normalizeLocationId(body?.locationId)
    if (requestedLocationId === "invalid") {
      return NextResponse.json({ success: false, error: "Invalid locationId" }, { status: 400 })
    }
    const supportsLocation = await tableHasLocationColumn("labor_transactions")
    const validLocationId = supportsLocation
      ? await validateLocationForTenant(tenantContext, requestedLocationId)
      : null
    if (supportsLocation && requestedLocationId && !validLocationId) {
      return NextResponse.json({ success: false, error: "Selected location is invalid for this tenant" }, { status: 400 })
    }
    const locationDedupClause = supportsLocation
      ? accountsSql` AND location_id IS NOT DISTINCT FROM ${validLocationId}::uuid`
      : accountsSql``

    // Extract estate and outside labor details
    const hfEntry = laborEntries.find((e: any) => e.name === "Estate Labor")
    const outsideEntry = laborEntries.find((e: any) => e.name === "Outside Labor")
    const hfLaborers = Number(hfEntry?.laborCount) || 0
    const hfCostPer = Number(hfEntry?.costPerLabor) || 0
    const outsideLaborers = Number(outsideEntry?.laborCount) || 0
    const outsideCostPer = Number(outsideEntry?.costPerLabor) || 0
    const computedTotalCost = hfLaborers * hfCostPer + outsideLaborers * outsideCostPer

    // De-dupe accidental rapid double-submit from UI (same payload within the last 90 seconds).
    try {
      const duplicateRows = await runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          SELECT id
          FROM labor_transactions
          WHERE tenant_id = ${tenantContext.tenantId}
            AND deployment_date::date = ${date}::date
            AND code = ${code}
            AND COALESCE(hf_laborers, 0) = ${hfLaborers}
            AND COALESCE(hf_cost_per_laborer, 0) = ${hfCostPer}
            AND COALESCE(outside_laborers, 0) = ${outsideLaborers}
            AND COALESCE(outside_cost_per_laborer, 0) = ${outsideCostPer}
            AND COALESCE(total_cost, 0) = ${computedTotalCost}
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
            INSERT INTO labor_transactions (
              deployment_date,
              code,
              hf_laborers,
              hf_cost_per_laborer,
              outside_laborers,
              outside_cost_per_laborer,
              total_cost,
              notes,
              location_id,
              tenant_id
            ) VALUES (
              ${date}::timestamp,
              ${code},
              ${hfEntry?.laborCount || 0},
              ${hfEntry?.costPerLabor || 0},
              ${outsideEntry?.laborCount || 0},
              ${outsideEntry?.costPerLabor || 0},
              ${computedTotalCost},
              ${notes},
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
            INSERT INTO labor_transactions (
              deployment_date,
              code,
              hf_laborers,
              hf_cost_per_laborer,
              outside_laborers,
              outside_cost_per_laborer,
              total_cost,
              notes,
              tenant_id
            ) VALUES (
              ${date}::timestamp,
              ${code},
              ${hfEntry?.laborCount || 0},
              ${hfEntry?.costPerLabor || 0},
              ${outsideEntry?.laborCount || 0},
              ${outsideEntry?.costPerLabor || 0},
              ${computedTotalCost},
              ${notes},
              ${tenantContext.tenantId}
            )
            RETURNING id
          `,
        )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "create",
      entityType: "labor_transactions",
      entityId: result?.[0]?.id,
      after: {
        deployment_date: date,
        code,
        hf_laborers: hfLaborers,
        hf_cost_per_laborer: hfCostPer,
        outside_laborers: outsideLaborers,
        outside_cost_per_laborer: outsideCostPer,
        total_cost: computedTotalCost,
        notes,
        location_id: supportsLocation ? validLocationId : null,
      },
    })


    return NextResponse.json({
      success: true,
      id: result[0].id,
    })
  } catch (error: any) {
    console.error("❌ Error adding labor deployment:", error.message)
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
    const { id, date, code, laborEntries, notes } = body

    const requestedLocationId = normalizeLocationId(body?.locationId)
    if (requestedLocationId === "invalid") {
      return NextResponse.json({ success: false, error: "Invalid locationId" }, { status: 400 })
    }
    const supportsLocation = await tableHasLocationColumn("labor_transactions")
    const validLocationId = supportsLocation
      ? await validateLocationForTenant(tenantContext, requestedLocationId)
      : null
    if (supportsLocation && requestedLocationId && !validLocationId) {
      return NextResponse.json({ success: false, error: "Selected location is invalid for this tenant" }, { status: 400 })
    }

    // Extract estate and outside labor details
    const hfEntry = laborEntries.find((e: any) => e.name === "Estate Labor")
    const outsideEntry = laborEntries.find((e: any) => e.name === "Outside Labor")
    const hfLaborers = Number(hfEntry?.laborCount) || 0
    const hfCostPer = Number(hfEntry?.costPerLabor) || 0
    const outsideLaborers = Number(outsideEntry?.laborCount) || 0
    const outsideCostPer = Number(outsideEntry?.costPerLabor) || 0
    const computedTotalCost = hfLaborers * hfCostPer + outsideLaborers * outsideCostPer

    const existing = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT *
        FROM labor_transactions
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
          UPDATE labor_transactions
          SET
            deployment_date = ${date}::timestamp,
            code = ${code},
            hf_laborers = ${hfEntry?.laborCount || 0},
            hf_cost_per_laborer = ${hfEntry?.costPerLabor || 0},
            outside_laborers = ${outsideEntry?.laborCount || 0},
            outside_cost_per_laborer = ${outsideEntry?.costPerLabor || 0},
            total_cost = ${computedTotalCost},
            notes = ${notes},
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
          UPDATE labor_transactions
          SET
            deployment_date = ${date}::timestamp,
            code = ${code},
            hf_laborers = ${hfEntry?.laborCount || 0},
            hf_cost_per_laborer = ${hfEntry?.costPerLabor || 0},
            outside_laborers = ${outsideEntry?.laborCount || 0},
            outside_cost_per_laborer = ${outsideEntry?.costPerLabor || 0},
            total_cost = ${computedTotalCost},
            notes = ${notes},
            tenant_id = ${tenantContext.tenantId}
          WHERE id = ${id}
            AND tenant_id = ${tenantContext.tenantId}
        `,
      )
    }

    await logAuditEvent(accountsSql, sessionUser, {
      action: "update",
      entityType: "labor_transactions",
      entityId: id,
      before: existing?.[0] ?? null,
      after: {
        deployment_date: date,
        code,
        hf_laborers: hfLaborers,
        hf_cost_per_laborer: hfCostPer,
        outside_laborers: outsideLaborers,
        outside_cost_per_laborer: outsideCostPer,
        total_cost: computedTotalCost,
        notes,
        location_id: supportsLocation ? validLocationId : null,
      },
    })


    return NextResponse.json({
      success: true,
    })
  } catch (error: any) {
    console.error("❌ Error updating labor deployment:", error.message)
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
        FROM labor_transactions
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        DELETE FROM labor_transactions
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "delete",
      entityType: "labor_transactions",
      entityId: existing?.[0]?.id ?? id,
      before: existing?.[0] ?? null,
    })


    return NextResponse.json({
      success: true,
    })
  } catch (error: any) {
    console.error("❌ Error deleting labor deployment:", error.message)
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
