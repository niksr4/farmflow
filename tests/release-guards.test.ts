import { describe, expect, it } from "vitest"

import { readFileSync } from "node:fs"

import {
  pendingMigrations,
  routeIsExternallyBilled,
  smokeRoutes,
  isSmokeFailure,
  pickRollbackTarget,
  preflightBlocks,
  parseDeploymentUrl,
  collectSources,
  exportsGet,
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

describe("only one of the two directions may stop a deploy", () => {
  /**
   * ⚠ THE ASYMMETRY IS THE WHOLE POINT, and treating the two as the same broke the gate in
   * production use on 2026-10-13 -- the day 153 and 154 were applied. Blocking on ghosts meant
   * that the moment 154 reached prod, every branch without a 154 file (main and both tooling
   * branches) became undeployable, including the branch carrying the code 154 was applied for.
   * The gate refused the exact workflow it was built to protect.
   */
  it("BLOCKS on a pending migration, because that code 500s", () => {
    expect(preflightBlocks({ pending: ["154-x.sql"], ghosts: [] })).toBe(true)
  })

  it("does NOT block on a ghost, because older code on newer schema works", () => {
    expect(preflightBlocks({ pending: [], ghosts: ["154-x.sql"] })).toBe(false)
  })

  it("still blocks when a pending migration and a ghost appear together", () => {
    expect(preflightBlocks({ pending: ["155-y.sql"], ghosts: ["154-x.sql"] })).toBe(true)
  })

  it("blocks on a missing feature-spec table regardless of migrations", () => {
    expect(preflightBlocks({ pending: [], ghosts: [], specProblems: 1 })).toBe(true)
  })

  it("passes a fully aligned branch", () => {
    expect(preflightBlocks({ pending: [], ghosts: [], specProblems: 0 })).toBe(false)
    expect(preflightBlocks()).toBe(false)
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
  /**
   * ⚠ EVERY ROW GETS A DISTINCT `created`, AND THAT IS THE POINT. The first version of this helper
   * set `created: 1` on every deployment, so no assertion here could distinguish ordering from no
   * ordering at all -- and pickRollbackTarget ignored time entirely. Six tamper tests passed
   * against a function that could roll FORWARD into the broken build. The tests did not miss the
   * bug by bad luck; they were built so that they could not see it.
   *
   * Newest-first, the way the Vercel API returns them.
   */
  const d = (uid: string, state: string, created: number) => ({ uid, state, created, meta: {} })

  it("never picks a build that is not READY", () => {
    /**
     * There were two CANCELED deployments in the six most recent at the time this was written.
     * Aliasing the domain to one points thefarmflow.in at a build that does not exist -- a worse
     * outage than the one being escaped, and produced by the rollback itself.
     */
    const got = pickRollbackTarget(
      [d("dpl_live", "READY", 500), d("dpl_bad", "CANCELED", 400), d("dpl_err", "ERROR", 300), d("dpl_good", "READY", 200)],
      "dpl_live",
    )
    expect(got?.uid).toBe("dpl_good")
  })

  it("never picks the deployment that is already live", () => {
    // Rolling back onto the thing you are rolling back from is a no-op that reports success.
    const got = pickRollbackTarget([d("dpl_live", "READY", 500), d("dpl_prev", "READY", 400)], "dpl_live")
    expect(got?.uid).toBe("dpl_prev")
  })

  it("NEVER ROLLS FORWARD into a build newer than the one live", () => {
    /**
     * The scenario this exists for, and the one the old tests could not express: you have already
     * rolled back once, so the NEWEST deployment is the broken build you escaped. Asking to roll
     * back again must go further back, never return to it.
     */
    const got = pickRollbackTarget(
      [d("dpl_broken", "READY", 900), d("dpl_live", "READY", 500), d("dpl_old", "READY", 100)],
      "dpl_live",
    )
    expect(got?.uid).toBe("dpl_old")
  })

  it("picks the newest of the builds that are older, not just any older one", () => {
    /**
     * ⚠ DELIBERATELY OUT OF ORDER. The first version of this case listed them newest-first, which
     * is how the API returns them -- so filtering alone produced the right answer and deleting the
     * sort changed nothing. A tamper run caught that the assertion could not fail: the test was
     * passing on the input's accident, not the function's behaviour. The sort exists so this does
     * not depend on the caller's ordering, so the test must not supply the ordering.
     */
    const got = pickRollbackTarget(
      [d("dpl_live", "READY", 900), d("dpl_ancient", "READY", 100), d("dpl_recent", "READY", 800)],
      "dpl_live",
    )
    expect(got?.uid).toBe("dpl_recent")
  })

  it("refuses rather than guessing when there is nothing safe", () => {
    expect(pickRollbackTarget([d("dpl_live", "READY", 500)], "dpl_live")).toBeNull()
    expect(pickRollbackTarget([d("dpl_a", "CANCELED", 400), d("dpl_b", "BUILDING", 300)], "dpl_a")).toBeNull()
  })

  it("refuses when the live deployment is not in the window, rather than comparing against nothing", () => {
    // Without the live build's timestamp there is no "older" to compute. Guessing here is an
    // outage; the caller is told to pass --to.
    expect(pickRollbackTarget([d("dpl_a", "READY", 400), d("dpl_b", "READY", 300)], "dpl_not_here")).toBeNull()
    expect(pickRollbackTarget([d("dpl_a", "READY", 400)], null)).toBeNull()
  })
})

describe("go-live aliases the build it actually created", () => {
  /**
   * ⚠ NOT "the newest READY deployment". Merging to main auto-deploys, so another build can go
   * READY while go-live is running -- it would be the newest non-live entry and would get aliased
   * in place of ours, while the success message still named this branch and commit. Shipping one
   * build and reporting another is the worst outcome available to this tool.
   */
  it("reads the deployment URL out of the CLI's own output", () => {
    const stdout = [
      "Vercel CLI 54.18.2",
      "🔍  Inspect: https://vercel.com/niks-projects/farmflowv1/CHzDtLm7gpUtAFX7qU66daEDuWGV [2s]",
      "✅  Production: https://farmflowv1-abc123xyz-niks-projects.vercel.app [41s]",
    ].join("\n")
    expect(parseDeploymentUrl(stdout)).toBe("https://farmflowv1-abc123xyz-niks-projects.vercel.app")
  })

  it("does not mistake the Inspect link for the deployment", () => {
    // The Inspect URL is on vercel.com and contains the uid, so a loose match would return a
    // dashboard link that resolves to nothing.
    const stdout = "🔍  Inspect: https://vercel.com/niks/farmflowv1/CHzDtLm7gpUtAFX7qU66daEDuWGV"
    expect(parseDeploymentUrl(stdout)).toBeNull()
  })

  it("prefers the production URL even when it is NOT the last one printed", () => {
    /**
     * ⚠ PRODUCTION FIRST, PREVIEW SECOND, ON PURPOSE. The first version of this case had them the
     * other way round, so "last URL printed" gave the right answer too and deleting the preference
     * changed nothing -- a tamper run showed the assertion could not fail. If the only ordering
     * tested is the one the fallback already handles, the preference is untested.
     */
    const stdout = [
      "Production: https://farmflowv1-prod-abc.vercel.app",
      "Preview: https://farmflowv1-preview-xyz.vercel.app",
    ].join("\n")
    expect(parseDeploymentUrl(stdout)).toBe("https://farmflowv1-prod-abc.vercel.app")
  })

  it("falls back to the last URL when nothing is labelled production", () => {
    const stdout = ["https://farmflowv1-one.vercel.app", "https://farmflowv1-two.vercel.app"].join("\n")
    expect(parseDeploymentUrl(stdout)).toBe("https://farmflowv1-two.vercel.app")
  })

  it("returns null on output with no deployment URL, so the caller stops instead of guessing", () => {
    expect(parseDeploymentUrl("")).toBeNull()
    expect(parseDeploymentUrl("Error: build failed")).toBeNull()
    expect(parseDeploymentUrl(null)).toBeNull()
  })
})

describe("the paid-route scan follows imports all the way down", () => {
  /**
   * The original read exactly one level of `@/` imports and ignored relative imports entirely.
   * A route importing ./helpers, where helpers reads ALPHAVANTAGE_API_KEY, was classed as free --
   * and Alpha Vantage's free tier is 25 calls a DAY.
   */
  const graph: Record<string, string> = {
    "/route.ts": 'import { a } from "./a"',
    "/a.ts": 'import { b } from "@/lib/b"',
    "/lib/b.ts": 'import { c } from "../deep/c"',
    "/deep/c.ts": "const k = process.env.ALPHAVANTAGE_API_KEY",
  }
  const read = (f: string) => (f in graph ? graph[f] : null)
  const resolve = (src: string): string[] => {
    const specs = [...src.matchAll(/["']([^"']+)["']/g)].map((x) => x[1])
    const table: Record<string, string> = { "./a": "/a.ts", "@/lib/b": "/lib/b.ts", "../deep/c": "/deep/c.ts" }
    return specs.map((s) => table[s]).filter((x): x is string => Boolean(x))
  }

  it("reaches a key read three modules below the route", () => {
    const sources = collectSources("/route.ts", read, resolve)
    expect(sources).toHaveLength(4)
    expect(routeIsExternallyBilled(sources[0], sources.slice(1))).toBe(true)
  })

  it("terminates on a cycle instead of hanging", () => {
    const cyc: Record<string, string> = { "/x.ts": '"./y"', "/y.ts": '"./x"' }
    const r = (f: string) => (f in cyc ? cyc[f] : null)
    const res = (src: string) => (src.includes("./y") ? ["/y.ts"] : ["/x.ts"])
    expect(collectSources("/x.ts", r, res)).toHaveLength(2)
  })

  it("skips a file that does not resolve rather than throwing", () => {
    expect(collectSources("/nope.ts", () => null, () => [])).toEqual([])
  })
})

describe("every shape of GET handler is called", () => {
  /**
   * ⚠ THE FILTER MATCHED ONE SPELLING AND SILENTLY DROPPED TWO REAL ROUTES -- /api/labor and
   * /api/consumables, one a core money route. The smoke then reported "78 endpoints answered,
   * PASSES", two short, with nothing saying so. A guard that quietly measures less is this
   * project's signature failure, and it was inside the guard written to catch it.
   */
  it("matches async function, plain function, const, and a re-export", () => {
    expect(exportsGet("export async function GET() {}")).toBe(true)
    expect(exportsGet("export function GET() {}")).toBe(true)
    expect(exportsGet("export const GET = handler")).toBe(true)
    expect(exportsGet("const handler = () => {}\nexport { handler as GET }")).toBe(true)
    expect(exportsGet("export { GET, POST }")).toBe(true)
  })

  it("is not fooled by a POST-only route or a passing mention", () => {
    expect(exportsGet("export async function POST() {}")).toBe(false)
    expect(exportsGet("// this route has no GET on purpose")).toBe(false)
    expect(exportsGet('fetch(url, { method: "GET" })')).toBe(false)
  })

  it("picks up the two routes the old filter dropped, read from the real tree", () => {
    // Pinned to the real app/api sources, not a fixture: these two are why the filter changed, and
    // a fixture-only test would pass again the moment someone narrowed the regex.
    for (const route of ["app/api/labor/route.ts", "app/api/consumables/route.ts"]) {
      expect(exportsGet(readFileSync(route, "utf8")), `${route} exports a GET the smoke must call`).toBe(true)
    }
  })
})
