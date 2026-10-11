import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * THE OWNER GOT "✅ All tenants healthy" EVERY SINGLE NIGHT, and learned to skim past it.
 *
 * That is the real cost: the one night in thirty that says "⚠️ 2 tenants need attention" arrives
 * looking like the twenty-nine that did not, in the same thread, at the same hour. A report nobody
 * reads is not a safety net, and the fix for that is fewer of them, not more.
 *
 * ⚠ THE OBVIOUS IMPLEMENTATION IS THE WRONG ONE. Gating the whole agent to every third night --
 * or adding a `schedule` to vercel.json -- would also delay a genuine alert by up to three days.
 * So the gate is on the QUIET case only: `needsAttention` is zero, meaning no tenant is stuck,
 * quiet or flagged. Anything else mails the next morning exactly as before.
 */
const agent = readFileSync("lib/server/agents/tenant-engagement-agent.ts", "utf8")

describe("the all-healthy report is every three days, the warning is not", () => {
  it("only ever suppresses when nothing needs attention", () => {
    // If this condition loses its needsAttention term, a stuck tenant goes unreported for 3 days.
    expect(agent).toMatch(/if \(needsAttention === 0 && isDbConfigured\)/)
  })

  it("gates on the last run that actually SENT, not the last run", () => {
    /**
     * The agent now records a row every night. Gating on "was there a run in the last 3 days"
     * would therefore always be true and the report would never go out again -- silence that
     * looks exactly like everything being fine.
     */
    expect(agent).toMatch(/summary->>'emailSent' = 'true'/)
  })

  it("fails OPEN, so a broken guard means an extra email and never a missed one", () => {
    // Standing down because a guard query errored is how an estate stops being watched with
    // nobody noticing. The digest gates in the orchestrator make the same choice.
    const block = agent.match(/let suppressedAsQuiet = false[\s\S]*?\n  \}/)
    expect(block).not.toBeNull()
    expect(block![0]).toMatch(/catch[\s\S]*?suppressedAsQuiet = false/)
  })

  it("records nothing on a dry run, so a manual test cannot mute the real report", () => {
    expect(agent).toMatch(/if \(!dryRun && isDbConfigured\)/)
  })

  it("does not suppress the send itself when a tenant needs attention", () => {
    expect(agent).toMatch(/if \(!dryRun && !suppressedAsQuiet\)/)
  })

  it("gates on isDbConfigured, not on `sql` being falsy", () => {
    /**
     * CLAUDE.md: `sql` is NEVER falsy -- it is `baseUrl ? neon(baseUrl) : createUnavailableClient()`,
     * so `if (sql)` reads as "configured" unconditionally and has already shipped one dead branch.
     */
    const added = agent.slice(agent.indexOf("const emailCadenceDays"))
    expect(added).not.toMatch(/if \(sql\)/)
  })
})
