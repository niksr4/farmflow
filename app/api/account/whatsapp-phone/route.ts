import { NextResponse } from "next/server"
import { accountsSql } from "@/lib/server/db"
import { requireModuleAccess } from "@/lib/server/module-access"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

export const dynamic = "force-dynamic"

const PHONE_PATTERN = /^\+\d{7,15}$/

export async function GET() {
  try {
    const sessionUser = await requireModuleAccess("inventory")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)

    const rows = await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        SELECT whatsapp_phone
        FROM tenant_users
        WHERE tenant_id = ${tenantContext.tenantId}
          AND username = ${sessionUser.username}
        LIMIT 1
      `,
    )
    const phone = rows?.[0]?.whatsapp_phone ?? null
    return NextResponse.json({ success: true, phone })
  } catch {
    return NextResponse.json({ success: false, error: "Failed to load phone" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const sessionUser = await requireModuleAccess("inventory")
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const body = await request.json()
    const phone: string | null = body?.phone ? String(body.phone).trim() : null

    if (phone && !PHONE_PATTERN.test(phone)) {
      return NextResponse.json({ success: false, error: "Invalid phone number format" }, { status: 400 })
    }

    // Check for conflicts (another user already registered this number)
    if (phone) {
      const conflict = await accountsSql`
        SELECT id FROM tenant_users
        WHERE whatsapp_phone = ${phone}
          AND NOT (tenant_id = ${tenantContext.tenantId} AND username = ${sessionUser.username})
        LIMIT 1
      `
      const conflictRows = Array.isArray(conflict) ? conflict : (conflict as any)?.rows ?? []
      if (conflictRows.length) {
        return NextResponse.json(
          { success: false, error: "This number is already registered to another account" },
          { status: 409 },
        )
      }
    }

    await runTenantQuery(
      accountsSql,
      tenantContext,
      accountsSql`
        UPDATE tenant_users
        SET whatsapp_phone = ${phone}
        WHERE tenant_id = ${tenantContext.tenantId}
          AND username = ${sessionUser.username}
      `,
    )

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? "Failed to update phone" }, { status: 500 })
  }
}
