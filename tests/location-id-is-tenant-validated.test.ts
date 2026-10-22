import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * A WRITE THAT ACCEPTS A BLOCK ID MUST CHECK THE BLOCK BELONGS TO THE CALLER'S ESTATE.
 *
 * ⚠ THE DATABASE WILL NOT DO IT FOR YOU, and this is the part that surprises people. A foreign key
 * check runs with row-level security BYPASSED -- that is documented Postgres behaviour, not a
 * misconfiguration here -- so `location_id REFERENCES locations(id)` happily accepts another
 * tenant's block id even though the caller cannot SELECT that row. Verified against production on
 * 2026-10-21: ALL 21 foreign keys pointing at `locations` are single-column. Not one is scoped by
 * tenant.
 *
 * There is a second, closer-to-home half: a `user` restricted to some blocks via `user_locations`
 * could write against any other block in their own estate. The tenant check and the per-user check
 * are the same call, which is why `validateLocationForTenant` takes the session user.
 *
 * SEVERITY, measured rather than assumed: 0 cross-tenant rows exist across all 21 tables on
 * production today. This is a latent hole, not an incident, and no data needs repairing. It is
 * guarded because the next route to accept a block id is the one that gets it wrong -- #127 fixed
 * seven routes by hand and its own description lists four more it did not reach.
 *
 * THE RATCHET ONLY EVER SHRINKS. Same contract as mutation-route-role-guard.test.ts: a newly
 * unguarded route fails the first test, and fixing a listed one fails the second until the entry
 * is deleted. An allowlist with no second test is how an exemption outlives the reason for it.
 */

/**
 * Routes that still write a caller-supplied location id without validating it.
 *
 * Seeded from the state of the tree, NOT from a guess. Every entry here is a real instance of the
 * bug and every one should eventually go.
 */
const KNOWN_UNVALIDATED_LOCATION_WRITES: string[] = [
  // ⚠ ENTRIES ARE "path HANDLER", NOT JUST A PATH. A file-level allowlist exempted every handler
  // in a file once one of them was fixed, which is how app/api/inventory-neon/route.ts DELETE
  // stayed unguarded after its POST was corrected -- invisible to the very test written to catch
  // it. Naming the handler means fixing POST does not quietly cover PUT.
  //
  // The admin console's own writes. Gated on owner/admin, so the blast radius is smaller, but
  // seed-tenant in particular constructs rows for a tenant chosen by the caller.
  "app/api/admin/seed-tenant/route.ts POST",
  "app/api/admin/user-locations/route.ts PUT",
  // Money and stock. These matter most and should go first.
  "app/api/dispatch/route.ts POST",
  "app/api/dispatch/route.ts PUT",
  "app/api/other-sales/route.ts POST",
  "app/api/other-sales/route.ts PUT",
  "app/api/sales/route.ts PUT",
  // The legacy Accounts write path, three routes sharing one shape.
  "app/api/transactions-neon/batch/route.ts POST",
  "app/api/transactions-neon/route.ts POST",
  "app/api/transactions-neon/update/route.ts PUT",
  // Bulk import, which writes on behalf of a file rather than a form.
  "app/api/import-bulk/route.ts POST",
].sort()

/**
 * The call that does the checking.
 *
 * ⚠ THE `\b` IS LOAD-BEARING AND ITS ABSENCE MADE THIS GUARD VACUOUS. Without it the pattern
 * matches INSIDE `NOTvalidateLocationForTenant(`, so neutralising a call by renaming it still
 * looked guarded -- which is precisely how the tamper test caught it. The same mistake was made in
 * the worker-PII guard earlier; a bare identifier regex needs an anchor or it matches any longer
 * identifier ending in the same text.
 */
const VALIDATES = /\bvalidateLocationForTenant\s*\(/

/**
 * A mutation that stores a location id. Keyed on the COLUMN appearing in a real INSERT or UPDATE,
 * not on a variable name, because the variable is spelled `locationId`, `location_id`, `locId` and
 * `blockId` in different files and a name-based scan would miss three of the four.
 */
const WRITES_LOCATION_COLUMN =
  /INSERT\s+INTO\s+[\s\S]{0,400}?\blocation_id\b[\s\S]{0,400}?VALUES|UPDATE\s+\w+[\s\S]{0,200}?SET[\s\S]{0,400}?\blocation_id\s*=/i

/**
 * Comments in this repository explain the bug they guard against, so a raw scan trips on the
 * explanation. This has now caught five guards; see CLAUDE.md.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<![:"'\\])\/\/.*$/gm, "")

const collectRouteFiles = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...collectRouteFiles(full))
    else if (entry === "route.ts") out.push(full)
  }
  return out
}

/**
 * Split a route file into its exported handlers, so each is judged on its own.
 *
 * ⚠ THIS USED TO BE FILE-LEVEL, AND THAT MADE THE GUARD VACUOUS AT THE HANDLER LEVEL. One
 * `validateLocationForTenant(` anywhere in a file exempted the WHOLE file -- so a route whose POST
 * validated and whose PATCH did not passed cleanly. Caught in review on #127, which is the PR
 * whose entire purpose was this class: the guard was blind to exactly the shape it existed to
 * catch, one level down.
 *
 * Returns [name, body] pairs. A file's preamble (imports, helpers) is dropped, which is correct:
 * a validation call in a shared helper is only a validation if a handler reaches it, and a helper
 * that validates will appear inside the handler that calls it by name -- see HELPER_VALIDATES.
 */
const handlersOf = (source: string): Array<{ name: string; body: string }> => {
  const pattern = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g
  const starts: Array<{ name: string; at: number }> = []
  for (const match of source.matchAll(pattern)) {
    starts.push({ name: match[1], at: match.index ?? 0 })
  }
  return starts.map((start, index) => ({
    name: start.name,
    body: source.slice(start.at, index + 1 < starts.length ? starts[index + 1].at : source.length),
  }))
}

/**
 * A file-scoped helper that itself validates, plus the handler calling it by name.
 *
 * Some routes funnel their writes through one local function. Requiring the call to appear
 * literally inside the handler would flag those falsely, so a handler also passes when it calls a
 * helper whose own body validates.
 */
const validatingHelpers = (source: string): string[] => {
  const names: string[] = []
  const pattern = /(?:const|function)\s+([A-Za-z_$][\w$]*)\s*(?:=\s*)?(?:async\s*)?\(/g
  for (const match of source.matchAll(pattern)) {
    const name = match[1]
    const from = match.index ?? 0
    // Look only at the next ~2500 characters, which is the helper, not the rest of the file.
    if (VALIDATES.test(source.slice(from, from + 2500))) names.push(name)
  }
  return [...new Set(names)]
}

/** Every handler that stores a location id without checking it, as "path POST". */
const findUnvalidatedLocationWrites = () => {
  const root = process.cwd()
  const flagged: string[] = []

  for (const file of collectRouteFiles(resolve(root, "app/api"))) {
    const src = stripComments(readFileSync(file, "utf8"))
    if (!WRITES_LOCATION_COLUMN.test(src)) continue
    const path = relative(root, file).split("\\").join("/")
    const helpers = validatingHelpers(src)

    for (const handler of handlersOf(src)) {
      if (!WRITES_LOCATION_COLUMN.test(handler.body)) continue
      if (VALIDATES.test(handler.body)) continue
      if (helpers.some((name) => new RegExp(`\\b${name}\\s*\\(`).test(handler.body))) continue
      flagged.push(`${path} ${handler.name}`)
    }
  }

  return flagged.sort()
}

describe("a caller-supplied location id is validated against the tenant before it is stored", () => {
  it("finds routes that write a location id at all", () => {
    /**
     * Vacuity: if the detector matches nothing -- a regex that stopped working, an app/api that
     * moved -- every assertion below passes over an empty set and reads exactly like a clean run.
     * Count the routes that write the column, guarded or not.
     */
    const root = process.cwd()
    const writers = collectRouteFiles(resolve(root, "app/api")).filter((file) =>
      WRITES_LOCATION_COLUMN.test(stripComments(readFileSync(file, "utf8"))),
    )
    expect(writers.length).toBeGreaterThan(5)
  })

  it("does not add a new route that stores a location id without checking it", () => {
    const flagged = findUnvalidatedLocationWrites()
    const added = flagged.filter((route) => !KNOWN_UNVALIDATED_LOCATION_WRITES.includes(route))

    expect(
      added,
      `These routes store a caller-supplied location_id without calling ` +
        `validateLocationForTenant. A foreign key does NOT see row-level security, so another ` +
        `tenant's block id is accepted, and a user restricted to some blocks can write to any ` +
        `other. See app/api/picking-records/route.ts for the established pattern.`,
    ).toEqual([])
  })

  it("keeps the allowlist accurate so a fix is noticed", () => {
    const flagged = findUnvalidatedLocationWrites()
    const fixed = KNOWN_UNVALIDATED_LOCATION_WRITES.filter((route) => !flagged.includes(route))

    expect(
      fixed,
      `These routes are listed as unvalidated but now look guarded (or were deleted or renamed). ` +
        `Remove them from KNOWN_UNVALIDATED_LOCATION_WRITES in this file.`,
    ).toEqual([])
  })

  it("recognises the handlers that were fixed, so the detector is not just matching nothing", () => {
    /**
     * ⚠ THIS ASSERTION WENT VACUOUS THE MOMENT THE DETECTOR BECAME PER-HANDLER, and it is worth
     * recording because it is the same mistake one level along. It read
     * `expect(flagged).not.toContain("app/api/journal/route.ts")` -- a bare PATH. `flagged` now
     * holds "path HANDLER" strings, so a bare path can never appear in it and the three negative
     * assertions could not fail for any state of the code.
     *
     * A negative assertion is only worth anything when the positive form is reachable, so this
     * now names handlers that really exist and checks the detector finds SOMETHING.
     */
    const flagged = findUnvalidatedLocationWrites()

    // Reachability: the detector must be flagging real handlers, or the negatives prove nothing.
    expect(flagged.length).toBeGreaterThan(0)
    expect(flagged.every((entry) => /^app\/api\/.+ (GET|POST|PUT|PATCH|DELETE)$/.test(entry))).toBe(true)

    // Fixed in #127 and in this change, and must never reappear.
    expect(flagged).not.toContain("app/api/journal/route.ts POST")
    expect(flagged).not.toContain("app/api/journal/route.ts PATCH")
    expect(flagged).not.toContain("app/api/picking-records/route.ts POST")
    expect(flagged).not.toContain("app/api/pepper-records/route.ts POST")
    expect(flagged).not.toContain("app/api/inventory-neon/route.ts POST")
    expect(flagged).not.toContain("app/api/inventory-neon/route.ts DELETE")
  })
})
