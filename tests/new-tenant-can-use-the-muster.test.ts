import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * A NEW ESTATE MUST BE ABLE TO MARK WORK ON THE MUSTER ON ITS FIRST DAY.
 *
 * `blockedByLabourCutoverBefore` refuses every muster allocation for a tenant with no
 * `tenant_labour_entry_mode` row. For an established estate that is right: no row means they have
 * not switched, and a muster row saved before the switch is counted in no total anywhere. The
 * refusal was never the bug.
 *
 * The bug was that nothing except a hand-run dev script ever wrote that table, so every self-serve
 * signup landed on the legacy Accounts path, found "Set work" on the muster, and was told the estate
 * records labour somewhere else. Onboarding a new estate required the developer to run SQL.
 *
 * ⚠ COMMENTS ARE BLANKED BEFORE SEARCHING, AND THAT IS NOT OPTIONAL HERE. The function this guards
 * carries a long comment that names `tenant_labour_entry_mode` five times and quotes the refusal it
 * prevents. A raw substring search over the source would pass on the prose alone, with the INSERT
 * deleted -- the guard against the bug satisfied by the paragraph describing the bug. That exact
 * failure already happened once in this repo, to the falling-beans CSS scan.
 */

const blankComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + " ".repeat(m.length - lead.length))

const provisionSource = (): string =>
  blankComments(
    readFileSync(resolve(process.cwd(), "lib/server/onboarding/provision-tenant.ts"), "utf8"),
  )

describe("provisioning gives a new tenant a labour cutover", () => {
  it("writes a tenant_labour_entry_mode row, in code and not only in a comment", () => {
    const src = provisionSource()
    expect(
      src,
      "provisioning must INSERT a cutover row, or the muster refuses every allocation a new estate makes",
    ).toMatch(/INSERT\s+INTO\s+tenant_labour_entry_mode/i)
  })

  it("actually calls the helper from the provisioning path", () => {
    const src = provisionSource()
    // Declaring it is not calling it, and the two are distinguishable: the arrow declaration reads
    // `ensureLabourEntryMode = async (`, so it cannot satisfy a search for `ensureLabourEntryMode(`.
    expect(src).toMatch(/const\s+ensureLabourEntryMode\s*=/)
    expect(
      src,
      "ensureLabourEntryMode must be awaited from the provisioning path, not merely defined",
    ).toMatch(/await\s+ensureLabourEntryMode\s*\(/)
  })

  it("is idempotent, because provisioning is retried on a resumed signup", () => {
    const src = provisionSource()
    const insert = src.slice(src.search(/INSERT\s+INTO\s+tenant_labour_entry_mode/i))
    expect(insert.slice(0, 400)).toMatch(/ON\s+CONFLICT\s*\(\s*tenant_id\s*\)\s*DO\s+NOTHING/i)
  })

  /**
   * The estate's today, not the server's. Every FarmFlow server runs UTC, so a bare CURRENT_DATE
   * sets the cutover a day early for anybody signing up between 18:30 and midnight IST. Work marked
   * that first evening would fall before the boundary and be counted via Accounts, where the estate
   * has entered nothing -- a day of labour costing zero, silently.
   */
  it("dates the cutover in the estate's timezone rather than the server's", () => {
    const src = provisionSource()
    const insert = src.slice(src.search(/INSERT\s+INTO\s+tenant_labour_entry_mode/i), src.length)
    const statement = insert.slice(0, 400)

    expect(statement, "the cutover date must be IST").toMatch(/AT\s+TIME\s+ZONE\s+'Asia\/Kolkata'/i)
    // CURRENT_DATE and NOW()::date are both the server's calendar. Neither may appear bare here.
    expect(statement).not.toMatch(/VALUES[^)]*\bCURRENT_DATE\b/i)
  })
})
