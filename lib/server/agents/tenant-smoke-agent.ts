import "server-only"

import { generateTemporaryPassword } from "@/lib/passwords"
import { finishAgentRun, saveAgentFinding, startAgentRun } from "@/lib/server/agents/agent-store"
import { sendAgentAlertEmail } from "@/lib/server/agents/alert-email"
import { logAppErrorEvent } from "@/lib/server/error-events"
import { fetchWithTimeout } from "@/lib/server/http"
import {
  buildTenantSmokeCoverage,
  parseTenantSmokeTargetsEnv,
  resolveTenantSmokeBaseUrl,
  type TenantSmokeCheckDefinition,
  type TenantSmokeTarget,
} from "@/lib/server/agents/tenant-smoke-config"

type FindingSeverity = "low" | "medium" | "high" | "critical"
type SmokeCheckStatus = "passed" | "failed"

type SmokeCheckResult = {
  key: string
  label: string
  status: SmokeCheckStatus
  detail: string
  severity?: FindingSeverity
  path?: string
  httpStatus?: number
}

type SmokeTenantResult = {
  slug: string
  tenantName: string
  tenantId: string | null
  username: string
  role: string | null
  planId: string | null
  modules: string[]
  status: "healthy" | "failed"
  checks: SmokeCheckResult[]
}

type JsonRecord = Record<string, any>

const AGENT_NAME = "tenant-smoke-agent"
const DEFAULT_TIMEOUT_MS = 12_000

const truncate = (value: string, max = 220) => (value.length > max ? `${value.slice(0, max - 1)}…` : value)

const normalizeText = (value: unknown) => String(value || "").trim()

const resolveTimeoutMs = () => {
  const raw = Number.parseInt(String(process.env.TENANT_SMOKE_TIMEOUT_MS || ""), 10)
  if (!Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(raw, 3_000), 30_000)
}

const parseBoolean = (value: unknown, defaultValue: boolean) => {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return defaultValue
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return defaultValue
}

const sanitizeSmokeUsername = (slug: string) =>
  `tenantsmoke_${slug.replace(/[^a-z0-9_]/gi, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 28) || "monitor"}`

const buildCookieHeaderValue = (cookies: Map<string, string>) =>
  Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ")

class CookieJar {
  private readonly cookies = new Map<string, string>()
  constructor(private readonly baseUrl: string, private readonly timeoutMs: number) {}

  private updateFromResponse(response: Response) {
    const headersWithSetCookie = response.headers as Headers & { getSetCookie?: () => string[] }
    const setCookieHeaders =
      typeof headersWithSetCookie.getSetCookie === "function" ? headersWithSetCookie.getSetCookie() : []

    for (const headerValue of setCookieHeaders) {
      const pair = String(headerValue || "")
        .split(";")[0]
        ?.trim()
      if (!pair) continue
      const separatorIndex = pair.indexOf("=")
      if (separatorIndex <= 0) continue
      const name = pair.slice(0, separatorIndex).trim()
      const value = pair.slice(separatorIndex + 1).trim()
      if (!name) continue
      this.cookies.set(name, value)
    }
  }

  async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers)
    if (this.cookies.size > 0) {
      headers.set("cookie", buildCookieHeaderValue(this.cookies))
    }
    // Lets the login flow tag the resulting security_event with a distinguishable
    // source instead of "next-auth" — this agent signs in as the tenant's REAL
    // admin account (not a tenantsmoke_* username), so engagement/dormancy queries
    // that only filter actor_username by that prefix never catch this login.
    headers.set("x-farmflow-agent", "tenant-smoke")

    const response = await fetchWithTimeout(new URL(path, this.baseUrl), {
      ...init,
      headers,
      timeoutMs: this.timeoutMs,
      cache: "no-store",
    })
    this.updateFromResponse(response)
    return response
  }
}

const parseJsonResponse = async <T = JsonRecord>(response: Response) => {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

const describeHttpFailure = (response: Response, payload?: JsonRecord | null) => {
  const message =
    normalizeText(payload?.error) ||
    normalizeText(payload?.message) ||
    response.statusText ||
    `HTTP ${response.status}`
  return `${response.status} ${message}`.trim()
}

const classifyFailureSeverity = (input: {
  key: string
  httpStatus?: number
  detail?: string
  sessionSensitive?: boolean
}): FindingSeverity => {
  const status = Number(input.httpStatus || 0)
  const key = normalizeText(input.key).toLowerCase()
  const detail = normalizeText(input.detail).toLowerCase()

  if (input.sessionSensitive || status >= 500 || status === 401 || status === 403) return "critical"
  if (status === 429) return "medium"
  if (key.includes("user") || key.includes("plan") || detail.includes("redirect")) return "high"
  return "high"
}

const validateSmokeApiPayload = (key: string, payload: JsonRecord | null) => {
  if (key === "locations-api") return Array.isArray(payload?.locations)
  if (key === "processing-api") return Array.isArray(payload?.records)
  if (key === "dispatch-api") return Array.isArray(payload?.records)
  if (key === "sales-api") return Array.isArray(payload?.records)
  if (key === "journal-api") return Array.isArray(payload?.entries)
  if (key === "rainfall-api") return Array.isArray(payload?.records)
  if (key === "weather-api") return Boolean(payload?.location || payload?.forecast)
  return Boolean(payload && payload.success !== false)
}

async function logSmokeFailureEvent(input: {
  target: TenantSmokeTarget
  tenantId?: string | null
  key: string
  path?: string
  severity: FindingSeverity
  detail: string
}) {
  const severity = input.severity === "medium" || input.severity === "low" ? "error" : "critical"
  await logAppErrorEvent({
    tenantId: input.tenantId || null,
    source: "agent/tenant-smoke",
    endpoint: input.path || null,
    errorCode: input.key,
    severity,
    message: `[${input.target.tenantName}] ${input.detail}`,
    metadata: {
      tenantName: input.target.tenantName,
      slug: input.target.slug,
      username: input.target.username,
      checkKey: input.key,
      path: input.path || null,
      severity: input.severity,
    },
  })
}

async function authenticateTenantSession(input: {
  baseUrl: string
  timeoutMs: number
  target: TenantSmokeTarget
}) {
  const jar = new CookieJar(input.baseUrl, input.timeoutMs)

  const csrfResponse = await jar.request("/api/auth/csrf", {
    headers: { Accept: "application/json" },
  })
  const csrfPayload = await parseJsonResponse<{ csrfToken?: string }>(csrfResponse)
  if (!csrfResponse.ok || !normalizeText(csrfPayload?.csrfToken)) {
    throw new Error(`Could not obtain login CSRF token (${describeHttpFailure(csrfResponse, csrfPayload as JsonRecord | null)})`)
  }

  const loginBody = new URLSearchParams({
    csrfToken: String(csrfPayload?.csrfToken || ""),
    username: input.target.username,
    password: input.target.password,
    callbackUrl: `${input.baseUrl}/dashboard?tab=launcher`,
    json: "true",
    sessionMode: "app",
  })

  const loginResponse = await jar.request("/api/auth/callback/credentials?json=true", {
    method: "POST",
    redirect: "manual",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: loginBody.toString(),
  })

  if (loginResponse.status >= 400) {
    const payload = await parseJsonResponse<JsonRecord>(loginResponse)
    throw new Error(`Login failed (${describeHttpFailure(loginResponse, payload)})`)
  }

  const sessionResponse = await jar.request("/api/auth/session", {
    headers: { Accept: "application/json" },
  })
  const sessionPayload = await parseJsonResponse<JsonRecord>(sessionResponse)
  const sessionUser = sessionPayload?.user as JsonRecord | undefined
  if (!sessionResponse.ok || !sessionUser) {
    throw new Error(`Session lookup failed (${describeHttpFailure(sessionResponse, sessionPayload)})`)
  }

  const sessionUsername = normalizeText(sessionUser.name || sessionUser.username)
  const sessionTenantId = normalizeText(sessionUser.tenantId)
  if (!sessionTenantId || sessionUsername.toLowerCase() !== input.target.username.toLowerCase()) {
    throw new Error("Authenticated session user does not match tenant smoke target")
  }

  return {
    jar,
    sessionUser: {
      username: sessionUsername,
      role: normalizeText(sessionUser.role).toLowerCase(),
      tenantId: sessionTenantId,
    },
  }
}

async function checkHtmlPage(input: {
  jar: CookieJar
  check: TenantSmokeCheckDefinition
}) {
  const response = await input.jar.request(input.check.path, {
    method: "GET",
    redirect: "manual",
    headers: { Accept: "text/html" },
  })

  const location = normalizeText(response.headers.get("location"))
  if (response.status >= 300 && response.status < 400) {
    return {
      ok: false,
      detail: `Redirected to ${location || "unknown location"}`,
      httpStatus: response.status,
    }
  }

  const html = await response.text()
  if (!response.ok) {
    return {
      ok: false,
      detail: `${response.status} ${response.statusText || "Page request failed"}`.trim(),
      httpStatus: response.status,
    }
  }

  if (input.check.expectedText && !html.includes(input.check.expectedText)) {
    return {
      ok: false,
      detail: `Expected page text not found: ${input.check.expectedText}`,
      httpStatus: response.status,
    }
  }

  return {
    ok: true,
    detail: `Loaded (${response.status})`,
    httpStatus: response.status,
  }
}

async function checkJsonApi(input: {
  jar: CookieJar
  check: TenantSmokeCheckDefinition
}) {
  const response = await input.jar.request(input.check.path, {
    method: "GET",
    headers: { Accept: "application/json" },
  })
  const payload = await parseJsonResponse<JsonRecord>(response)

  if (!response.ok) {
    return {
      ok: false,
      detail: describeHttpFailure(response, payload),
      httpStatus: response.status,
    }
  }

  if (!validateSmokeApiPayload(input.check.key, payload)) {
    return {
      ok: false,
      detail: "Unexpected API response shape",
      httpStatus: response.status,
    }
  }

  return {
    ok: true,
    detail: `Loaded (${response.status})`,
    httpStatus: response.status,
  }
}

async function fetchTenantModules(jar: CookieJar) {
  const response = await jar.request("/api/tenant-modules", {
    headers: { Accept: "application/json" },
  })
  const payload = await parseJsonResponse<JsonRecord>(response)
  if (!response.ok || payload?.success !== true || !Array.isArray(payload?.modules)) {
    throw new Error(`Tenant modules check failed (${describeHttpFailure(response, payload)})`)
  }

  return {
    planId: normalizeText(payload?.planId).toLowerCase() || null,
    modules: (payload?.modules || []).map((moduleId: unknown) => String(moduleId || "")).filter(Boolean),
  }
}

async function fetchTenantSettings(jar: CookieJar) {
  const response = await jar.request("/api/tenant-settings", {
    headers: { Accept: "application/json" },
  })
  const payload = await parseJsonResponse<JsonRecord>(response)
  if (!response.ok || payload?.success !== true || !payload?.settings || typeof payload.settings !== "object") {
    throw new Error(`Tenant settings check failed (${describeHttpFailure(response, payload)})`)
  }
  return payload.settings as JsonRecord
}

async function fetchTenantUsers(jar: CookieJar) {
  const response = await jar.request("/api/admin/users", {
    headers: { Accept: "application/json" },
  })
  const payload = await parseJsonResponse<JsonRecord>(response)
  if (!response.ok || payload?.success !== true || !Array.isArray(payload?.users)) {
    throw new Error(`Tenant users check failed (${describeHttpFailure(response, payload)})`)
  }
  return payload.users as JsonRecord[]
}

async function deleteTenantUser(jar: CookieJar, userId: string) {
  const response = await jar.request(`/api/admin/users?userId=${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  })
  const payload = await parseJsonResponse<JsonRecord>(response)
  if (!response.ok || payload?.success !== true) {
    throw new Error(`User delete failed (${describeHttpFailure(response, payload)})`)
  }
}

async function exerciseTenantUserMutation(input: {
  jar: CookieJar
  target: TenantSmokeTarget
}) {
  const smokeUsername = sanitizeSmokeUsername(input.target.slug)
  const password = generateTemporaryPassword(12)
  const existingUsers = await fetchTenantUsers(input.jar)
  const existingSmokeUser = existingUsers.find((user) => normalizeText(user.username) === smokeUsername)
  if (existingSmokeUser?.id) {
    await deleteTenantUser(input.jar, String(existingSmokeUser.id))
  }

  const createResponse = await input.jar.request("/api/admin/users", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: smokeUsername,
      password,
      role: "admin",
    }),
  })
  const createPayload = await parseJsonResponse<JsonRecord>(createResponse)
  if (!createResponse.ok || createPayload?.success !== true || !normalizeText(createPayload?.user?.id)) {
    throw new Error(`User create failed (${describeHttpFailure(createResponse, createPayload)})`)
  }

  const createdUserId = String(createPayload?.user?.id || "")
  try {
    await deleteTenantUser(input.jar, createdUserId)
  } catch (error) {
    throw new Error(`User cleanup failed (${String((error as Error)?.message || error)})`)
  }
}

async function runTenantSmokeChecks(input: {
  baseUrl: string
  timeoutMs: number
  target: TenantSmokeTarget
  runId: string
  dryRun: boolean
}) {
  const checks: SmokeCheckResult[] = []
  let tenantId: string | null = null
  let role: string | null = null
  let planId: string | null = null
  let modules: string[] = []

  const recordCheck = async (check: SmokeCheckResult) => {
    checks.push(check)
    if (check.status !== "failed") return

    const severity = check.severity || "high"
    if (!input.dryRun) {
      await saveAgentFinding({
        runId: input.runId,
        tenantId,
        findingType: "tenant_smoke",
        findingKey: `${input.target.slug}:${check.key}`,
        severity,
        title: `${input.target.tenantName} :: ${check.label}`,
        description: check.detail,
        payload: {
          tenantName: input.target.tenantName,
          slug: input.target.slug,
          path: check.path || null,
          httpStatus: check.httpStatus || null,
          username: input.target.username,
          role,
          planId,
          modules,
        },
      })
    }

    await logSmokeFailureEvent({
      target: input.target,
      tenantId,
      key: check.key,
      path: check.path,
      severity,
      detail: check.detail,
    })
  }

  try {
    const { jar, sessionUser } = await authenticateTenantSession({
      baseUrl: input.baseUrl,
      timeoutMs: input.timeoutMs,
      target: input.target,
    })
    tenantId = sessionUser.tenantId
    role = sessionUser.role

    await recordCheck({
      key: "sign-in",
      label: "Sign in",
      status: "passed",
      detail: `Authenticated as ${sessionUser.username}`,
      path: "/login",
    })

    if (!["admin", "owner"].includes(sessionUser.role)) {
      await recordCheck({
        key: "admin-role",
        label: "Admin session",
        status: "failed",
        detail: `Expected admin or owner role, received '${sessionUser.role || "unknown"}'`,
        severity: "critical",
      })
    } else {
      await recordCheck({
        key: "admin-role",
        label: "Admin session",
        status: "passed",
        detail: `Role is ${sessionUser.role}`,
      })
    }

    try {
      const tenantModules = await fetchTenantModules(jar)
      planId = tenantModules.planId
      modules = tenantModules.modules
      await recordCheck({
        key: "tenant-modules",
        label: "Tenant modules",
        status: "passed",
        detail: `${modules.length} modules loaded${planId ? ` (${planId})` : ""}`,
        path: "/api/tenant-modules",
      })
    } catch (error) {
      await recordCheck({
        key: "tenant-modules",
        label: "Tenant modules",
        status: "failed",
        detail: String((error as Error)?.message || error),
        severity: "critical",
        path: "/api/tenant-modules",
      })
    }

    if (input.target.expectedPlanId) {
      const planMatched = normalizeText(planId).toLowerCase() === input.target.expectedPlanId
      await recordCheck({
        key: "plan-match",
        label: "Tenant plan expectation",
        status: planMatched ? "passed" : "failed",
        detail: planMatched
          ? `Plan matches expected '${input.target.expectedPlanId}'`
          : `Expected '${input.target.expectedPlanId}', got '${planId || "unknown"}'`,
        severity: planMatched ? undefined : "high",
      })
    }

    try {
      await fetchTenantSettings(jar)
      await recordCheck({
        key: "tenant-settings",
        label: "Tenant settings API",
        status: "passed",
        detail: "Tenant settings loaded",
        path: "/api/tenant-settings",
      })
    } catch (error) {
      await recordCheck({
        key: "tenant-settings",
        label: "Tenant settings API",
        status: "failed",
        detail: String((error as Error)?.message || error),
        severity: "critical",
        path: "/api/tenant-settings",
      })
    }

    try {
      await fetchTenantUsers(jar)
      await recordCheck({
        key: "tenant-users-list",
        label: "Tenant users API",
        status: "passed",
        detail: "Tenant users loaded",
        path: "/api/admin/users",
      })
    } catch (error) {
      await recordCheck({
        key: "tenant-users-list",
        label: "Tenant users API",
        status: "failed",
        detail: String((error as Error)?.message || error),
        severity: "critical",
        path: "/api/admin/users",
      })
    }

    const coverage = buildTenantSmokeCoverage(modules)
    for (const pageCheck of coverage.pages) {
      const result = await checkHtmlPage({ jar, check: pageCheck })
      await recordCheck({
        key: pageCheck.key,
        label: pageCheck.label,
        status: result.ok ? "passed" : "failed",
        detail: result.detail,
        severity: result.ok
          ? undefined
          : classifyFailureSeverity({
              key: pageCheck.key,
              httpStatus: result.httpStatus,
              detail: result.detail,
              sessionSensitive: pageCheck.key === "dashboard-launcher" || pageCheck.key === "settings-page",
            }),
        path: pageCheck.path,
        httpStatus: result.httpStatus,
      })
    }

    for (const apiCheck of coverage.apis) {
      const result = await checkJsonApi({ jar, check: apiCheck })
      await recordCheck({
        key: apiCheck.key,
        label: apiCheck.label,
        status: result.ok ? "passed" : "failed",
        detail: result.detail,
        severity: result.ok
          ? undefined
          : classifyFailureSeverity({
              key: apiCheck.key,
              httpStatus: result.httpStatus,
              detail: result.detail,
            }),
        path: apiCheck.path,
        httpStatus: result.httpStatus,
      })
    }

    if (parseBoolean(process.env.TENANT_SMOKE_ENABLE_USER_MUTATION_CHECKS, true)) {
      try {
        await exerciseTenantUserMutation({ jar, target: input.target })
        await recordCheck({
          key: "tenant-user-mutation",
          label: "Tenant user create/delete",
          status: "passed",
          detail: "Temporary tenant admin was created and removed successfully",
          path: "/api/admin/users",
        })
      } catch (error) {
        await recordCheck({
          key: "tenant-user-mutation",
          label: "Tenant user create/delete",
          status: "failed",
          detail: String((error as Error)?.message || error),
          severity: "critical",
          path: "/api/admin/users",
        })
      }
    }
  } catch (error) {
    await recordCheck({
      key: "sign-in",
      label: "Sign in",
      status: "failed",
      detail: String((error as Error)?.message || error),
      severity: "critical",
      path: "/login",
    })
  }

  return {
    slug: input.target.slug,
    tenantName: input.target.tenantName,
    tenantId,
    username: input.target.username,
    role,
    planId,
    modules,
    status: checks.some((check) => check.status === "failed") ? "failed" : "healthy",
    checks,
  } as SmokeTenantResult
}

export async function runTenantSmokeAgent(input?: {
  triggerSource?: string
  dryRun?: boolean
  tenantSlug?: string | null
}) {
  const dryRun = Boolean(input?.dryRun)
  const triggerSource = normalizeText(input?.triggerSource) || "manual"
  const baseUrl = resolveTenantSmokeBaseUrl()
  const timeoutMs = resolveTimeoutMs()

  let targets = parseTenantSmokeTargetsEnv()
  const requestedSlug = normalizeText(input?.tenantSlug).toLowerCase()
  if (requestedSlug) {
    targets = targets.filter((target) => target.slug === requestedSlug || target.tenantName.toLowerCase() === requestedSlug)
    if (!targets.length) {
      throw new Error(`No tenant smoke target found for '${requestedSlug}'`)
    }
  }

  const runId = dryRun
    ? "dry-run"
    : await startAgentRun({
        agentName: AGENT_NAME,
        triggerSource,
        tenantScope: requestedSlug || "all",
        metadata: {
          baseUrl,
          tenantCount: targets.length,
          requestedSlug: requestedSlug || null,
        },
      })

  try {
    const results: SmokeTenantResult[] = []
    for (const target of targets) {
      results.push(
        await runTenantSmokeChecks({
          baseUrl,
          timeoutMs,
          target,
          runId,
          dryRun,
        }),
      )
    }

    const failedResults = results.filter((result) => result.status === "failed")
    const failedChecks = failedResults.flatMap((result) => result.checks.filter((check) => check.status === "failed"))
    const summary: Record<string, any> = {
      dryRun,
      baseUrl,
      tenantCount: results.length,
      healthyTenantCount: results.length - failedResults.length,
      failedTenantCount: failedResults.length,
      totalCheckCount: results.reduce((sum, result) => sum + result.checks.length, 0),
      failedCheckCount: failedChecks.length,
      tenants: results.map((result) => ({
        slug: result.slug,
        tenantName: result.tenantName,
        tenantId: result.tenantId,
        username: result.username,
        role: result.role,
        planId: result.planId,
        status: result.status,
        modules: result.modules,
        failedChecks: result.checks.filter((check) => check.status === "failed").map((check) => ({
          key: check.key,
          label: check.label,
          detail: check.detail,
          path: check.path || null,
          httpStatus: check.httpStatus || null,
        })),
      })),
    }

    if (!dryRun && failedChecks.length > 0) {
      const lines = failedResults.flatMap((tenantResult) =>
        tenantResult.checks
          .filter((check) => check.status === "failed")
          .map((check) => {
            const severity = String(check.severity || "high").toUpperCase()
            const scope = `${tenantResult.tenantName} :: ${check.label}`
            return `[${severity}] ${scope} :: ${truncate(check.detail)}`
          }),
      )

      const text = [
        `FarmFlow tenant smoke agent detected ${failedChecks.length} failing check(s) across ${failedResults.length} tenant(s).`,
        `Run ID: ${runId}`,
        `Base URL: ${baseUrl}`,
        "",
        ...lines,
      ].join("\n")

      summary.emailNotification = await sendAgentAlertEmail({
        subject: `[FarmFlow] Tenant Smoke Alerts (${failedResults.length})`,
        text,
      })
    } else {
      summary.emailNotification = {
        sent: false,
        provider: "none",
        reason: dryRun ? "dry-run" : "no failing checks",
      }
    }

    if (!dryRun) {
      await finishAgentRun({
        runId,
        status: "success",
        summary,
      })
    }

    return { runId, summary, results }
  } catch (error) {
    if (!dryRun) {
      await finishAgentRun({
        runId,
        status: "failed",
        summary: { error: String((error as Error)?.message || error) },
      })
    }
    throw error
  }
}
