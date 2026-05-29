import { createHash, createHmac, timingSafeEqual } from "crypto"

import { normalizeTenantPlanId, type TenantPlanId } from "../../modules"

export type RazorpayBillingCycle = "monthly"

export type RazorpaySubscriptionEntity = {
  id: string
  plan_id: string
  customer_id?: string | null
  status: string
  short_url?: string | null
  start_at?: number | null
  charge_at?: number | null
  current_start?: number | null
  current_end?: number | null
  end_at?: number | null
  ended_at?: number | null
  expire_by?: number | null
  created_at?: number | null
  has_scheduled_changes?: boolean
  change_scheduled_at?: number | null
  notes?: Record<string, string> | null
}

type RazorpayCreateSubscriptionInput = {
  planId: TenantPlanId
  billingCycle?: RazorpayBillingCycle
  quantity?: number
  totalCount?: number
  startAt?: Date | null
  expireBy?: Date | null
  customerNotify?: boolean
  notes?: Record<string, string>
}

type RazorpayEnv = Record<string, string | undefined>

const RAZORPAY_API_BASE_URL = "https://api.razorpay.com/v1"
const DEFAULT_MONTHLY_TOTAL_COUNT = 120

const digest = (value: string) => Uint8Array.from(createHash("sha256").update(value).digest())

const normalizeEnvValue = (value: string | undefined) => {
  const normalized = String(value || "").trim()
  return normalized || null
}

const toUnixSeconds = (value?: Date | null) => {
  if (!value) return undefined
  return Math.floor(value.getTime() / 1000)
}

export const unixSecondsToIso = (value?: number | null) => {
  if (!value || !Number.isFinite(value)) return null
  return new Date(value * 1000).toISOString()
}

export const razorpayStatusToCommercialStatus = (
  status: unknown,
  options?: { startAt?: number | null; now?: Date },
) => {
  const normalized = String(status || "").trim().toLowerCase()
  const nowSeconds = Math.floor((options?.now || new Date()).getTime() / 1000)
  const startAt = Number(options?.startAt || 0) || null

  if (normalized === "authenticated") {
    return startAt && startAt > nowSeconds ? "trialing" : "active"
  }
  if (normalized === "active") return "active"
  if (normalized === "pending") return "past_due"
  if (normalized === "halted") return "unpaid"
  if (normalized === "paused") return "paused"
  if (normalized === "cancelled") return "canceled"
  if (normalized === "completed" || normalized === "expired") return "expired"
  return "incomplete"
}

export const resolveRazorpayPlanId = (
  planId: unknown,
  billingCycle: RazorpayBillingCycle = "monthly",
  env: RazorpayEnv = process.env,
) => {
  const normalizedPlanId = normalizeTenantPlanId(planId)
  const cycle = billingCycle === "monthly" ? "MONTHLY" : "MONTHLY"
  const envKey = `RAZORPAY_PLAN_${normalizedPlanId.toUpperCase()}_${cycle}_ID`
  const providerPlanId = normalizeEnvValue(env[envKey])
  if (!providerPlanId) {
    throw new Error(`Razorpay plan is not configured for ${normalizedPlanId} (${billingCycle})`)
  }
  return providerPlanId
}

export const isRazorpayConfigured = (env: RazorpayEnv = process.env) =>
  Boolean(
    normalizeEnvValue(env.RAZORPAY_KEY_ID) &&
      normalizeEnvValue(env.RAZORPAY_KEY_SECRET) &&
      normalizeEnvValue(env.RAZORPAY_WEBHOOK_SECRET),
  )

export const getRazorpayPublicConfig = (env: RazorpayEnv = process.env) => ({
  configured: isRazorpayConfigured(env),
  keyId: normalizeEnvValue(env.RAZORPAY_KEY_ID),
  plans: {
    basic: Boolean(normalizeEnvValue(env.RAZORPAY_PLAN_BASIC_MONTHLY_ID)),
    core: Boolean(normalizeEnvValue(env.RAZORPAY_PLAN_CORE_MONTHLY_ID)),
    enterprise: Boolean(normalizeEnvValue(env.RAZORPAY_PLAN_ENTERPRISE_MONTHLY_ID)),
  },
})

const getRazorpayCredentials = (env: RazorpayEnv = process.env) => {
  const keyId = normalizeEnvValue(env.RAZORPAY_KEY_ID)
  const keySecret = normalizeEnvValue(env.RAZORPAY_KEY_SECRET)
  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials are not configured")
  }
  return { keyId, keySecret }
}

export const verifyRazorpayWebhookSignature = (
  payload: string,
  signature: string,
  secret: string,
) => {
  const normalizedPayload = String(payload || "")
  const normalizedSignature = String(signature || "").trim()
  const normalizedSecret = String(secret || "").trim()

  if (!normalizedPayload || !normalizedSignature || !normalizedSecret) {
    return false
  }

  const expectedSignature = createHmac("sha256", normalizedSecret).update(normalizedPayload).digest("hex")
  return timingSafeEqual(digest(expectedSignature), digest(normalizedSignature))
}

const normalizeNotes = (notes?: Record<string, string>) => {
  const entries = Object.entries(notes || {})
    .filter(([key, value]) => key.trim() && String(value || "").trim())
    .slice(0, 12)
    .map(([key, value]) => [key.trim().slice(0, 30), String(value).trim().slice(0, 256)])
  return Object.fromEntries(entries)
}

const basicAuthHeader = (keyId: string, keySecret: string) =>
  `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`

const parseRazorpayError = async (response: Response) => {
  const payload = await response.json().catch(() => null)
  return (
    payload?.error?.description ||
    payload?.error?.reason ||
    payload?.error?.field ||
    payload?.error?.code ||
    `Razorpay request failed with status ${response.status}`
  )
}

export async function createRazorpaySubscription(
  input: RazorpayCreateSubscriptionInput,
  env: RazorpayEnv = process.env,
): Promise<RazorpaySubscriptionEntity> {
  const { keyId, keySecret } = getRazorpayCredentials(env)
  const billingCycle = input.billingCycle || "monthly"

  const response = await fetch(`${RAZORPAY_API_BASE_URL}/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(keyId, keySecret),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: resolveRazorpayPlanId(input.planId, billingCycle, env),
      total_count: input.totalCount || DEFAULT_MONTHLY_TOTAL_COUNT,
      quantity: input.quantity || 1,
      customer_notify: input.customerNotify ?? true,
      notes: normalizeNotes(input.notes),
      ...(toUnixSeconds(input.startAt) ? { start_at: toUnixSeconds(input.startAt) } : {}),
      ...(toUnixSeconds(input.expireBy) ? { expire_by: toUnixSeconds(input.expireBy) } : {}),
    }),
  })

  if (!response.ok) {
    throw new Error(await parseRazorpayError(response))
  }

  return (await response.json()) as RazorpaySubscriptionEntity
}
