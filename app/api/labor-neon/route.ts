import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"
import { canDeleteModule, canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"

export async function GET(request: Request) {
  try {
    console.log("📡 Fetching all labor transactions from accounts_db...")
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
        FROM labor_transactions
        WHERE tenant_id = ${tenantContext.tenantId}
      `,
      accountsSql`
        SELECT COALESCE(SUM(total_cost), 0) as total
        FROM labor_transactions
        WHERE tenant_id = ${tenantContext.tenantId}
      `,
      limit
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
          `,
    ]

    const [totalCountResult, totalCostResult, result] = await runTenantQueries(accountsSql, tenantContext, queryList)

    const totalCount = Number(totalCountResult[0]?.count) || 0
    const totalCost = Number(totalCostResult[0]?.total) || 0

    // Transform the data to match the expected format
    const deployments = result.map((row: any) => {
      const laborEntries = []

      // Add HF labor entry
      if (row.hf_laborers && row.hf_laborers > 0) {
        laborEntries.push({
          name: "Estate Labor",
          laborCount: row.hf_laborers,
          costPerLabor: Number.parseFloat(row.hf_cost_per_laborer || 0),
        })
      }

      // Add outside labor entry
      if (row.outside_laborers && row.outside_laborers > 0) {
        laborEntries.push({
          name: "Outside Labor",
          laborCount: row.outside_laborers,
          costPerLabor: Number.parseFloat(row.outside_cost_per_laborer || 0),
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

    console.log(`✅ Found ${deployments.length} labor deployments`)

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
    const { date, code, reference, laborEntries, totalCost, notes, user } = body

    console.log("➕ Adding new labor deployment:", { code, reference, totalCost })

    // Extract HF and outside labor details
    const hfEntry = laborEntries.find((e: any) => e.name === "Estate Labor")
    const outsideEntry = laborEntries.find((e: any) => e.name === "Outside Labor")
    const hfLaborers = Number(hfEntry?.laborCount) || 0
    const hfCostPer = Number(hfEntry?.costPerLabor) || 0
    const outsideLaborers = Number(outsideEntry?.laborCount) || 0
    const outsideCostPer = Number(outsideEntry?.costPerLabor) || 0
    const computedTotalCost = hfLaborers * hfCostPer + outsideLaborers * outsideCostPer

    const result = await runTenantQuery(
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
      },
    })

    console.log("✅ Labor deployment added successfully")

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
    const { id, date, code, reference, laborEntries, totalCost, notes } = body

    console.log("📝 Updating labor deployment:", id)

    // Extract HF and outside labor details
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
      },
    })

    console.log("✅ Labor deployment updated successfully")

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

    console.log("🗑️ Deleting labor deployment:", id)

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

    console.log("✅ Labor deployment deleted successfully")

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
