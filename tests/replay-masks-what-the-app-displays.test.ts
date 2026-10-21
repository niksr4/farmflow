import { describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

/**
 * SESSION REPLAY WAS RECORDING WORKER BANK ACCOUNTS IN CLEARTEXT, and the config looked fine.
 *
 * `maskAllInputs: true` masks what a person TYPES. FarmFlow's personal data is almost entirely
 * what the app DISPLAYS: components/worker-profiles-tab.tsx renders 78 PII values as DOM text,
 * payroll-summary-tab.tsx 9, sales-tab.tsx 3. Nobody typed a worker's IFSC code into the roster;
 * the roster printed it. Replay captured the DOM, so it captured all of it.
 *
 * The two settings that were supposed to cover this -- `maskTextClass: "ph-mask"` and
 * `blockClass: "ph-no-capture"` -- were referenced in ZERO components. Configuration that names a
 * class nothing uses is indistinguishable from no configuration, except that it reads as managed.
 *
 * ⚠ REPLAY IS ENABLED IN THE POSTHOG DASHBOARD, NOT IN THIS REPOSITORY. Nothing here calls
 * `startSessionRecording` or sets `disable_session_recording`, so the code cannot turn recording
 * off and this masking config is the only control the repository has over what leaves a device.
 * That is why this is a guard and not a comment: there is no second line of defence.
 *
 * WHY THESE ASSERTIONS AND NOT A SNAPSHOT: a snapshot of the init block would fail on any edit,
 * which trains you to update it. These fail only when masking actually weakens.
 */

const repoFile = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8")

/**
 * Comments in this repository explain the bugs they guard against, so a raw substring scan trips
 * on the explanation and passes over the defect. This has happened twice -- see CLAUDE.md.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/**
 * Every tracked file that initialises PostHog, derived rather than listed. A hand-kept list of one
 * is how a second init added next month escapes -- and a second init is plausible here, since the
 * marketing pages and the app shell are different trees.
 */
const posthogInitFiles = () => {
  const tracked = execFileSync("git", ["ls-files", "*.ts", "*.tsx"], {
    encoding: "utf8",
    cwd: new URL("..", import.meta.url),
  })
    .split("\n")
    .filter((path) => path && !path.startsWith("tests/"))

  return tracked.filter((path) => /posthog\s*\.\s*init\s*\(/.test(stripComments(repoFile(path))))
}

describe("session replay masks what the app displays, not just what gets typed", () => {
  it("finds the PostHog initialisation", () => {
    const files = posthogInitFiles()
    // Vacuity: if the init moves or is renamed, every assertion below would pass over nothing.
    expect(files.length).toBeGreaterThan(0)
    expect(files).toContain("instrumentation-client.ts")
  })

  it("masks every text node wherever replay is configured", () => {
    for (const path of posthogInitFiles()) {
      const source = stripComments(repoFile(path))
      if (!/session_recording\s*:/.test(source)) continue

      /**
       * `maskTextSelector: "*"` is rrweb's deny-by-default. The alternative -- a selector list
       * naming the PII-bearing elements -- fails open for every column somebody adds later, and
       * two separate audits of this schema each missed fields that a derived sweep then found.
       */
      expect(source, `${path} configures replay without masking displayed text`).toMatch(
        /maskTextSelector\s*:\s*["'`]\*["'`]/,
      )

      // Typed input still has to be masked. This was already true; it must stay true.
      expect(source, `${path} stopped masking typed input`).toMatch(/maskAllInputs\s*:\s*true/)
    }
  })

  it("does not rely on a mask class that no component applies", () => {
    const source = stripComments(repoFile("instrumentation-client.ts"))
    const classNames = [...source.matchAll(/mask(?:Text)?Class\s*:\s*["'`]([^"'`]+)["'`]/g)].map(
      (match) => match[1],
    )

    for (const className of classNames) {
      /**
       * A class-based mask is only as good as its uses. `ph-mask` was configured and applied
       * nowhere for the entire time replay was running. If somebody adds a class-based mask back
       * as the PRIMARY defence, this fails -- unless they also apply it. The selector mask above
       * is what actually protects the data; this stops a decorative setting looking like cover.
       */
      const applied = execFileSync(
        "bash",
        [
          "-lc",
          `git grep -lF '${className}' -- 'app/*' 'components/*' | head -1 || true`,
        ],
        { encoding: "utf8", cwd: new URL("..", import.meta.url) },
      ).trim()

      if (!applied) {
        // Allowed only while the selector mask is doing the work, which the test above proves.
        expect(source).toMatch(/maskTextSelector\s*:\s*["'`]\*["'`]/)
      }
    }
  })
})
