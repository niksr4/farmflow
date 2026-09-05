import { beforeEach, describe, expect, it, vi } from "vitest"

// vi.mock factories are hoisted above the whole module, including any `const` a factory below
// closes over -- referencing such a `const` directly throws "Cannot access before initialization".
// vi.hoisted() is the documented way to share a value with a hoisted factory safely, same pattern
// as tests/location-access.test.ts and tests/biometric-attendance-ingest.test.ts.
const { accountsSql, runTenantQuery } = vi.hoisted(() => ({
  accountsSql: ((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })) as any,
  runTenantQuery: vi.fn(),
}))

vi.mock("@/lib/server/db", () => ({ accountsSql }))

vi.mock("@/lib/server/tenant-db", () => ({
  normalizeTenantContext: (tenantId: string | undefined, role: string) => ({ tenantId: tenantId ?? "", role }),
  runTenantQuery: (...args: unknown[]) => runTenantQuery(...args),
}))

// Static import is safe here: vitest hoists vi.mock above the import graph.
import {
  blockedByLabourCutover,
  blockedByLabourCutoverBefore,
  getLabourCutover,
} from "@/lib/server/labour-entry-mode"

const TENANT_ID = "tenant-1"
const tenantContext = { tenantId: TENANT_ID, role: "user" } as any

beforeEach(() => {
  runTenantQuery.mockReset()
})

describe("getLabourCutover", () => {
  it("returns the cutover date (YYYY-MM-DD) when a row exists", async () => {
    runTenantQuery.mockResolvedValueOnce([{ from_date: "2026-08-01T00:00:00.000Z" }])
    const result = await getLabourCutover(tenantContext)
    expect(result).toBe("2026-08-01")
  })

  it("returns null when the tenant has no cutover row (never switched)", async () => {
    runTenantQuery.mockResolvedValueOnce([])
    const result = await getLabourCutover(tenantContext)
    expect(result).toBeNull()
  })

  it("returns null rather than throwing when the table doesn't exist yet (pre-migration-116 instance)", async () => {
    runTenantQuery.mockRejectedValueOnce(new Error('relation "tenant_labour_entry_mode" does not exist'))
    const result = await getLabourCutover(tenantContext)
    expect(result).toBeNull()
  })
})

describe("blockedByLabourCutover (Accounts-entry write guard)", () => {
  it("returns null without touching the database for an unparseable date", async () => {
    const result = await blockedByLabourCutover(tenantContext, "not-a-date")
    expect(result).toBeNull()
    expect(runTenantQuery).not.toHaveBeenCalled()
  })

  it("returns null when the tenant has never switched (no cutover row)", async () => {
    runTenantQuery.mockResolvedValueOnce([])
    const result = await blockedByLabourCutover(tenantContext, "2026-09-01")
    expect(result).toBeNull()
  })

  it("returns null for an entry dated before the cutover -- still recorded in Accounts", async () => {
    runTenantQuery.mockResolvedValueOnce([{ from_date: "2026-08-15" }])
    const result = await blockedByLabourCutover(tenantContext, "2026-08-10")
    expect(result).toBeNull()
  })

  it("blocks an entry dated on the cutover day itself", async () => {
    runTenantQuery.mockResolvedValueOnce([{ from_date: "2026-08-15" }])
    const result = await blockedByLabourCutover(tenantContext, "2026-08-15")
    expect(result).toContain("2026-08-15")
    expect(result).toContain("muster roll")
  })

  it("blocks an entry dated after the cutover", async () => {
    runTenantQuery.mockResolvedValueOnce([{ from_date: "2026-08-15" }])
    const result = await blockedByLabourCutover(tenantContext, "2026-09-01")
    expect(result).not.toBeNull()
  })
})

describe("blockedByLabourCutoverBefore (Muster-allocation write guard)", () => {
  it("returns null without touching the database for an unparseable date", async () => {
    const result = await blockedByLabourCutoverBefore(tenantContext, "not-a-date")
    expect(result).toBeNull()
    expect(runTenantQuery).not.toHaveBeenCalled()
  })

  it("blocks when the tenant has never switched -- Costs is still the system of record", async () => {
    runTenantQuery.mockResolvedValueOnce([])
    const result = await blockedByLabourCutoverBefore(tenantContext, "2026-09-01")
    expect(result).not.toBeNull()
    expect(result).toContain("Costs")
  })

  it("allows an allocation dated on the cutover day itself", async () => {
    runTenantQuery.mockResolvedValueOnce([{ from_date: "2026-08-15" }])
    const result = await blockedByLabourCutoverBefore(tenantContext, "2026-08-15")
    expect(result).toBeNull()
  })

  it("allows an allocation dated after the cutover", async () => {
    runTenantQuery.mockResolvedValueOnce([{ from_date: "2026-08-15" }])
    const result = await blockedByLabourCutoverBefore(tenantContext, "2026-09-01")
    expect(result).toBeNull()
  })

  it("blocks an allocation dated before the cutover -- belongs to the old Accounts-recorded era", async () => {
    runTenantQuery.mockResolvedValueOnce([{ from_date: "2026-08-15" }])
    const result = await blockedByLabourCutoverBefore(tenantContext, "2026-08-01")
    expect(result).not.toBeNull()
    expect(result).toContain("Costs")
  })
})
