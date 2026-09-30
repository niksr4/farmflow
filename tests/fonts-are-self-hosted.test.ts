import { execSync } from "node:child_process"
import { readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * A BUILD MUST NOT DEPEND ON A THIRD PARTY BEING UP.
 *
 * `next/font/google` downloads the woff2 at BUILD TIME. On 2026-09-29 fonts.gstatic.com was
 * unreachable from the CI runner for a few minutes and the build failed with:
 *
 *     next/font/google queries have exactly one entry
 *     Error: Timed out waiting 180000ms from config.webServer
 *
 * which names neither the network nor the font, blames the E2E web server, and is indistinguishable
 * from a real regression. PR #54 built fine four minutes later on the same runner. Half an hour went
 * into proving the diff was innocent -- the build succeeded locally, the diff touched nothing in the
 * import trace, CI does not cache .next -- and the only conclusion available was "it was the
 * network", which is not a conclusion anybody should have to reach by elimination.
 *
 * The fix removes the dependency rather than making the failure legible.
 */

const repoFile = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8")

/**
 * EVERY tracked TS/TSX file outside tests, so this cannot be a hand-kept list of the two that used
 * to offend.
 *
 * Repository-wide rather than `app components lib hooks`, which skipped the root entirely --
 * including instrumentation-client.ts, the ONLY browser entry point on Sentry SDK v10 and therefore
 * exactly the kind of file that could pull in a font. A scan whose blind spot is the root of the
 * repo is a scan with a blind spot. Raised by CodeRabbit on PR #57.
 */
const trackedSources = execSync("git ls-files '*.ts' '*.tsx'", { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && !f.startsWith("tests/"))

const stripComments = (src: string): string =>
  src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^[ \t]*\/\/.*$/gm, "")

describe("no build step reaches out to Google for a font", () => {
  it("nothing imports next/font/google", () => {
    /**
     * Derived from git ls-files rather than checking the two files that used to do it. A third file
     * adding its own `Manrope({ ... })` is exactly how the dependency would come back, and it would
     * come back silently -- builds keep working right up until the one that does not.
     *
     * Comments stripped: this file and app/fonts/index.ts both discuss next/font/google at length,
     * and a guard satisfied by its own explanation is no guard.
     */
    const offenders = trackedSources.filter((f) => /next\/font\/google/.test(stripComments(repoFile(f))))
    expect(
      offenders,
      "use next/font/local and commit the woff2 — a build must not need fonts.gstatic.com",
    ).toEqual([])
  })

  it("the woff2 files are committed and are really woff2", () => {
    // A LFS pointer, an HTML error page saved under a .woff2 name, or a truncated download would
    // all "exist". wOF2 is the magic number; anything else is not a font.
    const fonts = execSync("git ls-files app/fonts", { encoding: "utf8" })
      .split("\n")
      .filter((f) => f.endsWith(".woff2"))
    expect(fonts.length, "both faces must be committed").toBe(2)
    for (const f of fonts) {
      const head = readFileSync(resolve(process.cwd(), f)).subarray(0, 4).toString("latin1")
      expect(head, `${f} is not a woff2`).toBe("wOF2")
      expect(statSync(resolve(process.cwd(), f)).size, `${f} is suspiciously small`).toBeGreaterThan(5_000)
    }
  })

  it("ships the OFL licence beside each font, because bundling requires it", () => {
    /**
     * Manrope and Fraunces are both SIL Open Font License 1.1. It permits bundling and
     * redistribution and REQUIRES the licence accompany the font. Deleting these files would make
     * shipping the app a licence breach rather than merely untidy, which is not obvious from
     * looking at a folder of woff2 files -- hence a test rather than a comment.
     */
    for (const face of ["manrope", "fraunces"]) {
      const licence = repoFile(`app/fonts/${face}-OFL.txt`)
      expect(licence, `${face} licence must be the OFL`).toContain("SIL OPEN FONT LICENSE")
      expect(licence).toContain("Copyright")
    }
  })

  it("declares the weight range the variable file actually carries", () => {
    /**
     * A variable woff2 covers a range. Declaring a single weight makes the browser synthesise the
     * others from one master -- which renders, so nothing looks broken, it just looks slightly
     * wrong everywhere. Both call sites previously asked for explicit weight lists, so the ranges
     * here are what they were getting.
     */
    const fonts = stripComments(repoFile("app/fonts/index.ts"))
    expect(fonts).toMatch(/weight:\s*"200 800"/) // Manrope
    expect(fonts).toMatch(/weight:\s*"600 800"/) // Fraunces, the range both call sites asked for
  })

  it("is declared once, not once per call site", () => {
    /**
     * app/layout.tsx and components/public-site-shell.tsx each declared both faces, with DIFFERENT
     * weight lists for the same typeface. Two sources of truth for one font is how the app and the
     * marketing site come to render in subtly different weights, and nothing fails when they do.
     */
    const declaring = trackedSources.filter((f) => /\blocalFont\s*\(/.test(stripComments(repoFile(f))))
    expect(declaring, "only app/fonts/index.ts should call localFont").toEqual(["app/fonts/index.ts"])
  })
})
