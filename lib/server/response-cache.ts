import "server-only"

import { sql } from "@/lib/server/db"

const toRows = (r: unknown): any[] => (Array.isArray(r) ? r : (r as any)?.rows ?? [])

/**
 * Read a cached response. Returns null if the entry is missing or older than ttlSeconds.
 */
export async function readResponseCache<T = unknown>(
  cacheKey: string,
  ttlSeconds: number,
): Promise<T | null> {
  if (!sql) return null
  try {
    const rows = toRows(
      await sql`
        SELECT response_json, cached_at
        FROM api_response_cache
        WHERE cache_key = ${cacheKey}
          AND cached_at > NOW() - (${ttlSeconds} || ' seconds')::interval
        LIMIT 1
      `,
    )
    if (!rows.length) return null
    return rows[0].response_json as T
  } catch {
    return null
  }
}

/**
 * Write a response into the cache, replacing any existing entry for this key.
 */
export async function writeResponseCache(cacheKey: string, data: unknown): Promise<void> {
  if (!sql) return
  try {
    await sql`
      INSERT INTO api_response_cache (cache_key, response_json, cached_at)
      VALUES (${cacheKey}, ${JSON.stringify(data)}, NOW())
      ON CONFLICT (cache_key)
      DO UPDATE SET response_json = EXCLUDED.response_json, cached_at = NOW()
    `
  } catch {
    // Non-critical — cache write failure must never break the response
  }
}

/**
 * Read, then on miss call fetcher(), write result, return.
 * TTL is in seconds.
 */
export async function withResponseCache<T>(
  cacheKey: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<{ data: T; fromCache: boolean }> {
  const cached = await readResponseCache<T>(cacheKey, ttlSeconds)
  if (cached !== null) return { data: cached, fromCache: true }

  const fresh = await fetcher()
  await writeResponseCache(cacheKey, fresh)
  return { data: fresh, fromCache: false }
}
