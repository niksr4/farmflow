import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { DEFAULT_COFFEE_VARIETIES } from "@/lib/crop-config"
import {
  CROP_LABEL,
  DEFAULT_TENANT_ESTATE_PROFILE,
  mergeTenantEstateProfile,
  sanitizeTenantEstateProfile,
} from "@/lib/tenant-estate-profile"

describe("the crop is coffee, and is not configurable", () => {
  it("keeps the two varieties the app separates everywhere", () => {
    expect([...DEFAULT_COFFEE_VARIETIES]).toEqual(["Arabica", "Robusta"])
  })

  it("labels the crop without asking a tenant", () => {
    expect(CROP_LABEL).toBe("coffee")
  })

  it("no longer carries a crop family or variety list on the estate profile", () => {
    expect(DEFAULT_TENANT_ESTATE_PROFILE).not.toHaveProperty("cropFamily")
    expect(DEFAULT_TENANT_ESTATE_PROFILE).not.toHaveProperty("primaryVarieties")
  })

  it("drops a crop family a stale client still sends, rather than storing it", () => {
    // An older tab left open would keep posting these. They must not be written back into
    // ui_preferences, or the field quietly returns via the merge path.
    expect(sanitizeTenantEstateProfile({ cropFamily: "tea", primaryVarieties: ["Assam"] })).toBeNull()
    const merged = mergeTenantEstateProfile({ cropFamily: "tea" } as any)
    expect(merged).not.toHaveProperty("cropFamily")
  })

  it("still sanitizes the fields that remain", () => {
    expect(sanitizeTenantEstateProfile({ weatherLatitude: 12.4, weatherLongitude: 75.7 })).toEqual({
      weatherLatitude: 12.4,
      weatherLongitude: 75.7,
    })
  })
})

describe("the multi-crop machinery is gone, not merely unused", () => {
  // It was seven crop families with their own processing vocabulary, kept so the app could one
  // day relabel itself per crop. Every tenant's cropFamily was null, the picker had already been
  // narrowed to coffee, and the processingTerms that justified the structure were read by
  // nothing. Reintroducing the table would buy the appearance of multi-crop support with none
  // of it -- which is exactly what it was.
  // Comments are stripped first: the file's own docstring names the crops it used to carry, and
  // an assertion that forbids explaining a removal is an assertion that deletes the reason.
  const cropConfig = readFileSync("lib/crop-config.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")

  it.each(["tea", "cocoa", "Forastero", "Darjeeling", "processingTerms", "CROP_FAMILIES"])(
    "does not mention %s",
    (token) => {
      expect(cropConfig).not.toContain(token)
    },
  )

  it("is not referenced by the digest or the AI prompt builders", () => {
    for (const file of ["lib/server/agents/weekly-digest-agent.ts", "lib/server/ai-analysis.ts"]) {
      const body = readFileSync(file, "utf8")
      expect(body, `${file} still calls a per-crop label helper`).not.toContain("getCropLabel")
      expect(body, `${file} still calls a per-crop variety helper`).not.toContain("getCropVarietiesLabel")
    }
  })
})
