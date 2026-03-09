import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const hasRedisConfig = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
)

const redis = hasRedisConfig ? Redis.fromEnv() : null

type RateLimitKey = "aiAnalysis" | "news" | "weather" | "authLogin" | "registerInterest"

type RateLimitResult = {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

const limiters: Record<RateLimitKey, Ratelimit | null> = {
  aiAnalysis: redis ? new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(5, "1 m") }) : null,
  news: redis ? new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(30, "1 m") }) : null,
  weather: redis ? new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(30, "1 m") }) : null,
  authLogin: redis ? new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(10, "10 m") }) : null,
  registerInterest: redis ? new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(6, "10 m") }) : null,
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
  news: { limit: 30, windowMs: 60_000 },
  weather: { limit: 30, windowMs: 60_000 },
  authLogin: { limit: 10, windowMs: 10 * 60_000 },
  registerInterest: { limit: 6, windowMs: 10 * 60_000 },
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
    return runLocalRateLimit(key, identifier)
  }

  return limiter.limit(identifier)
}

export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  if (!result.limit) return {}
  return {
    "x-ratelimit-limit": String(result.limit),
    "x-ratelimit-remaining": String(result.remaining),
    "x-ratelimit-reset": String(result.reset),
  }
}
