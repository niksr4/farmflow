import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The muster roll is not estate-filtered, and the save must stay in step with that.
 *
 * Presence has no place -- attendance_records carries no location, and a terminal belongs to a
 * tenant rather than an estate -- so an estate filter on the roll could only match on a property
 * of the worker, while the estate of the day's work is not settled until a block is picked. It
 * also made the ordinary case impossible: with Valley selected, a Hill worker sent to Valley
 * vanished from the roll and could not be marked present where they actually were.
 *
 * The pairing below is the part worth guarding. While the roll filtered, the PUT had to scope its
 * delete to the same estate or saving one estate's sheet wiped the others' attendance for that
 * date. Now that the roll lists everyone, presentWorkerIds is complete and the delete must NOT be
 * scoped -- otherwise unticking a worker from another estate silently fails to save. Reintroduce
 * either half alone and one of those two bugs comes back.
 */
const tab = readFileSync(resolve(process.cwd(), "components/attendance-tab.tsx"), "utf8")
const route = readFileSync(resolve(process.cwd(), "app/api/attendance/route.ts"), "utf8")

describe("the muster roll lists every worker, whichever estate is selected", () => {
  it("does not filter the roster by the worker's estate", () => {
    expect(route).not.toMatch(/AND \(w\.estate IS NULL OR w\.estate = /)
    expect(route).not.toMatch(/estateClause\(/)
  })

  it("does not scope the attendance delete by estate either", () => {
    // The two are one decision. A scoped delete under an unfiltered roll drops saves.
    expect(route).not.toMatch(/estateWorkerScopeClause = activeEstate/)
    expect(route).toContain("const estateWorkerScopeClause = accountsSql``")
  })

  it("no longer explains a filter that does not happen", () => {
    // The banner told a manager why the selector changed nothing. It changes nothing by design
    // now, so the sentence is noise on every multi-estate roll, every day.
    expect(tab).not.toContain("they appear under every estate")
  })

  it("still reports which tenants run more than one estate", () => {
    // The selector itself is unaffected -- it scopes every report, where the estate is a
    // property of the recorded work rather than a guess about the person.
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
  const pickers = [
    "components/worker-profiles-tab.tsx",
    "components/tenant-settings/operations-sections.tsx",
  ]

  for (const file of pickers) {
    it(`${file} routes location labels through the shared helper`, () => {
      const src = readFileSync(resolve(process.cwd(), file), "utf8")
      expect(src).toContain("formatLocationLabel")
    })

    it(`${file} does not render a bare location name in a picker`, () => {
      const src = readFileSync(resolve(process.cwd(), file), "utf8")
      // The old worker-profiles shape also double-prefixed the estate, giving
      // "Citrus Grove — Citrus Grove – C1" for a tenant who had named things properly.
      expect(src).not.toContain("${loc.estate} — ${loc.name}")
    })
  }
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
