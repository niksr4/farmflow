/**
 * FarmFlow grows coffee.
 *
 * This file used to hold seven crop families -- coffee, tea, cocoa, spices, tree nuts, grains,
 * horticulture -- each with its own processing vocabulary, so the app could one day be told which
 * crop an estate grew and relabel itself. That day was never coming: every tenant's cropFamily was
 * null, the guided-setup picker had already been narrowed to coffee only, and the per-crop
 * `processingTerms` that justified the whole structure were read by exactly nothing.
 *
 * The product is coffee-first now and says so on its own landing page. Pepper and arecanut are
 * intercrops on the same land rather than a reason to pretend the estate is a different kind of farm.
 *
 * ⚠ "TRACKED THROUGH OTHER SALES" WAS HALF THE STORY, and this line said only that until 2026-10-03.
 * Pepper has its own processing table too: `pepper_records` (kg_picked -> green_pepper -> dry_pepper,
 * the same wide-column shape as coffee's processing_records), and HoneyFarm has 19 rows in it from
 * February 2026 -- 2,815 kg picked, 744 kg dry. So pepper runs a real two-stage flow, with processing
 * in `pepper_records` and revenue in `other_sales_records`. Only the REVENUE goes through Other Sales.
 *
 * That matters for anyone extending this: pepper already has a crop axis (its own table), a form axis
 * (green vs dry, as columns), and no variety axis. Arecanut has none of the three and appears only as
 * an `asset_type` on a sale.
 *
 * If a genuinely different crop ever needs supporting, it needs its own processing chain and its
 * own tables -- not a lookup table of nouns. Reintroducing the label map would buy the appearance
 * of support without any of it, which is what this was.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * THREE AXES, NOT ONE. What an estate sells has three independent parts, and conflating any two of
 * them is how the same bag gets counted twice or lands in a category nobody asked for:
 *
 *   CROP     what grows on the land          Coffee, Pepper, Arecanut
 *   VARIETY  which coffee, coffee only       Arabica, Robusta
 *   FORM     the state it is sold in         Dry Parchment, Dry Cherry
 *
 * A coffee sale is (Coffee, Arabica, Dry Parchment). A pepper sale is (Pepper, -, -), which is why
 * `bag_type` is null on those rows rather than holding something invented.
 *
 * The database still carries the older, looser shape and this module is what makes it behave:
 *   coffee_type    VARIETY, on processing/dispatch/sales/curing. Free text, no constraint.
 *   bag_type       FORM, on dispatch/sales. Free text, no constraint, and it HAS drifted.
 *   crop           CROP, on picking_records only, lowercase, CHECK (coffee|pepper).
 *   asset_type     CROP, on other_sales_records.
 *   produce_type   VARIETY *union* CROP -- the booked_revenue view unions sales_records.coffee_type
 *                  with other_sales_records.asset_type, so one column holds "Arabica" and "Pepper"
 *                  as peers. That union is the clearest statement of the conflation above.
 *
 * ⚠ WHY ONE RECOGNISER AND NOT EIGHT. Thirteen places used to decide Cherry-vs-Parchment and they did
 * not agree (four of them found by the guard, not by reading the code). Estate Mock -- the demo
 * tenant, NOT a customer -- has one sales row and one dispatch row reading "Dry P", and that single
 * value was simultaneously:
 *
 *   "Dry P"           a third product category, in the sales and dispatch tabs (SQL CASE kept the
 *                     raw value in its ELSE, so the estate saw three bag types where it has two and
 *                     a bag of parchment went missing from the parchment total)
 *   null              in canonicalizeBagType, which validates writes
 *   "Dry Parchment"   in five read paths, by falling through to a default
 *
 * Nothing threw. The totals were just quietly wrong in one place and quietly right in another, which
 * is this project's whole failure signature. So: one list of spellings, one recogniser per axis, and
 * the SQL built from the SAME patterns so Postgres cannot answer differently from TypeScript.
 */

/** The crops that appear on these estates. Coffee is the product; the rest are intercrops. */
export const CROPS = ["Coffee", "Pepper", "Arecanut"] as const
export type Crop = (typeof CROPS)[number]

/**
 * The two varieties an Indian coffee estate actually separates, everywhere in the app.
 *
 * Named individually as well, because callers that want "the arabica one" were fishing it back out
 * of the list with `.find(t => t.toLowerCase().includes("arabica"))` -- re-deriving a constant from
 * itself, and one more place that would need editing if a spelling ever moved.
 */
export const ARABICA = "Arabica"
export const ROBUSTA = "Robusta"
export const DEFAULT_COFFEE_VARIETIES = [ARABICA, ROBUSTA] as const
export type CoffeeVariety = (typeof DEFAULT_COFFEE_VARIETIES)[number]

/** The two forms coffee is sold in. Parchment is washed, cherry is dried whole. */
export const COFFEE_FORMS = ["Dry Parchment", "Dry Cherry"] as const
export type CoffeeForm = (typeof COFFEE_FORMS)[number]

/**
 * What a reader sees when a row's variety or form is missing or unrecognised.
 *
 * Deliberately NOT the raw value and NOT a guess. Echoing the raw value invents a category and
 * splits a total; guessing a default hides a data-entry problem behind a plausible number. Naming it
 * keeps the money visible and the ambiguity visible at the same time.
 */
export const UNSPECIFIED_LABEL = "Unspecified"

/**
 * Spellings that have to be recognised, as POSIX-and-JavaScript-compatible patterns.
 *
 * Matched against the value lowercased and trimmed. Order matters: cherry is tested first, because
 * "dry cherry" contains no "parch" but a careless parchment pattern could swallow it.
 *
 * `^dry\s*p$` is anchored on purpose -- it exists for the real "Dry P" rows, and an unanchored
 * version would also claim "dry pepper", which is a different crop entirely.
 *
 * ONE DEFINITION DRIVES BOTH the TypeScript recogniser and the SQL CASE below. Two hand-written
 * copies of the same rule is exactly how `bag_type` ended up with eight answers.
 */
const COFFEE_FORM_PATTERNS: ReadonlyArray<readonly [CoffeeForm, string]> = [
  ["Dry Cherry", "cherry|^dc$"],
  ["Dry Parchment", "parch|^dry\\s*p$|^dp$"],
] as const

/** Varieties, same mechanism. Only the full words appear in any tenant's data. */
const COFFEE_VARIETY_PATTERNS: ReadonlyArray<readonly [CoffeeVariety, string]> = [
  ["Arabica", "arabica"],
  ["Robusta", "robusta"],
] as const

/**
 * Compiled once at module load rather than per call. The pattern strings are constants in this file,
 * never input, so there is nothing dynamic to exploit -- but building a RegExp from a variable on
 * every call is both wasteful and the shape a scanner flags, and neither is worth defending.
 */
const compile = <T extends string>(patterns: ReadonlyArray<readonly [T, string]>) =>
  patterns.map(([canonical, pattern]) => [canonical, new RegExp(pattern)] as const)

const COMPILED_FORMS = compile(COFFEE_FORM_PATTERNS)
const COMPILED_VARIETIES = compile(COFFEE_VARIETY_PATTERNS)

/**
 * ⚠ AMBIGUITY IS NOT A MATCH. If a value matches more than one canonical answer -- "Dry Cherry /
 * Dry Parchment", or a cell holding both because somebody merged two columns -- then the input does
 * not establish which it is, and picking one is inventing the answer.
 *
 * This mattered concretely: the first version returned on the first hit, so the parser answered
 * "Dry Cherry" (cherry is tested first) while migration 153 answered "Dry Parchment" (its parchment
 * UPDATE ran first) -- the app and the database disagreeing about the same cell, which is the exact
 * failure this whole file exists to end. Returning null makes the import report it and the migration
 * refuse to touch it.
 */
const matchPatterns = <T extends string>(
  compiled: ReadonlyArray<readonly [T, RegExp]>,
  value: string | null | undefined,
): T | null => {
  const normalized = String(value ?? "").trim().toLowerCase()
  if (!normalized) return null
  const hits = new Set<T>()
  for (const [canonical, pattern] of compiled) {
    if (pattern.test(normalized)) hits.add(canonical)
  }
  return hits.size === 1 ? [...hits][0] : null
}

/**
 * Strict. Returns null for anything not recognised, so a WRITE can be refused.
 *
 * Use this when accepting input. Saving an unrecognised form is how "Dry P" got into the table in
 * the first place, and one row of it cost two wrong screens.
 */
export const parseCoffeeForm = (value: string | null | undefined): CoffeeForm | null =>
  matchPatterns(COMPILED_FORMS, value)

/** Strict, as above, for the variety. */
export const parseCoffeeVariety = (value: string | null | undefined): CoffeeVariety | null =>
  matchPatterns(COMPILED_VARIETIES, value)

/**
 * For READING: always a label a person can group by, never a silent guess and never the raw value.
 *
 * The distinction from `parseCoffeeForm` is the whole point. A write path wants to reject what it
 * cannot understand; a report has to show the money anyway, under a name that admits what it does
 * not know.
 */
export const displayCoffeeForm = (value: string | null | undefined): CoffeeForm | typeof UNSPECIFIED_LABEL =>
  parseCoffeeForm(value) ?? UNSPECIFIED_LABEL

/** As above, for the variety. */
export const displayCoffeeVariety = (
  value: string | null | undefined,
): CoffeeVariety | typeof UNSPECIFIED_LABEL => parseCoffeeVariety(value) ?? UNSPECIFIED_LABEL

/**
 * The same rule, as SQL, generated from the patterns above.
 *
 * Needed because grouping happens in the database: `GROUP BY bag_type` on the raw column buckets
 * "Dry P" separately from "Dry Parchment", and no amount of correct TypeScript downstream can merge
 * two rows the database already handed back apart.
 *
 * `column` is an identifier from our own source, never user input, and is shape-checked anyway so a
 * caller cannot turn this into an injection point by accident.
 */
const caseExpression = <T extends string>(
  patterns: ReadonlyArray<readonly [T, string]>,
  column: string,
): string => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(column)) {
    throw new Error(`crop-config: ${JSON.stringify(column)} is not a plain column reference`)
  }
  const subject = `lower(trim(${column}))`
  const whens = patterns.map(([canonical, pattern]) => `WHEN ${subject} ~ '${pattern}' THEN '${canonical}'`)
  return `CASE\n    ${whens.join("\n    ")}\n    ELSE '${UNSPECIFIED_LABEL}'\n  END`
}

/** SQL that collapses any spelling of the form onto one of the two canonical labels. */
export const coffeeFormSql = (column: string): string => caseExpression(COFFEE_FORM_PATTERNS, column)

/** SQL that collapses any spelling of the variety onto one of the two canonical labels. */
export const coffeeVarietySql = (column: string): string =>
  caseExpression(COFFEE_VARIETY_PATTERNS, column)

/**
 * A SQL predicate selecting rows whose form is `form`, whatever they are spelled as.
 *
 * Replaces `bagPatternFor`, which built a LIKE pattern by assuming anything-not-cherry is parchment
 * -- so it matched "Dry P" for neither and silently excluded that row from both halves of a split.
 */
export const coffeeFormMatchesSql = (column: string, form: CoffeeForm): string => {
  if (!COFFEE_FORMS.includes(form)) {
    throw new Error(`crop-config: ${JSON.stringify(form)} is not a coffee form`)
  }
  return `(${coffeeFormSql(column)}) = '${form}'`
}

/** As above, for the variety. */
export const coffeeVarietyMatchesSql = (column: string, variety: CoffeeVariety): string => {
  if (!DEFAULT_COFFEE_VARIETIES.includes(variety)) {
    throw new Error(`crop-config: ${JSON.stringify(variety)} is not a coffee variety`)
  }
  return `(${coffeeVarietySql(column)}) = '${variety}'`
}

/**
 * How a produce line reads on screen: "Arabica Dry Parchment", "Pepper".
 *
 * Coffee is the only crop with a variety and a form, so naming the crop as well would make every
 * coffee row read "Coffee Arabica Dry Parchment" -- three words of which one is noise on 97% of
 * rows. The crop is named only when it is NOT coffee, which is exactly when a reader needs telling.
 */
export const formatProduceLabel = (parts: {
  crop?: Crop | string | null
  variety?: string | null
  form?: string | null
}): string => {
  const crop = String(parts.crop ?? "").trim()
  const isCoffee = !crop || crop.toLowerCase() === "coffee"
  if (!isCoffee) return crop
  const variety = parseCoffeeVariety(parts.variety)
  const form = parseCoffeeForm(parts.form)
  const words = [variety, form].filter(Boolean)
  return words.length ? words.join(" ") : UNSPECIFIED_LABEL
}
