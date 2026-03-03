import { describe, expect, it } from "vitest"

import {
  buildValidationErrors,
  normalizeImportMode,
  parseDate,
  parseNumber,
  toLocationCode,
} from "../lib/server/import-bulk-utils"

describe("import bulk utils", () => {
  it("parses numeric and date values with CSV-friendly normalization", () => {
    expect(parseNumber("1,234.5")).toBe(1234.5)
    expect(parseNumber("", 7)).toBe(7)
    expect(parseDate("24/02/2026")).toBe("2026-02-24")
    expect(parseDate("2026/02/24")).toBe("2026-02-24")
    expect(parseDate("not-a-date")).toBeNull()
  })

  it("normalizes import mode and location code safely", () => {
    expect(normalizeImportMode("validate")).toBe("validate")
    expect(normalizeImportMode("anything")).toBe("commit")
    expect(toLocationCode("Main Estate Block-A")).toBe("MAIN")
  })

  it("validates required sales CSV fields", () => {
    const { errors, skipped } = buildValidationErrors("sales", [
      {
        sale_date: "2026-02-20",
        coffee_type: "Arabica",
        bag_type: "Dry Cherry",
        location: "Main Estate",
        bags_sold: "10",
      },
      {
        sale_date: "",
        coffee_type: "",
      },
    ])

    expect(skipped).toBe(2)
    expect(errors).toEqual([
      { row: 2, message: "Missing price_per_bag or price_per_kg" },
      { row: 3, message: "Missing sale_date, coffee_type, bag_type, or location" },
    ])
  })

  it("validates required season-processing CSV fields", () => {
    const { errors, skipped } = buildValidationErrors("processing", [
      {
        process_date: "2026-02-20",
        coffee_type: "Robusta",
        location: "PG",
      },
      {
        process_date: "2026-02-20",
        coffee_type: "",
        location: "",
      },
    ])

    expect(skipped).toBe(1)
    expect(errors).toEqual([{ row: 3, message: "Missing process_date, coffee_type, or location" }])
  })
})
