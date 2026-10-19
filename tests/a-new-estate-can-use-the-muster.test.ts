import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * PROVISIONING MUST GIVE A NEW TENANT A LABOUR ENTRY MODE, OR ITS MUSTER REFUSES EVERY ALLOCATION.
 *
 * ⚠ NOTHING IN THE APPLICATION EVER WROTE `tenant_labour_entry_mode`. It was read in exactly one
 * file and inserted only by two hand-run scripts, so every self-serve tenant had no row -- and
 * with no row, blockedByLabourCutoverBefore refuses every muster work allocation with
 *
 *   "This estate records labour in Costs, not on the muster roll, so work set here would not be
 *    counted anywhere."
 *
 * That refusal is right given no cutover: labour_cost counts a muster row only from the cutover
 * date onward, so permitting the write would save a wage that no total in the app would show. The
 * bug was the missing row.
 *
 * Meanwhile onboarding step 4 drives the estate to price every worker *because* the muster asks
 * for a wage per line, and will not go green until all of them have one. The checklist furnished
 * a muster that then declined them.
 */

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")

const PROVISION = stripComments(
  readFileSync("lib/server/onboarding/provision-tenant.ts", "utf8"),
)

describe("a self-serve tenant gets a labour entry mode", () => {
  it("still provisions the things this test is about, so it cannot pass vacuously", () => {
    // If provisioning stops creating tenants, every assertion below is meaningless.
    expect(PROVISION).toMatch(/ensureTenant\s*\(/)
    expect(PROVISION).toMatch(/ensureUser\s*\(/)
  })

  it("writes a tenant_labour_entry_mode row", () => {
    expect(PROVISION).toMatch(/INSERT INTO tenant_labour_entry_mode/)
    expect(
      /ensureLabourEntryMode\s*\(/.test(PROVISION),
      "the helper must be CALLED, not merely defined -- a provisioning step nothing invokes is " +
        "exactly how this table stayed empty for every self-serve tenant",
    ).toBe(true)
  })

  it("dates the cutover in IST, not the server's UTC day", () => {
    const insert = PROVISION.slice(
      PROVISION.indexOf("INSERT INTO tenant_labour_entry_mode"),
      PROVISION.indexOf("ON CONFLICT", PROVISION.indexOf("INSERT INTO tenant_labour_entry_mode")),
    )
    expect(
      /AT TIME ZONE 'Asia\/Kolkata'/.test(insert),
      "a bare NOW()::date is the server's UTC day. Between 00:00 and 05:30 IST that is " +
        "YESTERDAY at the estate, and a cutover dated in the future refuses the muster for a day " +
        "with nothing on screen to say why",
    ).toBe(true)
    // The signature of the bug: a date taken without a zone.
    expect(insert).not.toMatch(/\(NOW\(\)\)::date|CURRENT_DATE/)
  })

  it("never moves an existing tenant's cutover", () => {
    // Not merely idempotency. Moving a cutover changes which side of the seam an estate's historic
    // labour is counted on, which is real money on the balance sheet. This may only create.
    const insert = PROVISION.slice(PROVISION.indexOf("INSERT INTO tenant_labour_entry_mode"))
    expect(insert.slice(0, 400)).toMatch(/ON CONFLICT \(tenant_id\) DO NOTHING/)
    expect(
      /ON CONFLICT[^;]*DO UPDATE[^;]*tenant_labour_entry_mode/.test(PROVISION),
      "an upsert here would silently re-date a live estate's cutover",
    ).toBe(false)
  })

  it("does not abort provisioning when the table is absent", () => {
    // Migration 116 may not be applied on an instance. A tenant with no row is the old behaviour,
    // usable via Costs, so this must not kill a run that has already created the tenant.
    const fn = PROVISION.slice(
      PROVISION.indexOf("const ensureLabourEntryMode"),
      PROVISION.indexOf("const usernameExists"),
    )
    expect(fn).toMatch(/catch/)
    expect(
      /isMissingLabourEntryModeTable\s*\(/.test(fn),
      "the catch must distinguish a missing table from a real failure -- swallowing everything " +
        "leaves the estate on a screen that refuses them with nothing logged",
    ).toBe(true)
  })

  it("asks for the mode before the signup is marked provisioned", () => {
    const callAt = PROVISION.search(/await ensureLabourEntryMode\s*\(/)
    const tenantAt = PROVISION.search(/await ensureTenant\s*\(/)
    expect(callAt).toBeGreaterThan(-1)
    expect(tenantAt).toBeGreaterThan(-1)
    expect(callAt, "the mode is set after the tenant exists").toBeGreaterThan(tenantAt)
  })
})

describe("the onboarding checklist and the muster agree", () => {
  /**
   * The contradiction worth guarding: step 4 sells the muster. If provisioning ever stops setting
   * a cutover, that step is advice to furnish a screen that refuses the estate.
   */
  it("still tells the estate the muster will ask for a wage per line", () => {
    const steps = readFileSync("components/inventory-system/onboarding.ts", "utf8")
    const mentionsMuster = /muster/i.test(steps)
    expect(
      mentionsMuster,
      "if onboarding no longer points at the muster, re-read whether provisioning should still " +
        "default a cutover -- the two were only coupled because step 4 sells the muster",
    ).toBe(true)
  })
})
