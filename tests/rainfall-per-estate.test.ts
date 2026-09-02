import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * Rain falls on one estate and not the other, so it has to be recordable that way.
 *
 * Asked for by Medappa 2026-09-02: "Can we capture the rainfall for citrus and Tirtha separately?
 * As of now we are capturing the data only for Tirtha on the system and citrus we are recording it
 * manually."
 *
 * THE BLOCKER WAS NOT THE MISSING COLUMN. rainfall_records carried UNIQUE (record_date,
 * tenant_id), so the second reading for a day was refused by the database whatever the screen
 * offered. Adding a picker without touching that constraint would have produced a form that looks
 * like it works and fails on save -- which is how you turn a missing feature into a bug report.
 *
 * NULL STAYS THE DEFAULT AND STAYS MEANINGFUL. Measuring rain in one place and calling it the
 * estate's rainfall is what most growers do and is not an error to be corrected. NULL reads as
 * "the whole property" and shows under every estate filter, the same convention every other
 * estate-scoped read follows -- a record with no estate is never the other estate's.
 */
const migration = readFileSync("scripts/146-rainfall-per-estate.sql", "utf8")
const route = readFileSync("app/api/rainfall/route.ts", "utf8")
const tab = readFileSync("components/rainfall-tab.tsx", "utf8")

describe("the database allows one reading per estate per day", () => {
  it("drops the blanket one-per-day constraint that made this impossible", () => {
    expect(migration).toContain("DROP CONSTRAINT IF EXISTS rainfall_records_record_date_tenant_id_key")
  })

  it("drops the constraint before the index it owns, or the migration aborts half-applied", () => {
    const dropConstraint = migration.indexOf("DROP CONSTRAINT IF EXISTS rainfall_records_record_date")
    const dropIndex = migration.indexOf("DROP INDEX IF EXISTS rainfall_records_record_date")
    expect(dropConstraint).toBeGreaterThan(-1)
    expect(dropIndex).toBeGreaterThan(dropConstraint)
  })

  it("replaces it with two PARTIAL indexes, not one plain one", () => {
    // A plain UNIQUE (tenant_id, record_date, estate) lets a tenant record the same day twice with
    // a NULL estate, because Postgres treats NULLs as distinct -- silently reintroducing the
    // duplicate-per-day for every single-estate tenant, which is all of them but two.
    expect(migration).toContain("WHERE estate IS NULL")
    expect(migration).toContain("WHERE estate IS NOT NULL")
  })

  it("does not guess where the existing readings were taken", () => {
    expect(migration).not.toMatch(/UPDATE rainfall_records\s+SET estate/i)
  })

  it("carries the ON CONFLICT warning, since partial indexes are how expenses broke", () => {
    expect(migration).toContain("MUST REPEAT THE")
  })
})

describe("the route knows which estate a reading belongs to", () => {
  it("scopes reads to the active estate but keeps whole-property readings", () => {
    expect(route).toContain("AND (estate IS NULL OR estate = ${activeEstate})")
  })

  it("checks the estate against the tenant's own, so a typo cannot invent one", () => {
    // "Tirtha" instead of "Tirtha Estate" would not fail -- it would create a third estate that
    // exists only in this table and is invisible to the estate selector.
    expect(route).toContain("async function resolveEstate")
    expect(route).toContain("is not one of your estates")
  })

  it("writes it on both create and edit", () => {
    expect(route).toContain("${resolved.estate}")
    expect(route).toContain("estate = ${editEstate.estate}")
  })

  it("names the estate when refusing a duplicate", () => {
    // "A record for this date already exists" reads as "you already did today" to a two-estate
    // grower who has only done the other one.
    expect(route).toContain("already exists for ${attemptedEstate}")
  })
})

describe("the form only asks when there is something to ask", () => {
  it("shows the picker only for tenants with more than one estate", () => {
    expect((tab.match(/estates\.length > 1/g) ?? []).length).toBe(2) // mobile and desktop
  })

  it("defaults to the whole property rather than forcing a choice", () => {
    expect(tab).toContain('<option value="">Whole property</option>')
    expect(tab).toContain('const [estate, setEstate] = useState("")')
  })

  it("sends null rather than an empty string, so the partial index applies", () => {
    expect(tab).toContain("estate: estate || null")
  })

  it("prefills on edit and clears on reset", () => {
    expect(tab).toContain('setEstate(record.estate || "")')
    expect(tab).toContain('setEstate("")')
  })

  it("labels each record with its estate, so two readings on one day are not read as a duplicate", () => {
    expect((tab.match(/record\.estate &&/g) ?? []).length).toBe(2)
  })
})
