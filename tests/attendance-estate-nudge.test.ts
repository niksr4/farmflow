import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The estate selector works, but on a multi-estate tenant it can silently do nothing.
 *
 * Unassigned workers show under EVERY estate (the always-NULL-shows convention), so Medappa --
 * 21 locations across two estates, all 24 workers unassigned -- gets an identical roster whichever
 * estate is selected, with nothing explaining why. Labour filters correctly because those records
 * do carry a location, which makes the attendance case more confusing, not less.
 */
const tab = readFileSync(resolve(process.cwd(), "components/attendance-tab.tsx"), "utf8")
const route = readFileSync(resolve(process.cwd(), "app/api/attendance/route.ts"), "utf8")

describe("unassigned-worker nudge", () => {
  it("only counts unassigned workers on a multi-estate tenant", () => {
    // Laxmi has 20 unassigned workers and one estate; telling them would be pure noise.
    expect(tab).toContain("isMultiEstate ? workers.filter((w) => !w.locationId) : []")
  })

  it("derives multi-estate from distinct estates, not location count", () => {
    // Two locations under one estate is not a multi-estate tenant -- same rule the estate
    // picker itself uses.
    expect(route).toContain("COUNT(DISTINCT estate)::int AS estate_count")
    expect(route).toContain("isMultiEstate:")
  })

  it("explains the consequence, not just the count", () => {
    // "23 workers unassigned" is not actionable; "they appear under every estate" is.
    expect(tab).toContain("they appear under every estate")
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
