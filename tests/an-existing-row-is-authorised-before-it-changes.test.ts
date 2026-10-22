import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * AUTHORIZE THE ROW YOU ARE ABOUT TO CHANGE, NOT ONLY THE VALUE YOU ARE CHANGING IT TO.
 *
 * `tests/location-id-is-tenant-validated.test.ts` guards the first half of this: an INCOMING
 * location_id must belong to the tenant. This is the other half, and it is a different class.
 *
 * An existing-row lookup is tenant-scoped (`WHERE id = $1 AND tenant_id = $2`), which stops
 * cross-tenant access and nothing else. A `user` carrying a location allow-list who knows a row's
 * id still finds that row even when it belongs to a block they cannot write to. So:
 *
 *   - journal PATCH validated the REPLACEMENT location and never the entry's own, and when the
 *     payload omitted location_id no check ran at all;
 *   - picking-records/[id] PATCH the same, on a row that carries WAGES;
 *   - pepper-records DELETE checked its id branch but not its date-plus-location branch.
 *
 * All three modules are in USER_MUTATION_MODULES, so a writer reaches every one of these handlers.
 * Raised as three Majors on #127 and fixed together.
 *
 * ⚠ THE ASSERTION IS AN ORDERING, NOT A PRESENCE. "requireLocationAccess appears in this handler"
 * is satisfied by a call placed AFTER the UPDATE, which authorizes nothing. Every index below is
 * asserted to have been found before it is compared, because `indexOf` returning -1 is how a
 * comparison silently becomes true -- that trap has already cost this repo one vacuous guard.
 */

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<![:"'\\])\/\/.*$/gm, "")

const routeSource = (relativePath: string) =>
  stripComments(readFileSync(resolve(process.cwd(), relativePath), "utf8"))

/** The named exported handler's body, so a call in a sibling handler cannot stand in for it. */
const handlerBody = (source: string, method: string) => {
  const pattern = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\s*\\(`)
  const start = source.search(pattern)
  expect(start, `${method} handler not found -- renamed?`).toBeGreaterThan(-1)
  const next = source.slice(start + 1).search(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/)
  return next === -1 ? source.slice(start) : source.slice(start, start + 1 + next)
}

/** Mutating statements, whichever table they name. */
const MUTATION = /\b(?:UPDATE\s+\w+|DELETE\s+FROM\s+\w+)/g

type Case = {
  label: string
  path: string
  method: string
  /**
   * How many authorisation calls this handler must contain.
   *
   * ⚠ A COUNT, NOT A PRESENCE, AND THIS IS THE SECOND TIME TODAY. The first version used
   * `indexOf("requireLocationAccess(")` and compared it to the mutation offsets. pepper-records
   * DELETE has TWO branches -- a lookup by id and a lookup by date plus location -- each with its
   * own authorisation and its own DELETE. Removing the second one left the first, which sits
   * before every mutation, so the ordering still held and the guard passed over an unguarded
   * branch.
   *
   * That is the same coarse-scope mistake CodeRabbit found in
   * tests/location-id-is-tenant-validated.test.ts one commit earlier: checking a container when
   * the defect lives in one of its parts. Counting the branches is the cheapest honest fix.
   */
  minAuthorisations: number
}

const CASES: Case[] = [
  { label: "journal PATCH", path: "app/api/journal/route.ts", method: "PATCH", minAuthorisations: 1 },
  // ⚠ PUT, not PATCH. The review called it a PATCH and this test copied that; the route exports
  // PUT, so the handler lookup found nothing and the assertions would have inspected an empty
  // string. The "handler not found -- renamed?" assertion is the only reason that surfaced.
  { label: "picking-records/[id] PUT", path: "app/api/picking-records/[id]/route.ts", method: "PUT", minAuthorisations: 1 },
  // Two branches, two authorisations: by id, and by date plus location.
  { label: "pepper-records DELETE", path: "app/api/pepper-records/route.ts", method: "DELETE", minAuthorisations: 2 },
]

describe("an existing row is authorised before it changes", () => {
  it.each(CASES)("$label authorises the row it found", ({ path, method, minAuthorisations }) => {
    const body = handlerBody(routeSource(path), method)

    const authorisations = [...body.matchAll(/requireLocationAccess\s*\(/g)].map((m) => m.index ?? -1)
    expect(
      authorisations.length,
      `expected at least ${minAuthorisations} authorisation call(s) -- one per branch that mutates`,
    ).toBeGreaterThanOrEqual(minAuthorisations)
    const authorise = authorisations[0]

    // Vacuity: if the handler mutates nothing, the ordering assertion below proves nothing.
    const mutations = [...body.matchAll(MUTATION)].map((match) => match.index ?? -1)
    expect(mutations.length, "no UPDATE or DELETE found in this handler").toBeGreaterThan(0)

    /**
     * EVERY mutation must come after the authorisation. Checking only the first would pass a
     * handler that authorises, updates, and then deletes something else unguarded.
     */
    for (const at of mutations) {
      expect(at, `a mutation at ${at} runs before requireLocationAccess at ${authorise}`).toBeGreaterThan(authorise)
    }
  })

  it.each(CASES)("$label reads the location off the ROW, not off the request body", ({ path, method }) => {
    const body = handlerBody(routeSource(path), method)
    /**
     * `requireLocationAccess(d.locationId)` would authorise where the row is GOING, which is the
     * bug restated. The argument has to come from the fetched row.
     */
    const call = body.slice(body.indexOf("requireLocationAccess("))
    const argument = call.slice("requireLocationAccess(".length, call.indexOf(")"))
    expect(argument).toMatch(/exist/i)
    expect(argument).toContain("location_id")
  })

  it.each(CASES)("$label turns the refusal into a 403 rather than a 500", ({ path, method }) => {
    /**
     * requireLocationAccess THROWS. Without the catch arm the route answers 500, which reads as
     * "FarmFlow is broken" rather than "you may not touch that block" -- and a 500 is what gets
     * chased as an incident.
     */
    /**
     * ⚠ SCOPED TO THE HANDLER. Checking the whole file passed a tamper that removed PATCH's catch
     * arm, because journal's POST has one too -- the same coarse-scope error as above.
     */
    const body = handlerBody(routeSource(path), method)
    expect(body).toMatch(/isLocationAccessError\s*\(\s*error\s*\)/)
    expect(body).toMatch(/status:\s*403/)
  })

  it("covers every route the review named, so the list cannot quietly shrink", () => {
    expect(CASES.map((entry) => `${entry.path} ${entry.method}`).sort()).toEqual([
      "app/api/journal/route.ts PATCH",
      "app/api/pepper-records/route.ts DELETE",
      "app/api/picking-records/[id]/route.ts PUT",
    ])
  })
})
