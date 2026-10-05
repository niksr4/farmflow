import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  ARABICA,
  COFFEE_FORMS,
  DEFAULT_COFFEE_VARIETIES,
  ROBUSTA,
  UNSPECIFIED_LABEL,
  coffeeFormMatchesSql,
  coffeeFormSql,
  coffeeVarietyMatchesSql,
  coffeeVarietySql,
  displayCoffeeForm,
  displayCoffeeVariety,
  formatProduceLabel,
  parseCoffeeForm,
  parseCoffeeVariety,
} from "@/lib/crop-config"

/**
 * ONE PLACE DECIDES WHICH COFFEE AND WHICH FORM.
 *
 * Thirteen places used to re-derive "is this cherry or parchment" from free text, and they did not
 * agree. Estate Mock -- the demo tenant, not a customer -- has one sales row and one dispatch row
 * reading "Dry P"; that single value was a
 * third product category on two tabs, null in the write validator, and "Dry Parchment" in five read
 * paths. Nothing threw -- the sales tab just showed three bag types for an estate that has two, and
 * resolveSlotStock could not see that bag at all, so the app would refuse to sell parchment the
 * estate owned.
 *
 * Four of those thirteen were found by this scan rather than by reading the code, including an entire
 * variety normaliser in app/api/yield-forecast. That is the argument for a shape scan over a list.
 */

/** Files allowed to contain the decision, because they ARE the decision. */
const HOME = "lib/crop-config.ts"

/**
 * The shape of re-deriving a canonical value from free text: a substring or pattern test whose
 * subject is one of the four words. `=== ARABICA` is fine -- comparing against the shared constant
 * is the point. What is banned is asking "does this text contain 'arabica'" to decide a category.
 */
/**
 * ⚠ THE ABBREVIATIONS BELONG HERE TOO. This was only the four full words, which left the guard blind
 * to exactly the spellings this refactor taught the system to accept: a new file writing
 * `value.includes("dry p")` to classify a form would have passed the scan, and "Dry P" is the real
 * value that caused all of this.
 *
 * `dry\s*p(?![a-z])` is anchored on the right so it claims "dry p" but not "dry pepper" -- a
 * different crop -- and not "dry parchment", which `parch` already covers. `dp`/`dc` need word
 * boundaries or they would fire inside unrelated identifiers.
 */
const CROP_WORD = "cherry|parch|arabica|robusta|dry\\s*p(?![a-z])|\\bdp\\b|\\bdc\\b"
const AD_HOC_DECISION = new RegExp(
  [
    // includes("cherry"), startsWith("arab"), match(/robusta/) …
    `(?:includes|startsWith|endsWith|indexOf|search|match|test)\\s*\\(\\s*[\`"'/][^\`"'/]*(?:${CROP_WORD})`,
    // SQL, either operator
    `\\bLIKE\\s+'%?(?:${CROP_WORD})`,
    `~\\s*'[^']*(?:${CROP_WORD})`,
    // ⚠ A BARE LIKE PATTERN, WITH NO OPERATOR ON THE LINE. Added because the tamper fixture below
    // caught the omission: the real `bagPatternFor` was
    //   bagType === "Dry Cherry" ? "%cherry%" : "%parchment%"
    // which builds the pattern on one line and applies it on another, so none of the clauses above
    // could see it -- and that function is the one that understated parchment stock.
    //
    // Only [a-z%] may surround the word, which is what makes this a PATTERN rather than a sentence.
    // A first attempt allowed anything, and matched ten lines of prose that happen to contain a
    // percentage near one of the words -- "30-50% canopy cover for Arabica", "10-11% moisture
    // content for parchment", and the shade tree "Grevillea robusta". Those are in the must-NOT-match
    // fixture below now, so the clause cannot drift back to over-matching.
    `['"\`](?=[^'"\`]*%)[a-z%]*(?:${CROP_WORD})[a-z%]*['"\`]`,
    // Equality against a RAW ABBREVIATION, e.g. `normalized === "dp"` or `case "dry p":`.
    //
    // Only the abbreviations, never the full words, and the line is deliberate. A comparison like
    // `normalizeBagType(value) === "cherry"` is legitimate: "cherry" is the shared helper's own
    // return key, and the sales tab and the CSV export both read it that way. But "dp", "dc" and
    // "dry p" are not anybody's vocabulary -- they are raw spellings out of the data, so testing a
    // value against one is always a classifier. The literal must be the whole spelling, which keeps
    // `=== "Dry Parchment"` (the canonical value) out of it.
    `[=!]==?\\s*(['"\`])(?:dp|dc|dry\\s*p)\\1`,
  ].join("|"),
  "i",
)

/**
 * Comments blanked before matching, newlines kept so line numbers survive.
 *
 * NOT optional. lib/crop-config.ts, lib/server/season-summary-utils.ts and app/api/sales/route.ts
 * all explain this bug by quoting the banned pattern verbatim -- `includes("cherry") ? cherry :
 * parchment` and `LIKE '%parchment%'`. A scan over raw text would flag the documentation of the fix
 * as an instance of the bug, and the natural response would be to delete the explanation.
 */
const blankComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + " ".repeat(m.length - lead.length))

const sourceFiles = (): string[] =>
  execSync("git ls-files app lib components", { encoding: "utf8" })
    .split("\n")
    .filter((f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && f !== HOME)

const offenders = (): string[] => {
  const found: string[] = []
  for (const file of sourceFiles()) {
    const code = blankComments(readFileSync(resolve(process.cwd(), file), "utf8"))
    code.split("\n").forEach((line, i) => {
      if (AD_HOC_DECISION.test(line)) found.push(`${file}:${i + 1}`)
    })
  }
  return found
}

describe("one place decides which coffee and which form", () => {
  it("no file re-derives the variety or the form from free text", () => {
    expect(
      offenders(),
      `import from @/lib/${HOME.replace("lib/", "")} instead — a second copy of this rule is how one ` +
        `"Dry P" row became a third bag type on two screens and vanished from the stock slot that ` +
        "gates a sale",
    ).toEqual([])
  })

  it("the scan can see the thing it forbids", () => {
    /**
     * The failure mode of the test above is matching nothing and reporting success -- and it would
     * pass just as happily with a regex that matches nothing at all. These are the exact forms that
     * were in the tree before this refactor.
     */
    const realExamples = [
      `if (normalized.includes("cherry")) return "Dry Cherry"`,
      `String(value || "").toLowerCase().includes("cherry") ? "Dry Cherry" : "Dry Parchment"`,
      `WHEN lower(bag_type) LIKE '%cherry%' THEN 'Dry Cherry'`,
      `if (lower.includes("arabica")) return "Arabica"`,
      `yieldByType.find((item) => item.coffeeType.toLowerCase().includes("robusta"))`,
      `bagType === "Dry Cherry" ? "%cherry%" : "%parchment%"`,
      // The abbreviations. A classifier keyed on these would have slipped past the first version of
      // this scan, and "Dry P" is the value the whole refactor is named after.
      `if (raw.includes("dry p")) return "Dry Parchment"`,
      `if (normalized === "dp") return "Dry Parchment"`,
      `if (normalized === "dc") return "Dry Cherry"`,
      `WHEN lower(bag_type) LIKE 'dry p%' THEN 'Dry Parchment'`,
    ]
    for (const example of realExamples) {
      expect(AD_HOC_DECISION.test(example), `should be caught: ${example}`).toBe(true)
    }

    // ...and does not fire on the legitimate shapes, or the guard would be unusable.
    const allowed = [
      `if (variety === ARABICA) return "arabica"`,
      `const form = parseCoffeeForm(value)`,
      `export const BAG_TYPES = COFFEE_FORMS`,
      `label: "Arabica"`,
      `title: "Arabica vs Robusta notes"`,
      // Prose that contains a percentage near one of the words. All four are real lines from
      // lib/coffee-agronomy.ts and the data-integrity agent, and an earlier version of the bare-
      // pattern clause flagged every one of them.
      `idealShade: "30–50% canopy cover for Arabica; 20–30% for Robusta (needs more sun)"`,
      `targetAfterDrying: "10–11% moisture content for parchment before dispatch to curing works"`,
      `"Silver Oak (Grevillea robusta) — fastest growing, widely planted"`,
      "description: `${location} ${coffeeType} dry parchment yield is ${pct}% vs baseline`,",
      // Comparing against a shared helper's own return key, or against a canonical value. Both are
      // the pattern this refactor wants, so neither may be flagged.
      `normalizeBagType(value) === "cherry" ? "Dry Cherry" : "Dry Parchment"`,
      `normalizeBagTypeKey(value) === "dry_cherry"`,
      `if (form === "Dry Parchment") return total`,
      `bag_type: "Dry Cherry"`,
    ]
    for (const example of allowed) {
      expect(AD_HOC_DECISION.test(example), `should be allowed: ${example}`).toBe(false)
    }
  })

  it("strips comments, so documenting the bug is not committing it", () => {
    const explaining = [
      `// This used to be includes("cherry") ? cherry : parchment, which was wrong.`,
      `/* The old pattern was LIKE '%parchment%' and it missed "Dry P". */`,
    ].join("\n")
    expect(AD_HOC_DECISION.test(explaining), "the raw text does contain the pattern").toBe(true)
    expect(
      blankComments(explaining).split("\n").some((l) => AD_HOC_DECISION.test(l)),
      "but not once comments are blanked",
    ).toBe(false)
    // Blanking must preserve line count, or reported line numbers point at the wrong code.
    expect(blankComments(explaining).split("\n").length).toBe(2)
  })

  it("recognises the spellings an estate actually types", () => {
    // "Dry P" is real: one sales row and one dispatch row, on the Estate Mock demo tenant.
    expect(parseCoffeeForm("Dry P")).toBe("Dry Parchment")
    expect(parseCoffeeForm("dry p")).toBe("Dry Parchment")
    expect(parseCoffeeForm("DP")).toBe("Dry Parchment")
    expect(parseCoffeeForm("dc")).toBe("Dry Cherry")
    expect(parseCoffeeForm("  Dry  Cherry ")).toBe("Dry Cherry")
    expect(parseCoffeeForm("parchment")).toBe("Dry Parchment")

    // The anchor on ^dry\s*p$ exists so a different crop is not claimed as parchment.
    expect(parseCoffeeForm("dry pepper")).toBeNull()
    expect(parseCoffeeForm("green bean")).toBeNull()
    expect(parseCoffeeForm("")).toBeNull()
    expect(parseCoffeeForm(null)).toBeNull()

    expect(parseCoffeeVariety("arabica washed")).toBe(ARABICA)
    expect(parseCoffeeVariety("ROBUSTA")).toBe(ROBUSTA)
    expect(parseCoffeeVariety("excelsa")).toBeNull()
  })

  it("refuses a value that names both forms, rather than picking the first", () => {
    /**
     * A cell reading "Dry Cherry / Dry Parchment" does not establish which it is.
     *
     * The first version returned on the first pattern hit, so the parser said "Dry Cherry" (cherry is
     * tested first) while migration 153 said "Dry Parchment" (its parchment UPDATE ran first) -- the
     * app and the database settling the same cell differently, which is the precise failure this
     * module exists to end. Both refuse now: null here, and the migration aborts before its UPDATEs
     * can erase the original value.
     */
    expect(parseCoffeeForm("Dry Cherry / Dry Parchment")).toBeNull()
    expect(parseCoffeeForm("cherry and parchment")).toBeNull()
    expect(parseCoffeeVariety("arabica and robusta")).toBeNull()
    expect(displayCoffeeForm("Dry Cherry / Dry Parchment")).toBe(UNSPECIFIED_LABEL)

    // An unambiguous value is still read, including the abbreviations.
    expect(parseCoffeeForm("Dry P")).toBe("Dry Parchment")
    expect(parseCoffeeForm("Dry Cherry")).toBe("Dry Cherry")

    // The migration refuses the same thing, keyed on the same two pattern sets.
    const migration = readFileSync(resolve(process.cwd(), "scripts/153-one-crop-taxonomy.sql"), "utf8")
    const abort = migration.slice(0, migration.indexOf("── 1. Repair"))
    expect(abort, "the ambiguity check must run BEFORE the UPDATEs").toMatch(/RAISE EXCEPTION/)
    expect(abort).toMatch(/cherry/)
    expect(abort).toMatch(/parch/)
    expect(abort).toMatch(/\^dry\\s\*p\$/)
    /**
     * BOTH AXES. The first version guarded bag_type only, which left the identical hole one column
     * across: 'Arabica / Robusta' would have been settled silently, because the Arabica UPDATE runs
     * first and the Robusta UPDATE then skips a cell that already reads 'Arabica'. Section 2 would
     * have accepted it and the CHECK locked it in.
     */
    expect(abort, "the variety must be checked for ambiguity too").toMatch(/arabica/i)
    expect(abort).toMatch(/robusta/i)
    expect(
      (abort.match(/RAISE EXCEPTION/g) || []).length,
      "one abort per axis",
    ).toBe(2)
  })

  it("names what it cannot place instead of guessing or echoing it", () => {
    /**
     * The two failure modes this replaces. Echoing the raw value invented a category and split a
     * total; defaulting to parchment filed cherry money under parchment. Both were silent.
     */
    expect(displayCoffeeForm("green bean")).toBe(UNSPECIFIED_LABEL)
    expect(displayCoffeeForm(null)).toBe(UNSPECIFIED_LABEL)
    expect(displayCoffeeVariety("excelsa")).toBe(UNSPECIFIED_LABEL)
    // A recognised value is never relabelled.
    expect(displayCoffeeForm("Dry P")).toBe("Dry Parchment")
  })

  it("the SQL is generated from the same patterns, so Postgres cannot disagree", () => {
    /**
     * Grouping happens in the database. `GROUP BY bag_type` on the raw column hands back "Dry P" and
     * "Dry Parchment" as separate rows, and no correct TypeScript downstream can merge two rows the
     * database already split -- app/api/sales/route.ts was doing exactly that.
     *
     * Verified against Postgres on 2026-10-03 across sixteen inputs, TypeScript and SQL agreeing on
     * every one. This test holds the structural half of that: the same pattern strings reach both.
     */
    const formSql = coffeeFormSql("bag_type")
    expect(formSql).toContain("lower(trim(bag_type))")
    expect(formSql).toContain("'Dry Cherry'")
    expect(formSql).toContain("'Dry Parchment'")
    expect(formSql).toContain(`'${UNSPECIFIED_LABEL}'`)
    // The anchored "Dry P" pattern must survive into the SQL, not just live in the TypeScript.
    expect(formSql).toContain("^dry\\s*p$")
    expect(coffeeVarietySql("pr.coffee_type")).toContain("lower(trim(pr.coffee_type))")

    // No ELSE that echoes the column: that is what minted the phantom category.
    expect(formSql).not.toMatch(/ELSE\s+COALESCE/i)
    expect(formSql).not.toMatch(/ELSE\s+[A-Za-z]/)
  })

  it("refuses to build SQL from anything that is not a plain column or a known value", () => {
    expect(() => coffeeFormSql("bag_type; DROP TABLE sales_records")).toThrow(/plain column/)
    expect(() => coffeeFormSql("(SELECT 1)")).toThrow(/plain column/)
    expect(() => coffeeVarietySql("a.b.c")).toThrow(/plain column/)
    // Qualified references are legitimate and must still work.
    expect(() => coffeeVarietySql("pr.coffee_type")).not.toThrow()
    // The compared value is embedded too, so it is checked rather than trusted.
    expect(() => coffeeFormMatchesSql("bag_type", "Dry P' OR '1'='1" as never)).toThrow(/coffee form/)
    expect(() => coffeeVarietyMatchesSql("coffee_type", "Arabica'--" as never)).toThrow(/coffee variety/)
  })

  it("names a produce line the way a reader needs it", () => {
    /**
     * Coffee is the only crop with a variety and a form, so saying "Coffee" as well would make every
     * coffee row read "Coffee Arabica Dry Parchment" -- one word of noise on 97% of rows. The crop is
     * named only when it is not coffee, which is exactly when a reader needs telling.
     */
    expect(formatProduceLabel({ crop: "Coffee", variety: "Arabica", form: "Dry Parchment" })).toBe(
      "Arabica Dry Parchment",
    )
    expect(formatProduceLabel({ variety: "Robusta", form: "Dry P" })).toBe("Robusta Dry Parchment")
    expect(formatProduceLabel({ crop: "Pepper" })).toBe("Pepper")
    // Pepper has no bag type, and must not be given one.
    expect(formatProduceLabel({ crop: "Pepper", form: null })).toBe("Pepper")
    expect(formatProduceLabel({})).toBe(UNSPECIFIED_LABEL)
  })

  it("keeps the canonical lists to the two values each", () => {
    expect([...DEFAULT_COFFEE_VARIETIES]).toEqual(["Arabica", "Robusta"])
    expect([...COFFEE_FORMS]).toEqual(["Dry Parchment", "Dry Cherry"])
  })
})
