import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * /api/dashboard/bootstrap is the endpoint every page load blocks on, and it ran four database
 * round trips back to back: the three-query batch, then the plan, then the per-user location
 * allow-list, then the labour cutover. Sentry logged it 30 times as "Consecutive HTTP" against
 * `executing api route (app) /api/dashboard/bootstrap` (JAVASCRIPT-NEXTJS-Z, first seen
 * 2026-09-11).
 *
 * Only resolveTenantPlanId genuinely depends on one of them -- it reads tenantRows. The other two
 * need only the session user and the tenant context, both of which exist before the batch runs.
 *
 * Source-scanned rather than executed, deliberately: what matters is the SHAPE of the awaits, and
 * that is not observable from the response. A behavioural test would have to mock the driver and
 * assert on interleaving, which pins the mock rather than the route. The assertions below key on
 * positions, so reordering or reintroducing a sequential await fails regardless of naming.
 */

const route = readFileSync("app/api/dashboard/bootstrap/route.ts", "utf8")
const code = route
  .split("\n")
  .filter((line) => {
    const t = line.trim()
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*")
  })
  .join("\n")

describe("the bootstrap endpoint does not serialise independent reads", () => {
  it("issues the independent reads in one Promise.all", () => {
    expect(code, "the three independent reads must start together").toMatch(
      /await Promise\.all\(\[[\s\S]*runTenantQueries[\s\S]*getAccessibleLocationIds[\s\S]*getLabourCutover[\s\S]*\]\)/,
    )
  })

  it("does not await the location allow-list or the cutover on their own", () => {
    /**
     * The precise regression. Both used to sit in their own `await` -- getAccessibleLocationIds on
     * its own line, getLabourCutover inline inside the response literal, which is the easiest one
     * to reintroduce by accident because it reads like a field rather than a query.
     *
     * Comments are stripped first: this file now explains the old shape in prose, and matching that
     * explanation would make the guard pass on the description of the bug it guards against.
     */
    expect(code).not.toMatch(/await\s+getAccessibleLocationIds\s*\(/)
    expect(code).not.toMatch(/await\s+getLabourCutover\s*\(/)
    expect(code, "labourCutover must be a resolved value by the time the response is built").toMatch(
      /labourCutover,/,
    )
  })

  it("keeps the plan lookup after the batch, because it reads the batch's rows", () => {
    // Not everything can be parallel, and pretending otherwise would be the opposite bug:
    // resolveTenantPlanId takes moduleRows, which only exists once the batch has returned.
    const parallelAt = code.indexOf("await Promise.all([")
    const planAt = code.search(/await resolveTenantPlanId/)
    expect(parallelAt).toBeGreaterThan(-1)
    expect(planAt).toBeGreaterThan(-1)
    expect(planAt, "the plan depends on tenantRows, so it cannot join the batch").toBeGreaterThan(parallelAt)
  })

  it("counts the awaits, so a fifth round trip cannot creep back in unnoticed", () => {
    /**
     * Derived rather than a shape match. Four are expected and each is load-bearing:
     * requireSessionUser, resolveScopedSessionUser (it reads a cookie and may look up the previewed
     * tenant), the Promise.all, and resolveTenantPlanId.
     *
     * A fifth means somebody added a sequential read -- which is exactly how the four this fixes
     * accumulated, one reasonable-looking line at a time.
     */
    const awaits = code.match(/\bawait\s+\w/g) || []
    expect(
      awaits.length,
      `expected 4 awaits, found ${awaits.length}. A new one is a new round trip on the endpoint every page load waits for.`,
    ).toBe(4)
  })
})
