import { afterEach, describe, expect, it, vi } from "vitest"
import { createAbortGroup, fetchJson, isAbortError } from "../lib/abortable"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("isAbortError", () => {
  it("recognises a real fetch abort", async () => {
    const controller = new AbortController()
    controller.abort()
    // Exercise the genuine rejection shape the runtime produces rather than a hand-built one.
    const error = await fetch("https://example.invalid", { signal: controller.signal }).catch(
      (e) => e,
    )
    expect(isAbortError(error)).toBe(true)
  })

  it("recognises a DOMException-shaped abort", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true)
  })

  it("recognises a plain error named AbortError", () => {
    const error = new Error("aborted")
    error.name = "AbortError"
    expect(isAbortError(error)).toBe(true)
  })

  it("recognises an abort wrapped as a cause", () => {
    const inner = new Error("aborted")
    inner.name = "AbortError"
    expect(isAbortError(new Error("fetch failed", { cause: inner }))).toBe(true)
  })

  it("does not swallow genuine failures", () => {
    // Critical: a real network error misclassified as an abort would silently hide an outage.
    expect(isAbortError(new TypeError("Failed to fetch"))).toBe(false)
    expect(isAbortError(new Error("500 Internal Server Error"))).toBe(false)
    expect(isAbortError(null)).toBe(false)
    expect(isAbortError(undefined)).toBe(false)
    expect(isAbortError("AbortError")).toBe(false)
  })

  it("terminates on a self-referential cause", () => {
    const error: any = new Error("looping")
    error.cause = error
    expect(isAbortError(error)).toBe(false)
  })
})

describe("createAbortGroup", () => {
  it("cancels the previous request when a new one supersedes it", () => {
    const group = createAbortGroup()
    const first = group.next()
    expect(first.aborted).toBe(false)

    const second = group.next()
    expect(first.aborted).toBe(true)
    expect(second.aborted).toBe(false)
  })

  it("cancels everything outstanding on abortAll", () => {
    const group = createAbortGroup()
    const signal = group.next()
    group.abortAll()
    expect(signal.aborted).toBe(true)
  })

  it("reports whether the current request is aborted", () => {
    const group = createAbortGroup()
    expect(group.isAborted()).toBe(false)
    group.next()
    expect(group.isAborted()).toBe(false)
    group.abortAll()
    // abortAll clears the slot; nothing is in flight to be aborted.
    expect(group.isAborted()).toBe(false)
  })

  it("survives abortAll with nothing in flight", () => {
    const group = createAbortGroup()
    expect(() => group.abortAll()).not.toThrow()
  })

  it("issues a usable signal after abortAll", () => {
    const group = createAbortGroup()
    group.next()
    group.abortAll()
    const revived = group.next()
    expect(revived.aborted).toBe(false)
  })
})

describe("fetchJson", () => {
  const mockFetch = (body: unknown, init: { ok?: boolean; status?: number } = {}) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: init.ok ?? true,
        status: init.status ?? 200,
        json: async () => body,
      }),
    )
  }

  it("returns data for a successful envelope", async () => {
    mockFetch({ success: true, records: [1, 2] })
    const result = await fetchJson<{ records: number[] }>("/api/x")
    expect(result).toEqual({ ok: true, data: { success: true, records: [1, 2] } })
  })

  it("surfaces the API error message on a non-2xx", async () => {
    mockFetch({ error: "Module access disabled" }, { ok: false, status: 403 })
    const result = await fetchJson("/api/x")
    expect(result).toEqual({ ok: false, error: "Module access disabled" })
  })

  it("falls back to the status code when there is no error message", async () => {
    mockFetch(null, { ok: false, status: 500 })
    const result = await fetchJson("/api/x")
    expect(result).toEqual({ ok: false, error: "Request failed (500)" })
  })

  it("treats an explicit success:false as a failure even on a 200", async () => {
    // This API returns 200 with { success: false } in places; that must not read as data.
    mockFetch({ success: false, error: "Not allowed" })
    const result = await fetchJson("/api/x")
    expect(result).toEqual({ ok: false, error: "Not allowed" })
  })

  it("tolerates a body that is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON")
        },
      }),
    )
    const result = await fetchJson("/api/x")
    expect(result).toEqual({ ok: true, data: null })
  })

  it("propagates an abort as a throw, never as an error result", async () => {
    // An abort rendered as { ok: false } would surface a red error state for a cancellation
    // the app asked for. It must be distinguishable by the caller.
    const abort = new DOMException("aborted", "AbortError")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort))
    await expect(fetchJson("/api/x")).rejects.toBe(abort)
  })
})
