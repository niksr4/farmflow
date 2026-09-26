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

  it("queries with the same string it validated, whitespace and all", async () => {
    /**
     * It validated `.trim()`ed and then cast the UNTRIMMED input in both queries, so " <uuid> "
     * passed the isUuid guard and still reached Postgres with the whitespace attached -- producing
     * the exact 22P02 that guard exists to prevent.
     *
     * Not reachable from the app today: both callers already trim (the zod schema in that file has
     * `.string().trim()`, and app/api/import-bulk/route.ts trims explicitly). So this asserts the
     * function's own contract rather than a live 500. A function that is only correct because of
     * what its callers happen to do is one caller away from being wrong, and this test is what makes
     * a third caller safe.
     *
     * Raised by CodeRabbit on PR #37.
     */
    const token = "4f1c2d3e-1111-4222-8333-944455556666"
    runTenantQuery.mockResolvedValueOnce([{ id: token, status: "validated" }])
    await loadValidatedImportJob({ ...base, validationToken: `  ${token}\n` })

    const values = (runTenantQuery.mock.calls[0]?.[2] as { values?: unknown[] })?.values || []
    expect(values, "the padded token must never reach the ::uuid cast").toContain(token)
    expect(
      values.filter((v) => typeof v === "string" && v !== v.trim()),
      "no untrimmed value may be cast to uuid",
    ).toEqual([])
  })
})
