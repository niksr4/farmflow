import { globSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * REVERSED 2026-08-25. This file used to assert that the muster roll is NOT estate-filtered and
 * that the PUT's delete is correspondingly unscoped.
 *
 * The reasoning was that presence has no place -- attendance_records carries no location, and a
 * terminal belongs to a tenant rather than an estate -- so an estate filter on the roll could only
 * match a property of the worker, not of the work. That is still true. It stopped being the
 * deciding argument once thirty-four other routes honoured the selector and this was one of two
 * that did not: a selector that scopes the whole app except one screen is worked around, not
 * understood.
 *
 * The objection it recorded does not hold either. A Hill worker sent to Valley does not become
 * unmarkable, because presence is one row per person per day, tenant-wide -- they are marked once
 * on the roll they belong to, and where they WORK is the block on the allocation, which is not
 * estate-fenced.
 *
 * The pairing this file was really protecting is still the point and now lives in
 * tests/muster-estate-scope.test.ts: roll and delete must be scoped together or one of two bugs
 * appears -- an unscoped delete under a scoped roll destroys the other estate's attendance, and a
 * scoped delete under an unscoped roll silently drops saves.
 *
 * What remains below is everything in this file that never depended on that decision.
 */
const tab = readFileSync(resolve(process.cwd(), "components/attendance-tab.tsx"), "utf8")
const route = readFileSync(resolve(process.cwd(), "app/api/attendance/route.ts"), "utf8")

describe("the estate selector and the muster", () => {
  it("does not explain away a filter, now that the filter works", () => {
    // The banner told a manager why the selector changed nothing on this screen. It changes
    // something now, so there is nothing to explain and the sentence would be wrong as well as
    // noisy.
    expect(tab).not.toContain("they appear under every estate")
  })

  it("still reports which tenants run more than one estate", () => {
    // Drives whether the estate controls appear at all. Unaffected by the reversal.
    expect(route).toContain("COUNT(DISTINCT estate)::int AS estate_count")
  })
})

describe("relay drops non-device traffic", () => {
  const relay = readFileSync(resolve(process.cwd(), "relay/relay.mjs"), "utf8")

  it("rejects a request with no usable dev_id before forwarding", () => {
    // A public port collects background scanning. Each such request was being forwarded,
    // rejected upstream, and writing a security_events row -- 18 in 14 hours, which tripped the
    // log-anomaly alert. A real terminal always sends dev_id, so this has no false positives.
    expect(relay).toContain("req.headers.dev_id")
    const guard = relay.slice(relay.indexOf("Drop anything that is not a terminal"), relay.indexOf("const forwarded"))
    expect(guard).toContain("400")
    expect(guard).toContain("return")
  })
})

describe("location pickers disambiguate colliding names", () => {
  // Laxmi named all four of their blocks "Laxmi" and kept the block identity in `code`
  // (HOUSE-BLOCK, LAXMI-STORE-BLOCK, LAXMI-MEKOOR-BLOCK, GEETHA-BLOCK). Any picker rendering
  // only `name` shows four identical rows, which is how 42 labour records ended up scattered
  // across three of them.
  /**
   * ⚠ THIS GUARD USED TO PASS ON A DEAD IMPORT.
   *
   * It asserted `expect(src).toContain("formatLocationLabel")` — satisfied by the import line
   * alone. components/worker-profiles-tab.tsx imported the helper and never called it, and the
   * test went green on the mention. Found on 2026-09-17 by turning on tsc's --noUnusedLocals,
   * which reported the import as never read; the guard had been asserting nothing for that file.
   *
   * Two changes. The check is now for a CALL, with import lines stripped first, so a mention can
   * never satisfy it again. And worker-profiles-tab is off the list on its merits: it renders
   * ESTATE names (`loc.estate`, deduped through a Set), not location names, and has no location
   * picker to disambiguate. It fetched `locations` purely to derive that estate set.
   */
  const locationPickers = ["components/tenant-settings/operations-sections.tsx"]

  const withoutImports = (src: string) =>
    src
      .split("\n")
      .filter((line) => !/^\s*import\b/.test(line) && !/^\s*}\s*from\s*['"]/.test(line))
      .join("\n")

  for (const file of locationPickers) {
    it(`${file} CALLS the shared helper, not merely imports it`, () => {
      const src = readFileSync(resolve(process.cwd(), file), "utf8")
      expect(withoutImports(src)).toMatch(/\b(formatLocationLabel|buildLocationLabelMap)\s*\(/)
    })
  }

  /**
   * ⚠ THIS SCAN WAS TOO NARROW AND REPORTED A FALSE CLEAN BILL. Raised by Greptile on PR #26.
   *
   * The first version matched `<SelectItem …>{loc.name}</SelectItem>` — hardcoding both the JSX
   * element and the callback variable name. It therefore missed every real offender, because real
   * code does not use those names:
   *
   *   components/attendance/worker-allocation.tsx      `{l.name}` in a <SelectItem>
   *   components/accounts/labour-cost-summary.tsx      `{b.name}` in an <option>
   *
   * Both were live block pickers. A guard written to catch bare location names found none while
   * two sat in the tree — the same "reports success having checked nothing" failure as the
   * `toContain` assertion it replaced, committed in the very act of fixing it.
   *
   * Now keyed on SHAPE, not names: an entity picker is `value={X.id}` labelled `{X.name}` for the
   * same X, whatever X is and whatever the element. That matches 10 sites, of which 3 were
   * locations; the other 7 are workers, buyers, tenants and certifications, listed below. A new
   * picker is an unrecognised entry and fails until somebody classifies it.
   */
  const ENTITY_PICKER = /<(?:SelectItem|option)\b[^>]*\bvalue=\{(\w+)\.id\}[^>]*>\s*\{\s*\1\.name\s*\}/

  /** Pickers over something that is NOT a location, and why that is fine. */
  const NOT_LOCATIONS: Record<string, string> = {
    "components/admin/tenant-operations-sections.tsx": "tenants",
    "components/attendance-device-settings.tsx": "workers",
    "components/attendance-scanner-tab.tsx": "workers",
    "components/compliance-tab.tsx": "certifications",
    "components/market-pricing-tab.tsx": "buyers",
    "components/picking-log-tab.tsx": "workers",
  }

  it("no picker renders a bare location name — whatever the element or variable is called", () => {
    const offenders = globSync("components/**/*.tsx", { cwd: process.cwd() })
      .filter((file) => {
        if (file in NOT_LOCATIONS) return false
        return ENTITY_PICKER.test(readFileSync(resolve(process.cwd(), file), "utf8"))
      })
      .sort()
    expect(offenders).toEqual([])
  })

  it("the not-a-location list carries no file that stopped having a picker", () => {
    // Otherwise an exemption outlives its reason and quietly covers a future location picker
    // added to the same file.
    const stale = Object.keys(NOT_LOCATIONS).filter(
      (file) => !ENTITY_PICKER.test(readFileSync(resolve(process.cwd(), file), "utf8")),
    )
    expect(stale).toEqual([])
  })

  it("does not double-prefix the estate onto the location name", () => {
    // The old worker-profiles shape gave "Citrus Grove — Citrus Grove – C1" for a tenant who had
    // named things properly.
    const offenders = globSync("components/**/*.tsx", { cwd: process.cwd() }).filter((file) =>
      readFileSync(resolve(process.cwd(), file), "utf8").includes("${loc.estate} — ${loc.name}"),
    )
    expect(offenders).toEqual([])
  })
})

describe("estate discoverability", () => {
  const src = readFileSync(resolve(process.cwd(), "components/tenant-settings/operations-sections.tsx"), "utf8")

  it("hints that estates exist when a tenant has locations but no grouping", () => {
    // Estates are a label typed onto a location, not an entity you create -- which is good for
    // the single-estate majority but leaves no way to discover the feature. Even the product
    // owner did not know it was there.
    expect(src).toContain("Run more than one estate?")
  })

  it("stays hidden once estates are in use, and for trivially small setups", () => {
    expect(src).toContain("locations.length > 2 && estateSuggestions.length === 0")
  })
})
