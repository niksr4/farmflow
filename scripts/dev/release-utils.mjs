/**
 * The decisions a release makes, as pure functions.
 *
 * WHY THIS FILE EXISTS SEPARATELY. The scripts around it talk to Vercel, Neon and a browser, so
 * nothing in them can be tested without all three. The parts that can actually be WRONG -- which
 * migration is missing, which deployment to roll back to, which routes cost money to call -- are
 * all decisions over data. They live here, take plain arrays, and are tested in
 * tests/release-guards.test.ts.
 *
 * Every one of these has a silent failure mode. A rollback target picked from a CANCELED build
 * aliases the domain to nothing. A migration comparison sorted as strings puts 100 before 87 and
 * reports a migrated database as pending. Neither throws.
 */

import { compareMigrationFiles } from "../migrate-utils.mjs"

/**
 * What the code on disk needs that the database has not been told about.
 *
 * ⚠ SORTED NUMERICALLY, via the shared comparator. "100-x.sql" < "87-x.sql" as strings, and that
 * exact bug shipped here once already (2026-07-22): three-digit migrations were bootstrapped as
 * "already applied" without running. Do not replace this with .sort().
 *
 * `ghosts` is the other direction and matters just as much: a version in the ledger with no file
 * on this branch means the branch is BEHIND what the database has already had done to it. Prod
 * sat in exactly that state for three days in October, when 152 was applied from a feature branch
 * while main jumped 151 -> 153.
 */
export const pendingMigrations = (filesOnDisk, appliedVersions) => {
  const applied = new Set(appliedVersions)
  const files = filesOnDisk.filter((f) => /^\d+-.*\.sql$/.test(f))
  return {
    pending: files.filter((f) => !applied.has(f)).sort(compareMigrationFiles),
    ghosts: [...applied].filter((v) => !files.includes(v)).sort(compareMigrationFiles),
  }
}

/**
 * Does calling this route spend money or burn a third-party quota?
 *
 * DERIVED FROM SOURCE, NOT LISTED. A hand-kept list of "do not call these" is how the next paid
 * endpoint gets called on every deploy -- and Alpha Vantage's free tier is 25 calls a DAY, which
 * one smoke run would eat. Keyed on the API-key names and the paid client modules, so a route
 * added next season that reads one of them is excluded the day it is written.
 *
 * Takes the route's own source plus the sources of everything it imports, TRANSITIVELY -- see
 * collectSources. One level is not enough: a route can import `@/lib/server/digest`, which imports
 * the module that reads ALPHAVANTAGE_API_KEY, and a one-level scan calls it on every run.
 */
const PAID_SIGNALS =
  /ANTHROPIC_API_KEY|ALPHAVANTAGE_API_KEY|WEATHERAPI_API_KEY|THENEWSAPI_API_KEY|PLANTHEALTH_API_KEY|OPENAI_API_KEY|GROQ_API_KEY|RAZORPAY_KEY|ai-provider|server\/claude|coffee-prices/

export const routeIsExternallyBilled = (source, depSources = []) =>
  PAID_SIGNALS.test(source) || depSources.some((s) => PAID_SIGNALS.test(s))

/**
 * Every source file reachable from an entry point, following imports.
 *
 * ⚠ THE FILESYSTEM IS INJECTED so this is testable against a fake module graph. The original
 * version of the paid-route exclusion lived inline in smoke-live.mjs, read exactly one level of
 * `@/` imports, and ignored relative imports entirely -- three route files here use them. A paid
 * key read through either shape was classed as free and called on every deploy.
 *
 * `readSource` returns the file's text or null if it does not resolve. `resolveImports` turns a
 * source string plus its own path into the paths it imports. The visited set makes a cycle
 * terminate rather than hang, and maxDepth is a belt-and-braces stop.
 */
export const collectSources = (entry, readSource, resolveImports, maxDepth = 8) => {
  const seen = new Set()
  const out = []
  const visit = (file, depth) => {
    if (depth > maxDepth || seen.has(file)) return
    seen.add(file)
    const src = readSource(file)
    if (src == null) return
    out.push(src)
    for (const dep of resolveImports(src, file)) visit(dep, depth + 1)
  }
  visit(entry, 0)
  return out
}

/**
 * Does this file export a GET handler?
 *
 * ⚠ MATCHES THE SHAPE, NOT ONE SPELLING. This was `/export async function GET/` and it silently
 * dropped two real routes -- /api/labor and /api/consumables, one of them a core money route --
 * because they declare GET differently. The smoke then reported "78 endpoints answered, PASSES",
 * two short, with nothing anywhere saying so. A filter that quietly matches less is the exact
 * failure mode this project calls a vacuous guard, and it was in the guard written to catch it.
 */
export const exportsGet = (source) =>
  /export\s+(async\s+)?(function|const|let|var)\s+GET\b/.test(source) ||
  /export\s*\{[^}]*\bGET\b[^}]*\}/.test(source)

/**
 * Which routes a smoke run should call.
 *
 * Entries are { routePath, source, depSources }. Excluded:
 *   - no GET            nothing to call
 *   - a [dynamic] segment   there is no id to put in it
 *   - cron / webhooks / iclock   authenticated by secret, and firing them has side effects
 *   - externally billed     see above; include them deliberately with { includeBilled: true }
 */
export const smokeRoutes = (entries, { includeBilled = false } = {}) =>
  entries
    .filter((e) => exportsGet(e.source))
    .filter((e) => !/\[/.test(e.routePath))
    .filter((e) => !/\/(cron|webhooks|iclock)\b/.test(e.routePath))
    .filter((e) => includeBilled || !routeIsExternallyBilled(e.source, e.depSources))
    .map((e) => e.routePath)
    .sort()

/**
 * A response the smoke should treat as breakage.
 *
 * ⚠ THIS MEASURES LIVENESS, AND THE RULE IS DELIBERATELY NOT A LIST OF ACCEPTABLE CODES. It was
 * one -- 200/401/403/404 -- and the first real run against production failed on
 * /api/digest/feedback returning 400 "Invalid link", which is a token-link handler correctly
 * refusing a call with no token. The route was alive and validating. Adding 400 to the list would
 * have worked until the next code nobody thought of, and the fix after that is an exemption list
 * per route, which is how a smoke run goes quietly vacuous.
 *
 * So: anything below 500 means the request reached the handler and the handler answered. That is
 * what liveness is. 401/403 is a module gate or role check doing its job (estate_mock is a tenant
 * admin, not the owner, so owner-only routes SHOULD refuse it); 404 is the dormant-feature case,
 * where an endpoint answers nothing for any input because no rows exist (see "Built But
 * Unadopted"); 400 is input validation.
 *
 * A negative status is this script's own marker for a request that never completed.
 *
 * The cost of this choice, stated plainly: a route that answers 200 with WRONG DATA passes, and so
 * does one that starts 404ing because its path broke. This catches dead, not incorrect. Correctness
 * is what the unit tests and the money guards are for.
 */
export const isSmokeFailure = (status) => status < 0 || status >= 500

/**
 * The deployment to put the domain back on.
 *
 * ⚠ STATE IS LOAD-BEARING. The production list contains CANCELED and ERROR builds -- there were
 * two CANCELED in the six most recent at the time this was written. Aliasing the domain to one
 * points thefarmflow.in at a build that does not exist, which is a worse outage than the one being
 * rolled back from.
 *
 * ⚠ AND SO IS TIME. This used to return the newest non-live READY build, which rolls FORWARD: after
 * one rollback the newest deployment IS the broken one you just escaped, so running `pnpm rollback`
 * twice would put it straight back. `rollback.mjs` carries a comment warning about precisely that
 * and reads the live alias rather than assuming the newest is live -- and then this function, one
 * file over, made the assumption anyway.
 *
 * It was invisible because the tests built every row with `created: 1`, so no assertion could tell
 * ordering from no ordering. Six tamper tests passed against a function that could not sort.
 *
 * So: strictly OLDER than what is live, newest of those. Returns null when the live deployment is
 * not in the list at all, because without its timestamp there is no "older" to compute and a guess
 * here is an outage. Caller should fall back to an explicit --to.
 */
export const pickRollbackTarget = (deployments, liveUid) => {
  const live = deployments.find((d) => d.uid === liveUid)
  if (!live) return null
  const usable = deployments
    .filter((d) => d.state === "READY" && d.uid !== liveUid && Number(d.created) < Number(live.created))
    .sort((a, b) => Number(b.created) - Number(a.created))
  return usable[0] || null
}

/**
 * The deployment URL the Vercel CLI just built, read out of its own stdout.
 *
 * ⚠ WHY NOT "THE NEWEST READY DEPLOYMENT". Because that is not necessarily the one we built.
 * Merging to main auto-deploys, so a build can appear and go READY while go-live is running; it
 * would then be the newest non-live entry and get aliased in place of ours, while the success
 * message still named this branch and commit. Putting the wrong build in front of customers and
 * reporting the right one is the worst single failure this tool could have.
 *
 * The CLI prints an Inspect URL on vercel.com and the deployment URL on *.vercel.app, so keying on
 * the hostname suffix excludes the former. Prefers a line mentioning Production in case both a
 * preview and a production URL appear; otherwise the last one printed.
 */
export const parseDeploymentUrl = (stdout) => {
  const urls = String(stdout || "").match(/https:\/\/[A-Za-z0-9-]+\.vercel\.app/g)
  if (!urls || urls.length === 0) return null
  const production = String(stdout)
    .split(/\r?\n/)
    .filter((l) => /production/i.test(l))
    .flatMap((l) => l.match(/https:\/\/[A-Za-z0-9-]+\.vercel\.app/g) || [])
  return production[production.length - 1] || urls[urls.length - 1]
}
