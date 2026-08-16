import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * Two routes silently ignored the header estate selector: the ops export (a tenant with two
 * estates picked one, hit export, and got a file containing both) and the AI analysis charts
 * (which chart by location, so another estate's data appeared as extra series). Every other
 * read endpoint already filtered, so both disagreed with the screen they were launched from.
 *
 * The fix is one shared `estateScope()` fragment applied to every location-bearing query. The
 * failure mode it replaced is quiet -- a wrong export looks like a valid export -- and it comes
 * back the moment someone adds another dataset and forgets the clause. So the invariant is
 * asserted structurally rather than by example: any query that joins `locations` must scope.
 *
 * Deliberately not applied repo-wide: plenty of routes join `locations` and correctly do not
 * scope (the admin location-assignment screens need every estate, and fetching one worker by
 * id has nothing to filter). This guards the two routes where scoping is the contract.
 */
const SCOPED_ROUTES = [
  { path: "app/api/exports/ops/route.ts", minJoiningQueries: 8, probe: "FROM processing_records" },
  // Labour comes from the labour_cost view now, so the estate filter has to survive that move --
  // scoping a view is exactly as necessary as scoping the table it replaced. See scripts/117.
  { path: "app/api/ai-charts-data/route.ts", minJoiningQueries: 2, probe: "FROM labour_cost" },
] as const

/**
 * Extracts each sql`...` template literal. Tracks ${} nesting so an interpolation never ends the
 * literal early; none of the interpolations in this route contain a nested backtick.
 */
function sqlTemplates(source: string): string[] {
  const templates: string[] = []
  const marker = "sql`"

  for (let start = source.indexOf(marker); start !== -1; start = source.indexOf(marker, start + 1)) {
    let depth = 0
    let i = start + marker.length

    for (; i < source.length; i++) {
      const char = source[i]
      if (char === "\\") {
        i++
        continue
      }
      if (char === "$" && source[i + 1] === "{") {
        depth++
        i++
        continue
      }
      if (char === "}" && depth > 0) {
        depth--
        continue
      }
      if (char === "`" && depth === 0) break
    }

    templates.push(source.slice(start, i))
  }

  return templates
}

describe.each(SCOPED_ROUTES)("estate scoping in $path", ({ path, minJoiningQueries, probe }) => {
  const source = readFileSync(path, "utf8")
  const templates = sqlTemplates(source)

  it("finds the route's queries", () => {
    // Guards the parser itself -- a broken scanner would vacuously pass every assertion below.
    expect(templates.length).toBeGreaterThanOrEqual(minJoiningQueries)
    expect(templates.some((t) => t.includes(probe))).toBe(true)
  })

  it("scopes every query that joins locations to the selected estate", () => {
    const joining = templates.filter((t) => /LEFT JOIN locations l\b/.test(t))
    expect(joining.length).toBeGreaterThanOrEqual(minJoiningQueries)

    const unscoped = joining
      .filter((t) => !t.includes("estateScope("))
      .map((t) => t.match(/FROM\s+(\w+)/)?.[1] ?? "unknown")

    expect(unscoped).toEqual([])
  })

  it("never scopes a query that has no locations join to hang the clause off", () => {
    // labor/expenses fall back to a location-less query on schemas without location_id, and
    // rainfall has no location at all. `estateScope` references the `l` alias, so applying it
    // there would be a SQL error rather than a silently wrong result.
    const orphaned = templates.filter(
      (t) => t.includes("estateScope(") && !/LEFT JOIN locations l\b/.test(t),
    )
    expect(orphaned).toEqual([])
  })

  it("keeps records with no location visible under every estate", () => {
    // The always-NULL-shows convention in lib/estate-filter.ts: an unassigned record is not the
    // other estate's, so the filter must never drop it. Without this the route would quietly
    // lose rows that the screen still shows.
    const clause = source.match(/const estateScope[\s\S]*?\n\n/)?.[0] ?? ""
    expect(clause).toContain("l.id IS NULL")
  })

  it("is a no-op when no estate is selected", () => {
    // Keeps the single-estate path -- which is every tenant but one today -- unchanged.
    const clause = source.match(/const estateScope[\s\S]*?\n\n/)?.[0] ?? ""
    expect(clause).toMatch(/IS NULL OR/)
  })

  it("reads the estate from the header selector, not just an explicit query param", () => {
    // The callers do not pass ?estate= -- the selection lives in the cookie -- so resolving
    // only from searchParams would leave the route unfiltered in exactly the case that matters.
    expect(source).toContain("SELECTED_ESTATE_COOKIE")
    expect(source).toContain("resolveActiveEstate")
  })
})
