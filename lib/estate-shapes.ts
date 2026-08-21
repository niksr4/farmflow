/**
 * Every arrangement an estate can be in, and one rule for reaching each part of it.
 *
 * Tenants are not the same shape as each other, and almost every silent bug this codebase has hit
 * came from a shape that had only just started existing. Medappa's second storehouse was two days
 * old when it exposed an expense drawing chemicals from the wrong shed. HoneyFarm's estate-general
 * locations were one day old when they exposed acreage being demanded of something that is not a
 * piece of land. Neither threw. Both produced a confident wrong number.
 *
 * The shapes that are real today, and the one that is not yet:
 *
 *   1 estate,  1 store                     Laxmi
 *   n estates, 1 store shared              HoneyFarm (Honeyfarm + Sidapur, one shed)
 *   n estates, 1 store each                Medappa (Tirtha, Citrus Grove)
 *   n estates, some shared and some own    nobody yet -- falls out of the same rule for free
 *   no store at all                        a tenant on day one
 *   no estates at all                      a tenant that never needed the dimension
 *
 * THE RULE, stated once: a location naming an estate belongs to that estate. A location naming
 * none belongs to all of them. That is the same always-shows convention `lib/estate-filter.ts`
 * applies to records, and it holds for stores and blocks alike -- so there is one rule to reason
 * about rather than two that can disagree.
 *
 * This module exists because that rule was written twice: once in the storeLocations memo in
 * inventory-system.tsx and once in scripts/dev/estate-store-shapes.mjs, whose own comment
 * conceded "if they drift, this is the one that is wrong". Two copies of a rule is a shape bug
 * waiting for someone to edit one of them.
 */

export type EstateLocation = {
  id?: string | null
  name?: string | null
  estate?: string | null
  kind?: "block" | "store" | "general" | null
}

const kindOf = (l: EstateLocation) => l.kind || "block"

/**
 * Does this location serve the selected estate? A location with no estate serves every estate,
 * which is what lets a single shed supply a tenant that later splits into two estates without
 * anyone having to re-file anything.
 */
export const servesEstate = (location: EstateLocation, estate: string | null | undefined) =>
  !estate || !location.estate || location.estate === estate

/** The storehouses an estate can draw stock from. */
export const storesForEstate = <T extends EstateLocation>(locations: readonly T[], estate: string | null | undefined): T[] =>
  locations.filter((l) => kindOf(l) === "store" && servesEstate(l, estate))

/**
 * Everywhere cost or work can be recorded: real blocks and estate-general locations, never the
 * store. Stock sits in a shed; work happens on land, and estate-wide spend happens on neither in
 * particular -- but all three are places a cost can name, and none of them is the store.
 */
export const costSitesForEstate = <T extends EstateLocation>(locations: readonly T[], estate: string | null | undefined): T[] =>
  locations.filter((l) => kindOf(l) !== "store" && servesEstate(l, estate))

/**
 * The denominator under every per-acre figure: land only. A shed has a footprint but nothing
 * planted on it, and an estate-general location is not a place at all. Including either quietly
 * inflates the denominator and understates every cost per acre the estate is shown.
 */
export const acreageSitesForEstate = <T extends EstateLocation>(locations: readonly T[], estate: string | null | undefined): T[] =>
  locations.filter((l) => kindOf(l) === "block" && servesEstate(l, estate))

/** Distinct estate names in use, in stable order. A tenant using none is a real shape, not an error. */
export const estatesInUse = (locations: readonly EstateLocation[]) =>
  [...new Set(locations.map((l) => l.estate).filter((e): e is string => Boolean(e)))].sort()

/**
 * A one-line description of the arrangement, for harnesses and for saying out loud what a tenant
 * looks like before guessing why something is wrong for them.
 */
export const describeShape = (locations: readonly EstateLocation[]) => {
  const estates = estatesInUse(locations)
  const stores = locations.filter((l) => kindOf(l) === "store")
  const shared = stores.filter((l) => !l.estate)
  const blocks = locations.filter((l) => kindOf(l) === "block")
  const general = locations.filter((l) => kindOf(l) === "general")

  const estatePart = estates.length === 0 ? "no estates" : `${estates.length} estate${estates.length > 1 ? "s" : ""}`
  const storePart =
    stores.length === 0
      ? "no store"
      : shared.length === stores.length
        ? `${stores.length} shared store${stores.length > 1 ? "s" : ""}`
        : shared.length === 0
          ? `${stores.length} store${stores.length > 1 ? "s" : ""}, one per estate`
          : `${stores.length} stores (${shared.length} shared)`

  return `${estatePart}, ${blocks.length} block${blocks.length === 1 ? "" : "s"}${general.length ? ` + ${general.length} general` : ""}, ${storePart}`
}

/**
 * Arrangements that are legal but will produce a misleading number somewhere, so they can be
 * reported rather than discovered. Not errors -- a tenant is allowed to be mid-setup -- but each
 * one makes some figure quietly less true than it looks.
 */
export const shapeWarnings = (locations: readonly EstateLocation[]): string[] => {
  const out: string[] = []
  const estates = estatesInUse(locations)
  const blocks = locations.filter((l) => kindOf(l) === "block")

  for (const estate of estates) {
    if (storesForEstate(locations, estate).length === 0) {
      out.push(`estate "${estate}" has nowhere to draw stock from`)
    }
  }

  const unmeasured = blocks.filter((l) => !l.estate && estates.length > 0)
  if (unmeasured.length > 0) {
    out.push(`${unmeasured.length} block(s) belong to no estate while others do, so they count under every estate`)
  }

  if (estates.length > 0 && locations.filter((l) => kindOf(l) === "store" && !l.estate).length > 1) {
    out.push("more than one shared store: stock can be drawn from either, and which one is arbitrary")
  }

  return out
}
