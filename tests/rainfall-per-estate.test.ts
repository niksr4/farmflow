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

/**
 * Every figure on this tab was written when the database allowed exactly one record per day per
 * tenant, so all of them simply added whatever rows they were handed. Migration 146 removed that
 * constraint an hour before this was caught.
 *
 * RAINFALL IS A DEPTH, NOT A QUANTITY. Two inches at Tirtha and two at Citrus is two inches of
 * rain on the property, not four. Simulated against a week of both Medappa gauges reporting:
 * 12.25" of actual rain was being reported as 24.50", and a month of it as 108.5" against 54.25".
 * Delivered with total confidence, on the tab of the tenant who asked for the feature.
 */
describe("two gauges on one day is not twice the rain", () => {
  it("collapses the day to one figure instead of summing rows", () => {
    expect(tab).toContain("const byDate = new Map<string,")
    expect(tab).toContain("entry.values.reduce((sum, v) => sum + v, 0) / entry.values.length")
  })

  it("the export averages too, rather than keeping whichever row came first", () => {
    // Was `if (!yearMap.has(dateKey))` — one gauge's number printed as the property's, in a
    // spreadsheet somebody files, with no hint that half the readings were dropped.
    expect(tab).not.toContain("if (!yearMap.has(dateKey))")
    expect(tab).toContain("const prior = yearMap.get(dateKey)")
  })

  it("counts how many days were averaged, so the screen can say so", () => {
    expect(tab).toContain("const averagedDayCount")
    expect(tab).toContain("(r.gaugeCount ?? 1) > 1")
  })

  it("discloses it on both layouts rather than passing an average off as a measurement", () => {
    expect((tab.match(/averagedDayCount > 0 &&/g) ?? []).length).toBe(2)
    expect((tab.match(/the average, not the sum/g) ?? []).length).toBe(2)
  })

  it("stays silent when nothing was averaged", () => {
    // A single-estate tenant, or any estate actually selected, must see no notice at all.
    expect(tab).not.toMatch(/averagedDayCount >= 0/)
  })
})

/**
 * Fixing the tab was half the job.
 *
 * Migration 146 broke an assumption every reader of rainfall_records shared -- one row per day per
 * tenant -- and a sweep found five more places that simply added whatever rows they were handed.
 * Three of them post the number to a customer by email, where a doubled figure is one the estate
 * reads and believes. This is the same shape as the missing-rate check that two screens got wrong
 * the same way, and the ON CONFLICT that was right in five places and wrong in one.
 *
 * scripts/147 defines the collapse once, as a view, so the sixth consumer inherits it instead of
 * having to remember.
 */
const VIEW_SQL = readFileSync("scripts/147-rainfall-daily-view.sql", "utf8")
const RAINFALL_AGGREGATORS = [
  "lib/server/agents/digest-shared.ts",
  "lib/server/agents/weekly-digest-agent.ts",
  "lib/server/agents/daily-digest-agent.ts",
  "app/api/intelligence-brief/route.ts",
  "app/api/yield-forecast/route.ts",
]

describe("nothing sums rainfall rows behind the view's back", () => {
  it("the view averages the gauges rather than adding them", () => {
    expect(VIEW_SQL).toContain("AVG(inches + cents::numeric / 100)")
    expect(VIEW_SQL).not.toMatch(/SUM\(inches/)
  })

  it("runs as the caller, so it is not an RLS bypass wearing a helpful name", () => {
    expect(VIEW_SQL).toContain("security_invoker = true")
    expect(VIEW_SQL).toContain("147: rainfall_daily must be security_invoker")
  })

  it("every aggregating consumer reads the view", () => {
    for (const file of RAINFALL_AGGREGATORS) {
      expect(readFileSync(file, "utf8"), `${file} should aggregate rainfall_daily`).toContain("rainfall_daily")
    }
  })

  it("and none of them still adds the raw rows", () => {
    // The whole-app check, not just the known five: a new caller summing rainfall_records is the
    // same bug again, and it will not announce itself.
    const offenders: string[] = []
    for (const dir of ["app", "lib", "components"]) {
      const walk = (d: string): string[] => {
        const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs")
        const { resolve } = require("node:path") as typeof import("node:path")
        const out: string[] = []
        for (const entry of readdirSync(d)) {
          const p = resolve(d, entry)
          if (statSync(p).isDirectory()) out.push(...walk(p))
          else if (/\.tsx?$/.test(entry)) out.push(p)
        }
        return out
      }
      for (const file of walk(dir)) {
        const src = readFileSync(file, "utf8")
        if (/SUM\(\s*(COALESCE\()?inches/i.test(src)) offenders.push(file.slice(file.indexOf(dir)))
      }
    }
    expect(offenders, "these add rainfall rows together; rain is a depth, not a quantity").toEqual([])
  })
})
