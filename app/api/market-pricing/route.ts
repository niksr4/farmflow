import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { canWriteModule } from "@/lib/permissions"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { sanitizeRouteError } from "@/lib/server/sanitize-route-error"

export async function GET() {
  try {
    const sessionUser = await requireModuleAccess("market-pricing")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const [buyers, priceRecords] = await Promise.all([
      runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT id, name, type, contact_name, phone, email, notes, active, created_at
          FROM buyers
          WHERE tenant_id = ${tenantContext.tenantId}
          ORDER BY name ASC
        `,
      ),
      runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT r.id, r.buyer_id, b.name AS buyer_name, r.grade, r.variety,
                 r.price_per_kg, r.quantity_kg, r.record_date, r.notes, r.created_at
          FROM buyer_price_records r
          LEFT JOIN buyers b ON b.id = r.buyer_id
          WHERE r.tenant_id = ${tenantContext.tenantId}
          ORDER BY r.record_date DESC
          LIMIT 200
        `,
      ),
    ])

    return NextResponse.json({ success: true, buyers: buyers || [], priceRecords: priceRecords || [] })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      { success: false, error: sanitizeRouteError(error, "Failed to load market pricing data") },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("market-pricing")
    // requireModuleAccess only proves the module is enabled for this user — it says nothing
    // about whether their role may write. Without this, any role that can see the tab could
    // create records that are meant to be admin-only.
    if (!canWriteModule(sessionUser.role, "market-pricing")) {
      return NextResponse.json({ success: false, error: "Insufficient role" }, { status: 403 })
    }
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const payload = await request.json()

    if (payload.type === "buyer") {
      if (!String(payload.name || "").trim()) {
        return NextResponse.json({ success: false, error: "Buyer name is required" }, { status: 400 })
      }
      const result = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          INSERT INTO buyers (tenant_id, name, type, contact_name, phone, email, notes)
          VALUES (
            ${tenantContext.tenantId},
            ${payload.name},
            ${payload.buyerType || "trader"},
            ${payload.contact_name || null},
            ${payload.phone || null},
            ${payload.email || null},
            ${payload.notes || null}
          )
          RETURNING *
        `,
      )
      return NextResponse.json({ success: true, record: result[0] })
    }

    if (payload.type === "price_record") {
      const priceValue = Number(payload.price_per_kg)
      if (!Number.isFinite(priceValue) || priceValue <= 0) {
        return NextResponse.json({ success: false, error: "price_per_kg must be a positive number" }, { status: 400 })
      }
      if (!payload.record_date) {
        return NextResponse.json({ success: false, error: "record_date is required" }, { status: 400 })
      }
      const result = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          INSERT INTO buyer_price_records (tenant_id, buyer_id, grade, variety, price_per_kg, quantity_kg, record_date, notes)
          VALUES (
            ${tenantContext.tenantId},
            ${payload.buyer_id || null},
            ${payload.grade || null},
            ${payload.variety || null},
            ${payload.price_per_kg},
            ${payload.quantity_kg || null},
            ${payload.record_date},
            ${payload.notes || null}
          )
          RETURNING *
        `,
      )
      return NextResponse.json({ success: true, record: result[0] })
    }

    return NextResponse.json({ success: false, error: "Unknown payload type" }, { status: 400 })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      { success: false, error: sanitizeRouteError(error, "Failed to save market pricing record") },
      { status: 500 },
    )
  }
}
