import { describe, expect, it } from "vitest"
import {
  buildLocationLabelMap,
  formatLocationLabel,
  resolveLocationIdFromLabel,
} from "@/lib/location-label"

// The tenant that motivated this helper: four blocks, one shared name, identity in `code`.
const laxmi = [
  { id: "1", name: "Laxmi", code: "HOUSE-BLOCK" },
  { id: "2", name: "Laxmi", code: "LAXMI-STORE-BLOCK" },
  { id: "3", name: "Laxmi", code: "LAXMI-MEKOOR-BLOCK" },
  { id: "4", name: "Laxmi", code: "GEETHA-BLOCK" },
]

// A tenant with meaningful, unique names — these must keep reading as before.
const medappa = [
  { id: "a", name: "Tirtha – Robusta Drip", code: "TE-01" },
  { id: "b", name: "Tirtha – Arabica Drip", code: "TE-02" },
  { id: "c", name: "Citrus Grove – C1", code: "CG-C1" },
]

describe("formatLocationLabel", () => {
  it("appends the code when a name is shared, so duplicates are distinguishable", () => {
    const labels = laxmi.map((loc) => formatLocationLabel(loc, laxmi))
    expect(labels).toEqual([
      "Laxmi — HOUSE-BLOCK",
      "Laxmi — LAXMI-STORE-BLOCK",
      "Laxmi — LAXMI-MEKOOR-BLOCK",
      "Laxmi — GEETHA-BLOCK",
    ])
    expect(new Set(labels).size).toBe(laxmi.length)
  })

  it("leaves unique names untouched", () => {
    expect(formatLocationLabel(medappa[0], medappa)).toBe("Tirtha – Robusta Drip")
    expect(formatLocationLabel(medappa[2], medappa)).toBe("Citrus Grove – C1")
  })

  it("treats names differing only by case or spacing as colliding", () => {
    const locations = [
      { id: "1", name: "Main", code: "M1" },
      { id: "2", name: "  main ", code: "M2" },
    ]
    expect(formatLocationLabel(locations[0], locations)).toBe("Main — M1")
    expect(formatLocationLabel(locations[1], locations)).toBe("main — M2")
  })

  it("falls back to the code, then the fallback string, when there is no name", () => {
    expect(formatLocationLabel({ id: "1", name: "", code: "SG-A" }, [])).toBe("SG-A")
    expect(formatLocationLabel({ id: "1", name: null, code: null }, [])).toBe("Unnamed location")
    expect(formatLocationLabel({ id: "1" }, [], "Estate")).toBe("Estate")
    expect(formatLocationLabel(null, [])).toBe("Unnamed location")
  })

  it("does not repeat itself when the name and code are the same", () => {
    const locations = [
      { id: "1", name: "HF", code: "HF" },
      { id: "2", name: "HF", code: "HF-B" },
    ]
    expect(formatLocationLabel(locations[0], locations)).toBe("HF")
    expect(formatLocationLabel(locations[1], locations)).toBe("HF — HF-B")
  })

  it("does not treat a location as colliding with itself", () => {
    const single = [{ id: "1", name: "Laxmi", code: "HOUSE-BLOCK" }]
    expect(formatLocationLabel(single[0], single)).toBe("Laxmi")
  })

  it("keeps the bare name when the list is not supplied", () => {
    expect(formatLocationLabel({ id: "2", name: "Laxmi", code: "LAXMI-STORE-BLOCK" })).toBe("Laxmi")
  })
})

describe("buildLocationLabelMap", () => {
  it("matches formatLocationLabel for every entry", () => {
    for (const list of [laxmi, medappa]) {
      const map = buildLocationLabelMap(list)
      for (const loc of list) {
        expect(map.get(loc.id)).toBe(formatLocationLabel(loc, list))
      }
    }
  })

  it("skips entries without an id", () => {
    expect(buildLocationLabelMap([{ name: "Nameless", code: "NC" }]).size).toBe(0)
  })

  it("honours a custom fallback", () => {
    expect(buildLocationLabelMap([{ id: "1" }], "Estate").get("1")).toBe("Estate")
  })
})

describe("resolveLocationIdFromLabel", () => {
  it("prefers a code match", () => {
    expect(resolveLocationIdFromLabel("GEETHA-BLOCK", laxmi)).toBe("4")
    expect(resolveLocationIdFromLabel("te-01", medappa)).toBe("a")
  })

  it("refuses to guess between locations sharing a name", () => {
    // Previously this resolved to the first match, silently filing records against
    // HOUSE-BLOCK no matter which block the record belonged to.
    expect(resolveLocationIdFromLabel("Laxmi", laxmi)).toBe("")
  })

  it("resolves a name only when it is unambiguous", () => {
    expect(resolveLocationIdFromLabel("Citrus Grove – C1", medappa)).toBe("c")
  })

  it("returns empty for blank or unknown labels", () => {
    expect(resolveLocationIdFromLabel("", laxmi)).toBe("")
    expect(resolveLocationIdFromLabel(null, laxmi)).toBe("")
    expect(resolveLocationIdFromLabel("Nowhere", laxmi)).toBe("")
  })
})
