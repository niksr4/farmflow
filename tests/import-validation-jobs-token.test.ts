import { beforeEach, describe, expect, it, vi } from "vitest"

// vi.hoisted so the hoisted vi.mock factories can close over it (same pattern as
// tests/labour-entry-mode.test.ts).
const { runTenantQuery } = vi.hoisted(() => ({ runTenantQuery: vi.fn() }))

vi.mock("@/lib/server/db", () => ({
  sql: ((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })) as any,
}))
vi.mock("@/lib/server/tenant-db", () => ({
  normalizeTenantContext: (tenantId: string | undefined, role: string) => ({ tenantId: tenantId ?? "", role }),
  runTenantQuery: (...args: unknown[]) => runTenantQuery(...args),
  runTenantQueries: vi.fn(),
}))

import { loadValidatedImportJob } from "@/lib/server/import/validation-jobs"

const base = { tenantId: "t1", role: "admin", requestedBy: "alice", requestedByUserId: null, dataset: "sales" }

beforeEach(() => runTenantQuery.mockReset())

describe("loadValidatedImportJob", () => {
  it("treats a malformed token as 'no such job' without querying (it used to 500 on the ::uuid cast)", async () => {
    for (const validationToken of ["not-a-uuid", "'; DROP TABLE x; --", "1234"]) {
      expect(await loadValidatedImportJob({ ...base, validationToken })).toBeNull()
    }
    expect(runTenantQuery).not.toHaveBeenCalled()
  })

  it("still looks up a well-formed token", async () => {
    runTenantQuery.mockResolvedValueOnce([{ id: "4f1c2d3e-1111-4222-8333-944455556666", status: "validated" }])
    const job = await loadValidatedImportJob({ ...base, validationToken: "4f1c2d3e-1111-4222-8333-944455556666" })
    expect(job?.status).toBe("validated")
    expect(runTenantQuery).toHaveBeenCalledTimes(1)
  })
})
