import { describe, expect, it } from "vitest"
import { formatDateOnly, formatDateForDisplay } from "../lib/date-utils"

describe("formatDateOnly", () => {
  it("formats ISO date string to readable format", () => {
    const result = formatDateOnly("2026-06-05")
    expect(result).toBeTruthy()
    expect(typeof result).toBe("string")
    expect(result.length).toBeGreaterThan(0)
  })

  it("handles timestamp strings", () => {
    const result = formatDateOnly("2026-06-05T12:00:00.000Z")
    expect(result).toBeTruthy()
  })

  it("handles Date objects", () => {
    const d = new Date("2026-06-05")
    const result = formatDateOnly(d)
    expect(result).toBeTruthy()
  })

  it("returns something for invalid input without throwing", () => {
    expect(() => formatDateOnly("")).not.toThrow()
    expect(() => formatDateOnly(null as any)).not.toThrow()
  })
})

describe("formatDateForDisplay", () => {
  it("formats for display", () => {
    const result = formatDateForDisplay("2026-06-05T12:00:00.000Z")
    expect(result).toBeTruthy()
    expect(typeof result).toBe("string")
  })
})
