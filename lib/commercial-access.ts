import { DEFAULT_TENANT_PLAN_ID, normalizeTenantPlanId, type TenantPlanId } from "./modules"

export type BillingProvider = "none" | "manual" | "razorpay" | "stripe" | "paddle" | "lemonsqueezy"

export type CommercialAccessStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "canceled"
  | "expired"
  | "incomplete"
  | "unpaid"

export type TenantCommercialAccessInput = {
  billingProvider?: unknown
  planId?: unknown
  status?: unknown
  trialStartedAt?: string | null
  trialEndsAt?: string | null
  currentPeriodEndsAt?: string | null
  accessEndsAt?: string | null
  cancelAtPeriodEnd?: boolean | null
} | null

export type ResolvedTenantCommercialAccess = {
  billingProvider: BillingProvider
  planId: TenantPlanId
  status: CommercialAccessStatus
  trialStartedAt: string | null
  trialEndsAt: string | null
  currentPeriodEndsAt: string | null
  accessEndsAt: string | null
  cancelAtPeriodEnd: boolean
  trialActive: boolean
  accessActive: boolean
  needsPaymentMethod: boolean
  stage: "trial" | "paid" | "grace" | "inactive"
}

const DAY_MS = 24 * 60 * 60 * 1000
const BILLING_PROVIDERS: BillingProvider[] = ["none", "manual", "razorpay", "stripe", "paddle", "lemonsqueezy"]
const COMMERCIAL_ACCESS_STATUSES: CommercialAccessStatus[] = [
  "trialing",
  "active",
  "past_due",
  "paused",
  "canceled",
  "expired",
  "incomplete",
  "unpaid",
]

const normalizeTimestamp = (value: unknown) => {
  const normalized = String(value || "").trim()
  return normalized || null
}

const parseTimestampMs = (value: unknown) => {
  const normalized = normalizeTimestamp(value)
  if (!normalized) return null
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export const normalizeBillingProvider = (value: unknown): BillingProvider => {
  const normalized = String(value || "").trim().toLowerCase()
  return BILLING_PROVIDERS.includes(normalized as BillingProvider)
    ? (normalized as BillingProvider)
    : "none"
}

export const normalizeCommercialAccessStatus = (value: unknown): CommercialAccessStatus => {
  const normalized = String(value || "").trim().toLowerCase()
  return COMMERCIAL_ACCESS_STATUSES.includes(normalized as CommercialAccessStatus)
    ? (normalized as CommercialAccessStatus)
    : "active"
}

export const resolveLegacyCommercialAccess = (planId?: unknown): ResolvedTenantCommercialAccess => ({
  billingProvider: "manual",
  planId: normalizeTenantPlanId(planId || DEFAULT_TENANT_PLAN_ID),
  status: "active",
  trialStartedAt: null,
  trialEndsAt: null,
  currentPeriodEndsAt: null,
  accessEndsAt: null,
  cancelAtPeriodEnd: false,
  trialActive: false,
  accessActive: true,
  needsPaymentMethod: false,
  stage: "paid",
})

export const resolveTenantCommercialAccess = (
  input?: TenantCommercialAccessInput,
  options?: { now?: Date },
): ResolvedTenantCommercialAccess => {
  if (!input) {
    return resolveLegacyCommercialAccess(DEFAULT_TENANT_PLAN_ID)
  }

  const nowMs = (options?.now || new Date()).getTime()
  const planId = normalizeTenantPlanId(input.planId || DEFAULT_TENANT_PLAN_ID)
  let status = normalizeCommercialAccessStatus(input.status)
  const billingProvider = normalizeBillingProvider(input.billingProvider)
  const trialStartedAt = normalizeTimestamp(input.trialStartedAt)
  const trialEndsAt = normalizeTimestamp(input.trialEndsAt)
  const currentPeriodEndsAt = normalizeTimestamp(input.currentPeriodEndsAt)
  const accessEndsAt = normalizeTimestamp(input.accessEndsAt)
  const cancelAtPeriodEnd = Boolean(input.cancelAtPeriodEnd)

  const trialEndsAtMs = parseTimestampMs(trialEndsAt)
  const currentPeriodEndsAtMs = parseTimestampMs(currentPeriodEndsAt)
  const accessEndsAtMs =
    parseTimestampMs(accessEndsAt) ??
    (status === "trialing" ? trialEndsAtMs : currentPeriodEndsAtMs)

  if (status === "trialing" && trialEndsAtMs !== null && nowMs > trialEndsAtMs) {
    status = "expired"
  }

  const trialActive = status === "trialing" && (trialEndsAtMs === null || nowMs <= trialEndsAtMs)
  const isPotentiallyActive =
    status === "trialing" ||
    status === "active" ||
    status === "past_due" ||
    status === "paused" ||
    status === "canceled"
  const accessActive = isPotentiallyActive && (accessEndsAtMs === null || nowMs <= accessEndsAtMs)
  const needsPaymentMethod = status === "incomplete" || status === "past_due" || status === "unpaid"

  let stage: ResolvedTenantCommercialAccess["stage"] = "inactive"
  if (trialActive) {
    stage = "trial"
  } else if (accessActive && (status === "past_due" || status === "incomplete" || status === "unpaid")) {
    stage = "grace"
  } else if (accessActive) {
    stage = "paid"
  }

  return {
    billingProvider,
    planId,
    status,
    trialStartedAt,
    trialEndsAt,
    currentPeriodEndsAt,
    accessEndsAt,
    cancelAtPeriodEnd,
    trialActive,
    accessActive,
    needsPaymentMethod,
    stage,
  }
}

export const buildTenantTrialDefaults = (
  planId: unknown = DEFAULT_TENANT_PLAN_ID,
  options?: { now?: Date; trialDays?: number; billingProvider?: unknown },
) => {
  const now = options?.now || new Date()
  const trialDays = Math.max(1, Number(options?.trialDays) || 30)
  const trialEndsAt = new Date(now.getTime() + trialDays * DAY_MS)

  return {
    planId: normalizeTenantPlanId(planId),
    billingProvider: normalizeBillingProvider(options?.billingProvider),
    status: "trialing" as const,
    trialStartedAt: now.toISOString(),
    trialEndsAt: trialEndsAt.toISOString(),
    accessEndsAt: trialEndsAt.toISOString(),
    cancelAtPeriodEnd: false,
  }
}
