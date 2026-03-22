import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const hasRedisConfig = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
)

const redis = hasRedisConfig ? Redis.fromEnv() : null

type RateLimitKey =
  | "aiAnalysis"
  | "aiAssistant"
  | "news"
  | "weather"
  | "authLogin"
  | "accountPasswordChange"
  | "registerInterest"
  | "authSignup"
  | "authSignupResend"
  | "authSignupVerify"
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

const limiters: Record<RateLimitKey, Ratelimit | null> = {
  aiAnalysis: redis ? new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(5, "1 m") }) : null,
  aiAssistant: redis ? new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(12, "5 m") }) : null,
  news: redis ? new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(30, "1 m") }) : null,
  weather: redis ? new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(30, "1 m") }) : null,
  authLogin: redis ? new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(10, "10 m") }) : null,
  accountPasswordChange: redis ? new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(6, "15 m") }) : null,
  registerInterest: redis ? new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(6, "10 m") }) : null,
  authSignup: redis ? new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(6, "10 m") }) : null,
  authSignupResend: redis ? new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(6, "10 m") }) : null,
  authSignupVerify: redis ? new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(20, "10 m") }) : null,
  opsErrorIngest: redis ? new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(20, "1 m") }) : null,
}

type LocalLimiterConfig = {
  limit: number
  windowMs: number
}

type LocalLimiterEntry = {
  count: number
  reset: number
}

const localLimiterConfig: Record<RateLimitKey, LocalLimiterConfig> = {
  aiAnalysis: { limit: 5, windowMs: 60_000 },
  aiAssistant: { limit: 12, windowMs: 5 * 60_000 },
  news: { limit: 30, windowMs: 60_000 },
  weather: { limit: 30, windowMs: 60_000 },
  authLogin: { limit: 10, windowMs: 10 * 60_000 },
  accountPasswordChange: { limit: 6, windowMs: 15 * 60_000 },
  registerInterest: { limit: 6, windowMs: 10 * 60_000 },
  authSignup: { limit: 6, windowMs: 10 * 60_000 },
  authSignupResend: { limit: 6, windowMs: 10 * 60_000 },
  authSignupVerify: { limit: 20, windowMs: 10 * 60_000 },
  opsErrorIngest: { limit: 20, windowMs: 60_000 },
}

const localLimiterStore = new Map<string, LocalLimiterEntry>()

const runLocalRateLimit = (key: RateLimitKey, identifier: string): RateLimitResult => {
  const config = localLimiterConfig[key]
  const now = Date.now()
  const scopedIdentifier = `${key}:${identifier}`
  const current = localLimiterStore.get(scopedIdentifier)
  let nextEntry: LocalLimiterEntry

  if (!current || current.reset <= now) {
    nextEntry = { count: 1, reset: now + config.windowMs }
  } else {
    nextEntry = { count: current.count + 1, reset: current.reset }
  }

  localLimiterStore.set(scopedIdentifier, nextEntry)

  // Keep local fallback memory bounded when Redis is unavailable.
  if (localLimiterStore.size > 5000) {
    for (const [entryKey, entry] of localLimiterStore.entries()) {
      if (entry.reset <= now) {
        localLimiterStore.delete(entryKey)
      }
    }
  }

  return {
    success: nextEntry.count <= config.limit,
    limit: config.limit,
    remaining: Math.max(0, config.limit - nextEntry.count),
    reset: nextEntry.reset,
  }
}

export async function checkRateLimit(key: RateLimitKey, identifier: string): Promise<RateLimitResult> {
  const limiter = limiters[key]
  if (!limiter) {
    if (requiresDistributedRateLimit(key)) {
      throw new RateLimitUnavailableError(key)
    }
    return runLocalRateLimit(key, identifier)
  }

  try {
    return await limiter.limit(identifier)
  } catch (error) {
    if (requiresDistributedRateLimit(key)) {
      throw new RateLimitUnavailableError(key, error)
    }
    return runLocalRateLimit(key, identifier)
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
