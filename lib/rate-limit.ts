import { sql as dbSql } from "@/lib/server/db"

const toRows = (r: unknown): any[] => (Array.isArray(r) ? r : (r as any)?.rows ?? [])

type RateLimitKey =
  | "aiAnalysis"
  | "aiAssistant"
  | "aiProactiveInsights"
  | "aiSeasonCompare"
  | "news"
  | "weather"
  | "authLogin"
  | "accountPasswordChange"
  | "registerInterest"
  | "authSignup"
  | "authSignupResend"
  | "authSignupVerify"
  | "authSignupIp"
  | "authForgotPassword"
  | "authForgotPasswordIp"
  | "authResetPassword"
  | "opsErrorIngest"
  | "biometricPunch"
  | "biometricHeartbeat"
  | "biometricIp"
  | "biometricUnknownSerial"

type RateLimitResult = {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

const SENSITIVE_RATE_LIMIT_KEYS = new Set<RateLimitKey>([
  "authLogin",
  "accountPasswordChange",
  "authSignup",
  "authSignupResend",
  "authSignupVerify",
  "authForgotPassword",
  "authForgotPasswordIp",
  // Was the one IP-keyed auth control missing here, so it failed *open* while its twin
  // authForgotPasswordIp -- same 15/hour limit, same shape of abuse -- failed closed. A counter
  // query failure silently removed the per-IP cap on a public signup endpoint. Failing closed
  // costs nothing real: the store is the app's own database, and provisioning a tenant needs it
  // anyway, so a signup could not have succeeded during that window regardless.
  "authSignupIp",
  "authResetPassword",
  "opsErrorIngest",
])

export const isSensitiveRateLimitKey = (key: RateLimitKey) => SENSITIVE_RATE_LIMIT_KEYS.has(key)

export const requiresDistributedRateLimit = (key: RateLimitKey, env: NodeJS.ProcessEnv = process.env) =>
  env.NODE_ENV === "production" && isSensitiveRateLimitKey(key)

export class RateLimitUnavailableError extends Error {
  key: RateLimitKey

  constructor(key: RateLimitKey, cause?: unknown) {
    super("Rate limiting is temporarily unavailable. Please try again shortly.", {
      cause: cause instanceof Error ? cause : undefined,
    })
    this.name = "RateLimitUnavailableError"
    this.key = key
  }
}

export const isRateLimitUnavailableError = (error: unknown): error is RateLimitUnavailableError =>
  Boolean(error && (error as Error).name === "RateLimitUnavailableError")

const LIMITS: Record<RateLimitKey, { limit: number; windowMs: number }> = {
  aiAnalysis:            { limit: 5,  windowMs: 60_000 },
  aiAssistant:           { limit: 12, windowMs: 5 * 60_000 },
  aiProactiveInsights:   { limit: 4,  windowMs: 30 * 60_000 },
  aiSeasonCompare:       { limit: 3,  windowMs: 60 * 60_000 },
  news:                  { limit: 30, windowMs: 60_000 },
  weather:               { limit: 30, windowMs: 60_000 },
  authLogin:             { limit: 10, windowMs: 10 * 60_000 },
  accountPasswordChange: { limit: 6,  windowMs: 15 * 60_000 },
  registerInterest:      { limit: 6,  windowMs: 10 * 60_000 },
  authSignup:            { limit: 6,  windowMs: 10 * 60_000 },
  authSignupResend:      { limit: 6,  windowMs: 10 * 60_000 },
  authSignupVerify:      { limit: 20, windowMs: 10 * 60_000 },
  authSignupIp:          { limit: 15, windowMs: 60 * 60_000 },
  authForgotPassword:    { limit: 6,  windowMs: 15 * 60_000 },
  authForgotPasswordIp:  { limit: 15, windowMs: 60 * 60_000 },
  authResetPassword:     { limit: 20, windowMs: 10 * 60_000 },
  opsErrorIngest:        { limit: 20, windowMs: 60_000 },
  biometricPunch:        { limit: 120, windowMs: 5 * 60_000 },
  biometricHeartbeat:    { limit: 20, windowMs: 60_000 },
  // Per-IP ceiling for the whole /iclock surface. The two limits above are keyed by serial
  // number, which an attacker supplies — rotating it mints a fresh bucket every request, so
  // per-serial limiting alone bounds nothing. Generous, because a single estate can legitimately
  // run several terminals behind one NAT address: heartbeats are ~2/min per device, so this
  // leaves room for roughly 20 devices before a real farm would notice.
  biometricIp:           { limit: 300, windowMs: 5 * 60_000 },
  // The actual anti-enumeration control, keyed by IP and charged ONLY when a serial fails to
  // resolve. Serials are guessable — AMDB25062800863 is a vendor prefix, a 2025-06-28
  // manufacture date and a batch sequence — so an attacker can walk AMDB2506280XXXX. A
  // registered device never charges this bucket, so tightening it cannot lock out a real
  // terminal. It also bounds the security_events row written per rejection, which was
  // otherwise unbounded, attacker-controlled table growth.
  biometricUnknownSerial: { limit: 20, windowMs: 60 * 60_000 },
}

/**
 * Several limits in ONE round trip.
 *
 * ⚠ WHY THIS EXISTS. Every biometric heartbeat checked two buckets — per-IP and per-serial — as
 * two sequential statements, and the device polls roughly every three minutes from two terminals.
 * Measured in Sentry over the week to 2026-09-12: POST /hdata.aspx ran 5.4 HOURS of total span
 * time at a p95 of 2,678 ms, against just 303 real punches. About 96% of those requests were empty
 * heartbeats, and each paid four sequential trips to Neon in ap-southeast-1 before doing any work.
 * Sentry raised it as "Consecutive HTTP POST".
 *
 * One INSERT with several VALUES rows settles every bucket at once. The counting, the window
 * arithmetic and the fail-open/fail-closed behaviour are identical to checkRateLimit — this is the
 * same statement with more rows, not a second implementation of rate limiting.
 *
 * Buckets may have different windows; each row carries its own window_start and window_ms, so
 * mixing a 60-second limit with a five-minute one is fine.
 */
export async function checkRateLimits(
  checks: readonly { key: RateLimitKey; identifier: string }[],
): Promise<Map<RateLimitKey, RateLimitResult>> {
  const out = new Map<RateLimitKey, RateLimitResult>()
  if (!checks.length) return out

  const now = Date.now()
  const rowsToWrite = checks.map(({ key, identifier }) => {
    const { windowMs } = LIMITS[key]
    return { key, dbKey: `${key}:${identifier}`, windowStart: Math.floor(now / windowMs) * windowMs, windowMs }
  })

  const allow = (key: RateLimitKey, count: number, windowStart: number, windowMs: number): RateLimitResult => ({
    success: count <= LIMITS[key].limit,
    limit: LIMITS[key].limit,
    remaining: Math.max(0, LIMITS[key].limit - count),
    reset: windowStart + windowMs,
  })

  try {
    /**
     * PLACEHOLDERS, NEVER INTERPOLATION. `identifier` is attacker-supplied — a device serial
     * number or a client IP — and on the biometric path the serial has not even been validated
     * yet, because rate limiting deliberately runs BEFORE validation. Building this VALUES list by
     * hand-escaping quotes into the string would put unvalidated input into SQL text; the escaping
     * might well be right, and it is not a thing to be right about by hand.
     */
    const params: (string | number)[] = []
    const values = rowsToWrite
      .map((r) => {
        params.push(r.dbKey, r.windowStart, r.windowMs)
        return `($${params.length - 2}, $${params.length - 1}, $${params.length}, 1)`
      })
      .join(", ")
    const rows = toRows(
      await dbSql.query(
        `INSERT INTO rate_limit_counters (key, window_start, window_ms, count)
         VALUES ${values}
         ON CONFLICT (key, window_start) DO UPDATE
           SET count = rate_limit_counters.count + 1
         RETURNING key, count`,
        params,
      ),
    )

    const countByKey = new Map(rows.map((r: any) => [String(r.key), Number(r.count ?? 1)]))
    for (const r of rowsToWrite) {
      out.set(r.key, allow(r.key, countByKey.get(r.dbKey) ?? 1, r.windowStart, r.windowMs))
    }

    // Same 1% purge as the single-key path, so the table stays bounded whichever one is used.
    if (Math.random() < 0.01) {
      const cutoff = now - 24 * 60 * 60 * 1000
      dbSql`DELETE FROM rate_limit_counters WHERE window_start < ${cutoff}`.catch(() => {})
    }
    return out
  } catch (error) {
    // A sensitive bucket in the batch makes the whole batch fail closed, matching checkRateLimit:
    // the caller cannot tell which bucket failed, so the strictest rule has to win.
    const sensitive = checks.find(({ key }) => isSensitiveRateLimitKey(key))
    if (sensitive) throw new RateLimitUnavailableError(sensitive.key, error)
    for (const r of rowsToWrite) out.set(r.key, allow(r.key, 1, r.windowStart, r.windowMs))
    return out
  }
}

export async function checkRateLimit(key: RateLimitKey, identifier: string): Promise<RateLimitResult> {
  const config = LIMITS[key]
  const now = Date.now()
  const { windowMs } = config
  const windowStart = Math.floor(now / windowMs) * windowMs
  const dbKey = `${key}:${identifier}`

  try {
    const rows = toRows(
      await dbSql`
        INSERT INTO rate_limit_counters (key, window_start, window_ms, count)
        VALUES (${dbKey}, ${windowStart}, ${windowMs}, 1)
        ON CONFLICT (key, window_start) DO UPDATE
          SET count = rate_limit_counters.count + 1
        RETURNING count
      `,
    )

    const count = Number(rows[0]?.count ?? 1)

    // 1% chance: purge windows older than 24 h to keep the table bounded
    if (Math.random() < 0.01) {
      const cutoff = now - 24 * 60 * 60 * 1000
      dbSql`DELETE FROM rate_limit_counters WHERE window_start < ${cutoff}`.catch(() => {})
    }

    return {
      success: count <= config.limit,
      limit: config.limit,
      remaining: Math.max(0, config.limit - count),
      reset: windowStart + windowMs,
    }
  } catch (error) {
    if (isSensitiveRateLimitKey(key)) {
      // Auth endpoints must not silently fail open — callers catch this and surface an error.
      throw new RateLimitUnavailableError(key, error)
    }
    // Non-sensitive (AI, news, weather) — fail open rather than blocking legitimate users.
    return { success: true, limit: config.limit, remaining: config.limit, reset: now + windowMs }
  }
}

export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  if (!result.limit) return {}
  return {
    "x-ratelimit-limit": String(result.limit),
    "x-ratelimit-remaining": String(result.remaining),
    "x-ratelimit-reset": String(result.reset),
  }
}
