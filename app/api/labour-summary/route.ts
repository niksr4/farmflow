import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { resolveActiveEstate } from "@/lib/server/estate-filter"
import { SELECTED_ESTATE_COOKIE } from "@/lib/server/estate-cookie"
import { normalizeTenantContext, runTenantQueries } from "@/lib/server/tenant-db"
import { logServerError } from "@/lib/server/safe-logging"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"

/**
 * Labour cost broken down by block, by work, and by who did it.
 *
 * Reads the labour_cost view rather than either table directly, so it answers correctly whichever
 * way a tenant is entering -- and keeps answering correctly the day they switch over. See
 * scripts/117 for the cutover rule.
 *
 * Useful before any of that lands: legacy rows already carry a block and an activity code, so an
 * estate that has been typing labour into Accounts for months can see where the money went today.
 */

export const dynamic = "force-dynamic"
export const revalidate = 0

const DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)

    const startDate = String(searchParams.get("startDate") || "").trim()
    const endDate = String(searchParams.get("endDate") || "").trim()
    if (!DATE.test(startDate) || !DATE.test(endDate)) {
      return NextResponse.json({ success: false, error: "startDate and endDate must be YYYY-MM-DD" }, { status: 400 })
    }

    // A row with no block is not "the other estate's" -- same always-NULL-shows convention every
    // estate-aware route uses. See lib/estate-filter.ts.
    const cookieEstate = (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null
    const activeEstate = resolveActiveEstate(searchParams, cookieEstate)
    const estateClause = activeEstate
      ? accountsSql` AND (lc.location_id IS NULL OR lc.location_id IN (
          SELECT id FROM locations WHERE tenant_id = ${tenantContext.tenantId} AND estate = ${activeEstate}
        ))`
      : accountsSql``

    // Narrow to one activity or one block. Both are answerable across a tenant's whole history --
    // every legacy row carries a code, and just over half carry a block -- so these work long
    // before anyone moves to the muster.
    const code = String(searchParams.get("code") || "").trim()
    const codeClause = code ? accountsSql` AND lc.activity_code = ${code}` : accountsSql``

    const locationId = String(searchParams.get("locationId") || "").trim()
    const locationClause = UUID.test(locationId)
      ? accountsSql` AND lc.location_id = ${locationId}::uuid`
      : accountsSql``

    // "Which weeks did this cost me" is a different question from "which blocks", and the answer
    // is the one that shows a spike. Weekly by default; monthly once a range gets long enough that
    // weeks stop fitting on a screen.
    const bucket = searchParams.get("bucket") === "month" ? "month" : "week"

    const filters = accountsSql`${estateClause}${codeClause}${locationClause}`

    const [byBlock, byWork, byKind, totals, byPeriod, options] = await runTenantQueries(accountsSql, tenantContext, [
      accountsSql`
        SELECT
          COALESCE(l.name, l.code, 'No block recorded') AS label,
          l.estate,
          -- Cost per acre is the number growers actually compare. Null when the block has no area
          -- yet rather than a misleading zero -- see scripts/114.
          l.area_acres,
          SUM(lc.total_cost)::numeric AS cost
        FROM labour_cost lc
        LEFT JOIN locations l ON l.id = lc.location_id
        WHERE lc.tenant_id = ${tenantContext.tenantId}
          AND lc.work_date BETWEEN ${startDate}::date AND ${endDate}::date
          ${filters}
        GROUP BY l.name, l.code, l.estate, l.area_acres
        ORDER BY SUM(lc.total_cost) DESC
      `,
      accountsSql`
        SELECT
          lc.activity_code AS code,
          MAX(aa.activity) AS name,
          SUM(lc.total_cost)::numeric AS cost
        FROM labour_cost lc
        LEFT JOIN account_activities aa
          ON aa.code = lc.activity_code AND aa.tenant_id = lc.tenant_id
        WHERE lc.tenant_id = ${tenantContext.tenantId}
          AND lc.work_date BETWEEN ${startDate}::date AND ${endDate}::date
          ${filters}
        GROUP BY lc.activity_code
        ORDER BY SUM(lc.total_cost) DESC
      `,
      // Estate labour versus contract. Correct for the first time on assignment rows, which derive
      // it from what the worker is; legacy rows carry whatever was typed into the hf/outside split,
      // and at least one tenant files their own permanent staff as outside labour.
      accountsSql`
        SELECT
          SUM(lc.estate_laborers)::numeric   AS estate_laborers,
          SUM(lc.contract_laborers)::numeric AS contract_laborers,
          SUM(lc.estate_laborers * lc.estate_rate)::numeric     AS estate_cost,
          SUM(lc.contract_laborers * lc.contract_rate)::numeric AS contract_cost
        FROM labour_cost lc
        WHERE lc.tenant_id = ${tenantContext.tenantId}
          AND lc.work_date BETWEEN ${startDate}::date AND ${endDate}::date
          ${filters}
      `,
      accountsSql`
        SELECT
          SUM(lc.total_cost)::numeric AS cost,
          COUNT(*)::int AS entries,
          COUNT(*) FILTER (WHERE lc.source = 'assignment')::int AS from_muster,
          COUNT(*) FILTER (WHERE lc.source = 'transaction')::int AS from_accounts
        FROM labour_cost lc
        WHERE lc.tenant_id = ${tenantContext.tenantId}
          AND lc.work_date BETWEEN ${startDate}::date AND ${endDate}::date
          ${filters}
      `,
      accountsSql`
        SELECT date_trunc(${bucket}, lc.work_date)::date::text AS period,
               SUM(lc.total_cost)::numeric AS cost,
               COUNT(*)::int AS entries
        FROM labour_cost lc
        WHERE lc.tenant_id = ${tenantContext.tenantId}
          AND lc.work_date BETWEEN ${startDate}::date AND ${endDate}::date
          ${filters}
        GROUP BY 1 ORDER BY 1
      `,
      // What the pickers can offer. Deliberately unfiltered by code/block, so choosing one does
      // not empty the list you chose it from.
      accountsSql`
        SELECT DISTINCT lc.activity_code AS code, l.id AS location_id,
               COALESCE(l.name, l.code) AS location_name
        FROM labour_cost lc
        LEFT JOIN locations l ON l.id = lc.location_id
        WHERE lc.tenant_id = ${tenantContext.tenantId}
          AND lc.work_date BETWEEN ${startDate}::date AND ${endDate}::date
          ${estateClause}
      `,
    ])

    const n = (value: unknown) => Number(value ?? 0) || 0
    const t = (totals?.[0] as any) || {}
    const k = (byKind?.[0] as any) || {}

    return NextResponse.json({
      success: true,
      startDate,
      endDate,
      total: n(t.cost),
      entries: n(t.entries),
      // Lets the UI say where the numbers came from during a parallel run, when a tenant may
      // legitimately have both kinds of row inside one fiscal year.
      source: { fromMuster: n(t.from_muster), fromAccounts: n(t.from_accounts) },
      byBlock: byBlock.map((row: any) => ({
        label: String(row.label || "No block recorded"),
        estate: row.estate ? String(row.estate) : null,
        areaAcres: row.area_acres != null ? Number(row.area_acres) : null,
        cost: n(row.cost),
        costPerAcre: row.area_acres != null && Number(row.area_acres) > 0
          ? n(row.cost) / Number(row.area_acres)
          : null,
      })),
      byWork: byWork.map((row: any) => ({
        code: String(row.code || ""),
        name: row.name ? String(row.name) : null,
        cost: n(row.cost),
      })),
      bucket,
      appliedFilters: { code: code || null, locationId: UUID.test(locationId) ? locationId : null },
      byPeriod: byPeriod.map((row: any) => ({
        period: String(row.period),
        cost: n(row.cost),
        entries: n(row.entries),
      })),
      filterOptions: {
        codes: [...new Set(options.map((r: any) => String(r.code || "")).filter(Boolean))].sort(),
        blocks: [
          ...new Map(
            options
              .filter((r: any) => r.location_id)
              .map((r: any) => [String(r.location_id), { id: String(r.location_id), name: String(r.location_name || "Block") }]),
          ).values(),
        ].sort((a: any, b: any) => a.name.localeCompare(b.name)),
      },
      byKind: {
        estateLabourers: n(k.estate_laborers),
        contractLabourers: n(k.contract_laborers),
        estateCost: n(k.estate_cost),
        contractCost: n(k.contract_cost),
      },
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    logServerError("Failed to build labour summary", error)
    return NextResponse.json(
      { success: false, error: sanitizeRouteError(error, "Could not build the labour summary") },
      { status: 500 },
    )
  }
}
