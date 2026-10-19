import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * AN ALERT NOTHING CALLS IS NOT AN ALERT, AND A PASSING TEST SUITE CANNOT TELL THE DIFFERENCE.
 *
 * ⚠ sendOwnerSignupRequestedAlert was fully written, logged its own delivery failure via
 * logAppErrorEvent, and was covered by THREE passing tests -- while being called by nothing
 * outside those tests. Its own failure metadata named `/api/auth/signup` as the endpoint, so the
 * intent was never in doubt. The only owner alert actually wired up fires after successful
 * provisioning, so an estate that started a signup and stalled was invisible by construction.
 *
 * Five of seven production signup requests never got past verification, and the one real inbound
 * estate sat `pending` for 144 days with nobody aware it had arrived.
 *
 * This is the shape a green gate cannot see: `pnpm lint:dead-imports` checks IMPORTS, not exports,
 * and a function imported only by its own test file is imported. So the guard has to ask whether
 * production code calls it.
 */

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")

/** Every non-test source file, so the scan set cannot drift out of date. */
const productionSources = (): string[] =>
  execFileSync("git", ["ls-files", "lib", "app", "components"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("__tests__"))

describe("every owner alert is reachable from production code", () => {
  const alerts = stripComments(readFileSync("lib/server/onboarding/owner-alerts.ts", "utf8"))

  /** Derived from the module's own exports, so a fourth alert added later is covered. */
  const exported = [...alerts.matchAll(/export\s+async\s+function\s+(send\w*Alert)\s*\(/g)].map(
    (m) => m[1],
  )

  it("finds the alert functions at all, so this cannot pass by scanning nothing", () => {
    expect(
      exported.length,
      "no exported send*Alert functions found -- the scan is broken, not the code",
    ).toBeGreaterThanOrEqual(2)
  })

  it.each(exported)("%s is called by something that is not a test", (name) => {
    const callers = productionSources().filter((file) => {
      if (file === "lib/server/onboarding/owner-alerts.ts") return false
      const src = stripComments(readFileSync(file, "utf8"))
      // A CALL, not a mention. An import line satisfies `toContain(name)` and that is precisely
      // how a dead alert looks identical to a live one.
      return new RegExp(`${name}\\s*\\(`).test(src)
    })

    expect(
      callers,
      `${name} is exported, tested, and called by no production code. An alert nothing invokes ` +
        "cannot fire, and its tests pass either way.",
    ).not.toEqual([])
  })
})

describe("the signup path tells the owner before it returns", () => {
  const signup = stripComments(readFileSync("lib/server/onboarding/signup.ts", "utf8"))

  it("alerts on a new signup request", () => {
    expect(signup).toMatch(/sendOwnerSignupRequestedAlert\s*\(/)
  })

  it("does not let the alert fail the signup", () => {
    // The estate's signup has already succeeded by this point. An alert to the owner must never
    // be the thing that turns a successful signup into an error on their screen.
    const at = signup.indexOf("sendOwnerSignupRequestedAlert(")
    const region = signup.slice(Math.max(0, at - 40), at + 700)
    expect(
      /void\s+sendOwnerSignupRequestedAlert|\.catch\(/.test(region),
      "the alert must be fire-and-forget or caught -- an awaited throw here fails a signup that " +
        "has already been recorded and whose verification email has already gone out",
    ).toBe(true)
  })

  it("fires after the verification email is recorded as sent", () => {
    const sentAt = signup.search(/markVerificationSent\s*\(/)
    const alertAt = signup.search(/sendOwnerSignupRequestedAlert\s*\(/)
    expect(sentAt).toBeGreaterThan(-1)
    expect(alertAt).toBeGreaterThan(-1)
    expect(
      alertAt > sentAt,
      "alerting before the mail is confirmed sent would report signups that then throw",
    ).toBe(true)
  })
})
