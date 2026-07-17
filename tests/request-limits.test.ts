import { describe, it, expect } from "vitest"
import { formatBodyLimit, parseContentLengthHeader, resolveApiBodyLimit } from "@/lib/request-limits"

const KB = 1024
const MB = 1024 * KB

describe("formatBodyLimit", () => {
  it("formats bytes, KB and MB", () => {
    expect(formatBodyLimit(512)).toBe("512 bytes")
    expect(formatBodyLimit(16 * KB)).toBe("16 KB")
    expect(formatBodyLimit(2 * MB)).toBe("2 MB")
    expect(formatBodyLimit(Math.round(11.5 * MB))).toBe("11.5 MB")
  })
})

describe("parseContentLengthHeader", () => {
  it("parses a valid length", () => {
    expect(parseContentLengthHeader("2048")).toBe(2048)
  })
  it("returns null for missing/blank/invalid/negative", () => {
    expect(parseContentLengthHeader(null)).toBeNull()
    expect(parseContentLengthHeader("")).toBeNull()
    expect(parseContentLengthHeader("abc")).toBeNull()
    expect(parseContentLengthHeader("-5")).toBeNull()
  })
  it("floors fractional values", () => {
    expect(parseContentLengthHeader("100.9")).toBe(100)
  })
})

describe("resolveApiBodyLimit", () => {
  it("applies explicit per-route limits", () => {
    expect(resolveApiBodyLimit("/api/auth/signup", "application/json")).toBe(32 * KB)
    expect(resolveApiBodyLimit("/api/import-bulk", "application/json")).toBe(2 * MB)
    expect(resolveApiBodyLimit("/api/documents", "application/json")).toBe(11 * MB)
  })

  it("gives multipart uploads the larger default", () => {
    expect(resolveApiBodyLimit("/api/some-upload", "multipart/form-data; boundary=x")).toBe(12 * MB)
  })

  it("gives other API routes the default JSON limit", () => {
    expect(resolveApiBodyLimit("/api/sales", "application/json")).toBe(512 * KB)
  })

  it("returns null for non-API paths", () => {
    expect(resolveApiBodyLimit("/dashboard", "text/html")).toBeNull()
  })

  it("prefers the explicit route limit over the multipart default", () => {
    // plant-health is explicitly capped even when sent as multipart
    expect(resolveApiBodyLimit("/api/plant-health", "multipart/form-data")).toBe(9 * MB)
  })
})
