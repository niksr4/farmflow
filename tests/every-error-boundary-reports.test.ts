import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

/**
 * AN ERROR SCREEN THAT REPORTS NOTHING IS A CRASH YOU CANNOT FIX.
 *
 * ⚠ app/error.tsx CARRIED THE COMMENT "Log to an error reporting service if available" AND THEN
 * CALLED console.error. On a phone that goes nowhere. So every time an estate saw "Something went
 * wrong" -- often enough on the PWA that the owner was reloading to get past it -- the error was
 * shown to the user and recorded in no system anywhere.
 *
 * app/global-error.tsx had called Sentry.captureException the whole time, which is what made the
 * area look covered. But that boundary only fires when the ROOT LAYOUT throws. app/error.tsx
 * catches nearly everything else, and it was the blind one.
 *
 * Server-side looked healthy and genuinely was: Sentry's onRequestError covers throws out of route
 * handlers and RSC renders, and seven days of production showed 13 error groups of which twelve
 * were a module gate correctly refusing the smoke run. A client render error reached error.tsx and
 * stopped there, which is why there was nothing to diagnose from.
 *
 * Same family as the CSP wildcard that kept client-side Sentry dark for months: the reporting path
 * was broken, so the absence of reports read as the absence of problems.
 */

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")

/** Derived: Next.js names every error boundary error.tsx or global-error.tsx, anywhere in app/. */
const boundaries = (): string[] =>
  execFileSync("git", ["ls-files", "app"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => /(^|\/)(global-)?error\.tsx$/.test(f))

describe("every error boundary", () => {
  const files = boundaries()

  it("finds the boundaries, so this cannot pass by scanning nothing", () => {
    expect(
      files.length,
      "no error boundary found -- the scan is broken, not the code",
    ).toBeGreaterThanOrEqual(2)
    expect(files).toContain("app/error.tsx")
    expect(files).toContain("app/global-error.tsx")
  })

  it.each(files)("%s reports the error somewhere a human can find it", (file) => {
    const src = stripComments(readFileSync(file, "utf8"))
    expect(
      /captureException\s*\(/.test(src),
      `${file} shows a user an error screen and reports the error nowhere. console.error on a ` +
        "phone is not reporting: nobody reads a mobile console, so the only record of the crash " +
        "is the person deciding whether to tell you about it.",
    ).toBe(true)
  })

  it.each(files)("%s does not merely mention a reporter in a comment", (file) => {
    const raw = readFileSync(file, "utf8")
    const stripped = stripComments(raw)
    // The original bug in one assertion: the intent was in a comment and nowhere else.
    if (/report|Sentry|captureException/i.test(raw)) {
      expect(
        /captureException\s*\(/.test(stripped),
        `${file} talks about error reporting in a comment but calls no reporter. A comment ` +
          "describing an intention is how this went unnoticed for the life of the file.",
      ).toBe(true)
    }
  })

  it("app/error.tsx attaches the digest the screen shows the user", () => {
    // The screen prints "Error ID: <digest>". Tagging it is the only bridge between somebody in a
    // field reading that off their phone and the stack trace behind it.
    const src = stripComments(readFileSync("app/error.tsx", "utf8"))
    expect(src).toMatch(/digest/)
    const call = src.slice(src.indexOf("captureException"))
    expect(
      /digest/.test(call.slice(0, 300)),
      "the digest is displayed to the user but not attached to the report, so the Error ID they " +
        "can read out is not searchable",
    ).toBe(true)
  })
})
