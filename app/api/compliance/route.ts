import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireModuleAccess, isModuleAccessError } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

export async function GET() {
  try {
    const sessionUser = await requireModuleAccess("compliance")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const [certifications, checklistItems] = await Promise.all([
      runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT id, name, certification_type, issuing_body, certificate_number,
                 valid_from, valid_until, status, notes, created_at, updated_at
          FROM certifications
          WHERE tenant_id = ${tenantContext.tenantId}
          ORDER BY valid_until ASC NULLS LAST
        `,
      ),
      runTenantQuery(
        sql,
        tenantContext,
        sql`
          SELECT i.id, i.certification_id, c.name AS certification_name, i.title,
                 i.description, i.due_date, i.completed_at, i.completed_by,
                 i.status, i.notes, i.created_at
          FROM compliance_checklist_items i
          LEFT JOIN certifications c ON c.id = i.certification_id
          WHERE i.tenant_id = ${tenantContext.tenantId}
          ORDER BY i.due_date ASC NULLS LAST
        `,
      ),
    ])

    return NextResponse.json({
      success: true,
      certifications: certifications || [],
      checklistItems: checklistItems || [],
    })
  } catch (error) {
    if (isModuleAccessError(error)) {
      return NextResponse.json({ success: false, error: "Module access disabled" }, { status: 403 })
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("compliance")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const payload = await request.json()

    if (payload.type === "certification") {
      const result = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          INSERT INTO certifications (
            tenant_id, name, certification_type, issuing_body,
            certificate_number, valid_from, valid_until, status, notes
          )
          VALUES (
            ${tenantContext.tenantId},
            ${payload.name},
            ${payload.certification_type || "custom"},
            ${payload.issuing_body || null},
            ${payload.certificate_number || null},
            ${payload.valid_from || null},
            ${payload.valid_until || null},
            ${payload.status || "active"},
            ${payload.notes || null}
          )
          RETURNING *
        `,
      )
      return NextResponse.json({ success: true, record: result[0] })
    }

    if (payload.type === "checklist_item") {
      const result = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          INSERT INTO compliance_checklist_items (
            tenant_id, certification_id, title, description, due_date, status, notes
          )
          VALUES (
            ${tenantContext.tenantId},
            ${payload.certification_id || null},
            ${payload.title},
            ${payload.description || null},
            ${payload.due_date || null},
            ${payload.status || "pending"},
            ${payload.notes || null}
          )
          RETURNING *
        `,
      )
      return NextResponse.json({ success: true, record: result[0] })
    }

    if (payload.type === "complete_checklist_item") {
      const result = await runTenantQuery(
        sql,
        tenantContext,
        sql`
          UPDATE compliance_checklist_items
          SET status = 'completed', completed_at = now(), completed_by = ${sessionUser.username || ""}
          WHERE id = ${payload.id} AND tenant_id = ${tenantContext.tenantId}
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
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
