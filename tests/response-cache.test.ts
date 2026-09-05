import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// vi.hoisted so the mocked `sql` tagged-template is available inside the vi.mock factory below
// (module-level consts referenced by a hoisted factory throw "Cannot access before initialization"
// otherwise -- same pattern as tests/location-access.test.ts).
// lib/server/response-cache.ts calls the bare `sql` tagged template directly (not runTenantQuery --
// api_response_cache has no tenant_id column, see scripts/80-api-response-cache.sql, so it's
// legitimately out of RLS scope). Mock it as a callable tag function whose invocation is recorded
// and whose resolved value is controlled per-test via sqlImpl. Both sqlImpl and sql must live
// inside vi.hoisted() -- the vi.mock factory below is hoisted above this file's top-level consts,
// so referencing a plain `const sql` from inside it throws "Cannot access before initialization".
const { sqlImpl, sql } = vi.hoisted(() => {
  const sqlImpl = vi.fn()
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => sqlImpl(strings, values)) as any
  return { sqlImpl, sql }
})

vi.mock("@/lib/server/db", () => ({ sql }))

import { readResponseCache, withResponseCache, writeResponseCache } from "@/lib/server/response-cache"

describe("response-cache", () => {
  beforeEach(() => {
    sqlImpl.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("readResponseCache", () => {
    it("returns the cached value on a hit", async () => {
      sqlImpl.mockResolvedValueOnce([{ response_json: { hello: "world" }, cached_at: new Date().toISOString() }])
      const result = await readResponseCache("weather:tenant-1", 300)
      expect(result).toEqual({ hello: "world" })
    })

    it("returns null on a miss (no matching row)", async () => {
      sqlImpl.mockResolvedValueOnce([])
      const result = await readResponseCache("weather:tenant-1", 300)
      expect(result).toBeNull()
    })

    it("handles the neon {rows:[...]} response shape as well as a bare array", async () => {
      sqlImpl.mockResolvedValueOnce({ rows: [{ response_json: "cached-value", cached_at: new Date().toISOString() }] })
      const result = await readResponseCache("coffee-news", 60)
      expect(result).toBe("cached-value")
    })

    it("swallows a DB error and returns null rather than throwing", async () => {
      sqlImpl.mockRejectedValueOnce(new Error('relation "api_response_cache" does not exist'))
      const result = await readResponseCache("weather:tenant-1", 300)
      expect(result).toBeNull()
    })
  })

  describe("writeResponseCache", () => {
    it("issues an upsert with the cache key and JSON-serialized data", async () => {
      sqlImpl.mockResolvedValueOnce([])
      await writeResponseCache("weather:tenant-1", { temp: 24 })
      expect(sqlImpl).toHaveBeenCalledTimes(1)
      const [, values] = sqlImpl.mock.calls[0]
      expect(values).toEqual(["weather:tenant-1", JSON.stringify({ temp: 24 })])
    })

    it("swallows a write failure rather than throwing (cache writes must never break the response)", async () => {
      sqlImpl.mockRejectedValueOnce(new Error("connection reset"))
      await expect(writeResponseCache("weather:tenant-1", { temp: 24 })).resolves.toBeUndefined()
    })
  })

  describe("withResponseCache", () => {
    it("returns the cached value and skips the fetcher on a cache hit", async () => {
      sqlImpl.mockResolvedValueOnce([{ response_json: "cached", cached_at: new Date().toISOString() }])
      const fetcher = vi.fn().mockResolvedValue("fresh")
      const result = await withResponseCache("key", 60, fetcher)
      expect(result).toEqual({ data: "cached", fromCache: true })
      expect(fetcher).not.toHaveBeenCalled()
    })

    it("calls the fetcher and writes through on a cache miss", async () => {
      sqlImpl.mockResolvedValueOnce([]).mockResolvedValueOnce([])
      const fetcher = vi.fn().mockResolvedValue("fresh-value")
      const result = await withResponseCache("key", 60, fetcher)
      expect(result).toEqual({ data: "fresh-value", fromCache: false })
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(sqlImpl).toHaveBeenCalledTimes(2) // one read (miss), one write-through
    })

    it("still returns the fresh value even if the write-through itself fails", async () => {
      sqlImpl.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("write failed"))
      const fetcher = vi.fn().mockResolvedValue("fresh-value")
      const result = await withResponseCache("key", 60, fetcher)
      expect(result).toEqual({ data: "fresh-value", fromCache: false })
    })
  })
})
