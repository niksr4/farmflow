import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { hashPassword, verifyPassword } from "@/lib/passwords"
import { logAuditEvent } from "@/lib/server/audit-log"
import { logSecurityEvent } from "@/lib/server/security-events"

export async function POST(request: Request) {
  try {
    const sessionUser = await requireSessionUser()
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const body = await request.json()
    const currentPassword = String(body.currentPassword || "")
    const newPassword = String(body.newPassword || "")

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: "currentPassword and newPassword are required" },
        { status: 400 },
      )
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ success: false, error: "New password must be at least 8 characters" }, { status: 400 })
    }
    if (newPassword === currentPassword) {
      return NextResponse.json(
        { success: false, error: "New password must be different from current password" },
        { status: 400 },
      )
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT id, username, role, tenant_id, password_hash, password_reset_required
        FROM users
        WHERE username = ${sessionUser.username}
          AND tenant_id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    if (!rows?.length) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    const account = rows[0]
    const passwordCheck = verifyPassword(currentPassword, String(account.password_hash || ""))
    if (!passwordCheck.matches) {
      return NextResponse.json({ success: false, error: "Current password is incorrect" }, { status: 401 })
    }

    const passwordHash = hashPassword(newPassword)
    await runTenantQuery(
      sql,
      tenantContext,
      sql`
        UPDATE users
        SET password_hash = ${passwordHash},
            password_reset_required = FALSE,
            password_updated_at = CURRENT_TIMESTAMP
        WHERE id = ${account.id}
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "users",
      entityId: account.id,
      before: {
        id: account.id,
        username: account.username,
        role: account.role,
        password_reset_required: Boolean(account.password_reset_required),
      },
      after: {
        id: account.id,
        username: account.username,
        role: account.role,
        password_reset_required: false,
      },
    })

    await logSecurityEvent({
      tenantId: String(account.tenant_id),
      actorUserId: String(account.id),
      actorUsername: String(account.username),
      actorRole: String(account.role),
      eventType: "auth_password_changed",
      severity: "warning",
      source: "account/password",
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    const message = error?.message || "Failed to update password"
    if (message === "Unauthorized") {
      return NextResponse.json({ success: false, error: message }, { status: 401 })
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

