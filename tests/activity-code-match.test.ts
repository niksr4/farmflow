import { describe, it, expect } from "vitest"
import { resolveActivityFromQuery } from "@/lib/activity-code-match"

const activities = [
  { code: "P-01", reference: "Weeding" },
  { code: "P-02", reference: "Pruning" },
  { code: "H-10", reference: "Harvest picking" },
  { code: "H-11", reference: "Harvest transport" },
]

describe("resolveActivityFromQuery", () => {
  it("resolves an exact code match (case-insensitive)", () => {
    expect(resolveActivityFromQuery("p-01", activities)?.code).toBe("P-01")
    expect(resolveActivityFromQuery("P-02", activities)?.reference).toBe("Pruning")
  })

  it("resolves an exact category (reference) match", () => {
    expect(resolveActivityFromQuery("weeding", activities)?.code).toBe("P-01")
  })

  it("resolves an unambiguous partial match", () => {
    expect(resolveActivityFromQuery("weed", activities)?.code).toBe("P-01")
    expect(resolveActivityFromQuery("picking", activities)?.code).toBe("H-10")
  })

  it("does NOT guess when a partial match is ambiguous", () => {
    // "harvest" matches both H-10 and H-11 -> refuse rather than pick wrong
    expect(resolveActivityFromQuery("harvest", activities)).toBeNull()
    // "H-1" matches H-10 and H-11
    expect(resolveActivityFromQuery("H-1", activities)).toBeNull()
  })

  it("returns null for empty/whitespace/no-match input", () => {
    expect(resolveActivityFromQuery("", activities)).toBeNull()
    expect(resolveActivityFromQuery("   ", activities)).toBeNull()
    expect(resolveActivityFromQuery("nonexistent", activities)).toBeNull()
  })

  it("prefers an exact code match over a partial reference match", () => {
    const data = [
      { code: "WEED", reference: "Something else" },
      { code: "X-99", reference: "Weeding around WEED block" },
    ]
    expect(resolveActivityFromQuery("weed", data)?.code).toBe("WEED")
  })
})
