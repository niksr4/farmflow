import { describe, expect, it } from "vitest"

import {
  pendingMigrations,
  routeIsExternallyBilled,
  smokeRoutes,
  isSmokeFailure,
  pickRollbackTarget,
} from "../scripts/dev/release-utils.mjs"

/**
 * THE RELEASE PATH'S DECISIONS, TESTED AS DATA.
 *
 * Each of these has a silent failure mode -- a wrong answer, not an exception:
 *
 *   pendingMigrations      sorted as strings, "100-x" < "87-x", and a migrated DB reads as pending
 *   pickRollbackTarget     a CANCELED build aliased to the domain serves nothing
 *   smokeRoutes            an empty list is a smoke that passes by calling nothing
 *   isSmokeFailure         treating 500 as acceptable makes the whole gate decorative
 */

describe("which migrations production is missing", () => {
  it("sorts numerically, not as strings", () => {
    /**
     * The 2026-07-22 bug: "100-..." < "87-..." as strings, so three-digit migrations sorted BEFORE
     * 87 and were bootstrapped as already-applied without ever running. If this list comes back in
     * string order the operator applies them in the wrong order.
     */
    const { pending } = pendingMigrations(
      ["87-a.sql", "100-b.sql", "9-c.sql", "153-d.sql"],
      [],
    )
    expect(pending).toEqual(["9-c.sql", "87-a.sql", "100-b.sql", "153-d.sql"])
  })

  it("reports exactly what the ledger lacks, and nothing else", () => {
    const { pending, ghosts } = pendingMigrations(
      ["151-a.sql", "152-b.sql", "153-c.sql", "154-d.sql"],
      ["151-a.sql", "152-b.sql"],
    )
    expect(pending).toEqual(["153-c.sql", "154-d.sql"])
    expect(ghosts).toEqual([])
  })

  it("names versions the database has that this branch does not, which means the branch is behind", () => {
    // Prod sat in exactly this state in October: 152 applied from a feature branch while main
    // jumped 151 -> 153. Reporting only the forward direction would have called that healthy.
    const { ghosts } = pendingMigrations(["151-a.sql", "153-c.sql"], ["151-a.sql", "152-b.sql", "153-c.sql"])
    expect(ghosts).toEqual(["152-b.sql"])
  })

  it("ignores files in scripts/ that are not numbered migrations", () => {
    const { pending } = pendingMigrations(["README.md", "seed.sql", "153-c.sql"], [])
    expect(pending).toEqual(["153-c.sql"])
  })

  it("is silent when prod is fully migrated", () => {
    const { pending, ghosts } = pendingMigrations(["1-a.sql", "2-b.sql"], ["1-a.sql", "2-b.sql"])
    expect(pending).toEqual([])
    expect(ghosts).toEqual([])
  })
})

describe("routes that cost money are not called on every deploy", () => {
  it("spots a paid key read in the route itself", () => {
    expect(routeIsExternallyBilled("const k = process.env.ALPHAVANTAGE_API_KEY")).toBe(true)
  })

  it("spots one read a layer down, in an imported module", () => {
    // The usual shape: the route imports lib/server/coffee-prices.ts and THAT reads the key. A
    // scan of the route alone sees nothing, and Alpha Vantage's free tier is 25 calls a day.
    expect(routeIsExternallyBilled('import { x } from "@/lib/server/coffee-prices"', ["process.env.ALPHAVANTAGE_API_KEY"])).toBe(true)
  })

  it("leaves an ordinary database route alone", () => {
    expect(routeIsExternallyBilled("const rows = await sql`SELECT 1`", ["export const q = 1"])).toBe(false)
  })
})

describe("which routes a smoke run calls", () => {
  const entry = (routePath: string, source = "export async function GET() {}", depSources: string[] = []) => ({
    routePath,
    source,
    depSources,
  })

  it("skips dynamic segments, cron, webhooks and the clock endpoint", () => {
    const got = smokeRoutes([
      entry("/api/accounts"),
      entry("/api/lots/[lotId]"),
      entry("/api/cron/orchestrator"),
      entry("/api/billing/webhooks"),
      entry("/api/iclock/cdata"),
    ])
    expect(got).toEqual(["/api/accounts"])
  })

  it("skips a route with no GET", () => {
    expect(smokeRoutes([entry("/api/write-only", "export async function POST() {}")])).toEqual([])
  })

  it("excludes externally billed routes by default and includes them on request", () => {
    const entries = [entry("/api/accounts"), entry("/api/weather", "process.env.WEATHERAPI_API_KEY\nexport async function GET() {}")]
    expect(smokeRoutes(entries)).toEqual(["/api/accounts"])
    expect(smokeRoutes(entries, { includeBilled: true })).toEqual(["/api/accounts", "/api/weather"])
  })
})

describe("what counts as breakage", () => {
  it("treats a server error and a dead connection as failures", () => {
    expect(isSmokeFailure(500)).toBe(true)
    expect(isSmokeFailure(502)).toBe(true)
    expect(isSmokeFailure(503)).toBe(true)
    expect(isSmokeFailure(-1)).toBe(true)
  })

  it("does not fail on a handler that answered, whatever it answered", () => {
    /**
     * This rule used to enumerate 200/401/403/404, and the first real run against production
     * failed on /api/digest/feedback returning 400 "Invalid link" -- a token-link handler
     * correctly refusing a call with no token. 400 belongs here for the same reason 401 does:
     * the request reached the handler.
     *
     * 401/403 is a gate doing its job (estate_mock is a tenant admin, not the owner). 404 is the
     * dormant-feature case, where an endpoint answers nothing for any input (see "Built But
     * Unadopted"). 429 is a rate limiter working.
     */
    for (const ok of [200, 201, 304, 400, 401, 403, 404, 422, 429, 499]) {
      expect(isSmokeFailure(ok), `${ok} should not be reported as breakage`).toBe(false)
    }
  })
})

describe("where a rollback goes", () => {
  const d = (uid: string, state: string) => ({ uid, state, created: 1, meta: {} })

  it("never picks a build that is not READY", () => {
    /**
     * There were two CANCELED deployments in the six most recent at the time this was written.
     * Aliasing the domain to one points thefarmflow.in at a build that does not exist -- a worse
     * outage than the one being escaped, and produced by the rollback itself.
     */
    const got = pickRollbackTarget([d("dpl_new", "READY"), d("dpl_bad", "CANCELED"), d("dpl_err", "ERROR"), d("dpl_good", "READY")], "dpl_new")
    expect(got?.uid).toBe("dpl_good")
  })

  it("never picks the deployment that is already live", () => {
    // Rolling back onto the thing you are rolling back from is a no-op that reports success.
    const got = pickRollbackTarget([d("dpl_live", "READY"), d("dpl_prev", "READY")], "dpl_live")
    expect(got?.uid).toBe("dpl_prev")
  })

  it("refuses rather than guessing when there is nothing safe", () => {
    expect(pickRollbackTarget([d("dpl_live", "READY")], "dpl_live")).toBeNull()
    expect(pickRollbackTarget([d("dpl_a", "CANCELED"), d("dpl_b", "BUILDING")], null)).toBeNull()
  })
})
