import { NextResponse } from "next/server"
import { z } from "zod"
import { sql } from "@/lib/server/db"
import { requireOwnerRole } from "@/lib/tenant"
import {
  buildTenantDeletionSchema,
  isTenantDeletionDependencyAvailable,
  listTenantDeletionRequiredTables,
  resolveTenantDeletionDependencyQueryMode,
  summarizeTenantDeletionCounts,
  TENANT_DELETION_DEPENDENCIES,
  type TenantDeletionDependencyQueryMode,
  type TenantDeletionDependencySpec,
} from "@/lib/tenant-deletion"
import { requireAdminSession } from "@/lib/server/mfa"
import { DEFAULT_TENANT_PLAN_ID, MODULES, clampRequestedModuleStatesToPlan, normalizeTenantPlanId } from "@/lib/modules"
import { persistTenantPlanId } from "@/lib/server/tenant-subscriptions"
import { normalizeTenantContext, runTenantQueries, runTenantQuery } from "@/lib/server/tenant-db"
import { logAuditEvent } from "@/lib/server/audit-log"
import { sendOwnerTenantCreatedAlert } from "@/lib/server/onboarding/owner-alerts"
import { buildAdminErrorResponse, databaseNotConfiguredResponse } from "@/lib/server/route-utils"
import { logServerError } from "@/lib/server/safe-logging"

const updateTenantBodySchema = z.object({
  tenantId: z.string().trim().min(1, "tenantId is required"),
  name: z.string().trim().min(1, "Tenant name is required").max(160, "Tenant name is too long"),
})

const buildTenantDeletionCountQuery = (
  spec: TenantDeletionDependencySpec,
  tenantId: string,
  queryMode: TenantDeletionDependencyQueryMode,
) => {
  switch (queryMode) {
    case "signup_tokens":
      return sql.query(
        `
          SELECT COUNT(*)::int AS count
          FROM signup_tokens st
          WHERE EXISTS (
            SELECT 1
            FROM signup_requests sr
            WHERE sr.id = st.signup_request_id
              AND sr.tenant_id = $1::uuid
          )
        `,
        [tenantId],
      )
    case "user_modules_by_tenant":
      return sql.query(
        `
          SELECT COUNT(*)::int AS count
          FROM user_modules
          WHERE tenant_id = $1::uuid
        `,
        [tenantId],
      )
    case "user_modules_by_user":
      return sql.query(
        `
          SELECT COUNT(*)::int AS count
          FROM user_modules
          WHERE user_id IN (
            SELECT id
            FROM users
            WHERE tenant_id = $1::uuid
          )
        `,
        [tenantId],
      )
    case "user_modules_by_tenant_or_user":
      return sql.query(
        `
          SELECT COUNT(*)::int AS count
          FROM user_modules
          WHERE tenant_id = $1::uuid
             OR user_id IN (
               SELECT id
               FROM users
               WHERE tenant_id = $1::uuid
             )
        `,
        [tenantId],
      )
    default:
      return sql.query(`SELECT COUNT(*)::int AS count FROM ${spec.table} WHERE tenant_id = $1::uuid`, [tenantId])
  }
}

const buildTenantDeletionDeleteQuery = (
  spec: TenantDeletionDependencySpec,
  tenantId: string,
  queryMode: TenantDeletionDependencyQueryMode,
) => {
  switch (queryMode) {
    case "signup_tokens":
      return sql.query(
        `
          DELETE FROM signup_tokens
          WHERE signup_request_id IN (
            SELECT id
            FROM signup_requests
            WHERE tenant_id = $1::uuid
          )
        `,
        [tenantId],
      )
    case "user_modules_by_tenant":
      return sql.query(
        `
          DELETE FROM user_modules
          WHERE tenant_id = $1::uuid
        `,
        [tenantId],
      )
    case "user_modules_by_user":
      return sql.query(
        `
          DELETE FROM user_modules
          WHERE user_id IN (
            SELECT id
            FROM users
            WHERE tenant_id = $1::uuid
          )
        `,
        [tenantId],
      )
    case "user_modules_by_tenant_or_user":
      return sql.query(
        `
          DELETE FROM user_modules
          WHERE tenant_id = $1::uuid
             OR user_id IN (
               SELECT id
               FROM users
               WHERE tenant_id = $1::uuid
             )
        `,
        [tenantId],
      )
    default:
      return sql.query(`DELETE FROM ${spec.table} WHERE tenant_id = $1::uuid`, [tenantId])
  }
}

export async function GET(_request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    requireOwnerRole(sessionUser.role)
    if (!sql) {
      return databaseNotConfiguredResponse()
    }

    const adminContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const tenants = await runTenantQuery(
      sql,
      adminContext,
      sql`
        SELECT id, name, created_at
        FROM tenants
        ORDER BY created_at DESC
      `,
    )

    return NextResponse.json({ success: true, tenants })
  } catch (error: any) {
    logServerError("Error fetching tenants", error)
    return buildAdminErrorResponse(error, "Failed to fetch tenants", { ownerRequired: true })
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    requireOwnerRole(sessionUser.role)
    if (!sql) {
      return databaseNotConfiguredResponse()
    }

    const body = await request.json()
    const name = String(body.name || "").trim()
    const planId = normalizeTenantPlanId(body.planId || DEFAULT_TENANT_PLAN_ID)

    if (!name) {
      return NextResponse.json({ success: false, error: "Tenant name is required" }, { status: 400 })
    }

    const adminContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const result = await runTenantQuery(
      sql,
      adminContext,
      sql`
        INSERT INTO tenants (name)
        VALUES (${name})
        RETURNING id, name, created_at
      `,
    )

    const tenantId = result[0]?.id
    if (tenantId) {
      const moduleStates = clampRequestedModuleStatesToPlan(
        MODULES.map((moduleEntry) => ({
          id: moduleEntry.id,
          enabled: moduleEntry.defaultEnabled === true,
        })),
        planId,
      )

      for (const moduleEntry of moduleStates) {
        await runTenantQuery(
          sql,
          adminContext,
          sql`
            INSERT INTO tenant_modules (tenant_id, module, enabled)
            VALUES (${tenantId}, ${moduleEntry.id}, ${moduleEntry.enabled})
            ON CONFLICT (tenant_id, module) DO NOTHING
          `,
        )
      }

      await persistTenantPlanId(sql, tenantId, sessionUser.role, planId)
    }

    await logAuditEvent(sql, sessionUser, {
      action: "create",
      entityType: "tenants",
      entityId: result?.[0]?.id,
      after: {
        ...(result?.[0] ?? {}),
        subscriptionPlan: planId,
      },
    })

    if (result?.[0]?.id && result?.[0]?.name) {
      await sendOwnerTenantCreatedAlert({
        tenantId: String(result[0].id),
        tenantName: String(result[0].name),
        origin: "owner-console",
        createdBy: sessionUser.username || "owner-console",
        source: "admin/tenants",
      })
    }

    return NextResponse.json({
      success: true,
      tenant: {
        ...(result[0] || {}),
        subscriptionPlan: planId,
      },
    })
  } catch (error: any) {
    logServerError("Error creating tenant", error)
    return buildAdminErrorResponse(error, "Failed to create tenant", { ownerRequired: true })
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    requireOwnerRole(sessionUser.role)
    if (!sql) {
      return databaseNotConfiguredResponse()
    }

    const { searchParams } = new URL(request.url)
    const tenantId = String(searchParams.get("tenantId") || "").trim()
    if (!tenantId) {
      return NextResponse.json({ success: false, error: "tenantId is required" }, { status: 400 })
    }

    if (tenantId === sessionUser.tenantId) {
      return NextResponse.json(
        { success: false, error: "Cannot delete the active tenant for the current session" },
        { status: 400 },
      )
    }

    const adminContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const existing = await runTenantQuery(
      sql,
      adminContext,
      sql`
        SELECT id, name
        FROM tenants
        WHERE id = ${tenantId}
        LIMIT 1
      `,
    )

    if (!existing?.length) {
      return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 })
    }

    const requiredTables = listTenantDeletionRequiredTables()
    const [existingTableRows, existingColumnRows] = await runTenantQueries(
      sql,
      adminContext,
      [
        sql.query(
          `
            SELECT table_name, table_type
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = ANY($1::text[])
          `,
          [requiredTables],
        ),
        sql.query(
          `
            SELECT table_name, column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = ANY($1::text[])
          `,
          [requiredTables],
        ),
      ],
    )
    const deletionSchema = buildTenantDeletionSchema({
      tables: existingTableRows as Array<{ table_name?: string | null; table_type?: string | null }>,
      columns: existingColumnRows as Array<{ table_name?: string | null; column_name?: string | null }>,
    })

    const availableSpecs = TENANT_DELETION_DEPENDENCIES.map((spec) => ({
      spec,
      queryMode: resolveTenantDeletionDependencyQueryMode(spec, deletionSchema),
    })).filter(
      (
        entry,
      ): entry is { spec: TenantDeletionDependencySpec; queryMode: TenantDeletionDependencyQueryMode } =>
        entry.queryMode !== null && isTenantDeletionDependencyAvailable(entry.spec, deletionSchema),
    )

    const countResults = availableSpecs.length
      ? await runTenantQueries(
          sql,
          adminContext,
          availableSpecs.map(({ spec, queryMode }) => buildTenantDeletionCountQuery(spec, tenantId, queryMode)),
        )
      : []
    const deletionSummary = summarizeTenantDeletionCounts(
      availableSpecs.map(({ spec }, index) => ({
        table: spec.table,
        label: spec.label,
        category: spec.category,
        count: Number(countResults[index]?.[0]?.count) || 0,
      })),
    )

    if (!deletionSummary.canDelete) {
      return NextResponse.json(
        {
          success: false,
          error: "Tenant has operational data and cannot be deleted automatically.",
          blockingDependencies: deletionSummary.blockingDependencies,
          cleanupDependencies: deletionSummary.cleanupDependencies,
          nextStep: "Archive this tenant or add an explicit data-purge workflow before deletion.",
        },
        { status: 409 },
      )
    }

    const cleanupSpecs = availableSpecs.filter(({ spec }) => spec.category === "cleanup")
    if (cleanupSpecs.length) {
      await runTenantQueries(
        sql,
        adminContext,
        cleanupSpecs.map(({ spec, queryMode }) => buildTenantDeletionDeleteQuery(spec, tenantId, queryMode)),
      )
    }

    await runTenantQuery(
      sql,
      adminContext,
      sql`
        DELETE FROM tenants
        WHERE id = ${tenantId}
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "delete",
      entityType: "tenants",
      entityId: tenantId,
      before: existing?.[0] ?? null,
      after: {
        deletedManagedDependencies: deletionSummary.cleanupDependencies,
      },
    })

    return NextResponse.json({
      success: true,
      deletedManagedDependencies: deletionSummary.cleanupDependencies,
    })
  } catch (error: any) {
    logServerError("Error deleting tenant", error)
    return buildAdminErrorResponse(error, "Failed to delete tenant", { ownerRequired: true })
  }
}

export async function PATCH(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    requireOwnerRole(sessionUser.role)
    if (!sql) {
      return databaseNotConfiguredResponse()
    }

    const parsedBody = updateTenantBodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, error: parsedBody.error.issues[0]?.message || "Invalid request body" },
        { status: 400 },
      )
    }

    const { tenantId, name } = parsedBody.data
    const adminContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const existing = await runTenantQuery(
      sql,
      adminContext,
      sql`
        SELECT id, name, created_at
        FROM tenants
        WHERE id = ${tenantId}
        LIMIT 1
      `,
    )

    if (!existing?.length) {
      return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 })
    }

    const updated = await runTenantQuery(
      sql,
      adminContext,
      sql`
        UPDATE tenants
        SET name = ${name}
        WHERE id = ${tenantId}
        RETURNING id, name, created_at
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "tenants",
      entityId: tenantId,
      before: existing[0] ?? null,
      after: updated[0] ?? null,
    })

    return NextResponse.json({ success: true, tenant: updated[0] })
  } catch (error: any) {
    logServerError("Error updating tenant", error)
    return buildAdminErrorResponse(error, "Failed to update tenant", { ownerRequired: true })
  }
}
