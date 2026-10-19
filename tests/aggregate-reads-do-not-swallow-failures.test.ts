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
    /**
     * ⚠ COMMENTS STRIPPED, AND IT IS LOAD-BEARING. This guard forbids `.catch(() => [])`, and the
     * fix that removed it documents the old pattern VERBATIM:
     *
     *   // These aggregates each used to end in `.catch(() => [])`, so a failed query arrived as
     *
     * So the raw scan matched its own explanation and failed over correct code. Found on
     * 2026-10-19 while merging this PR into a main that already carried the attemptRead fix from
     * #88 -- the code was right and the guard was wrong.
     *
     * This is the FOURTH time this exact trap has fired in this repo (a-failed-read-is-not-a-zero,
     * seeding-cannot-wipe-a-real-estate, every-error-boundary-reports, and now this one). If you
     * are writing a scan over source, strip comments first.
     */
    const stripComments = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")
    const source = stripComments(readFileSync(resolve(__dirname, "..", route), "utf8"))

    it(`${route} has no .catch(() => []) fallback`, () => {
      expect(source).not.toMatch(/\.catch\(\s*\(\s*\)\s*=>\s*\[\s*\]\s*\)/)
    })

    it(`${route} has no log-and-continue try/catch around a read`, () => {
      expect(source).not.toMatch(/console\.error\("Error fetching (labour|processing) data:"/)
    })
  }
})
