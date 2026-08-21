import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * A writer (role=user) can now open Settings. What they must see there is their own language and
 * their own password -- both of which the API has always allowed them to change -- and nothing
 * else. The risk this pins is not today's list but tomorrow's: a section pushed unconditionally
 * becomes visible to writers silently, which is exactly how People behaved before this change.
 */
const page = readFileSync("components/tenant-settings-page.tsx", "utf8")
const route = readFileSync("app/settings/page.tsx", "utf8")

const ADMIN_ONLY = [
  "estate-identity",
  "estate-profile",
  "display-preferences",
  "thresholds",
  "data-import",
  "locations",
  "tenant-users",
  "user-module-overrides",
  "tenant-modules",
  "audit-log",
]

describe("a writer reaches their own settings", () => {
  it("is no longer redirected away", () => {
    expect(route).not.toMatch(/role === "user"[\s\S]{0,60}redirect\("\/dashboard"\)/)
  })

  it("still sends an unfinished setup to the guided flow", () => {
    expect(route).toContain('redirect("/welcome")')
  })
})

describe("and sees only what is theirs", () => {
  // The section list is built once; anything not behind a role check is visible to everyone.
  const listBlock = page.slice(page.indexOf("const sectionLinks"), page.indexOf("const settingsShellStats"))

  it.each(ADMIN_ONLY)("%s is behind a role check", (id) => {
    const idx = listBlock.indexOf(`id: "${id}"`)
    expect(idx, `${id} is not in the section list at all`).toBeGreaterThan(-1)
    const before = listBlock.slice(0, idx)
    // Either inside the isAdminOrOwner spread, or pushed inside a role-gated if.
    expect(
      /isAdminOrOwner|isOwner|canManageTenantExperience/.test(before.slice(-400)),
      `"${id}" is reachable by a writer`,
    ).toBe(true)
  })

  it("keeps language and security available to everyone, which is the point", () => {
    expect(listBlock).toContain('id: "account-language"')
    expect(listBlock).toContain('id: "account-security"')
  })

  it("People is gated — it was the one section pushed unconditionally", () => {
    expect(listBlock).toMatch(/if \(isAdminOrOwner\) \{\s*sectionLinks\.push\(\{ id: "tenant-users"/)
  })
})

describe("the endpoints behind those two sections are genuinely self-service", () => {
  // If either of these grew an admin check, the writer's settings page would render a section
  // whose save always 403s -- worse than not showing it.
  it.each(["app/api/account/preferences/route.ts", "app/api/account/password/route.ts"])(
    "%s does not require an admin role",
    (file) => {
      expect(readFileSync(file, "utf8")).not.toContain("requireAdminRole")
    },
  )
})
