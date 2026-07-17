import { describe, it, expect } from "vitest"
import {
  CROP_FAMILIES,
  DEFAULT_COFFEE_VARIETIES,
  getCropFamilyById,
} from "@/lib/crop-config"

describe("crop families", () => {
  it("defaults to coffee with Arabica and Robusta", () => {
    expect(DEFAULT_COFFEE_VARIETIES).toEqual(["Arabica", "Robusta"])
    expect(getCropFamilyById("coffee").label).toBe("Coffee")
  })

  it("returns coffee (the first family) for unknown or nullish ids", () => {
    expect(getCropFamilyById("does-not-exist").id).toBe("coffee")
    expect(getCropFamilyById(null).id).toBe("coffee")
    expect(getCropFamilyById(undefined).id).toBe("coffee")
  })

  it("resolves each known family by id", () => {
    for (const family of CROP_FAMILIES) {
      expect(getCropFamilyById(family.id).id).toBe(family.id)
    }
  })

  it("every family carries a complete processing-terms bridge and at least one variety", () => {
    for (const family of CROP_FAMILIES) {
      expect(family.varieties.length).toBeGreaterThan(0)
      const t = family.processingTerms
      // secondaryOutput may be intentionally empty; the rest must be labelled
      expect(t.intake).toBeTruthy()
      expect(t.primarySort).toBeTruthy()
      expect(t.secondarySort).toBeTruthy()
      expect(t.wetProcess).toBeTruthy()
      expect(t.primaryOutput).toBeTruthy()
      expect(typeof t.secondaryOutput).toBe("string")
    }
  })

  it("has unique family ids", () => {
    const ids = CROP_FAMILIES.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
