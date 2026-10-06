import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")

describe("benchmarks cross-tenant query binds exactly the parameters it references", () => {
  const source = read("app/api/benchmarks/route.ts")
  const query = source.slice(source.indexOf("FROM tenants t"), source.indexOf("HAVING COUNT"))

  it("references only $1 and $2 (two bound values: fiscal start, fiscal end)", () => {
    const placeholders = Array.from(new Set(query.match(/\$\d+/g) ?? []))
    expect(placeholders.sort()).toEqual(["$1", "$2"])
  })

  it("bounds processing days by start then end, not end then a missing third value", () => {
    expect(query).toMatch(/process_date >= \$1/)
    expect(query).toMatch(/process_date <= \$2/)
  })
})

describe("intelligence-brief cache is keyed by who is asking", () => {
  const source = read("app/api/intelligence-brief/route.ts")
  const keyLine = source.split("\n").find((line) => line.includes("const cacheKey = `intelligence-brief:")) ?? ""

  it("includes the scoped-user flag and the enabled modules", () => {
    expect(keyLine).toContain("isScopedUser")
    expect(keyLine).toContain("enabledModules")
  })
})

describe("feedback email escapes the username", () => {
  it("never interpolates sessionUser.username raw into the HTML body", () => {
    const source = read("app/api/feedback/route.ts")
    expect(source).not.toMatch(/>\$\{sessionUser\.username\}</)
    expect(source).toContain("escapeHtml(String(sessionUser.username")
  })
})

describe("worker PUT refuses an unreadable daily rate instead of wiping the stored one", () => {
  it("returns 400 when dailyRate was supplied but did not parse", () => {
    const source = read("app/api/attendance/workers/[id]/route.ts")
    expect(source).toMatch(/body\?\.dailyRate != null && \(Number\.isNaN\(Number\(body\.dailyRate\)\)/)
  })
})

describe("locations PATCH holds the same area/coordinate line as POST", () => {
  it("only writes area on a block and coordinates off a general location", () => {
    const source = read("app/api/locations/route.ts")
    expect(source).toMatch(/areaProvided && existingKind === "block"/)
    expect(source).toMatch(/coordsProvided && existingKind !== "general"/)
  })
})

describe("list endpoints clamp limit/offset", () => {
  it.each(["app/api/curing-records/route.ts", "app/api/quality-grading-records/route.ts"])("%s", (path) => {
    const source = read(path)
    expect(source).not.toMatch(/Number\(searchParams\.get\("limit"\)/)
    expect(source).toMatch(/Math\.min\(Math\.max\(Number\.parseInt\(searchParams\.get\("limit"\)/)
  })
})

describe("ai-season-compare reads today in IST", () => {
  it("does not derive todayStr from the UTC ISO string", () => {
    const source = read("app/api/ai-season-compare/route.ts")
    expect(source).toContain("const todayStr = todayIso()")
    expect(source).not.toMatch(/todayStr = today\.toISOString/)
  })
})
