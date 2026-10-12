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
 * Takes the route's own source plus the sources of its local imports, because the key is usually
 * read a layer down (lib/server/coffee-prices.ts, not the route).
 */
const PAID_SIGNALS =
  /ANTHROPIC_API_KEY|ALPHAVANTAGE_API_KEY|WEATHERAPI_API_KEY|THENEWSAPI_API_KEY|PLANTHEALTH_API_KEY|OPENAI_API_KEY|GROQ_API_KEY|RAZORPAY_KEY|ai-provider|server\/claude|coffee-prices/

export const routeIsExternallyBilled = (source, depSources = []) =>
  PAID_SIGNALS.test(source) || depSources.some((s) => PAID_SIGNALS.test(s))

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
    .filter((e) => /export async function GET/.test(e.source))
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
 * Newest-first input. Returns null rather than guessing when there is no safe target, because
 * "roll back to nothing" must be a refusal and not a surprise.
 */
export const pickRollbackTarget = (deployments, liveUid) => {
  const usable = deployments.filter((d) => d.state === "READY" && d.uid !== liveUid)
  return usable[0] || null
}
