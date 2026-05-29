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
  | "opsErrorIngest"

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
  opsErrorIngest:        { limit: 20, windowMs: 60_000 },
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
