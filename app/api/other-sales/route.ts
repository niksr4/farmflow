import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { canDeleteModule, canWriteModule } from "@/lib/permissions"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"
import { resolveLocationInfo } from "@/lib/server/location-utils"
import { logAuditEvent } from "@/lib/server/audit-log"

export const dynamic = "force-dynamic"
export const revalidate = 0

const ASSET_TYPES = ["Pepper", "Arecanut", "Avocado", "Coconut", "Other"] as const
const SALE_MODES = ["per_kg", "contract"] as const

type AssetType = (typeof ASSET_TYPES)[number]
type SaleMode = (typeof SALE_MODES)[number]

const isScopedUserRole = (role: string | null | undefined) => String(role || "").toLowerCase() === "user"

const round2 = (value: number) => Number(value.toFixed(2))

const toNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : NaN
}

const canonicalizeAssetType = (value: unknown): AssetType | null => {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return null
  if (normalized.includes("pepper")) return "Pepper"
  if (normalized.includes("arecanut") || normalized.includes("areca")) return "Arecanut"
  if (normalized.includes("avocado")) return "Avocado"
  if (normalized.includes("coconut") || normalized.includes("cocount")) return "Coconut"
  if (normalized.includes("other")) return "Other"
  return null
}

const canonicalizeSaleMode = (value: unknown): SaleMode | null => {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return null
  if (normalized === "per_kg" || normalized === "perkg" || normalized === "kg") return "per_kg"
  if (normalized === "contract") return "contract"
  return null
}

const parseDate = (value: unknown) => {
  const date = String(value || "").trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ""
}

type ParsedPayload = {
  saleDate: string
  assetType: AssetType
  saleMode: SaleMode
  kgsSold: number | null
  ratePerKg: number | null
  contractAmount: number | null
  revenue: number
  buyerName: string | null
  bankAccount: string | null
  notes: string | null
  locationId: string | null
  estate: string | null
}

const parsePayload = (body: any): { data: ParsedPayload | null; error: string | null } => {
  const saleDate = parseDate(body?.sale_date)
  if (!saleDate) {
    return { data: null, error: "sale_date is required (YYYY-MM-DD)." }
  }

  const assetType = canonicalizeAssetType(body?.asset_type)
  if (!assetType) {
    return { data: null, error: "asset_type must be Pepper, Arecanut, Avocado, Coconut, or Other." }
  }

  const saleMode = canonicalizeSaleMode(body?.sale_mode)
  if (!saleMode) {
    return { data: null, error: "sale_mode must be per_kg or contract." }
  }

  const buyerName = String(body?.buyer_name || "").trim() || null
  const bankAccount = String(body?.bank_account || "").trim() || null
  const notes = String(body?.notes || "").trim() || null
  const locationIdRaw = String(body?.location_id || "").trim()
  const locationId = locationIdRaw || null
  const estate = String(body?.estate || "").trim() || null

  if (saleMode === "per_kg") {
    const kgsSold = toNumber(body?.kgs_sold)
    const ratePerKg = toNumber(body?.rate_per_kg)
    if (!Number.isFinite(kgsSold) || kgsSold <= 0) {
      return { data: null, error: "kgs_sold must be greater than 0 for per-kg sales." }
    }
    if (!Number.isFinite(ratePerKg) || ratePerKg < 0) {
      return { data: null, error: "rate_per_kg must be 0 or more for per-kg sales." }
    }
    const revenue = round2(kgsSold * ratePerKg)
    return {
      data: {
        saleDate,
        assetType,
        saleMode,
        kgsSold: round2(kgsSold),
        ratePerKg: round2(ratePerKg),
        contractAmount: null,
        revenue,
        buyerName,
        bankAccount,
        notes,
        locationId,
        estate,
      },
      error: null,
    }
  }

  const contractAmount = toNumber(body?.contract_amount ?? body?.revenue)
  if (!Number.isFinite(contractAmount) || contractAmount < 0) {
    return { data: null, error: "contract_amount must be 0 or more for contract sales." }
  }

  return {
    data: {
      saleDate,
      assetType,
      saleMode,
      kgsSold: null,
      ratePerKg: null,
      contractAmount: round2(contractAmount),
      revenue: round2(contractAmount),
      buyerName,
      bankAccount,
      notes,
      locationId,
      estate,
    },
    error: null,
  }
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("other-sales")
    if (isScopedUserRole(sessionUser.role)) {
      return NextResponse.json({ success: false, error: "Other sales access is restricted for this role." }, { status: 403 })
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)
    const startDate = parseDate(searchParams.get("startDate"))
    const endDate = parseDate(searchParams.get("endDate"))
    const locationId = String(searchParams.get("locationId") || "").trim()
    const saleMode = canonicalizeSaleMode(searchParams.get("saleMode"))
    const assetType = canonicalizeAssetType(searchParams.get("assetType"))
    const all = searchParams.get("all") === "true"
    const limitParam = searchParams.get("limit")
    const offsetParam = searchParams.get("offset")
    const limit = !all && limitParam ? Math.min(Math.max(Number.parseInt(limitParam, 10) || 0, 1), 500) : null
    const offset = !all && offsetParam ? Math.max(Number.parseInt(offsetParam, 10) || 0, 0) : 0

    const dateClause =
      startDate && endDate
        ? sql` AND os.sale_date >= ${startDate}::date AND os.sale_date <= ${endDate}::date`
        : startDate
          ? sql` AND os.sale_date >= ${startDate}::date`
          : endDate
            ? sql` AND os.sale_date <= ${endDate}::date`
            : sql``
    const locationClause = locationId ? sql` AND os.location_id = ${locationId}` : sql``
    const modeClause = saleMode ? sql` AND os.sale_mode = ${saleMode}` : sql``
    const assetClause = assetType ? sql` AND os.asset_type = ${assetType}` : sql``

    const queries = [
      sql`
        SELECT COUNT(*)::int AS count
        FROM other_sales_records os
        WHERE os.tenant_id = ${tenantContext.tenantId}
          ${dateClause}
          ${locationClause}
          ${modeClause}
          ${assetClause}
      `,
      sql`
        SELECT
          COALESCE(SUM(revenue), 0) AS total_revenue,
          COALESCE(SUM(CASE WHEN sale_mode = 'per_kg' THEN revenue ELSE 0 END), 0) AS per_kg_revenue,
          COALESCE(SUM(CASE WHEN sale_mode = 'contract' THEN revenue ELSE 0 END), 0) AS contract_revenue,
          COALESCE(SUM(CASE WHEN sale_mode = 'per_kg' THEN COALESCE(kgs_sold, 0) ELSE 0 END), 0) AS total_kgs_sold
        FROM other_sales_records os
        WHERE os.tenant_id = ${tenantContext.tenantId}
          ${dateClause}
          ${locationClause}
          ${modeClause}
          ${assetClause}
      `,
      sql`
        SELECT
          asset_type,
          COALESCE(SUM(revenue), 0) AS revenue,
          COALESCE(SUM(CASE WHEN sale_mode = 'per_kg' THEN COALESCE(kgs_sold, 0) ELSE 0 END), 0) AS kgs_sold,
          COUNT(*)::int AS count
        FROM other_sales_records os
        WHERE os.tenant_id = ${tenantContext.tenantId}
          ${dateClause}
          ${locationClause}
          ${modeClause}
          ${assetClause}
        GROUP BY asset_type
        ORDER BY revenue DESC, asset_type ASC
      `,
      limit
        ? sql`
            SELECT os.*, l.name AS location_name, l.code AS location_code
            FROM other_sales_records os
            LEFT JOIN locations l ON l.id = os.location_id
            WHERE os.tenant_id = ${tenantContext.tenantId}
              ${dateClause}
              ${locationClause}
              ${modeClause}
              ${assetClause}
            ORDER BY os.sale_date DESC, os.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
          `
        : sql`
            SELECT os.*, l.name AS location_name, l.code AS location_code
            FROM other_sales_records os
            LEFT JOIN locations l ON l.id = os.location_id
            WHERE os.tenant_id = ${tenantContext.tenantId}
              ${dateClause}
              ${locationClause}
              ${modeClause}
              ${assetClause}
            ORDER BY os.sale_date DESC, os.created_at DESC
          `,
    ]

    const [countRows, totalsRows, byAssetRows, recordRows] = await runTenantQueries(sql, tenantContext, queries)

    return NextResponse.json({
      success: true,
      records: recordRows || [],
      totalCount: Number(countRows?.[0]?.count) || 0,
      totals: {
        totalRevenue: Number(totalsRows?.[0]?.total_revenue) || 0,
        perKgRevenue: Number(totalsRows?.[0]?.per_kg_revenue) || 0,
        contractRevenue: Number(totalsRows?.[0]?.contract_revenue) || 0,
        totalKgsSold: Number(totalsRows?.[0]?.total_kgs_sold) || 0,
      },
      byAsset: (byAssetRows || []).map((row: any) => ({
        assetType: String(row.asset_type || "Other"),
        revenue: Number(row.revenue) || 0,
        kgsSold: Number(row.kgs_sold) || 0,
        count: Number(row.count) || 0,
      })),
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        locationId: locationId || null,
        saleMode: saleMode || null,
        assetType: assetType || null,
      },
    })
  } catch (error: any) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    if (String(error?.message || "").includes("does not exist")) {
      return NextResponse.json({
        success: true,
        records: [],
        totalCount: 0,
        totals: { totalRevenue: 0, perKgRevenue: 0, contractRevenue: 0, totalKgsSold: 0 },
        byAsset: [],
      })
    }
    console.error("Error loading other sales records:", error)
    return NextResponse.json({ success: false, error: error.message || "Failed to load records" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("other-sales")
    if (isScopedUserRole(sessionUser.role)) {
      return NextResponse.json({ success: false, error: "Other sales access is restricted for this role." }, { status: 403 })
    }
    if (!canWriteModule(sessionUser.role, "other-sales")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }

    const body = await request.json()
    const parsed = parsePayload(body)
    if (!parsed.data) {
      return NextResponse.json({ success: false, error: parsed.error || "Invalid payload" }, { status: 400 })
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const locationInfo = await resolveLocationInfo(sql, tenantContext, {
      locationId: parsed.data.locationId,
      estate: parsed.data.estate,
    })
    if (!locationInfo) {
      return NextResponse.json({ success: false, error: "Estate/location is required." }, { status: 400 })
    }

    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO other_sales_records (
          tenant_id,
          sale_date,
          location_id,
          asset_type,
          sale_mode,
          kgs_sold,
          rate_per_kg,
          contract_amount,
          revenue,
          buyer_name,
          bank_account,
          notes,
          created_by
        )
        VALUES (
          ${tenantContext.tenantId},
          ${parsed.data.saleDate}::date,
          ${locationInfo.id},
          ${parsed.data.assetType},
          ${parsed.data.saleMode},
          ${parsed.data.kgsSold},
          ${parsed.data.ratePerKg},
          ${parsed.data.contractAmount},
          ${parsed.data.revenue},
          ${parsed.data.buyerName},
          ${parsed.data.bankAccount},
          ${parsed.data.notes},
          ${sessionUser.username || "system"}
        )
        RETURNING *
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "create",
      entityType: "other_sales_records",
      entityId: rows?.[0]?.id,
      after: rows?.[0] ?? null,
    })

    return NextResponse.json({ success: true, record: rows?.[0] })
  } catch (error: any) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    console.error("Error creating other sale record:", error)
    return NextResponse.json({ success: false, error: error.message || "Failed to create record" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("other-sales")
    if (isScopedUserRole(sessionUser.role)) {
      return NextResponse.json({ success: false, error: "Other sales access is restricted for this role." }, { status: 403 })
    }
    if (!canWriteModule(sessionUser.role, "other-sales")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }

    const body = await request.json()
    const id = Number(body?.id)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "id is required." }, { status: 400 })
    }

    const parsed = parsePayload(body)
    if (!parsed.data) {
      return NextResponse.json({ success: false, error: parsed.error || "Invalid payload" }, { status: 400 })
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const existing = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT *
        FROM other_sales_records
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )
    if (!existing?.length) {
      return NextResponse.json({ success: false, error: "Record not found." }, { status: 404 })
    }

    const locationInfo = await resolveLocationInfo(sql, tenantContext, {
      locationId: parsed.data.locationId,
      estate: parsed.data.estate,
    })
    if (!locationInfo) {
      return NextResponse.json({ success: false, error: "Estate/location is required." }, { status: 400 })
    }

    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        UPDATE other_sales_records
        SET
          sale_date = ${parsed.data.saleDate}::date,
          location_id = ${locationInfo.id},
          asset_type = ${parsed.data.assetType},
          sale_mode = ${parsed.data.saleMode},
          kgs_sold = ${parsed.data.kgsSold},
          rate_per_kg = ${parsed.data.ratePerKg},
          contract_amount = ${parsed.data.contractAmount},
          revenue = ${parsed.data.revenue},
          buyer_name = ${parsed.data.buyerName},
          bank_account = ${parsed.data.bankAccount},
          notes = ${parsed.data.notes},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
        RETURNING *
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "other_sales_records",
      entityId: rows?.[0]?.id ?? id,
      before: existing?.[0] ?? null,
      after: rows?.[0] ?? null,
    })

    return NextResponse.json({ success: true, record: rows?.[0] })
  } catch (error: any) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    console.error("Error updating other sale record:", error)
    return NextResponse.json({ success: false, error: error.message || "Failed to update record" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("other-sales")
    if (isScopedUserRole(sessionUser.role)) {
      return NextResponse.json({ success: false, error: "Other sales access is restricted for this role." }, { status: 403 })
    }
    if (!canDeleteModule(sessionUser.role, "other-sales")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = Number(searchParams.get("id"))
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "id is required." }, { status: 400 })
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const existing = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT *
        FROM other_sales_records
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )
    if (!existing?.length) {
      return NextResponse.json({ success: false, error: "Record not found." }, { status: 404 })
    }

    await runTenantQuery(
      sql,
      tenantContext,
      sql`
        DELETE FROM other_sales_records
        WHERE id = ${id}
          AND tenant_id = ${tenantContext.tenantId}
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "delete",
      entityType: "other_sales_records",
      entityId: id,
      before: existing?.[0] ?? null,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    console.error("Error deleting other sale record:", error)
    return NextResponse.json({ success: false, error: error.message || "Failed to delete record" }, { status: 500 })
  }
}
