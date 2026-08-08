import { describe, expect, it } from "vitest"
import { resolveActiveEstate } from "@/lib/estate-filter"

const params = (query: string) => new URLSearchParams(query)

describe("resolveActiveEstate", () => {
  it("falls back to the cookie when no ?estate= or ?scope= is present", () => {
    expect(resolveActiveEstate(params(""), "Tirtha Estate")).toBe("Tirtha Estate")
  })

  it("returns null when there is no cookie and no query params either", () => {
    expect(resolveActiveEstate(params(""), null)).toBeNull()
  })

  it("an explicit ?estate= overrides the cookie", () => {
    expect(resolveActiveEstate(params("estate=Citrus+Grove"), "Tirtha Estate")).toBe("Citrus Grove")
  })

  it("an explicit ?estate= is honored even with no cookie set", () => {
    expect(resolveActiveEstate(params("estate=Citrus+Grove"), null)).toBe("Citrus Grove")
  })

  it("a present but empty ?estate= falls back to the cookie, not to null", () => {
    expect(resolveActiveEstate(params("estate="), "Tirtha Estate")).toBe("Tirtha Estate")
  })

  it("a present but whitespace-only ?estate= also falls back to the cookie", () => {
    expect(resolveActiveEstate(params("estate=%20%20"), "Tirtha Estate")).toBe("Tirtha Estate")
  })

  it("?scope=all bypasses everything, even with a cookie and an explicit ?estate= present", () => {
    expect(resolveActiveEstate(params("scope=all&estate=Citrus+Grove"), "Tirtha Estate")).toBeNull()
  })

  it("?scope=all alone bypasses a cookie-only selection", () => {
    expect(resolveActiveEstate(params("scope=all"), "Tirtha Estate")).toBeNull()
  })

  it("a ?scope= value other than 'all' does not trigger the bypass", () => {
    expect(resolveActiveEstate(params("scope=mine"), "Tirtha Estate")).toBe("Tirtha Estate")
  })
})
