import { NextResponse } from "next/server"
import { sql } from "@/lib/server/db"
import { requireSessionUser } from "@/lib/server/auth"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"
import { requireAdminRole } from "@/lib/permissions"
import { logAuditEvent } from "@/lib/server/audit-log"

const DEFAULT_BAG_WEIGHT_KG = 50
const MIN_BAG_WEIGHT_KG = 40
const MAX_BAG_WEIGHT_KG = 70

const DEFAULT_ALERT_THRESHOLDS = {
  floatRateIncreasePct: 0.15,
  yieldDropPct: 0.12,
  lossSpikeAbsPct: 0.02,
  lossSpikeRelPct: 0.5,
  mismatchBufferKgs: 5,
  dispatchUnconfirmedDays: 7,
  bagWeightDriftPct: 0.05,
  minKgsForSignal: 50,
  targets: {
    dryParchYieldFromRipe: null,
    lossPct: null,
    avgPricePerKg: null,
    floatRate: null,
  },
}

const sanitizeAlertThresholds = (input: any) => {
  if (!input || typeof input !== "object") return null
  const allowedFields = [
    "floatRateIncreasePct",
    "yieldDropPct",
    "lossSpikeAbsPct",
    "lossSpikeRelPct",
    "mismatchBufferKgs",
    "dispatchUnconfirmedDays",
    "bagWeightDriftPct",
    "minKgsForSignal",
  ]
  const allowedTargets = ["dryParchYieldFromRipe", "lossPct", "avgPricePerKg", "floatRate"]
  const cleaned: any = {}

  allowedFields.forEach((field) => {
    const value = input[field]
    if (typeof value === "number" && Number.isFinite(value)) {
      cleaned[field] = value
    }
  })

  if (input.targets && typeof input.targets === "object") {
    const targetPayload: any = {}
    allowedTargets.forEach((field) => {
      const value = input.targets[field]
      if (value === null) {
        targetPayload[field] = null
        return
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        targetPayload[field] = value
      }
    })
    if (Object.keys(targetPayload).length > 0) {
      cleaned.targets = targetPayload
    }
  }

  return Object.keys(cleaned).length > 0 ? cleaned : null
}

export async function GET() {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await requireSessionUser()
    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT name, bag_weight_kg, alert_thresholds
        FROM tenants
        WHERE id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    const bagWeightKg = Number(rows?.[0]?.bag_weight_kg) || DEFAULT_BAG_WEIGHT_KG
    const estateName = String(rows?.[0]?.name || "").trim()
    const rawThresholds = rows?.[0]?.alert_thresholds
    let parsedThresholds: any = null
    if (rawThresholds) {
      try {
        parsedThresholds =
          typeof rawThresholds === "string" ? JSON.parse(rawThresholds) : typeof rawThresholds === "object" ? rawThresholds : null
      } catch (err) {
        console.warn("Failed to parse alert thresholds JSON:", err)
      }
    }
    const alertThresholds = { ...DEFAULT_ALERT_THRESHOLDS, ...(parsedThresholds || {}) }
    if (parsedThresholds?.targets && typeof parsedThresholds.targets === "object") {
      alertThresholds.targets = { ...DEFAULT_ALERT_THRESHOLDS.targets, ...parsedThresholds.targets }
    }
    return NextResponse.json({ success: true, settings: { bagWeightKg, estateName, alertThresholds } })
  } catch (error: any) {
    console.error("Error loading tenant settings:", error)
    return NextResponse.json({ success: false, error: error.message || "Failed to load tenant settings" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    if (!sql) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 })
    }

    const sessionUser = await requireSessionUser()
    try {
      requireAdminRole(sessionUser.role)
    } catch {
      return NextResponse.json({ success: false, error: "Admin role required" }, { status: 403 })
    }

    const body = await request.json()
    const bagWeightKg = Number(body.bagWeightKg)
    const estateNameInput = typeof body.estateName === "string" ? body.estateName.trim() : null
    const alertThresholdsInput = sanitizeAlertThresholds(body.alertThresholds)

    if (!Number.isFinite(bagWeightKg)) {
      return NextResponse.json({ success: false, error: "bagWeightKg must be a number" }, { status: 400 })
    }

    if (bagWeightKg < MIN_BAG_WEIGHT_KG || bagWeightKg > MAX_BAG_WEIGHT_KG) {
      return NextResponse.json(
        { success: false, error: `bagWeightKg must be between ${MIN_BAG_WEIGHT_KG} and ${MAX_BAG_WEIGHT_KG}` },
        { status: 400 },
      )
    }

    const tenantContext = normalizeTenantContext(sessionUser.tenantId, sessionUser.role)
    if (estateNameInput !== null && !estateNameInput) {
      return NextResponse.json({ success: false, error: "estateName cannot be empty" }, { status: 400 })
    }

    const beforeRows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        SELECT bag_weight_kg, name, alert_thresholds
        FROM tenants
        WHERE id = ${tenantContext.tenantId}
        LIMIT 1
      `,
    )

    const rows = await runTenantQuery(
      sql,
      tenantContext,
      sql`
        UPDATE tenants
        SET bag_weight_kg = ${bagWeightKg},
            name = COALESCE(${estateNameInput}, name),
            alert_thresholds = COALESCE(${alertThresholdsInput ? JSON.stringify(alertThresholdsInput) : null}::jsonb, alert_thresholds)
        WHERE id = ${tenantContext.tenantId}
        RETURNING bag_weight_kg, name, alert_thresholds
      `,
    )

    const updated = Number(rows?.[0]?.bag_weight_kg) || bagWeightKg
    const estateName = String(rows?.[0]?.name || "").trim()
    const storedThresholds = rows?.[0]?.alert_thresholds
    let parsedThresholds: any = null
    if (storedThresholds) {
      try {
        parsedThresholds =
          typeof storedThresholds === "string"
            ? JSON.parse(storedThresholds)
            : typeof storedThresholds === "object"
              ? storedThresholds
              : null
      } catch (err) {
        console.warn("Failed to parse stored alert thresholds:", err)
      }
    }
    const alertThresholds = { ...DEFAULT_ALERT_THRESHOLDS, ...(parsedThresholds || {}) }
    if (parsedThresholds?.targets && typeof parsedThresholds.targets === "object") {
      alertThresholds.targets = { ...DEFAULT_ALERT_THRESHOLDS.targets, ...parsedThresholds.targets }
    }

    await logAuditEvent(sql, sessionUser, {
      action: "update",
      entityType: "tenants",
      entityId: tenantContext.tenantId,
      before: beforeRows?.[0] ?? null,
      after: rows?.[0] ?? null,
    })

    return NextResponse.json({ success: true, settings: { bagWeightKg: updated, estateName, alertThresholds } })
  } catch (error: any) {
    console.error("Error updating tenant settings:", error)
    return NextResponse.json({ success: false, error: error.message || "Failed to update tenant settings" }, { status: 500 })
  }
}
