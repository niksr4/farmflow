import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireAdminSession } from "@/lib/server/mfa"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { hashPassword } from "@/lib/passwords"
import { logAuditEvent } from "@/lib/server/audit-log"
import { logSecurityEvent } from "@/lib/server/security-events"

const adminErrorResponse = (error: any, fallback: string) => {
  const message = error?.message || fallback
  const status = ["MFA required", "Admin role required", "Unauthorized"].includes(message) ? 403 : 500
  return NextResponse.json({ success: false, error: message }, { status })
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const requestedTenantId = searchParams.get("tenantId")
    const tenantId = sessionUser.role === "owner" ? requestedTenantId : sessionUser.tenantId

    if (!tenantId) {
      return NextResponse.json({ success: false, error: "tenantId is required" }, { status: 400 })
    }

    if (sessionUser.role !== "owner" && requestedTenantId && requestedTenantId !== sessionUser.tenantId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)
    const users = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT id, username, role, tenant_id, created_at
        FROM users
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
      `,
    )

    return NextResponse.json({ success: true, users })
  } catch (error: any) {
    console.error("Error fetching users:", error)
    return adminErrorResponse(error, "Failed to fetch users")
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const body = await request.json()
    const username = String(body.username || "").trim()
    const password = String(body.password || "")
    const role = String(body.role || "user")
    const requestedTenantId = String(body.tenantId || "").trim()
    const tenantId = sessionUser.role === "owner" ? requestedTenantId : sessionUser.tenantId

    if (!username || !password || !tenantId) {
      return NextResponse.json({ success: false, error: "username, password, and tenantId are required" }, { status: 400 })
    }

    if (sessionUser.role !== "owner" && requestedTenantId && requestedTenantId !== sessionUser.tenantId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const passwordHash = hashPassword(password)

    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)
    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO users (username, password_hash, role, tenant_id)
        VALUES (${username}, ${passwordHash}, ${role}, ${tenantId})
        RETURNING id, username, role, tenant_id, created_at
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "create",
      entityType: "users",
      entityId: result?.[0]?.id,
      after: result?.[0] ?? null,
    })

    await logSecurityEvent({
      tenantId,
      actorUsername: sessionUser.username,
      actorRole: sessionUser.role,
      eventType: "permission_change",
      severity: "warning",
      source: "admin/users",
      metadata: {
        action: "user_created",
        targetUserId: result?.[0]?.id ?? null,
        targetUsername: result?.[0]?.username ?? null,
        role,
      },
    })

    return NextResponse.json({ success: true, user: result[0] })
  } catch (error: any) {
    console.error("Error creating user:", error)
    return adminErrorResponse(error, "Failed to create user")
  }
}

export async function PATCH(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const body = await request.json()
    const userId = String(body.userId || "").trim()
    const role = String(body.role || "").trim()

    if (!userId || !role) {
      return NextResponse.json({ success: false, error: "userId and role are required" }, { status: 400 })
    }

    if (!["admin", "user"].includes(role)) {
      return NextResponse.json({ success: false, error: "Invalid role" }, { status: 400 })
    }

    const lookupContext = normalizeTenantContext(
      sessionUser.role === "owner" ? undefined : sessionUser.tenantId,
      sessionUser.role,
    )
    const rows = await runTenantQuery(
      sql,
      lookupContext,
      sql`
        SELECT id, role, tenant_id
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `,
    )

    if (!rows?.length) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    if (String(rows[0].role) === "owner") {
      return NextResponse.json({ success: false, error: "Owner role cannot be modified" }, { status: 403 })
    }

    const targetTenantId = String(rows[0].tenant_id)
    if (sessionUser.role !== "owner" && targetTenantId !== sessionUser.tenantId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const tenantContext = normalizeTenantContext(targetTenantId, sessionUser.role)
    const result = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        UPDATE users
        SET role = ${role}
        WHERE id = ${userId}
        RETURNING id, username, role, tenant_id, created_at
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "users",
      entityId: result?.[0]?.id ?? userId,
      before: rows?.[0] ?? null,
      after: result?.[0] ?? null,
    })

    await logSecurityEvent({
      tenantId: targetTenantId,
      actorUsername: sessionUser.username,
      actorRole: sessionUser.role,
      eventType: "permission_change",
      severity: "warning",
      source: "admin/users",
      metadata: {
        action: "role_updated",
        targetUserId: result?.[0]?.id ?? userId,
        targetRole: role,
      },
    })

    return NextResponse.json({ success: true, user: result[0] })
  } catch (error: any) {
    console.error("Error updating user role:", error)
    return adminErrorResponse(error, "Failed to update user role")
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ success: false, error: "userId is required" }, { status: 400 })
    }

    const lookupContext = normalizeTenantContext(
      sessionUser.role === "owner" ? undefined : sessionUser.tenantId,
      sessionUser.role,
    )
    const rows = await runTenantQuery(
      sql,
      lookupContext,
      sql`
        SELECT id, role, tenant_id
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `,
    )

    if (!rows?.length) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    if (String(rows[0].role) === "owner") {
      return NextResponse.json({ success: false, error: "Owner user cannot be deleted" }, { status: 403 })
    }

    const targetTenantId = String(rows[0].tenant_id)
    if (sessionUser.role !== "owner" && targetTenantId !== sessionUser.tenantId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const tenantContext = normalizeTenantContext(targetTenantId, sessionUser.role)
    await runTenantQuery(
      sql,
      tenantContext,
      sql`DELETE FROM users WHERE id = ${userId}`,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "delete",
      entityType: "users",
      entityId: rows?.[0]?.id ?? userId,
      before: rows?.[0] ?? null,
    })

    await logSecurityEvent({
      tenantId: targetTenantId,
      actorUsername: sessionUser.username,
      actorRole: sessionUser.role,
      eventType: "permission_change",
      severity: "warning",
      source: "admin/users",
      metadata: {
        action: "user_deleted",
        targetUserId: rows?.[0]?.id ?? userId,
        targetRole: rows?.[0]?.role ?? null,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error deleting user:", error)
    return adminErrorResponse(error, "Failed to delete user")
  }
}
