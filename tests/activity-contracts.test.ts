import { readdirSync, readFileSync, statSync } from "node:fs"
import { relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"

import {
  ACTIVITY_MODULES,
  ACTIVITY_SOURCES,
  isActivityModule,
  isActivitySource,
} from "@/lib/activity-contracts"

/**
 * This codebase spells labour both ways deliberately -- labor_transactions is a table, labour_cost
 * is a view over it -- and every human-facing label says "Labour" because the growers are Indian.
 * That is fine until a spelling becomes an identifier crossing a boundary.
 *
 * It happened twice, both silent:
 *   - activity-log-tab filtered on "labour" against a route validating "labor", so the route
 *     ignored the value and returned everything. A filter that appeared to work.
 *   - smart-next-steps compared module === "labour" against a route emitting "labor", so the
 *     "Review labour visibility" step could never fire, and never had.
 */

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const p = resolve(dir, entry)
    if (statSync(p).isDirectory()) return entry === "node_modules" ? [] : walk(p)
    return /\.(ts|tsx)$/.test(entry) ? [p] : []
  })

const root = process.cwd()
const sources = ["app", "components", "lib", "hooks"]
  .flatMap((d) => walk(resolve(root, d)))
  .map((f) => ({
    rel: relative(root, f).split("\\").join("/"),
    // Comments stripped: lib/activity-contracts.ts quotes the broken comparison while explaining
    // it, and an assertion that forbids documenting a bug is an assertion that deletes the reason.
    body: readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, ""),
    raw: readFileSync(f, "utf8"),
  }))

describe("the identifier is 'labor', the label is 'Labour'", () => {
  it("both contracts use the American spelling as the identifier", () => {
    expect(ACTIVITY_MODULES).toContain("labor")
    expect(ACTIVITY_SOURCES).toContain("labor")
    expect(ACTIVITY_MODULES).not.toContain("labour")
    expect(ACTIVITY_SOURCES).not.toContain("labour")
  })

  it("rejects the British spelling at runtime too", () => {
    expect(isActivityModule("labour")).toBe(false)
    expect(isActivitySource("labour")).toBe(false)
    expect(isActivityModule("labor")).toBe(true)
    expect(isActivitySource("labor")).toBe(true)
  })
})

describe("nothing compares an activity module or source against 'labour'", () => {
  // The two real bugs were both this exact shape: a comparison or a lookup key that can never
  // match. Grep for it directly, because the type system cannot see across a `string`.
  const OFFENDERS = [
    /\.module\s*===\s*["']labour["']/,
    /\bsource\s*===\s*["']labour["']/,
    /\bsource:\s*["']labour["']/,
    /\bmodule:\s*["']labour["']/,
  ]

  it.each(OFFENDERS.map((re) => [re.source, re] as const))("no file matches %s", (_label, re) => {
    const hits = sources.filter((f) => re.test(f.body)).map((f) => f.rel)
    expect(hits, `these compare an identifier against the British spelling`).toEqual([])
  })
})

describe("neither side keeps a private copy of the vocabulary", () => {
  // A contract written in two places is not a contract. Both bugs existed because the route
  // declared it correctly and the client declared it again, differently.
  it("the routes import the shared unions rather than redeclaring them", () => {
    for (const rel of ["app/api/recent-activity/route.ts", "app/api/admin/tenant-activity/route.ts"]) {
      const body = sources.find((f) => f.rel === rel)!.body
      expect(body, `${rel} should import the contract`).toContain("@/lib/activity-contracts")
    }
  })

  it("activity-log-tab builds its filter options from the contract", () => {
    const body = sources.find((f) => f.rel === "components/activity-log-tab.tsx")!.body
    expect(body).toContain("ACTIVITY_SOURCES.map")
    // A hand-written option list is how the spelling drifted in the first place.
    expect(body).not.toMatch(/\{ value: "labor", label: "Labour" \}/)
  })
})

describe("display text stays British, because the growers are", () => {
  it("the label for the labor source still reads Labour", () => {
    const body = sources.find((f) => f.rel === "lib/activity-contracts.ts")!.raw
    expect(body).toContain('labor: "Labour"')
  })
})
