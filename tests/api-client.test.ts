import { afterEach, describe, expect, it, vi } from "vitest"
import { apiRequest } from "../lib/api-client"

afterEach(() => {
  vi.restoreAllMocks()
})

const mockFetch = (
  text: string,
  init: { ok?: boolean; status?: number; statusText?: string } = {},
) => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "",
    text: async () => text,
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("apiRequest", () => {
  it("returns parsed JSON on a successful response", async () => {
    mockFetch(JSON.stringify({ success: true, value: 42 }))
    const result = await apiRequest<{ success: boolean; value: number }>("/api/x")
    expect(result).toEqual({ success: true, value: 42 })
  })

  it("returns null for an empty body rather than throwing", async () => {
    mockFetch("")
    const result = await apiRequest("/api/x")
    expect(result).toBeNull()
  })

  it("throws using the API's error field on a non-2xx response", async () => {
    mockFetch(JSON.stringify({ error: "Module access disabled" }), { ok: false, status: 403 })
    await expect(apiRequest("/api/x")).rejects.toThrow("Module access disabled")
  })

  it("falls back to the message field when there is no error field", async () => {
    mockFetch(JSON.stringify({ message: "Not authorized" }), { ok: false, status: 401 })
    await expect(apiRequest("/api/x")).rejects.toThrow("Not authorized")
  })

  it("falls back to statusText, then a generic message, when the body has neither", async () => {
    mockFetch(JSON.stringify({}), { ok: false, status: 500, statusText: "Internal Server Error" })
    await expect(apiRequest("/api/x")).rejects.toThrow("Internal Server Error")

    mockFetch("null", { ok: false, status: 500, statusText: "" })
    await expect(apiRequest("/api/x")).rejects.toThrow("Request failed")
  })

  it("treats an explicit success:false as a failure even on a 200", async () => {
    // This API convention returns 200 with { success: false } in places; must not read as data.
    mockFetch(JSON.stringify({ success: false, error: "Not allowed" }))
    await expect(apiRequest("/api/x")).rejects.toThrow("Not allowed")
  })

  it("does not throw for a 200 body lacking a success field at all", async () => {
    mockFetch(JSON.stringify({ settings: { bagWeightKg: 50 } }))
    const result = await apiRequest<{ settings: { bagWeightKg: number } }>("/api/x")
    expect(result).toEqual({ settings: { bagWeightKg: 50 } })
  })

  it("sets Content-Type to application/json when a body is given and none was specified", async () => {
    const fetchMock = mockFetch(JSON.stringify({ success: true }))
    await apiRequest("/api/x", { method: "POST", body: JSON.stringify({ a: 1 }) })
    const [, options] = fetchMock.mock.calls[0]
    const headers = options.headers as Headers
    expect(headers.get("Content-Type")).toBe("application/json")
  })

  it("does not override a Content-Type the caller already set", async () => {
    const fetchMock = mockFetch(JSON.stringify({ success: true }))
    await apiRequest("/api/x", {
      method: "POST",
      body: "a=1",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    })
    const [, options] = fetchMock.mock.calls[0]
    const headers = options.headers as Headers
    expect(headers.get("Content-Type")).toBe("application/x-www-form-urlencoded")
  })

  it("defaults the Accept header to application/json", async () => {
    const fetchMock = mockFetch(JSON.stringify({ success: true }))
    await apiRequest("/api/x")
    const [, options] = fetchMock.mock.calls[0]
    const headers = options.headers as Headers
    expect(headers.get("Accept")).toBe("application/json")
  })

  it("defaults credentials to same-origin but lets a caller override it", async () => {
    const fetchMock = mockFetch(JSON.stringify({ success: true }))
    await apiRequest("/api/x")
    expect(fetchMock.mock.calls[0][1].credentials).toBe("same-origin")

    await apiRequest("/api/x", { credentials: "include" })
    expect(fetchMock.mock.calls[1][1].credentials).toBe("include")
  })

  // Known gap, filed as NIK-17: unlike lib/abortable.ts's fetchJson (which guards this exact
  // case with response.json().catch(() => null)), apiRequest's JSON.parse is unguarded, so a
  // non-JSON body (e.g. an HTML gateway-error page) throws a raw SyntaxError instead of a clean
  // "Request failed" message. This test pins the current (buggy) behavior so a fix is visible as
  // an intentional test change, not a silent regression.
  it("currently throws a raw parse error for a non-JSON body (see NIK-17)", async () => {
    mockFetch("<html>502 Bad Gateway</html>", { ok: false, status: 502 })
    await expect(apiRequest("/api/x")).rejects.toThrow(SyntaxError)
  })
})
