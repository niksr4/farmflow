import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * A HAND-WRITTEN CLASS IN globals.css MUST HAVE SOMETHING THAT USES IT.
 *
 * The falling coffee beans in the landing hero disappeared and nobody noticed for weeks. Nothing
 * broke, no test failed, no error was logged: #30 rebuilt the landing page and dropped the markup,
 * while `.coffee-bean` and `@keyframes bean-fall` stayed in app/globals.css with no consumer. The
 * styling was perfectly intact and simply never applied to anything.
 *
 * That is the usual shape here. CSS cannot fail loudly, so an orphan looks exactly like a feature
 * that works. The only way to notice is to ask whether anything still references it.
 *
 * The same sweep found `.marquee-track` orphaned by the same rebuild, which is why this is a scan and
 * not a single assertion about beans.
 */

/** Classes whose absence from the app is deliberate. Each needs a reason, or it is just a snooze. */
const INTENTIONALLY_UNUSED: Record<string, string> = {
  "marquee-track":
    "Orphaned by the same #30 rebuild as the beans. Kept because @keyframes marquee is still wanted " +
    "if the scrolling strip comes back; delete both together if it is not. Raised 2026-10-06.",
}

const handAuthoredClasses = (css: string): string[] => {
  const found = new Set<string>()
  // A class selector at the start of a rule: .thing { … } / .thing, .other / .thing::after / .thing:hover
  for (const m of css.matchAll(/^\.([a-z][a-z0-9-]{2,})(?=[\s,:{.])/gm)) found.add(m[1])
  return [...found].sort()
}

/**
 * Comments blanked before searching.
 *
 * ⚠ NOT OPTIONAL, AND A TAMPER CAUGHT THIS. The first version searched raw source, so when the bean
 * markup was deleted the scan still passed: the explanatory comment in landing-page.tsx says the word
 * "coffee-bean", and a comment about a class is not a class being applied to anything. The guard
 * against an orphan was satisfied by prose describing the orphan.
 */
const blankComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + " ".repeat(m.length - lead.length))

/**
 * The class as APPLIED, not as a substring.
 *
 * ⚠ A SECOND TAMPER CAUGHT A SECOND WAY THIS WENT VACUOUS. `hay.includes("coffee-bean")` was
 * permanently true because components/resources-tab.tsx references an image called
 * `coffee-bean-structure.png`. An unrelated filename kept the guard green no matter what happened to
 * the markup, so it would never have fired.
 *
 * Bounded on both sides by "not a class-name character", which is a word boundary that also respects
 * the hyphen: `coffee-bean` must not be matched by `coffee-bean-structure`.
 */
const isApplied = (haystack: string, cls: string): boolean =>
  new RegExp(`(?<![\\w-])${cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(haystack)

const appSource = (): string => {
  const files = execSync("git ls-files app components lib", { encoding: "utf8" })
    .split("\n")
    .filter((f) => /\.(tsx?|mjs|json)$/.test(f) && f !== "app/globals.css")
  return files
    .map((f) => {
      try {
        return blankComments(readFileSync(resolve(process.cwd(), f), "utf8"))
      } catch {
        return ""
      }
    })
    .join("\n")
}

describe("decorative CSS is actually applied to something", () => {
  const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8")
  const classes = handAuthoredClasses(css)

  it("finds the hand-authored classes at all, so passing means something", () => {
    /**
     * The failure mode of the test below is matching nothing and reporting success. These two are the
     * ones this test exists for, so if the selector scan stops seeing them the scan is broken.
     */
    expect(classes.length, "globals.css should yield a handful of authored classes").toBeGreaterThanOrEqual(5)
    expect(classes).toContain("coffee-bean")
    expect(classes).toContain("marquee-track")
  })

  it("every class in globals.css is referenced by the app", () => {
    const hay = appSource()
    const orphans = classes.filter((c) => !isApplied(hay, c) && !(c in INTENTIONALLY_UNUSED))
    expect(
      orphans,
      "these are styled but applied to nothing — either render them or delete the CSS. CSS cannot " +
        "fail loudly, so an orphan is indistinguishable from a working feature until somebody looks",
    ).toEqual([])
  })

  it("the falling beans in the landing hero are rendered", () => {
    /**
     * Named explicitly as well as covered by the scan above, because this is the one that was lost
     * and the user noticed before any test did. The scan would catch its removal; this says why.
     */
    const landing = readFileSync(resolve(process.cwd(), "components/landing-page.tsx"), "utf8")
    expect(landing, "the bean elements must exist in the hero").toContain('className="coffee-bean"')
    expect(landing, "and be driven by the restored specs").toMatch(/heroBeanSpecs\s*\.\s*map|heroBeanSpecs\.map/)
    // Four beans, the original count. A single stray bean is not the effect.
    const specs = landing.match(/const heroBeanSpecs = \[([\s\S]*?)\]/)
    expect(specs, "heroBeanSpecs must still be defined").toBeTruthy()
    expect((specs![1].match(/\{\s*left:/g) || []).length, "four beans, as originally").toBe(4)
    // Negative delays are what put beans mid-air on first paint rather than an empty hero.
    expect(specs![1], "delays stay negative so the hero opens mid-fall").toMatch(/delay: "-/)
  })

  it("every entry in the allowlist is still orphaned, or it should not be listed", () => {
    /**
     * Stops the allowlist outliving its reason. If somebody renders .marquee-track again, this fails
     * and the entry gets deleted instead of quietly suppressing a real future orphan.
     */
    const hay = appSource()
    const stale = Object.keys(INTENTIONALLY_UNUSED).filter((c) => isApplied(hay, c))
    expect(stale, "these are referenced now, so remove them from INTENTIONALLY_UNUSED").toEqual([])
    for (const [cls, reason] of Object.entries(INTENTIONALLY_UNUSED)) {
      expect(reason.length, `${cls} needs a real reason, not a placeholder`).toBeGreaterThan(40)
    }
  })
})
