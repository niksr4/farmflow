import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * A module scaffolded from templates/module-template starts life as a copy of these files, so
 * whatever the template gets wrong, every new module gets wrong. The template is also outside the
 * app/ tree that the repo's other source-scan guards (tests/mutation-route-role-guard.test.ts, the
 * IST date guards) walk, so it needs its own check.
 */
const route = readFileSync("templates/module-template/route.ts", "utf8")
const tab = readFileSync("templates/module-template/module-tab.tsx", "utf8")

describe("module template route", () => {
  it("checks the caller's role before writing, not just that the module is enabled", () => {
    const post = route.slice(route.indexOf("export async function POST"))
    expect(post).toContain("canWriteModule(sessionUser.role")
    // The role check has to come before the insert, or it guards nothing.
    expect(post.indexOf("canWriteModule(")).toBeLessThan(post.indexOf("INSERT INTO"))
  })

  it("does not hand undefined to the driver when no location is sent", () => {
    expect(route).toContain("payload.location_id ?? null")
  })
})

describe("module template tab", () => {
  it("stamps new records with the estate day (IST), not the UTC date", () => {
    expect(tab).toContain("istDateIso(new Date())")
    expect(tab).not.toContain("toISOString().slice(0, 10)")
  })

  it("reloads the list and confirms after a successful save", () => {
    const save = tab.slice(tab.indexOf("const handleSave"))
    expect(save).toContain("await loadRecords()")
    expect(save).toContain('title: "Saved"')
  })

  it("treats a non-ok or success:false load as a failure rather than empty data", () => {
    const load = tab.slice(tab.indexOf("const loadRecords"), tab.indexOf("const handleSave"))
    expect(load).toContain("!res.ok || !data.success")
  })
})
