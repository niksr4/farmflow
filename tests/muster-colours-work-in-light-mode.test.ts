import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * THE APP DEFAULTS TO LIGHT, AND TWO MUSTER SUBTABS WERE WRITTEN FOR DARK.
 *
 * `app/layout.tsx` sets `defaultTheme="light"`, so a bare `text-emerald-400` is what nearly every
 * estate actually sees. Measured against the real `--card` token (`0 0% 99%`):
 *
 *     text-amber-300    1.44:1     the "N workers have no daily rate" warning banner
 *     text-emerald-400  1.92:1     NET PAYABLE -- the one figure payroll exists to show
 *     text-sky-400      2.14:1     bonus / adjustment
 *     text-rose-400     2.69:1     deductions
 *     text-violet-300   1.85:1     the worker-type badges on the roster
 *
 * WCAG AA wants 4.5:1 for text this size. Payroll carried 38 of these and the Workers roster 24,
 * while `attendance-report-tab.tsx` and `attendance-scanner-tab.tsx` -- same workspace, same
 * payloads -- had the paired form right all along. So this was never a house style; it was two
 * files that missed a pass, with the correct pattern sitting next to them.
 *
 * WHY NOTHING CAUGHT IT. No lint rule reads colour. `tests/render/payroll-summary-tab.test.tsx` is
 * thorough about the figures -- it proves columns line up, the footer sums, the CSV reconciles --
 * but it asserts text CONTENT, which is identical whether or not anybody can read it. And
 * `app/globals.css` has a block of `.dark .text-*` overrides for hardcoded LIGHT classes, which is
 * this bug in the other direction, so there was a safety net and it faced the wrong way.
 *
 * Invisible is worse than absent: the badge still occupied the row and still looked deliberate.
 *
 * ── HOW THIS GUARD AVOIDS GOING VACUOUS ───────────────────────────────────────────────────────
 *
 * The file list is DERIVED from the workspace's own imports, not hand-kept, so a sixth subtab
 * added tomorrow is covered tomorrow. `itDerivesTheSubtabs` below fails if that derivation ever
 * stops finding them, because a scan over an empty list passes everything.
 *
 * It keys on SHAPE, not on identifiers: any `text-<hue>-(200|300|400)` with no `dark:` sibling.
 *
 * WHY THAT BAND. 200-400 is the ambiguous middle -- light enough to vanish on a white card, dark
 * enough that somebody reaches for it as a text colour. 50 and 100 are only ever legible on a
 * saturated ground, so a bare one is self-evidently deliberate; 500 and up pass on white already.
 *
 * Two exemptions, both shape-based rather than a list of blessed names:
 *   - an opacity modifier (`text-amber-400/70`) composites acceptably over either ground;
 *   - light text ON a saturated ground of the same hue, same line (`bg-emerald-700 text-emerald-100`).
 *
 * The same-line rule is deliberately strict, and it earned that. It first ran with the muster's
 * selected-day pill written as a `text-emerald-200` span inside a `bg-emerald-700` button -- the
 * ground on the parent, the text on a child, so this scan flagged it. Widening the window to
 * "somewhere nearby" would have hidden the finding, because -200 on -700 is 4.28:1 and that 9px
 * label was genuinely under AA. It is `text-emerald-100` (4.84:1) now. A guard that cannot see a
 * parent element is a weaker guard than one that forces the intent onto the line.
 */

const WORKSPACE = "components/attendance-workspace.tsx"

/** Hues that carry MEANING here -- money, warnings, worker type. Deliberately not `stone`. */
const SEMANTIC_HUES = [
  "emerald", "amber", "sky", "rose", "teal", "cyan", "purple",
  "red", "green", "blue", "yellow", "orange", "lime", "violet", "indigo", "fuchsia", "pink",
] as const

/**
 * `text-stone-400` is EXCLUDED FROM THIS SCAN BECAUSE IT IS FIXED CENTRALLY, NOT BECAUSE IT IS
 * IGNORED.
 *
 * It measured 2.46:1 on the light card -- the app's muted-label colour, 383 uses across
 * `components/` and `app/`, failing AA for most of the people reading it. Repainting it inside the
 * muster alone would have made these five tabs disagree with the other forty-odd files, so it was
 * repaired where it belongs: one light-mode rule in `app/globals.css` mapping it onto
 * `hsl(var(--muted-foreground) / 0.8)`, which measures 4.58:1 and stays lighter than body text.
 *
 * That makes the exclusion correct and the hue genuinely out of scope here -- but it also means
 * this file's reason for skipping `stone` now depends on a rule in a DIFFERENT file that nothing
 * else guards. `the app-wide muted label is repaired centrally` below asserts that rule exists, so
 * deleting it fails a test rather than quietly restoring a 2.46:1 default across the whole app.
 */
const EXCLUDED_HUE = "stone"

const repoFile = (relative: string) => readFileSync(path.resolve(process.cwd(), relative), "utf8")

/** The subtab component files, read off the workspace's relative imports. */
const musterSubtabFiles = (): string[] => {
  const source = repoFile(WORKSPACE)
  const files: string[] = []
  for (const match of source.matchAll(/^import\s+\w+\s+from\s+"(\.\/[^"]+)"/gm)) {
    files.push(path.join("components", `${match[1].replace(/^\.\//, "")}.tsx`))
  }
  return files
}

type Offence = { file: string; line: number; className: string; snippet: string }

/**
 * The quoted (or backticked) string containing `index`, or the whole line if none does.
 *
 * ⚠ WHY THIS EXISTS: the saturated-ground exemption below used to test the ENTIRE LINE, which
 * made it an escape hatch for the exact bug this file guards. Raised by CodeRabbit on PR #68 and
 * confirmed by running the old regex over both shapes:
 *
 *   <div className="bg-emerald-700" /><p className="text-emerald-400">x</p>   -> EXCUSED
 *   <p className="dark:bg-emerald-700 text-emerald-300">…</p>                 -> EXCUSED
 *
 * The first is two unrelated elements sharing a line; the second is a ground that only exists in
 * DARK mode excusing text that is unreadable in LIGHT. Four tamper tests missed both, because none
 * of them happened to put a saturated background on the offending line.
 */
const quotedSegmentAt = (line: string, index: number): string => {
  const spans: Array<{ start: number; end: number; text: string }> = []
  const quoted = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g
  let match: RegExpExecArray | null
  while ((match = quoted.exec(line)) !== null) {
    spans.push({ start: match.index, end: match.index + match[0].length, text: match[2] })
  }
  return spans.find((s) => index >= s.start && index <= s.end)?.text ?? line
}

/**
 * The scan itself, over SOURCE TEXT rather than a path.
 *
 * ⚠ Split out from the file-reading wrapper so the exemption rules can be driven directly. The
 * test for CodeRabbit's two holes first re-implemented this loop inline over `quotedSegmentAt`,
 * which made it a second copy of the logic: mutating the real scanner left that test green. This
 * repo already has a suite about precisely that mistake
 * (tests/render/worker-money-panel.test.tsx, on a validator that was reimplemented inline and
 * sat orphaned for a month). One implementation, exercised by everything.
 */
export const findBareDarkTunedTextIn = (source: string, file = "<source>"): Offence[] => {
  const offences: Offence[] = []
  const hues = SEMANTIC_HUES.join("|")

  source
    .split("\n")
    .forEach((rawLine, index) => {
      // Blank comment-only lines so prose ABOUT a colour never counts as a use of one.
      const line = rawLine.replace(/^\s*(\/\/|\*|\/\*).*$/, "")
      /*
       * `(?<!dark:)` is doing the real work, and it replaced something weaker.
       *
       * This first excused any bare class on a line that ALSO carried a `dark:text-<hue>-*`,
       * as a way of not matching the `dark:` half of a correct pair. Tamper-testing killed it:
       * putting `text-violet-300` back into a roster badge that still had its `dark:text-violet-300`
       * sibling produced an offence the guard waved through. The pairing says the dark side was
       * considered; the UNPREFIXED class is itself the light-mode value, so it has to stand on its
       * own. Excluding the `dark:` half by lookbehind instead of by line contents is the difference
       * between a guard and a formality.
       *
       * Lookbehind is fine here -- this is a Node-only test. CLAUDE.md's warning about it concerns
       * lib/observability.ts, which ships to Safari.
       *
       * `(?![\w/-])` drops opacity modifiers: `text-amber-400/70` is a tint, not a flat colour.
       */
      const pattern = new RegExp(`(?<!dark:)\\btext-(${hues})-(200|300|400)(?![\\w/-])`, "g")

      for (const match of line.matchAll(pattern)) {
        const [, hue, shade] = match
        const className = `text-${hue}-${shade}`

        /*
         * Light text on a saturated ground of its own hue is the correct way to build a pill —
         * but the ground has to be on THE SAME ELEMENT and has to exist in light mode:
         *   - same `className` string, not merely the same line (two elements can share a line);
         *   - no `dark:` prefix, or a dark-only ground would excuse text on a white card.
         */
        const ownClassName = quotedSegmentAt(line, match.index ?? 0)
        if (new RegExp(`(?<!dark:)\\bbg-${hue}-(?:500|600|700|800|900)(?![\\w/-])`).test(ownClassName)) continue

        offences.push({ file, line: index + 1, className, snippet: rawLine.trim().slice(0, 100) })
      }
    })

  return offences
}

const findBareDarkTunedText = (file: string): Offence[] => findBareDarkTunedTextIn(repoFile(file), file)

describe("the muster subtabs are legible in the theme the app actually opens in", () => {
  it("derives the subtab files from the workspace, so a new tab is covered without editing this test", () => {
    // A scan over an empty list passes vacuously, so the derivation itself is asserted. If the
    // import style in attendance-workspace.tsx changes, this fails rather than the scan going quiet.
    const files = musterSubtabFiles()

    expect(files.length, "no subtabs derived -- the scan below would pass over nothing").toBeGreaterThanOrEqual(5)
    expect(files).toContain("components/payroll-summary-tab.tsx")
    expect(files).toContain("components/worker-profiles-tab.tsx")
    expect(files).toContain("components/attendance-tab.tsx")
    for (const file of files) {
      expect(() => repoFile(file), `${file} is imported by the workspace but not readable`).not.toThrow()
    }
  })

  it("pairs every semantic colour with a light-mode value", () => {
    const offences = musterSubtabFiles().flatMap(findBareDarkTunedText)

    const report = offences
      .map((o) => `  ${o.file}:${o.line}  ${o.className}\n      ${o.snippet}`)
      .join("\n")

    expect(
      offences,
      offences.length
        ? `${offences.length} colour(s) tuned only for dark mode. The app opens in LIGHT, where ` +
          `these measure 1.4:1 to 2.7:1 against --card.\n\nUse the paired form already used by ` +
          `attendance-report-tab.tsx, e.g. "text-emerald-700 dark:text-emerald-400":\n\n${report}`
        : "",
    ).toEqual([])
  })

  it("does not let a neighbouring element, or a dark-only ground, excuse an unreadable figure", () => {
    /**
     * THE TWO HOLES CODERABBIT FOUND IN THIS GUARD (PR #68), pinned against a synthetic line each
     * rather than against a component, so they stay covered whatever the muster looks like later.
     *
     * The old exemption tested the whole line for `bg-<hue>-(500..900)`, which meant the guard
     * could be silenced by a `bg-emerald-700` element that merely shared a line, or by a
     * `dark:bg-emerald-700` ground that does not exist in the theme the app opens in. Both were
     * verified against the old regex before this was changed; four tamper tests had missed them.
     */
    // Drives the REAL scanner, not a copy of its rules — see the note on findBareDarkTunedTextIn.
    const flagged = (line: string) => findBareDarkTunedTextIn(line).map((o) => o.className)

    // Two elements sharing a line: the button's ground must not cover the figure's text.
    expect(flagged('<div className="bg-emerald-700" /><p className="text-emerald-400">x</p>')).toEqual([
      "text-emerald-400",
    ])
    // A ground that only exists in dark mode cannot excuse light-mode text.
    expect(flagged('<p className="dark:bg-emerald-700 text-emerald-300">x</p>')).toEqual(["text-emerald-300"])
    // And the legitimate shape is still exempt, or the guard would fail correct pills.
    expect(flagged('<span className="bg-emerald-700 text-emerald-200">x</span>')).toEqual([])
    // A tint is still a tint.
    expect(flagged('<p className="text-amber-400/70">x</p>')).toEqual([])
  })

  it("does not count a tint, or light text on a saturated ground of the same hue", () => {
    // Both shapes are legitimate and both appear in the muster today. If either exemption breaks,
    // this guard starts failing correct code, which is how a guard gets switched off.
    const musterSource = repoFile("components/attendance-tab.tsx")
    expect(musterSource, "the selected-day pill is the live example").toContain("bg-emerald-700")

    const payroll = repoFile("components/payroll-summary-tab.tsx")
    expect(payroll, "the warning banner's tint is the live example").toContain("bg-amber-400/[0.06]")
    expect(findBareDarkTunedText("components/payroll-summary-tab.tsx")).toEqual([])
  })

  it("the app-wide muted label is repaired centrally, which is why this scan skips it", () => {
    /**
     * The earlier version of this test asserted that THIS FILE contains the string
     * "--muted-foreground" — satisfied by the comment above it, which is a test of its own prose.
     * What actually matters is a rule in a different file, so that is what is checked.
     *
     * `.text-stone-400` has to be unprefixed to beat Tailwind's own utility at equal specificity
     * (globals.css sits after `@tailwind utilities`), while `.dark .text-stone-400` outranks it on
     * specificity and keeps dark mode as it was. Both halves are asserted, because losing either
     * one silently breaks a theme.
     */
    expect(SEMANTIC_HUES as readonly string[]).not.toContain(EXCLUDED_HUE)

    const css = repoFile("app/globals.css")

    /**
     * EVERY RULE, PINNED TO ITS VALUE. Raised by CodeRabbit on PR #69: this previously matched
     * `^\.dark \.text-stone-400\s+\{` and nothing after it, so the dark value could be edited
     * freely while a test claiming to protect "dark mode as it was" stayed green — and it checked
     * only the unprefixed selector, so deleting `/80` or `/90` silently returned those labels to
     * the 2.46:1 default. Tailwind emits each opacity variant as its own class, so each needs its
     * own assertion; three rules sharing a value is three ways to lose it.
     */
    const rule = (selector: string, alpha: string) =>
      new RegExp(
        `^${selector.replace(/[.\\/]/g, (c) => `\\${c}`)}\\s+\\{\\s*color:\\s*hsl\\(var\\(--muted-foreground\\)\\s*/\\s*${alpha.replace(".", "\\.")}\\)`,
        "m",
      )

    for (const selector of [".text-stone-400", ".text-stone-400\\/80", ".text-stone-400\\/90"]) {
      expect(css, `${selector} lost its light-mode repair — those labels fall back to 2.46:1`).toMatch(
        rule(selector, "0.8"),
      )
    }
    expect(css, "the dark override must survive AT 0.60, or dark mode shifts too").toMatch(
      rule(".dark .text-stone-400", "0.60"),
    )
    // stone-300 must NOT be swept in: its uses are light text on dark marketing pages.
    expect(css).not.toMatch(/^\.text-stone-300\s+\{/m)
  })
})
