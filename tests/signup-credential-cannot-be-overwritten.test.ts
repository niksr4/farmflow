import { existsSync, readFileSync } from "node:fs"
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

/**
 * The UPDATE taken alone -- the INSERT path legitimately writes all of these.
 *
 * ⚠ THE SLICE ITSELF HAS TO BE CHECKED. The first version anchored on
 * `"UPDATE signup_requests\n            SET"`, twelve spaces of indentation included. Reindent the
 * file and indexOf returns -1, slice(-1) takes the LAST CHARACTER of the file, and every negative
 * assertion below passes against it. A vacuous test, guarding a credential.
 */
/**
 * Anchored on the credential-bearing UPDATE specifically. markVerificationSent has its own
 * `UPDATE signup_requests SET verification_sent_at = ...` earlier in the file, and a bare search
 * lands on that one -- which contains none of the columns this test is about, so every negative
 * assertion would pass while examining the wrong statement.
 */
const findCredentialUpdate = (src: string): string => {
  // Every UPDATE on this table, then the one that actually touches the credential. Deterministic:
  // no character budget to outgrow, and markVerificationSent's own UPDATE is skipped because it
  // has no password_hash. Returns "" when none matches, which the first test turns into a failure
  // rather than letting the negative assertions below run against nothing.
  const re = /UPDATE signup_requests\s+SET/g
  for (let m = re.exec(src); m; m = re.exec(src)) {
    /**
     * Bounded at the end of its own sql`...` template, NOT at a fixed character count. An earlier
     * version fell back to a 2000-character window for statements with no RETURNING, which simply
     * swallowed the next UPDATE -- so markVerificationSent's statement "contained" password_hash
     * and was tested in place of the real one.
     */
    const stop = src.indexOf("`", m.index)
    const statement = src.slice(m.index, stop === -1 ? src.length : stop)
    if (statement.includes("password_hash")) return statement
  }
  return ""
}

const updateStatement = findCredentialUpdate(signup)

describe("the slice these assertions run against", () => {
  it("actually found the UPDATE", () => {
    expect(
      updateStatement,
      "no UPDATE on signup_requests assigns password_hash -- every negative assertion below is vacuous",
    ).not.toBe("")
  })

  it("contains the credential column, so a negative match means something", () => {
    expect(updateStatement).toContain("password_hash")
    expect(updateStatement.length).toBeGreaterThan(100)
  })
})

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
    // The RULE is that the UPDATE must not assign these columns at all -- not that it must avoid
    // one particular spelling of the right-hand side. `name = ${input.name}` or a renamed local
    // would sail past an identifier-pinned regex while reopening the hole.
    expect(updateStatement).not.toMatch(/\bestate_name\s*=/)
    expect(updateStatement).not.toMatch(/(?<!estate_)\bname\s*=/)
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

/**
 * KEEPING THE FIRST PASSWORD PROTECTS WHOEVER SIGNED UP FIRST -- WHICH IS NOT ALWAYS THE OWNER.
 *
 * Raised by CodeRabbit as a Major on this PR, and correct. The retention closes the case where a
 * genuine signup is hijacked afterwards, but reverses into a different failure: if a stranger is
 * the FIRST caller for an address, the real owner signs up later, their password is discarded,
 * they verify, and they cannot sign in to their own estate. Nothing errors at any point.
 *
 * The honest fix for both orderings is to set the password at verification time, which is a UI
 * change and a product decision. What must not wait is the SILENCE: the person has to be told
 * their password was not the one stored, or the cost is a locked-out estate admin with nothing
 * to read anywhere.
 */
const signupRoute = readFileSync("app/api/auth/signup/route.ts", "utf8")
/**
 * ⚠ THE SIGNUP FORM MOVED, AND THIS LINE IS WHY YOU CHECK FIRST.
 *
 * app/signup/page.tsx became a thin server wrapper on 2026-10-19 so it could export `metadata`
 * (a client component cannot), and the form itself moved to app/signup/page-client.tsx. This test
 * read the old path, so it went red on a change that altered no behaviour whatsoever -- exactly
 * the tax CLAUDE.md documents: five tests broke across nine decomposition passes and NONE was
 * asserting "this file contains X", every one was asserting "the implementation does X".
 *
 * Both halves are read and joined, so the assertion holds wherever the code sits. That is the
 * upgrade rather than a path swap: moving it again does not break this.
 */
const signupPage = [
  "app/signup/page.tsx",
  "app/signup/page-client.tsx",
]
  .filter((f) => existsSync(f))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n")
const verifyRoute = readFileSync("app/verify-email/page.tsx", "utf8")
const verifyPage = readFileSync("components/verify-email-page.tsx", "utf8")

describe("a discarded password is never discarded silently", () => {
  it("is reported out of the function that decides it", () => {
    /**
     * Scoped to the RETURN, not the file. `credentialRetained: keepExistingCredential` also
     * appears in the security-event metadata, so a whole-file match stayed green with the
     * response field deleted -- the mention-not-behaviour failure, found by tamper-testing this
     * very assertion rather than by reading it.
     */
    const returnBlock = signup.slice(signup.indexOf("verificationSent: true"))
    expect(returnBlock.slice(0, 400)).toMatch(/credentialRetained:\s*keepExistingCredential/)
  })

  it("survives the API boundary", () => {
    expect(signupRoute).toMatch(/credentialRetained: Boolean\(result\.credentialRetained\)/)
  })

  it("is carried to the screen the person actually lands on", () => {
    // The signup page redirects straight to /verify-email, so a message rendered on the signup
    // page itself would be unmounted before anyone read it.
    expect(signupPage).toMatch(/data\.credentialRetained/)
    expect(verifyRoute).toMatch(/credentialRetained/)
  })

  it("tells them in words, and tells them what to do about it", () => {
    // The GATE, not just the copy. Leaving the sentence in the file while never rendering it is
    // the same silence with extra steps, and a text-only match could not tell the difference.
    expect(verifyPage).toMatch(/\{\s*credentialRetained\s*\?/)
    expect(verifyPage).toMatch(/already had a signup waiting/i)
    // Naming the recovery matters more than naming the cause: password reset proves control of
    // the mailbox, which is the one thing the signup path cannot establish.
    expect(verifyPage).toMatch(/forgot password/i)
  })
})
