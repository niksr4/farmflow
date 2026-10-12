import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * ACCOUNT TAKEOVER THROUGH THE PUBLIC SIGNUP FORM.
 *
 * /api/auth/signup is unauthenticated -- a public page, rate-limited on IP+email and nothing else.
 * createOrRefreshSignupRequest used to UPDATE `password_hash` on an existing unprovisioned signup
 * request and then re-send the verification link to the address on that row:
 *
 *   1. Someone genuinely signs up and has not clicked their link yet.
 *   2. A stranger who knows their email POSTs the form with their OWN password.
 *   3. The stored hash becomes the stranger's; the victim is re-sent "verify your signup".
 *   4. The victim clicks, expecting their own signup. provision-tenant.ts creates the admin with
 *      the hash on the row -- the stranger's -- and the stranger can log in to the new estate.
 *
 * Nothing errors at any step, and the victim really did start a signup, so the email they receive
 * is one they are expecting. Found by the daily scanner on 2026-10-12. Five rows on production
 * were in the vulnerable state at the time (3 pending, 2 verified, 0 provisioned).
 *
 * The invariant: a caller who has not proven control of the mailbox cannot decide what the
 * verification link will produce.
 */
const signup = readFileSync("lib/server/onboarding/signup.ts", "utf8")

/** The UPDATE taken alone -- the INSERT path legitimately writes all of these. */
const updateStatement = signup.slice(signup.indexOf("UPDATE signup_requests\n            SET"))
  .slice(0, signup.slice(signup.indexOf("UPDATE signup_requests\n            SET")).indexOf("RETURNING"))

describe("a stranger cannot set the password on somebody else's pending signup", () => {
  it("never writes a freshly-hashed password onto an existing request", () => {
    // `passwordHash` is the hash of what THIS caller just typed. On the refresh path it must not
    // reach the row at all; only passwordHashToStore, which prefers what is already stored.
    expect(updateStatement).not.toMatch(/password_hash\s*=\s*\$\{passwordHash\}/)
    expect(updateStatement).toMatch(/password_hash\s*=\s*\$\{passwordHashToStore\}/)
  })

  it("keeps the stored hash whenever a request already exists", () => {
    // The conditional is the fix. If it ever reads the other way round, the hole reopens.
    expect(signup).toMatch(/const keepExistingCredential = Boolean\(existingSignup\)/)
    expect(signup).toMatch(
      /passwordHashToStore\s*=\s*keepExistingCredential\s*\?\s*existingSignup!?\.password_hash\s*:\s*passwordHash/,
    )
  })

  it("does not let the caller rewrite the estate or person the link will create", () => {
    // Defacement rather than takeover, but the same unproven caller writing the same unverified
    // row -- and the estate name is what the tenant ends up called.
    expect(updateStatement).not.toMatch(/\bname\s*=\s*\$\{name\}/)
    expect(updateStatement).not.toMatch(/estate_name\s*=\s*\$\{estateName\}/)
  })

  it("still creates a first-time signup normally, hash included", () => {
    // The guard must not break the ordinary path: a brand new request has no stored hash to keep,
    // and must store the one the person just chose.
    const insertStatement = signup.slice(signup.indexOf("INSERT INTO signup_requests"))
    expect(insertStatement).toMatch(/\$\{passwordHash\}/)
    expect(insertStatement).toMatch(/\$\{name\}/)
    expect(insertStatement).toMatch(/\$\{estateName\}/)
  })

  it("records the attempt instead of refusing it", () => {
    /**
     * Refusing would leak funnel membership to an unauthenticated caller ("that email already has
     * a signup"), and refusing silently would break the person who simply lost their first email.
     * The two cases are indistinguishable from this code path, so it serves the request and
     * leaves a trail.
     */
    expect(signup).toMatch(/refreshedExistingRequest: Boolean\(existingSignup\)/)
    expect(signup).toMatch(/credentialRetained: keepExistingCredential/)
  })

  it("still refuses outright once a real account exists", () => {
    // Unchanged, and the reason the blast radius stops at unprovisioned requests.
    expect(signup).toMatch(/An account already exists for this email/)
  })
})
