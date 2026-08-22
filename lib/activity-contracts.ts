/**
 * The two vocabularies a client and a route have to agree on, written once.
 *
 * This codebase spells labour both ways on purpose -- `labor_transactions` is a table,
 * `labour_cost` is a view over it, `labour_assignments` is the muster -- and the estates are
 * Indian, so every label a person reads says "Labour". That is all fine until a spelling becomes
 * an *identifier* crossing a boundary, at which point one side says `labor` and the other says
 * `labour` and nothing anywhere complains.
 *
 * It has now happened twice, in the same shape, and neither instance threw:
 *
 *   - components/activity-log-tab.tsx keyed its filter on "labour" while
 *     /api/admin/tenant-activity validates "labor". Choosing Labour in the dropdown sent a value
 *     the route did not recognise, so the route ignored the filter and returned every source. The
 *     screen showed a filter that appeared to work and did nothing.
 *   - components/inventory-system/smart-next-steps.ts tested
 *     `latestActivity.module === "labour"` against a route that emits "labor". The "Review labour
 *     visibility" step could never fire, and never had.
 *
 * Both routes declared their vocabulary correctly. Both clients redeclared it -- one as its own
 * union with the other spelling, one as a bare `string` -- so TypeScript had nothing to compare.
 * A contract described in two places is not a contract.
 *
 * Import these instead of retyping the values. The compiler then catches the next one.
 */

/** What /api/recent-activity reports as the module a record belongs to. */
export const ACTIVITY_MODULES = ["processing", "dispatch", "sales", "labor", "expenses"] as const
export type ActivityModule = (typeof ACTIVITY_MODULES)[number]

/** What /api/admin/tenant-activity tags each row with, and accepts as ?source=. */
export const ACTIVITY_SOURCES = ["labor", "expense", "inventory"] as const
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number]

/**
 * Display text is a separate decision from the identifier and always has been: the growers are in
 * Karnataka and every label they read says Labour. Keeping the two apart here is what lets the
 * identifier stay American without anyone being tempted to "fix" it in a component.
 */
export const ACTIVITY_SOURCE_LABELS: Record<ActivitySource, string> = {
  labor: "Labour",
  expense: "Expenses",
  inventory: "Inventory",
}

export const isActivityModule = (value: unknown): value is ActivityModule =>
  ACTIVITY_MODULES.includes(String(value) as ActivityModule)

export const isActivitySource = (value: unknown): value is ActivitySource =>
  ACTIVITY_SOURCES.includes(String(value) as ActivitySource)
