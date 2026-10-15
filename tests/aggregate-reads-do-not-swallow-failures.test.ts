import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * A read that failed must not be reported as a read that found nothing. These routes sum
 * season/labour/processing figures; when a query was wrapped in `.catch(() => [])` (or a
 * try/catch that only logged), an outage became a believable zero -- the AI season comparison
 * narrated "0 kg pulped" and cached it for four hours, and the AI charts drew an empty season.
 * A rejection must propagate to the route's outer handler, which returns a sanitized 500.
 */
const ROUTES = ["app/api/ai-season-compare/route.ts", "app/api/ai-charts-data/route.ts"]

describe("aggregate reads do not turn a failed query into zero rows", () => {
  for (const route of ROUTES) {
    const source = readFileSync(resolve(__dirname, "..", route), "utf8")

    it(`${route} has no .catch(() => []) fallback`, () => {
      expect(source).not.toMatch(/\.catch\(\s*\(\s*\)\s*=>\s*\[\s*\]\s*\)/)
    })

    it(`${route} has no log-and-continue try/catch around a read`, () => {
      expect(source).not.toMatch(/console\.error\("Error fetching (labour|processing) data:"/)
    })
  }
})
