import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { z } from "zod"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { resolveActiveEstate } from "@/lib/server/estate-filter"
import { SELECTED_ESTATE_COOKIE } from "@/lib/server/estate-cookie"
import { canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logServerError } from "@/lib/server/safe-logging"

export const dynamic = "force-dynamic"
export const revalidate = 0

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const ledgerBodySchema = z.object({
  workerId: z.string().uuid("Invalid worker ID"),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "entryDate must be YYYY-MM-DD"),
  entryType: z.enum(["advance", "deduction", "adjustment"]),
  amount: z.number().positive("Amount must be positive").max(999999),
  description: z.string().max(300).nullable().optional(),
})

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)

    const workerIdParam = searchParams.get("workerId")
    const workerId = workerIdParam && UUID_PATTERN.test(workerIdParam) ? workerIdParam : null
    const startDate = searchParams.get("startDate") || null
    const endDate = searchParams.get("endDate") || null
    const limit = Math.min(Math.max(Number.parseInt(searchParams.get("limit") || "200", 10) || 200, 1), 500)
    const offset = Math.max(Number.parseInt(searchParams.get("offset") || "0", 10) || 0, 0)

    const workerFilter = workerId ? accountsSql` AND wl.worker_id = ${workerId}::uuid` : accountsSql``
    const startFilter = startDate ? accountsSql` AND wl.entry_date >= ${startDate}::date` : accountsSql``
    const endFilter = endDate ? accountsSql` AND wl.entry_date <= ${endDate}::date` : accountsSql``
    // An explicit ?workerId= already picks out one worker (whichever estate they belong to),
    // so it wins outright, same convention as every other route here -- only narrow by estate
    // when listing across all workers. Ledger rows have no location of their own; the worker's
    // own estate assignment (scripts/112-attendance-workers-location.sql) is the join key, and
    // an unassigned worker must still show regardless of which estate is active.
    const cookieEstate = (await cookies()).get(SELECTED_ESTATE_COOKIE)?.value || null
    const activeEstate = resolveActiveEstate(searchParams, cookieEstate)
    const estateFilter =
      !workerId && activeEstate
        ? accountsSql` AND wl.worker_id IN (
            SELECT id FROM attendance_workers
            WHERE tenant_id = ${tenantContext.tenantId}
              AND (location_id IS NULL OR location_id IN (SELECT id FROM locations WHERE tenant_id = ${tenantContext.tenantId} AND estate = ${activeEstate}))
          )`
        : accountsSql``

    const [countRows, rows, balanceRows] = await Promise.all([
      runTenantQuery(
        accountsSql, tenantContext,
        accountsSql`
          SELECT COUNT(*)::int AS count FROM worker_ledger wl
          WHERE wl.tenant_id = ${tenantContext.tenantId} ${workerFilter} ${startFilter} ${endFilter} ${estateFilter}
        `,
      ),
      runTenantQuery(
        accountsSql, tenantContext,
        accountsSql`
          SELECT
            wl.id, wl.worker_id, aw.full_name AS worker_name,
            -- ::text for the same reason as picking-records: a bare date column comes back as a JS
            -- Date, String()s to "Wed Jan 28 2026 00:00:00 GMT+0530", and the client slices the
            -- first 10 characters of that. Both tabs were taken offline in 1272d15 for
            -- "crashing for some tenants" -- some tenants being the ones with any records.
            wl.entry_date::text AS entry_date, wl.entry_type, wl.amount, wl.description, wl.created_at
          FROM worker_ledger wl
          JOIN attendance_workers aw ON aw.id = wl.worker_id
          WHERE wl.tenant_id = ${tenantContext.tenantId} ${workerFilter} ${startFilter} ${endFilter} ${estateFilter}
          ORDER BY wl.entry_date DESC, wl.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `,
      ),
      workerId
        ? runTenantQuery(
            accountsSql, tenantContext,
            accountsSql`
              SELECT
                COALESCE(SUM(CASE WHEN entry_type IN ('advance','deduction') THEN amount ELSE 0 END), 0) AS total_deductions,
                COALESCE(SUM(CASE WHEN entry_type = 'adjustment' THEN amount ELSE 0 END), 0) AS total_adjustments
              FROM worker_ledger
              WHERE tenant_id = ${tenantContext.tenantId} AND worker_id = ${workerId}::uuid
            `,
          )
        : Promise.resolve([]),
    ])

    const totalCount = Number((countRows as any[])[0]?.count) || 0
    const balance = (balanceRows as any[])[0]

    return NextResponse.json({
      success: true,
      entries: (rows as any[]).map((r) => ({
        id: String(r.id),
        workerId: String(r.worker_id),
        workerName: String(r.worker_name || ""),
        entryDate: String(r.entry_date),
        entryType: String(r.entry_type),
        amount: Number(r.amount),
        description: r.description ? String(r.description) : null,
      })),
      totalCount,
      ...(balance
        ? {
            workerBalance: {
              totalDeductions: Number(balance.total_deductions) || 0,
              totalAdjustments: Number(balance.total_adjustments) || 0,
            },
          }
        : {}),
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled", entries: [] }, { status: 403 })
    }
    logServerError("Failed to fetch worker ledger", error)
    return NextResponse.json({ success: false, error: "Failed to fetch ledger entries", entries: [] }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    if (!canWriteModule(sessionUser.role, "accounts")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json().catch(() => ({}))
    const parsed = ledgerBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 })
    }
    const { workerId, entryDate, entryType, amount, description } = parsed.data

    const workerRows = await runTenantQuery(
      accountsSql, tenantContext,
      accountsSql`SELECT id FROM attendance_workers WHERE id = ${workerId}::uuid AND tenant_id = ${tenantContext.tenantId} LIMIT 1`,
    )
    if (!(workerRows as any[]).length) {
      return NextResponse.json({ success: false, error: "Worker not found" }, { status: 404 })
    }

    const inserted = await runTenantQuery(
      accountsSql, tenantContext,
      accountsSql`
        INSERT INTO worker_ledger (tenant_id, worker_id, entry_date, entry_type, amount, description)
        VALUES (${tenantContext.tenantId}, ${workerId}::uuid, ${entryDate}::date, ${entryType}, ${amount}, ${description ?? null})
        RETURNING id
      `,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "create",
      entityType: "worker_ledger",
      entityId: (inserted as any[])[0]?.id ?? null,
      after: { workerId, entryDate, entryType, amount, description },
    })

    return NextResponse.json({ success: true, id: String((inserted as any[])[0]?.id) })
  } catch (error) {
    if (isModuleAccessError(error)) return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    logServerError("Failed to create ledger entry", error)
    return NextResponse.json({ success: false, error: "Failed to save ledger entry" }, { status: 500 })
  }
}
