import "server-only"

import {
  buildTenantTrialDefaults,
  normalizeBillingProvider,
  normalizeCommercialAccessStatus,
  resolveTenantCommercialAccess,
  type BillingProvider,
  type CommercialAccessStatus,
} from "@/lib/commercial-access"
import { normalizeTenantPlanId } from "@/lib/modules"
import { normalizeTenantContext, runTenantQuery } from "@/lib/server/tenant-db"

export type TenantCommercialAccessRow = {
  tenant_id: string
  plan_id: string
  billing_provider: string
  billing_status: string
  billing_customer_id: string | null
  billing_subscription_id: string | null
  billing_price_id: string | null
  trial_started_at: string | null
  trial_ends_at: string | null
  current_period_started_at: string | null
  current_period_ends_at: string | null
  access_expires_at: string | null
  cancel_at_period_end: boolean
  canceled_at: string | null
  last_synced_at: string | null
  metadata: Record<string, unknown> | null
}

type SaveTenantCommercialAccessInput = {
  planId?: unknown
  billingProvider?: unknown
  status?: unknown
  billingCustomerId?: string | null
  billingSubscriptionId?: string | null
  billingPriceId?: string | null
  trialStartedAt?: string | null
  trialEndsAt?: string | null
  currentPeriodStartedAt?: string | null
  currentPeriodEndsAt?: string | null
  accessExpiresAt?: string | null
  cancelAtPeriodEnd?: boolean
  canceledAt?: string | null
  lastSyncedAt?: string | null
  metadata?: Record<string, unknown> | null
}

const isMissingRelation = (error: unknown, relation: string) => {
  const message = String((error as Error)?.message || error || "")
  return message.includes(`relation "${relation}"`) && message.includes("does not exist")
}

const isMissingColumn = (error: unknown, column: string) => {
  const message = String((error as Error)?.message || error || "")
  return message.includes(`column "${column}"`) && message.includes("does not exist")
}

const isCommercialAccessSchemaMissing = (error: unknown) =>
  isMissingRelation(error, "tenant_commercial_access") || isMissingColumn(error, "billing_provider")

const toMetadataObject = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null

const resolveExistingRow = async (db: any, tenantId: string) => {
  const tenantContext = normalizeTenantContext(tenantId, "owner")
  const rows = (await runTenantQuery(
    db,
    tenantContext,
    db`
      SELECT
        tenant_id,
        plan_id,
        billing_provider,
        billing_status,
        billing_customer_id,
        billing_subscription_id,
        billing_price_id,
        trial_started_at,
        trial_ends_at,
        current_period_started_at,
        current_period_ends_at,
        access_expires_at,
        cancel_at_period_end,
        canceled_at,
        last_synced_at,
        metadata
      FROM tenant_commercial_access
      WHERE tenant_id = ${tenantId}
      LIMIT 1
    `,
  )) as TenantCommercialAccessRow[]
  return rows[0] || null
}

const mergeMetadata = (
  existing: Record<string, unknown> | null,
  next: Record<string, unknown> | null | undefined,
) => {
  if (next === undefined) {
    return existing || {}
  }
  return next || {}
}

export const normalizeCommercialAccessSchemaError = (error: unknown) => {
  if (isCommercialAccessSchemaMissing(error)) {
    return new Error("Tenant commercial access schema missing. Run scripts/74-tenant-commercial-access.sql.")
  }
  return error instanceof Error ? error : new Error(String(error || "Tenant commercial access lookup failed"))
}

export async function loadTenantCommercialAccess(
  db: any,
  tenantId: string,
  _role: string,
): Promise<TenantCommercialAccessRow | null> {
  try {
    const row = await resolveExistingRow(db, tenantId)
    if (!row) return null
    return {
      ...row,
      metadata: toMetadataObject(row.metadata),
    }
  } catch (error) {
    if (isCommercialAccessSchemaMissing(error)) {
      return null
    }
    throw error
  }
}

export async function findTenantByBillingSubscriptionId(
  db: any,
  subscriptionId: string,
): Promise<{ tenantId: string; row: TenantCommercialAccessRow | null } | null> {
  try {
    const tenantContext = normalizeTenantContext(undefined, "owner")
    const rows = (await runTenantQuery(
      db,
      tenantContext,
      db`
        SELECT
          tenant_id,
          plan_id,
          billing_provider,
          billing_status,
          billing_customer_id,
          billing_subscription_id,
          billing_price_id,
          trial_started_at,
          trial_ends_at,
          current_period_started_at,
          current_period_ends_at,
          access_expires_at,
          cancel_at_period_end,
          canceled_at,
          last_synced_at,
          metadata
        FROM tenant_commercial_access
        WHERE billing_subscription_id = ${subscriptionId}
        LIMIT 1
      `,
    )) as TenantCommercialAccessRow[]

    const row = rows[0]
    if (!row) return null
    return {
      tenantId: row.tenant_id,
      row: {
        ...row,
        metadata: toMetadataObject(row.metadata),
      },
    }
  } catch (error) {
    if (isCommercialAccessSchemaMissing(error)) {
      return null
    }
    throw error
  }
}

export const resolveStoredTenantCommercialAccess = (row?: TenantCommercialAccessRow | null, options?: { now?: Date }) =>
  resolveTenantCommercialAccess(
    row
      ? {
          billingProvider: row.billing_provider,
          planId: row.plan_id,
          status: row.billing_status,
          trialStartedAt: row.trial_started_at,
          trialEndsAt: row.trial_ends_at,
          currentPeriodEndsAt: row.current_period_ends_at,
          accessEndsAt: row.access_expires_at,
          cancelAtPeriodEnd: row.cancel_at_period_end,
        }
      : null,
    options,
  )

export async function saveTenantCommercialAccess(
  db: any,
  tenantId: string,
  _role: string,
  input: SaveTenantCommercialAccessInput,
) {
  const tenantContext = normalizeTenantContext(tenantId, "owner")

  try {
    const existing = await resolveExistingRow(db, tenantId)
    const nextPlanId = normalizeTenantPlanId(input.planId ?? existing?.plan_id)
    const nextBillingProvider = normalizeBillingProvider(input.billingProvider ?? existing?.billing_provider) as BillingProvider
    const nextStatus = normalizeCommercialAccessStatus(input.status ?? existing?.billing_status) as CommercialAccessStatus
    const nextMetadata = mergeMetadata(toMetadataObject(existing?.metadata), input.metadata)

    await runTenantQuery(
      db,
      tenantContext,
      db`
        INSERT INTO tenant_commercial_access (
          tenant_id,
          plan_id,
          billing_provider,
          billing_status,
          billing_customer_id,
          billing_subscription_id,
          billing_price_id,
          trial_started_at,
          trial_ends_at,
          current_period_started_at,
          current_period_ends_at,
          access_expires_at,
          cancel_at_period_end,
          canceled_at,
          last_synced_at,
          metadata
        )
        VALUES (
          ${tenantId},
          ${nextPlanId},
          ${nextBillingProvider},
          ${nextStatus},
          ${input.billingCustomerId ?? existing?.billing_customer_id ?? null},
          ${input.billingSubscriptionId ?? existing?.billing_subscription_id ?? null},
          ${input.billingPriceId ?? existing?.billing_price_id ?? null},
          ${input.trialStartedAt ?? existing?.trial_started_at ?? null}::timestamptz,
          ${input.trialEndsAt ?? existing?.trial_ends_at ?? null}::timestamptz,
          ${input.currentPeriodStartedAt ?? existing?.current_period_started_at ?? null}::timestamptz,
          ${input.currentPeriodEndsAt ?? existing?.current_period_ends_at ?? null}::timestamptz,
          ${input.accessExpiresAt ?? existing?.access_expires_at ?? null}::timestamptz,
          ${input.cancelAtPeriodEnd ?? existing?.cancel_at_period_end ?? false},
          ${input.canceledAt ?? existing?.canceled_at ?? null}::timestamptz,
          ${input.lastSyncedAt ?? existing?.last_synced_at ?? null}::timestamptz,
          ${JSON.stringify(nextMetadata)}::jsonb
        )
        ON CONFLICT (tenant_id)
        DO UPDATE SET
          plan_id = EXCLUDED.plan_id,
          billing_provider = EXCLUDED.billing_provider,
          billing_status = EXCLUDED.billing_status,
          billing_customer_id = EXCLUDED.billing_customer_id,
          billing_subscription_id = EXCLUDED.billing_subscription_id,
          billing_price_id = EXCLUDED.billing_price_id,
          trial_started_at = EXCLUDED.trial_started_at,
          trial_ends_at = EXCLUDED.trial_ends_at,
          current_period_started_at = EXCLUDED.current_period_started_at,
          current_period_ends_at = EXCLUDED.current_period_ends_at,
          access_expires_at = EXCLUDED.access_expires_at,
          cancel_at_period_end = EXCLUDED.cancel_at_period_end,
          canceled_at = EXCLUDED.canceled_at,
          last_synced_at = EXCLUDED.last_synced_at,
          metadata = EXCLUDED.metadata,
          updated_at = CURRENT_TIMESTAMP
      `,
    )
    return true
  } catch (error) {
    if (isCommercialAccessSchemaMissing(error)) {
      return false
    }
    throw error
  }
}

export async function initializeTenantTrialAccess(
  db: any,
  tenantId: string,
  _role: string,
  input?: { planId?: unknown; billingProvider?: unknown; trialDays?: number; source?: string | null; now?: Date },
) {
  const tenantContext = normalizeTenantContext(tenantId, "owner")
  const defaults = buildTenantTrialDefaults(input?.planId, {
    now: input?.now,
    trialDays: input?.trialDays,
    billingProvider: input?.billingProvider,
  })

  try {
    await runTenantQuery(
      db,
      tenantContext,
      db`
        INSERT INTO tenant_commercial_access (
          tenant_id,
          plan_id,
          billing_provider,
          billing_status,
          trial_started_at,
          trial_ends_at,
          access_expires_at,
          cancel_at_period_end,
          metadata
        )
        VALUES (
          ${tenantId},
          ${defaults.planId},
          ${defaults.billingProvider},
          ${defaults.status},
          ${defaults.trialStartedAt},
          ${defaults.trialEndsAt},
          ${defaults.accessEndsAt},
          ${defaults.cancelAtPeriodEnd},
          ${JSON.stringify({
            source: input?.source || "self-serve-signup",
          })}::jsonb
        )
        ON CONFLICT (tenant_id) DO NOTHING
      `,
    )
    return true
  } catch (error) {
    if (isCommercialAccessSchemaMissing(error)) {
      return false
    }
    throw error
  }
}

export async function upsertTenantCommercialPlan(
  db: any,
  tenantId: string,
  _role: string,
  planId: unknown,
  input?: { billingProvider?: unknown; status?: unknown },
) {
  const tenantContext = normalizeTenantContext(tenantId, "owner")

  try {
    await runTenantQuery(
      db,
      tenantContext,
      db`
        INSERT INTO tenant_commercial_access (
          tenant_id,
          plan_id,
          billing_provider,
          billing_status
        )
        VALUES (
          ${tenantId},
          ${normalizeTenantPlanId(planId)},
          ${normalizeBillingProvider(input?.billingProvider)},
          ${normalizeCommercialAccessStatus(input?.status)}
        )
        ON CONFLICT (tenant_id)
        DO UPDATE SET
          plan_id = EXCLUDED.plan_id,
          updated_at = CURRENT_TIMESTAMP
      `,
    )
    return true
  } catch (error) {
    if (isCommercialAccessSchemaMissing(error)) {
      return false
    }
    throw error
  }
}
