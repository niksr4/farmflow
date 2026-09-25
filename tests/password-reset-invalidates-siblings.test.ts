import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Using one reset link must kill the others.
 *
 * resetPasswordWithToken() consumed only the token it was handed --
 * `UPDATE password_reset_tokens SET consumed_at = ... WHERE id = <that one>`. So a user who
 * clicked "forgot password" twice and recovered with the second link left the FIRST one working
 * for the rest of its hour. An unused reset link is a standing account-takeover credential sitting
 * in an inbox, and the window was closing on a timer rather than on the account being recovered.
 *
 * Not hypothetical: production shows one user issued two tokens on 2026-08-04.
 *
 * Found by the QA scanner 2026-09-25. Its own fix and tests were lost when that run's push was
 * refused by the git proxy and the commit was discarded with the clone, so this is a
 * reimplementation rather than a port.
 */

const runTenantQuery = vi.fn()

vi.mock("@/lib/server/tenant-db", () => ({
  normalizeTenantContext: (tenantId: string | undefined, role: string) => ({ tenantId: tenantId ?? "", role }),
  runTenantQuery: (...args: unknown[]) => runTenantQuery(...args),
}))

vi.mock("@/lib/server/db", () => {
  // Tagged-template stub: records the SQL text so assertions can read the statement shape.
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: strings.join("?"),
    values,
  })
  return { sql }
})

vi.mock("@/lib/server/security-events", () => ({ logSecurityEvent: vi.fn() }))
vi.mock("@/lib/server/password-hash", () => ({ hashPassword: () => "hashed" }))

import { resetPasswordWithToken } from "@/lib/server/password-reset"

const LIVE_TOKEN_ROW = {
  token_id: "tok-row-1",
  consumed_at: null,
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  user_id: "user-1",
  tenant_id: "tenant-1",
  username: "priya",
}

beforeEach(() => {
  runTenantQuery.mockReset()
})

describe("resetPasswordWithToken", () => {
  const statements = () =>
    runTenantQuery.mock.calls.map((call) => String((call[2] as { text?: string })?.text || ""))

  it("invalidates every other outstanding token for that user, not just the one used", async () => {
    runTenantQuery
      .mockResolvedValueOnce([LIVE_TOKEN_ROW]) // lookup
      .mockResolvedValueOnce([{ id: "tok-row-1" }]) // consume the one used
      .mockResolvedValueOnce([]) // update users
      .mockResolvedValueOnce([]) // invalidate siblings

    await resetPasswordWithToken({
      token: "raw-token",
      newPassword: "a-new-password",
      ipAddress: "1.2.3.4",
      userAgent: null,
    })

    const sweeping = statements().filter(
      (text) =>
        /UPDATE password_reset_tokens/i.test(text) &&
        /user_id/i.test(text) &&
        /consumed_at IS NULL/i.test(text),
    )
    expect(
      sweeping.length,
      "a second link must not outlive the reset it was superseded by",
    ).toBeGreaterThan(0)
  })

  it("sweeps the siblings AFTER the password is changed, never before", async () => {
    runTenantQuery
      .mockResolvedValueOnce([LIVE_TOKEN_ROW])
      .mockResolvedValueOnce([{ id: "tok-row-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    await resetPasswordWithToken({
      token: "raw-token",
      newPassword: "a-new-password",
      ipAddress: "1.2.3.4",
      userAgent: null,
    })

    const all = statements()
    const passwordUpdate = all.findIndex((t) => /UPDATE users/i.test(t) && /password_hash/i.test(t))
    const sweep = all.findIndex(
      (t) => /UPDATE password_reset_tokens/i.test(t) && /user_id/i.test(t) && /consumed_at IS NULL/i.test(t),
    )

    expect(passwordUpdate).toBeGreaterThanOrEqual(0)
    expect(sweep).toBeGreaterThan(passwordUpdate)
    // Ordering is the safety property: if the sweep ran first and then the password update threw,
    // the user would have burned every link they hold and still be locked out.
  })
})
