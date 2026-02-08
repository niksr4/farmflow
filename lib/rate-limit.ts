import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

const hasRedisConfig = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
)

const redis = hasRedisConfig ? Redis.fromEnv() : null

type RateLimitKey = "aiAnalysis" | "news" | "weather"

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
}

export async function checkRateLimit(key: RateLimitKey, identifier: string): Promise<RateLimitResult> {
  const limiter = limiters[key]
  if (!limiter) {
    return { success: true, limit: 0, remaining: 0, reset: 0 }
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
