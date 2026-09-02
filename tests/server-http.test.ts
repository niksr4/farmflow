import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// lib/server/http.ts imports "server-only", which throws outside a Next.js server context.
// Match the established pattern in this repo's other lib/server/**.test.ts files (there is
// none for this module yet) by mocking it out before importing the module under test.
vi.mock("server-only", () => ({}))

import { fetchWithTimeout } from "../lib/server/http"

describe("fetchWithTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("resolves normally when the request finishes before the timeout", async () => {
    const response = new Response("ok")
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal("fetch", fetchMock)

    const result = await fetchWithTimeout("https://example.com", { timeoutMs: 5_000 })

    expect(result).toBe(response)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("aborts with 'Request timed out' once the timeout elapses", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject((init.signal as AbortSignal).reason)
        })
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const pending = fetchWithTimeout("https://example.com", { timeoutMs: 1_000 })
    // Attach the rejection handler before advancing timers so vitest doesn't see an
    // unhandled rejection in the window between abort and the await below.
    const assertion = expect(pending).rejects.toThrow("Request timed out")

    await vi.advanceTimersByTimeAsync(1_000)
    await assertion
  })

  it("defaults to a 10s timeout when timeoutMs is omitted", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject((init.signal as AbortSignal).reason)
        })
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const pending = fetchWithTimeout("https://example.com")
    const assertion = expect(pending).rejects.toThrow("Request timed out")

    await vi.advanceTimersByTimeAsync(9_999)
    // Not yet aborted just under the 10s default.
    await vi.advanceTimersByTimeAsync(1)
    await assertion
  })

  it("propagates abort from a caller-supplied signal", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject((init.signal as AbortSignal).reason)
        })
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const controller = new AbortController()
    const pending = fetchWithTimeout("https://example.com", { timeoutMs: 60_000, signal: controller.signal })
    const assertion = expect(pending).rejects.toBeDefined()

    controller.abort(new Error("caller aborted"))
    await assertion
  })

  it("is already aborted if the caller's signal is aborted before the call", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        return Promise.reject(new Error("aborted before start"))
      }
      return new Promise(() => {})
    })
    vi.stubGlobal("fetch", fetchMock)

    const controller = new AbortController()
    controller.abort()

    await expect(
      fetchWithTimeout("https://example.com", { timeoutMs: 60_000, signal: controller.signal }),
    ).rejects.toThrow("aborted before start")
  })

  it("clears the internal timer once the request settles, leaking nothing", async () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout")
    const response = new Response("ok")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response))

    await fetchWithTimeout("https://example.com", { timeoutMs: 5_000 })

    expect(clearTimeoutSpy).toHaveBeenCalled()
  })
})
