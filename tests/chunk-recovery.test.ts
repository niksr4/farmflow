import { describe, expect, it } from "vitest"

import {
  CHUNK_RELOAD_COOLDOWN_MS,
  CHUNK_RELOAD_STORAGE_KEY,
  decideReload,
  isChunkLoadError,
} from "../lib/chunk-recovery"

/** A sessionStorage stand-in; `fail` models Safari private mode / quota exhaustion. */
const makeStorage = (initial: Record<string, string> = {}, fail = false) => {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: (k: string) => {
      if (fail) throw new Error("storage unavailable")
      return map.get(k) ?? null
    },
    setItem: (k: string, v: string) => {
      if (fail) throw new Error("storage unavailable")
      map.set(k, v)
    },
  }
}

describe("isChunkLoadError", () => {
  it("recognises the shapes browsers actually produce", () => {
    // The exact string from the 2026-08-26 HoneyFarm report.
    expect(isChunkLoadError(new Error("Failed to load chunk /_next/static/chunks/3xkoa0z287622.js from module 849511"))).toBe(true)
    expect(isChunkLoadError({ name: "ChunkLoadError", message: "boom" })).toBe(true)
    expect(isChunkLoadError(new Error("Loading chunk 42 failed."))).toBe(true)
    expect(isChunkLoadError(new Error("Loading CSS chunk 7 failed."))).toBe(true)
    // Vite/Safari/App-Router dynamic import phrasings.
    expect(isChunkLoadError(new Error("Failed to fetch dynamically imported module: /x.js"))).toBe(true)
    expect(isChunkLoadError(new Error("error loading dynamically imported module"))).toBe(true)
    expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true)
    expect(isChunkLoadError("ChunkLoadError: nope")).toBe(true)
  })

  it("leaves ordinary errors alone", () => {
    expect(isChunkLoadError(new Error("Rendered more hooks than during the previous render."))).toBe(false)
    expect(isChunkLoadError(new TypeError("x is not a function"))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
    expect(isChunkLoadError({})).toBe(false)
  })
})

describe("decideReload", () => {
  const chunkError = new Error("ChunkLoadError: Loading chunk 3 failed.")

  it("reloads on a first chunk failure and records when it did", () => {
    const storage = makeStorage()
    expect(decideReload({ error: chunkError, online: true, now: 1_000, storage })).toEqual({ reload: true })
    expect(storage.map.get(CHUNK_RELOAD_STORAGE_KEY)).toBe("1000")
  })

  it("does not reload for a non-chunk error", () => {
    const storage = makeStorage()
    expect(decideReload({ error: new Error("boom"), online: true, now: 1_000, storage }))
      .toEqual({ reload: false, reason: "not-a-chunk-error" })
    // and must not have burned the cooldown slot on an unrelated error
    expect(storage.map.get(CHUNK_RELOAD_STORAGE_KEY)).toBeUndefined()
  })

  it("does not reload while offline — the chunk is unreachable, not replaced", () => {
    expect(decideReload({ error: chunkError, online: false, now: 1_000, storage: makeStorage() }))
      .toEqual({ reload: false, reason: "offline" })
  })

  /**
   * The loop guard. A reload that does not fix the problem must not reload again, or a stale tab
   * becomes an infinite refresh — strictly worse than the blank screen this replaces.
   */
  it("reloads at most once per cooldown window", () => {
    const storage = makeStorage()
    expect(decideReload({ error: chunkError, online: true, now: 0, storage }).reload).toBe(true)

    expect(decideReload({ error: chunkError, online: true, now: 1, storage }))
      .toEqual({ reload: false, reason: "recently-reloaded" })
    expect(decideReload({ error: chunkError, online: true, now: CHUNK_RELOAD_COOLDOWN_MS - 1, storage }))
      .toEqual({ reload: false, reason: "recently-reloaded" })

    // Once the window has fully passed, a fresh failure is allowed to try again.
    expect(decideReload({ error: chunkError, online: true, now: CHUNK_RELOAD_COOLDOWN_MS, storage }).reload).toBe(true)
  })

  it("refuses to reload when storage cannot be read or written", () => {
    // No storage at all, and storage that throws, both mean "cannot promise once" — so: never.
    expect(decideReload({ error: chunkError, online: true, now: 1_000, storage: null }))
      .toEqual({ reload: false, reason: "no-storage" })
    expect(decideReload({ error: chunkError, online: true, now: 1_000, storage: makeStorage({}, true) }))
      .toEqual({ reload: false, reason: "no-storage" })
  })

  it("treats a corrupt stored timestamp as no previous reload rather than blocking forever", () => {
    const storage = makeStorage({ [CHUNK_RELOAD_STORAGE_KEY]: "not-a-number" })
    expect(decideReload({ error: chunkError, online: true, now: 5_000, storage }).reload).toBe(true)
  })
})
