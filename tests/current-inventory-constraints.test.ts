import { describe, expect, it } from "vitest"

import { isMissingCurrentInventoryUpsertConstraintError } from "../lib/server/current-inventory-constraints"

describe("isMissingCurrentInventoryUpsertConstraintError", () => {
  it("recognises Postgres 42P10 (no unique/exclusion constraint for ON CONFLICT)", () => {
    expect(isMissingCurrentInventoryUpsertConstraintError({ code: "42P10" })).toBe(true)
  })

  it("recognises the error by message text when the code is absent", () => {
    expect(
      isMissingCurrentInventoryUpsertConstraintError(
        new Error("no unique or exclusion constraint matching the ON CONFLICT specification"),
      ),
    ).toBe(true)
  })

  it("is case-insensitive on the message text", () => {
    expect(
      isMissingCurrentInventoryUpsertConstraintError(
        new Error("NO UNIQUE OR EXCLUSION CONSTRAINT MATCHING THE ON CONFLICT SPECIFICATION"),
      ),
    ).toBe(true)
  })

  it("returns false for unrelated errors", () => {
    expect(isMissingCurrentInventoryUpsertConstraintError(new Error("connection reset"))).toBe(false)
    expect(isMissingCurrentInventoryUpsertConstraintError({ code: "23505" })).toBe(false)
  })

  it("handles null, undefined, and non-error inputs without throwing", () => {
    expect(isMissingCurrentInventoryUpsertConstraintError(null)).toBe(false)
    expect(isMissingCurrentInventoryUpsertConstraintError(undefined)).toBe(false)
    expect(isMissingCurrentInventoryUpsertConstraintError("a plain string")).toBe(false)
    expect(isMissingCurrentInventoryUpsertConstraintError({})).toBe(false)
  })
})
