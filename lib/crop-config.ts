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
 * intercrops on the same land, tracked through Other Sales rather than by pretending the estate is
 * a different kind of farm.
 *
 * If a genuinely different crop ever needs supporting, it needs its own processing chain and its
 * own tables -- not a lookup table of nouns. Reintroducing the label map would buy the appearance
 * of support without any of it, which is what this was.
 */

/** The two varieties an Indian coffee estate actually separates, everywhere in the app. */
export const DEFAULT_COFFEE_VARIETIES = ["Arabica", "Robusta"] as const

export type CoffeeVariety = (typeof DEFAULT_COFFEE_VARIETIES)[number]
