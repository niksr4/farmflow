import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Using one reset link must kill the others, and the three writes that do it are one step.
 *
 * resetPasswordWithToken() originally consumed only the token it was handed, so a user who clicked
 * "forgot password" twice and recovered with the second link left the FIRST one working for the rest
 * of its hour. An unused reset link is a standing account-takeover credential sitting in an inbox,
 * and the window was closing on a timer rather than on the account being recovered. Not
 * hypothetical: production shows one user issued two tokens on 2026-08-04.
 *
 * PR #39 added the sweep as a third separate statement. CodeRabbit raised two Majors on it, and both
 * are the same structural fact from different sides:
 *
 *   1. If the sweep threw, the password and the token consumption had already committed, but the
 *      function rejected -- so the user was told the reset FAILED while their password had changed,
 *      and the consumed link could not be retried.
 *   2. Nothing serialized two concurrent resets for the same user. Each statement had its own
 *      transaction, so both tokens could be consumed and the second request could set the password
 *      after the first had swept -- defeating the guarantee the sweep exists to provide.
 *
 * Both close by making consume + password + sweep a single transaction behind a per-user advisory
 * lock. These tests hold that shape, because it is the shape that carries the guarantee.
 */

const runTenantQuery = vi.fn()
const runTenantQueries = vi.fn()
const logSecurityEvent = vi.fn()

vi.mock("@/lib/server/tenant-db", () => ({
  normalizeTenantContext: (tenantId: string | undefined, role: string) => ({ tenantId: tenantId ?? "", role }),
  runTenantQuery: (...args: unknown[]) => runTenantQuery(...args),
  runTenantQueries: (...args: unknown[]) => runTenantQueries(...args),
}))

vi.mock("@/lib/server/db", () => {
  /**
   * Tagged-template stub that records the SQL text so assertions can read statement shape.
   *
   * It INLINES nested fragments, because the driver does and the code under test relies on it: the
   * shared EXISTS guard is one fragment interpolated into two statements. app/api/sales/route.ts
   * composes the same way in production (`WHERE ${stockGuard}`, and an empty `db``` for a
   * conditional clause), which is the evidence that composition is supported rather than an
   * assumption about the driver.
   *
   * The first version of this stub did `strings.join("?")`, which replaced a nested fragment with a
   * single `?` -- so a guard asserting on the composed text could not see it. That produced two
   * failing tests against correct code, which is the better direction for a stub to be wrong in.
   */
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = ""
    const flattened: unknown[] = []
    strings.forEach((chunk, i) => {
      text += chunk
      if (i >= values.length) return
      const value = values[i] as { text?: unknown; values?: unknown[] } | null
      if (value && typeof value === "object" && typeof value.text === "string") {
        text += value.text
        flattened.push(...(value.values || []))
      } else {
        text += "?"
        flattened.push(value)
      }
    })
    return { text, values: flattened }
  }
  return { sql }
})

vi.mock("@/lib/server/security-events", () => ({ logSecurityEvent: (...a: unknown[]) => logSecurityEvent(...a) }))
vi.mock("@/lib/server/password-hash", () => ({ hashPassword: () => "hashed" }))

import { RESET_LINK_USED_MESSAGE } from "@/lib/server/password-reset-utils"
import { resetPasswordWithToken } from "@/lib/server/password-reset"

const LIVE_TOKEN_ROW = {
  token_id: "tok-row-1",
  consumed_at: null,
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  user_id: "user-1",
  tenant_id: "tenant-1",
  username: "priya",
}

/** The batch shape the real runTenantQueries returns: one result array per statement. */
const batchResult = (consumed: unknown[]) => [[], consumed, [], []]

beforeEach(() => {
  runTenantQuery.mockReset()
  runTenantQueries.mockReset()
  logSecurityEvent.mockReset()
  runTenantQuery.mockResolvedValue([LIVE_TOKEN_ROW]) // the token lookup
  runTenantQueries.mockResolvedValue(batchResult([{ id: "tok-row-1" }]))
})

const reset = () =>
  resetPasswordWithToken({
    token: "raw-token",
    newPassword: "a-new-password",
    ipAddress: "1.2.3.4",
    userAgent: null,
  })

/** The statements handed to the single transaction, as text. */
const batched = (): string[] =>
  ((runTenantQueries.mock.calls[0]?.[2] as Array<{ text?: string }>) || []).map((q) => String(q?.text || ""))

const isSweep = (text: string) =>
  /UPDATE password_reset_tokens/i.test(text) && /user_id/i.test(text) && /consumed_at IS NULL/i.test(text)
const isPasswordUpdate = (text: string) => /UPDATE users/i.test(text) && /password_hash/i.test(text)

describe("resetPasswordWithToken", () => {
  it("invalidates every other outstanding token for that user, not just the one used", async () => {
    await reset()
    expect(
      batched().filter(isSweep).length,
      "a second link must not outlive the reset it was superseded by",
    ).toBeGreaterThan(0)
  })

  it("sweeps the siblings AFTER the password is changed, never before", async () => {
    await reset()
    const all = batched()
    const passwordAt = all.findIndex(isPasswordUpdate)
    const sweepAt = all.findIndex(isSweep)
    expect(passwordAt).toBeGreaterThanOrEqual(0)
    expect(sweepAt).toBeGreaterThan(passwordAt)
    // Ordering still matters inside the transaction: the sweep's guard reads the token row that the
    // consume statement wrote, so it has to run after it.
  })

  it("consumes the token BEFORE the password update, not after", async () => {
    await reset()
    /**
     * The other end of the same ordering, and the assertion above does not cover it: it constrains
     * only the sweep. Both the password update and the sweep are gated on
     * `consumed_at = CURRENT_TIMESTAMP`, so if the consume statement moved below the password update
     * the EXISTS would find nothing, nothing would change, and the function would report the link as
     * used -- for a link that was perfectly good. Every test here would still pass, because
     * batchResult() hands back consumed rows in the second slot regardless of statement order.
     *
     * Raised by CodeRabbit on PR #43.
     */
    const all = batched()
    const consumeAt = all.findIndex(
      (t) => /UPDATE password_reset_tokens/i.test(t) && /\bid = \?/.test(t) && /RETURNING/i.test(t),
    )
    const passwordAt = all.findIndex(isPasswordUpdate)
    expect(consumeAt, "expected a single-token consume statement").toBeGreaterThanOrEqual(0)
    expect(passwordAt).toBeGreaterThanOrEqual(0)
    expect(consumeAt, "the password update reads the row the consume wrote").toBeLessThan(passwordAt)
  })

  it("does all three writes in ONE transaction", async () => {
    await reset()
    /**
     * THE FIX FOR BOTH MAJORS. Three separate transactions let the sweep fail on its own, after the
     * password had already changed -- the function then reported failure for a reset that had
     * happened. One transaction means the sweep cannot fail independently of what it accompanies.
     */
    expect(runTenantQueries, "consume + password + sweep must not be separable").toHaveBeenCalledTimes(1)
    const writes = batched().filter((t) => /^\s*UPDATE/im.test(t) || /UPDATE/i.test(t))
    expect(writes.length).toBe(3)
    // And no write may be issued outside it. The lookup is the only standalone query.
    expect(runTenantQuery).toHaveBeenCalledTimes(1)
    expect(String((runTenantQuery.mock.calls[0]?.[2] as { text?: string })?.text)).toMatch(/SELECT/i)
  })

  it("serializes concurrent resets for the same user, keyed on the user and not the token", async () => {
    await reset()
    const first = batched()[0]
    expect(first, "the lock must be the first statement, or the window it closes stays open").toMatch(
      /pg_advisory_xact_lock/i,
    )
    // Keyed on the USER: two different tokens for one account are exactly the race, so a
    // token-scoped lock would not serialize them.
    const lockValues = (runTenantQueries.mock.calls[0]?.[2] as Array<{ values?: unknown[] }>)[0]?.values || []
    expect(lockValues.some((v) => String(v).includes(LIVE_TOKEN_ROW.user_id))).toBe(true)
    expect(lockValues.some((v) => String(v).includes(LIVE_TOKEN_ROW.token_id))).toBe(false)
  })

  it("gates the password change on THIS transaction having consumed the token", async () => {
    await reset()
    const password = batched().find(isPasswordUpdate) || ""
    /**
     * `consumed_at = CURRENT_TIMESTAMP` is the whole point. CURRENT_TIMESTAMP is the transaction's
     * start time, so it means "the row this transaction consumed". A looser check such as
     * `consumed_at IS NOT NULL` would be satisfied by a token a racing request consumed a moment
     * earlier, which is the race rather than the fix.
     */
    expect(password).toMatch(/EXISTS/i)
    expect(password).toMatch(/consumed_at = CURRENT_TIMESTAMP/i)
    expect(password, "IS NOT NULL would accept a token somebody else just consumed").not.toMatch(
      /consumed_at IS NOT NULL/i,
    )
  })

  it("gates the sweep the same way, so a failed reset cannot burn the user's other links", async () => {
    await reset()
    const sweep = batched().find(isSweep) || ""
    // An ungated sweep would consume every outstanding link on behalf of a request that did not
    // consume its own token, locking the user out of their own recovery.
    expect(sweep).toMatch(/EXISTS/i)
    expect(sweep).toMatch(/consumed_at = CURRENT_TIMESTAMP/i)
  })

  it("reports an already-used link, and does not log a completed reset", async () => {
    // Consume returned no rows, so both gated writes were no-ops and the transaction changed
    // nothing. Reporting success here would claim a password change that did not happen.
    runTenantQueries.mockResolvedValue(batchResult([]))
    /**
     * Matched on the message, not on "something threw". A bare rejects.toThrow() passes for any
     * error -- a TypeError from a wrong result shape, or a destructuring bug on consumedRows -- so it
     * would not prove the writer sees "already used" rather than a 500. Raised by CodeRabbit on #43.
     */
    await expect(reset()).rejects.toThrow(RESET_LINK_USED_MESSAGE)
    expect(logSecurityEvent).not.toHaveBeenCalled()
  })

  it("logs the completed reset when the link was genuinely consumed", async () => {
    await reset()
    expect(logSecurityEvent).toHaveBeenCalledTimes(1)
    expect(logSecurityEvent.mock.calls[0][0]).toMatchObject({
      eventType: "auth_password_reset_completed",
      actorUserId: LIVE_TOKEN_ROW.user_id,
    })
  })
})
