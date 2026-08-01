import { describe, it, expect } from "vitest"
import {
  AUDIT_ENTITY_TYPES,
  formatAuditPayload,
  formatAuditTimestamp,
  formatUserModuleSource,
} from "@/components/tenant-settings/utils"
import { formatDateForDisplay } from "@/lib/date-utils"

describe("AUDIT_ENTITY_TYPES", () => {
  it("always includes an 'all' option first", () => {
    expect(AUDIT_ENTITY_TYPES[0]).toEqual({ id: "all", label: "All modules" })
  })

  it("has a unique id for every entry", () => {
    const ids = AUDIT_ENTITY_TYPES.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe("formatAuditTimestamp", () => {
  it("delegates to formatDateForDisplay for a valid ISO string", () => {
    const iso = "2026-03-14T09:05:00.000Z"
    expect(formatAuditTimestamp(iso)).toBe(formatDateForDisplay(iso))
  })
})

describe("formatAuditPayload", () => {
  it("returns 'None' for null, undefined, and empty string", () => {
    expect(formatAuditPayload(null)).toBe("None")
    expect(formatAuditPayload(undefined)).toBe("None")
    expect(formatAuditPayload("")).toBe("None")
  })

  it("returns 'None' for 0 and false (falsy but JSON-serializable)", () => {
    // Matches the function's own `if (!payload) return "None"` guard — documenting the
    // current behavior so a future refactor notices if this changes.
    expect(formatAuditPayload(0)).toBe("None")
    expect(formatAuditPayload(false)).toBe("None")
  })

  it("pretty-prints a plain object as 2-space-indented JSON", () => {
    const payload = { action: "update", field: "estateName" }
    expect(formatAuditPayload(payload)).toBe(JSON.stringify(payload, null, 2))
  })

  it("pretty-prints an array payload", () => {
    const payload = [{ id: 1 }, { id: 2 }]
    expect(formatAuditPayload(payload)).toBe(JSON.stringify(payload, null, 2))
  })

  it("falls back to String() when the payload cannot be JSON-stringified (e.g. a BigInt or circular object)", () => {
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular
    expect(formatAuditPayload(circular)).toBe(String(circular))

    // BigInt(10), not the `10n` literal: tsconfig targets ES6, where TS rejects BigInt
    // literals outright (TS2737). Same runtime value, same JSON.stringify failure — which
    // is the whole point of the case — and it typechecks.
    const withBigInt = { amount: BigInt(10) }
    expect(formatAuditPayload(withBigInt)).toBe(String(withBigInt))
  })
})

describe("formatUserModuleSource", () => {
  it("labels a 'user' source as an explicit exception", () => {
    expect(formatUserModuleSource("user")).toBe("User exception")
  })

  it("labels a 'tenant' source as estate defaults", () => {
    expect(formatUserModuleSource("tenant")).toBe("Estate defaults")
  })

  it("falls back to system defaults for 'default' and the empty-string source", () => {
    expect(formatUserModuleSource("default")).toBe("System defaults")
    expect(formatUserModuleSource("")).toBe("System defaults")
  })
})
