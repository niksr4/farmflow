import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * "Log today -> Labour" has to point at whichever surface actually accepts today's labour, and that
 * differs per tenant. Once an estate is on the muster, `blockedByLabourCutover` refuses a typed
 * Accounts entry dated today outright -- so the old unconditional button walked a writer into a
 * rejected write. Before an estate cuts over, the mirror image: the muster hides work allocation
 * for dates before the line, so pointing there early lands them on a roster they cannot cost.
 *
 * Both failures look like the app being broken rather than the button being aimed wrong, which is
 * why this is pinned rather than left to read correctly.
 */
const launcher = readFileSync("components/workspace-launcher.tsx", "utf8")
const shell = readFileSync("components/inventory-system.tsx", "utf8")
const bootstrap = readFileSync("app/api/dashboard/bootstrap/route.ts", "utf8")

const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "")

describe("the button follows the cutover, not a hardcoded guess", () => {
  it("chooses its handler from the flag", () => {
    expect(strip(launcher)).toContain("onClick={musterRecordsLabour ? onMuster : onAccountsLabor}")
  })

  it("chooses its label from the same flag", () => {
    // Same condition for label and destination. A button that says Muster and opens Accounts is
    // worse than either mistake alone.
    expect(strip(launcher)).toContain('{musterRecordsLabour ? "Muster" : "Labour"}')
  })

  it("does not reach the muster tab any other way", () => {
    // A second, unconditional path to "attendance" from this component would silently reintroduce
    // the bug for tenants who have not cut over.
    const musterCalls = strip(shell).match(/onMuster=\{[^}]*\}/g) ?? []
    expect(musterCalls).toEqual(['onMuster={() => handleTabChange("attendance")}'])
  })
})

describe("the flag means today, not ever", () => {
  it("compares the cutover date against today rather than testing for its presence", () => {
    // `Boolean(labourCutover)` alone would flip the button the moment a date is *scheduled*,
    // sending writers to a muster that will not cost their work until that date arrives.
    const line = strip(shell).split("\n").find((l) => l.includes("const musterRecordsLabour"))
    expect(line).toBeDefined()
    expect(line).toContain("todayIso()")
    expect(line).toContain(">=")
  })

  it("uses the same comparison the muster tab uses, so the two cannot disagree", () => {
    const tab = strip(readFileSync("components/attendance-tab.tsx", "utf8"))
    const tabLine = tab.split("\n").find((l) => l.includes("const musterRecordsLabour"))
    expect(tabLine).toContain(">=")
    expect(tabLine).toContain("assignmentsFrom")
  })
})

describe("the shell is told which way the tenant records labour", () => {
  it("bootstrap reports it", () => {
    /**
     * Keyed on WHAT the route does, not HOW it fetches it.
     *
     * This asserted the literal `labourCutover: await getLabourCutover(tenantContext)`, which broke
     * the moment that read moved into a Promise.all alongside the other two independent reads --
     * a change that did not alter this property at all. The endpoint still calls getLabourCutover
     * and still puts the result on the response; only the round-trip shape changed.
     *
     * An assertion pinned to the call's position is the identifier-fragility CLAUDE.md warns about:
     * it argues against a performance fix while proving nothing extra about correctness.
     */
    const code = bootstrap
      .split("\n")
      .filter((line) => {
        const t = line.trim()
        return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*")
      })
      .join("\n")
    // It is fetched...
    expect(code, "the route must read the cutover").toMatch(/getLabourCutover\s*\(\s*tenantContext\s*\)/)
    // ...and it reaches the response body, under that name.
    const responseBody = code.slice(code.indexOf("return NextResponse.json({", code.indexOf("const tenantId")))
    expect(responseBody, "and it must appear on the bootstrap response").toMatch(/\blabourCutover\b/)
  })

  it("reports it on the owner short-circuit too, rather than leaving it undefined", () => {
    expect(bootstrap).toContain("modules: null, locations: [], labourCutover: null")
  })

  it("the shell reads it", () => {
    expect(strip(shell)).toContain("setLabourCutover(data.labourCutover")
  })
})
