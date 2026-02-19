import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireAdminSession } from "@/lib/server/mfa"
import { requireOwnerRole } from "@/lib/tenant"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { logAuditEvent } from "@/lib/server/audit-log"
import { loadTenantExperienceColumnStatus, parseJsonObject } from "@/lib/server/tenant-experience-db"
import {
  DEFAULT_TENANT_FEATURE_FLAGS,
  DEFAULT_TENANT_UI_VARIANT,
  mergeTenantFeatureFlags,
  sanitizeTenantFeatureFlags,
  sanitizeTenantUiVariant,
} from "@/lib/tenant-experience"

const adminErrorResponse = (error: any, fallback: string) => {
  const message = error?.message || fallback
  const status = ["MFA required", "Admin role required", "Unauthorized"].includes(message) ? 403 : 500
  return NextResponse.json({ success: false, error: message }, { status })
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    requireOwnerRole(sessionUser.role)

    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const tenantId = String(searchParams.get("tenantId") || "").trim()
    if (!tenantId) {
      return NextResponse.json({ success: false, error: "tenantId is required" }, { status: 400 })
    }

    const adminContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const columnStatus = await loadTenantExperienceColumnStatus(sql, adminContext)
    if (!columnStatus.hasUiVariant || !columnStatus.hasFeatureFlags) {
      return NextResponse.json(
        { success: false, error: "Tenant experience schema missing. Run scripts/48-tenant-variants.sql." },
        { status: 400 },
      )
    }

    const rows = await runTenantQuery(
      sql,
      adminContext,
      sql`
        SELECT ui_variant, feature_flags
        FROM tenants
        WHERE id = ${tenantId}
        LIMIT 1
      `,
    )

    if (!rows?.length) {
      return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 })
    }

    const uiVariant = sanitizeTenantUiVariant(rows[0]?.ui_variant) || DEFAULT_TENANT_UI_VARIANT
    const parsedFlags = sanitizeTenantFeatureFlags(parseJsonObject(rows[0]?.feature_flags, "tenant feature flags"))
    const featureFlags = mergeTenantFeatureFlags(parsedFlags || DEFAULT_TENANT_FEATURE_FLAGS)

    return NextResponse.json({
      success: true,
      profile: { uiVariant, featureFlags },
    })
  } catch (error: any) {
    console.error("Error loading tenant profile:", error)
    return adminErrorResponse(error, "Failed to load tenant profile")
  }
}

export async function PUT(request: Request) {
  try {
    const sessionUser = await requireAdminSession()
    requireOwnerRole(sessionUser.role)

    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const body = await request.json()
    const tenantId = String(body.tenantId || "").trim()
    const uiVariant = sanitizeTenantUiVariant(body.uiVariant)
    const featureFlags = sanitizeTenantFeatureFlags(body.featureFlags)

    if (!tenantId) {
      return NextResponse.json({ success: false, error: "tenantId is required" }, { status: 400 })
    }
    if (!uiVariant) {
      return NextResponse.json({ success: false, error: "uiVariant is invalid" }, { status: 400 })
    }
    if (!featureFlags) {
      return NextResponse.json({ success: false, error: "featureFlags are invalid" }, { status: 400 })
    }

    const adminContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const columnStatus = await loadTenantExperienceColumnStatus(sql, adminContext)
    if (!columnStatus.hasUiVariant || !columnStatus.hasFeatureFlags) {
      return NextResponse.json(
        { success: false, error: "Tenant experience schema missing. Run scripts/48-tenant-variants.sql." },
        { status: 400 },
      )
    }

    const beforeRows = await runTenantQuery(
      sql,
      adminContext,
      sql`
        SELECT ui_variant, feature_flags
        FROM tenants
        WHERE id = ${tenantId}
        LIMIT 1
      `,
    )

    if (!beforeRows?.length) {
      return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 })
    }

    const mergedFlags = mergeTenantFeatureFlags(featureFlags)
    const rows = await runTenantQuery(
      sql,
      adminContext,
      sql`
        UPDATE tenants
        SET ui_variant = ${uiVariant},
            feature_flags = ${JSON.stringify(mergedFlags)}::jsonb
        WHERE id = ${tenantId}
        RETURNING ui_variant, feature_flags
      `,
    )

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "tenant_profile",
      entityId: tenantId,
      before: beforeRows?.[0] ?? null,
      after: rows?.[0] ?? null,
    })

    const savedUiVariant = sanitizeTenantUiVariant(rows?.[0]?.ui_variant) || DEFAULT_TENANT_UI_VARIANT
    const savedFlags = sanitizeTenantFeatureFlags(parseJsonObject(rows?.[0]?.feature_flags, "stored feature flags"))
    return NextResponse.json({
      success: true,
      profile: {
        uiVariant: savedUiVariant,
        featureFlags: mergeTenantFeatureFlags(savedFlags || DEFAULT_TENANT_FEATURE_FLAGS),
      },
    })
  } catch (error: any) {
    console.error("Error updating tenant profile:", error)
    return adminErrorResponse(error, "Failed to update tenant profile")
  }
}
