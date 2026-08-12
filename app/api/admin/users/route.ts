import { NextResponse } from "next/server"
import { z } from "zod"
import { sql } from "@/lib/server/db"
import { requireAdminSession } from "@/lib/server/mfa"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { generateTemporaryPassword, hashPassword } from "@/lib/passwords"
import { logAuditEvent } from "@/lib/server/audit-log"
import { logSecurityEvent } from "@/lib/server/security-events"
import { isReservedPlatformUsername, isSystemUsername, normalizeUsername, normalizeUsernameLookup } from "@/lib/usernames"
import { buildAdminErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"
import { logServerError } from "@/lib/server/safe-logging"
import { isForbiddenTenantAccess, resolveOwnerScopedTenantId, resolveRequestedTenantId } from "@/lib/permissions"

type UserRole = "admin" | "user" | "owner"

type UserRecord = {
  id: string
  username: string
  role: UserRole
  tenant_id: string
  created_at?: string
  password_reset_required?: boolean
}

const createUserBodySchema = z.object({
  username: z.string().trim().min(1, "username is required"),
  password: z.string().min(8, "password must be at least 8 characters"),
  role: z.enum(["admin", "user", "owner"]).optional().default("user"),
  tenantId: z.string().trim().optional().default(""),
})

const updateUserRoleSchema = z.object({
  userId: z.string().trim().min(1, "userId is required"),
  role: z.enum(["admin", "user"]).optional(),
  username: z.string().trim().min(1, "username is required").optional(),
}).refine((value) => value.role || value.username, {
  message: "role or username is required",
  path: ["role"],
})

const resetPasswordSchema = z.object({
  userId: z.string().trim().min(1, "userId is required"),
  temporaryPassword: z.string().trim().optional(),
})

const findConflictingUserByUsername = async (username: string, excludeUserId?: string) => {
  if (!sql) return null
  const ownerContext = normalizeTenantContext(undefined, "owner")
  const normalizedUsername = normalizeUsernameLookup(username)
  const query = excludeUserId
    ? sql`
        SELECT id, username, role, tenant_id, created_at
        FROM users
        WHERE LOWER(BTRIM(username)) = ${normalizedUsername}
          AND id <> ${excludeUserId}
        ORDER BY created_at ASC
        LIMIT 1
      `
    : sql`
        SELECT id, username, role, tenant_id, created_at
        FROM users
        WHERE LOWER(BTRIM(username)) = ${normalizedUsername}
        ORDER BY created_at ASC
        LIMIT 1
      `
  const rows = (await runTenantQuery(
    sql,
    ownerContext,
    query,
  )) as UserRecord[]

  return rows[0] || null
}
export async function GET(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    if (!sql) {
      return databaseNotConfiguredResponse()
    }

    const { searchParams } = new URL(request.url)
    const requestedTenantId = searchParams.get("tenantId")
    const tenantId = resolveRequestedTenantId(sessionUser, requestedTenantId)

    if (!tenantId) {
      return NextResponse.json({ success: false, error: "tenantId is required" }, { status: 400 })
    }

    if (isForbiddenTenantAccess(sessionUser, requestedTenantId)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)

    // The platform owner is the developer's account, not a member of the estate's team. This
    // endpoint feeds both the admin console and the tenant's own Settings > Current users list,
    // so without this a tenant admin sharing a tenant with the owner account would see a
    // "Platform Owner" row among their staff -- confusing at best, and it invites questions
    // about who else can see their data. Filtered in SQL so the row never reaches the browser.
    //
    // Scoped to the viewer rather than the tenant on purpose: the owner still sees every account
    // in the admin console, and the rule keeps holding if the owner is ever added to a customer
    // tenant for support.
    const viewerIsOwner = String(sessionUser.role || "").toLowerCase() === "owner"
    const users = (await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT id, username, role, tenant_id, created_at
        FROM users
        WHERE tenant_id = ${tenantId}
          AND (${viewerIsOwner}::boolean OR role <> 'owner')
        ORDER BY created_at DESC
      `,
    )) as UserRecord[]

    return NextResponse.json({ success: true, users })
  } catch (error: unknown) {
    logServerError("Error fetching users", error)
    return buildAdminErrorResponse(error, "Failed to fetch users")
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    if (!sql) {
      return databaseNotConfiguredResponse()
    }

    const parsedBody = createUserBodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsedBody.success) {
      return NextResponse.json({ success: false, error: parsedBody.error.issues[0]?.message || "Invalid request body" }, { status: 400 })
    }
    const username = normalizeUsername(parsedBody.data.username)
    const password = parsedBody.data.password
    const role = parsedBody.data.role
    const requestedTenantId = parsedBody.data.tenantId
    const tenantId = resolveRequestedTenantId(sessionUser, requestedTenantId)

    if (!username || !password || !tenantId) {
      return NextResponse.json({ success: false, error: "username, password, and tenantId are required" }, { status: 400 })
    }

    if (isSystemUsername(username)) {
      return NextResponse.json({ success: false, error: "System usernames are reserved" }, { status: 400 })
    }
    if (isReservedPlatformUsername(username)) {
      return NextResponse.json({ success: false, error: "Username 'owner' is reserved for the platform account" }, { status: 400 })
    }

    if (role === "owner" && sessionUser.role !== "owner") {
      return NextResponse.json({ success: false, error: "Only platform owners can create owner users" }, { status: 403 })
    }

    if (isForbiddenTenantAccess(sessionUser, requestedTenantId)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const conflictingUser = await findConflictingUserByUsername(username)
    if (conflictingUser) {
      return NextResponse.json({ success: false, error: "Username is already in use" }, { status: 409 })
    }

    const passwordHash = hashPassword(password)

    const tenantContext = normalizeTenantContext(tenantId, sessionUser.role)
    const result = (await runTenantQuery(
      sql,
      tenantContext,
      sql`
        INSERT INTO users (username, password_hash, role, tenant_id)
        VALUES (${username}, ${passwordHash}, ${role}, ${tenantId})
        RETURNING id, username, role, tenant_id, created_at
      `,
    )) as UserRecord[]

    await logAuditEvent(sql, sessionUser, {
      action: "create",
      entityType: "users",
      entityId: result?.[0]?.id,
      after: result?.[0] ?? null,
    })

    await logSecurityEvent({
      tenantId,
      actorUserId: sessionUser.id,
      actorUsername: sessionUser.username,
      actorRole: sessionUser.role,
      eventType: "permission_change",
      severity: "info",
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
    // The pre-check above is best-effort -- two concurrent creates for the same
    // username can both pass it and then race the DB's unique index
    // (idx_users_username_normalized_unique, scripts/60-user-identity-hardening.sql).
    // sanitizeRouteError blocks the raw "duplicate key value violates unique
    // constraint" message (it matches /constraint/i) before any statusByMessage
    // lookup runs, and the string that option previously listed here
    // ("Username already exists") didn't match this route's actual conflict
    // message ("Username is already in use") anyway -- so the loser of the race
    // was falling through to a generic 500. Handle the Postgres code directly.
    if (error?.code === "23505") {
      return NextResponse.json({ success: false, error: "Username is already in use" }, { status: 409 })
    }
    logServerError("Error creating user", error)
    return buildAdminErrorResponse(error, "Failed to create user")
  }
}

export async function PATCH(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    if (!sql) {
      return databaseNotConfiguredResponse()
    }

    const parsedBody = updateUserRoleSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsedBody.success) {
      return NextResponse.json({ success: false, error: parsedBody.error.issues[0]?.message || "Invalid request body" }, { status: 400 })
    }
    const userId = parsedBody.data.userId
    const role = parsedBody.data.role
    const username = parsedBody.data.username ? String(parsedBody.data.username).trim() : null

    const lookupContext = normalizeTenantContext(resolveOwnerScopedTenantId(sessionUser), sessionUser.role)
    const rows = (await runTenantQuery(
      sql,
      lookupContext,
      sql`
        SELECT id, role, tenant_id, username
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `,
    )) as UserRecord[]

    if (!rows?.length) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    if (String(rows[0].role) === "owner") {
      return NextResponse.json({ success: false, error: "Owner role cannot be modified" }, { status: 403 })
    }
    if (isReservedPlatformUsername(String(rows[0].username || ""))) {
      return NextResponse.json({ success: false, error: "Reserved platform account cannot be modified" }, { status: 403 })
    }
    if (isSystemUsername(String(rows[0].username || ""))) {
      return NextResponse.json({ success: false, error: "System users cannot be modified" }, { status: 403 })
    }

    const targetTenantId = String(rows[0].tenant_id)
    if (isForbiddenTenantAccess(sessionUser, targetTenantId)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    if (username) {
      if (isSystemUsername(username)) {
        return NextResponse.json({ success: false, error: "System usernames are reserved" }, { status: 400 })
      }
      if (isReservedPlatformUsername(username)) {
        return NextResponse.json({ success: false, error: "Username 'owner' is reserved for the platform account" }, { status: 400 })
      }

      const conflictingUser = await findConflictingUserByUsername(username, userId)
      if (conflictingUser) {
        return NextResponse.json({ success: false, error: "Username is already in use" }, { status: 409 })
      }
    }

    const nextRole = role || rows[0].role
    const nextUsername = username || rows[0].username

    const tenantContext = normalizeTenantContext(targetTenantId, sessionUser.role)
    const result = (await runTenantQuery(
      sql,
      tenantContext,
      sql`
        UPDATE users
        SET role = ${nextRole},
            username = ${nextUsername}
        WHERE id = ${userId}
        RETURNING id, username, role, tenant_id, created_at
      `,
    )) as UserRecord[]

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "users",
      entityId: result?.[0]?.id ?? userId,
      before: rows?.[0] ?? null,
      after: result?.[0] ?? null,
    })

    await logSecurityEvent({
      tenantId: targetTenantId,
      actorUserId: sessionUser.id,
      actorUsername: sessionUser.username,
      actorRole: sessionUser.role,
      eventType: "permission_change",
      severity: "info",
      source: "admin/users",
      metadata: {
        action: "user_updated",
        targetUserId: result?.[0]?.id ?? userId,
        targetRole: nextRole,
        targetUsername: nextUsername,
      },
    })

    return NextResponse.json({ success: true, user: result[0] })
  } catch (error: any) {
    // Same race as POST's create path: a concurrent rename to the same username
    // can pass the pre-check and then hit the unique index on the UPDATE below.
    if (error?.code === "23505") {
      return NextResponse.json({ success: false, error: "Username is already in use" }, { status: 409 })
    }
    logServerError("Error updating user", error)
    return buildAdminErrorResponse(error, "Failed to update user")
  }
}

export async function PUT(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    if (!sql) {
      return databaseNotConfiguredResponse()
    }

    const parsedBody = resetPasswordSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsedBody.success) {
      return NextResponse.json({ success: false, error: parsedBody.error.issues[0]?.message || "Invalid request body" }, { status: 400 })
    }
    const userId = parsedBody.data.userId
    const providedTempPassword = String(parsedBody.data.temporaryPassword || "").trim()
    if (providedTempPassword && providedTempPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: "temporaryPassword must be at least 8 characters" },
        { status: 400 },
      )
    }

    const lookupContext = normalizeTenantContext(resolveOwnerScopedTenantId(sessionUser), sessionUser.role)
    const rows = (await runTenantQuery(
      sql,
      lookupContext,
      sql`
        SELECT id, role, tenant_id, username, password_reset_required
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `,
    )) as UserRecord[]

    if (!rows?.length) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    const target = rows[0]
    if (isReservedPlatformUsername(String(target.username || "")) && sessionUser.role !== "owner") {
      return NextResponse.json({ success: false, error: "Only platform owners can reset reserved account passwords" }, { status: 403 })
    }
    if (isSystemUsername(String(target.username || ""))) {
      return NextResponse.json({ success: false, error: "System users cannot be reset" }, { status: 403 })
    }
    if (String(target.role) === "owner" && sessionUser.role !== "owner") {
      return NextResponse.json({ success: false, error: "Only platform owners can reset owner passwords" }, { status: 403 })
    }

    const targetTenantId = String(target.tenant_id)
    if (isForbiddenTenantAccess(sessionUser, targetTenantId)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const temporaryPassword = providedTempPassword || generateTemporaryPassword(12)
    const passwordHash = hashPassword(temporaryPassword)

    const tenantContext = normalizeTenantContext(targetTenantId, sessionUser.role)
    const result = (await runTenantQuery(
      sql,
      tenantContext,
      sql`
        UPDATE users
        SET password_hash = ${passwordHash},
            password_reset_required = TRUE,
            password_updated_at = CURRENT_TIMESTAMP
        WHERE id = ${userId}
        RETURNING id, username, role, tenant_id, created_at, password_reset_required
      `,
    )) as UserRecord[]

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "users",
      entityId: result?.[0]?.id ?? userId,
      before: {
        id: target.id,
        role: target.role,
        tenant_id: target.tenant_id,
        username: target.username,
        password_reset_required: Boolean(target.password_reset_required),
      },
      after: {
        id: result?.[0]?.id ?? userId,
        role: result?.[0]?.role ?? target.role,
        tenant_id: result?.[0]?.tenant_id ?? target.tenant_id,
        username: result?.[0]?.username ?? target.username,
        password_reset_required: Boolean(result?.[0]?.password_reset_required),
      },
    })

    await logSecurityEvent({
      tenantId: targetTenantId,
      actorUserId: sessionUser.id,
      actorUsername: sessionUser.username,
      actorRole: sessionUser.role,
      eventType: "permission_change",
      severity: "info",
      source: "admin/users",
      metadata: {
        action: "password_reset_forced",
        targetUserId: result?.[0]?.id ?? userId,
        targetUsername: result?.[0]?.username ?? target.username,
      },
    })

    return NextResponse.json({
      success: true,
      user: result?.[0] ?? null,
      temporaryPassword,
      message: "Temporary password generated. User must rotate password at next login.",
    })
  } catch (error: unknown) {
    logServerError("Error resetting user password", error)
    return buildAdminErrorResponse(error, "Failed to reset password")
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    if (!sql) {
      return databaseNotConfiguredResponse()
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ success: false, error: "userId is required" }, { status: 400 })
    }

    const lookupContext = normalizeTenantContext(resolveOwnerScopedTenantId(sessionUser), sessionUser.role)
    const rows = (await runTenantQuery(
      sql,
      lookupContext,
      sql`
        SELECT id, role, tenant_id, username
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `,
    )) as UserRecord[]

    if (!rows?.length) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 })
    }

    if (String(rows[0].role) === "owner") {
      return NextResponse.json({ success: false, error: "Owner user cannot be deleted" }, { status: 403 })
    }
    if (isReservedPlatformUsername(String(rows[0].username || ""))) {
      return NextResponse.json({ success: false, error: "Reserved platform account cannot be deleted" }, { status: 403 })
    }
    if (isSystemUsername(String(rows[0].username || ""))) {
      return NextResponse.json({ success: false, error: "System users cannot be deleted" }, { status: 403 })
    }

    const targetTenantId = String(rows[0].tenant_id)
    if (isForbiddenTenantAccess(sessionUser, targetTenantId)) {
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
      actorUserId: sessionUser.id,
      actorUsername: sessionUser.username,
      actorRole: sessionUser.role,
      eventType: "permission_change",
      severity: "info",
      source: "admin/users",
      metadata: {
        action: "user_deleted",
        targetUserId: rows?.[0]?.id ?? userId,
        targetRole: rows?.[0]?.role ?? null,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    logServerError("Error deleting user", error)
    return buildAdminErrorResponse(error, "Failed to delete user")
  }
}
