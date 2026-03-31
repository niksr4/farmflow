import { NextResponse } from "next/server"
import { z } from "zod"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { canWriteModule } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logServerError } from "@/lib/server/safe-logging"

export const dynamic = "force-dynamic"
export const revalidate = 0

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isUuid = (v: string) => UUID_PATTERN.test(v)

const pickingBodySchema = z.object({
  workerId: z.string().uuid("Invalid worker ID"),
  pickDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "pickDate must be YYYY-MM-DD"),
  kgPicked: z.number().positive("kg picked must be positive").max(9999),
  ratePerKg: z.number().min(0, "rate must be non-negative").max(99999),
  locationId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export async function GET(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("accounts")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const { searchParams } = new URL(request.url)

    const workerIdParam = searchParams.get("workerId")
    const workerId = workerIdParam && isUuid(workerIdParam) ? workerIdParam : null
    const startDate = searchParams.get("startDate") || null
    const endDate = searchParams.get("endDate") || null
    const limit = Math.min(Math.max(Number.parseInt(searchParams.get("limit") || "200", 10) || 200, 1), 500)
    const offset = Math.max(Number.parseInt(searchParams.get("offset") || "0", 10) || 0, 0)

    const workerFilter = workerId ? accountsSql` AND pr.worker_id = ${workerId}::uuid` : accountsSql``
    const startFilter = startDate ? accountsSql` AND pr.pick_date >= ${startDate}::date` : accountsSql``
    const endFilter = endDate ? accountsSql` AND pr.pick_date <= ${endDate}::date` : accountsSql``

    const [countRows, rows, summaryRows] = await Promise.all([
      runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          SELECT COUNT(*)::int AS count
          FROM picking_records pr
          WHERE pr.tenant_id = ${tenantContext.tenantId}
            ${workerFilter} ${startFilter} ${endFilter}
        `,
      ),
      runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          SELECT
            pr.id,
            pr.worker_id,
            aw.full_name AS worker_name,
            pr.pick_date,
            pr.kg_picked,
            pr.rate_per_kg,
            (pr.kg_picked * pr.rate_per_kg) AS amount,
            pr.location_id,
            pr.notes,
            pr.created_at
          FROM picking_records pr
          JOIN attendance_workers aw ON aw.id = pr.worker_id
          WHERE pr.tenant_id = ${tenantContext.tenantId}
            ${workerFilter} ${startFilter} ${endFilter}
          ORDER BY pr.pick_date DESC, aw.full_name ASC
          LIMIT ${limit} OFFSET ${offset}
        `,
      ),
      runTenantQuery(
        accountsSql,
        tenantContext,
        accountsSql`
          SELECT
            COALESCE(SUM(kg_picked), 0) AS total_kg,
            COALESCE(SUM(kg_picked * rate_per_kg), 0) AS total_amount
          FROM picking_records pr
          WHERE pr.tenant_id = ${tenantContext.tenantId}
            ${workerFilter} ${startFilter} ${endFilter}
        `,
      ),
    ])

    const totalCount = Number((countRows as any[])[0]?.count) || 0
    const summary = (summaryRows as any[])[0]

    return NextResponse.json({
      success: true,
      records: (rows as any[]).map((r) => ({
        id: String(r.id),
        workerId: String(r.worker_id),
        workerName: String(r.worker_name || ""),
        pickDate: String(r.pick_date),
        kgPicked: Number(r.kg_picked),
        ratePerKg: Number(r.rate_per_kg),
        amount: Number(r.amount),
        locationId: r.location_id ? String(r.location_id) : null,
        notes: r.notes ? String(r.notes) : null,
      })),
      totalCount,
      totalKg: Number(summary?.total_kg) || 0,
      totalAmount: Number(summary?.total_amount) || 0,
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled", records: [] }, { status: 403 })
    }
    logServerError("Failed to fetch picking records", error)
    return NextResponse.json({ success: false, error: "Failed to fetch picking records", records: [] }, { status: 500 })
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
    const parsed = pickingBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid request" },
        { status: 400 },
      )
    }
    const { workerId, pickDate, kgPicked, ratePerKg, locationId, notes } = parsed.data

    // Verify worker belongs to this tenant
    const workerRows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`SELECT id FROM attendance_workers WHERE id = ${workerId}::uuid AND tenant_id = ${tenantContext.tenantId} AND active = TRUE LIMIT 1`,
    )
    if (!(workerRows as any[]).length) {
      return NextResponse.json({ success: false, error: "Worker not found" }, { status: 404 })
    }

    const inserted = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        INSERT INTO picking_records (tenant_id, worker_id, pick_date, kg_picked, rate_per_kg, location_id, notes)
        VALUES (
          ${tenantContext.tenantId},
          ${workerId}::uuid,
          ${pickDate}::date,
          ${kgPicked},
          ${ratePerKg},
          ${locationId ?? null}::uuid,
          ${notes ?? null}
        )
        RETURNING id
      `,
    )

    await logAuditEvent(accountsSql, sessionUser, {
      action: "create",
      entityType: "picking_records",
      entityId: (inserted as any[])[0]?.id ?? null,
      after: { workerId, pickDate, kgPicked, ratePerKg, locationId, notes },
    })

    return NextResponse.json({ success: true, id: String((inserted as any[])[0]?.id) })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    logServerError("Failed to create picking record", error)
    return NextResponse.json({ success: false, error: "Failed to save picking record" }, { status: 500 })
  }
}
