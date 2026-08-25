/**
 * Pure search + sort applied to a record list. Lives here (rather than inside
 * `useListControls`) so the behaviour every record tab depends on is unit-testable.
 */

export type SortDirection = "asc" | "desc"

/**
 * A named dimension a list can be narrowed by -- worker type, estate, status.
 *
 * Separate from `search` because they answer different questions and compose: search is "find the
 * thing I can name", a facet is "show me only this kind". A roster of thirty-six with eight types
 * needs the second one, and typing "chkroll" into a search box only works if the label happens to
 * appear in a searched field.
 *
 * `ALL_FACET_VALUES` rather than an empty string, because "" is a legitimate value for a facet over
 * a nullable column -- "workers with no estate set" is a real thing to ask for, and the sentinel
 * keeps it distinguishable from "not filtering".
 */
export const ALL_FACET_VALUES = "__all__"

export type FacetDefinition<T> = {
  /** Stable key, used as the state key and the control's id. */
  key: string
  label: string
  /** The value this item falls under. Null/undefined become UNSET_FACET_VALUE. */
  valueOf: (item: T) => string | null | undefined
  /** How a value is shown. Defaults to the value itself. */
  labelOf?: (value: string) => string
}

/** What a facet reports for an item whose value is null -- a real bucket, not an absence. */
export const UNSET_FACET_VALUE = "__unset__"

export type ApplyListControlsParams<T> = {
  items: readonly T[]
  search: string
  /**
   * Fields the search text is matched against (case-insensitive substring).
   * Omit for server-side search — sorting still applies, filtering is left to the API.
   */
  searchFields?: (item: T) => Array<string | number | null | undefined>
  sorters: Record<string, (item: T) => string | number>
  sortValue: string
  sortDirection: SortDirection
  /** Facet definitions, and the currently selected value for each by key. */
  facets?: ReadonlyArray<FacetDefinition<T>>
  facetValues?: Readonly<Record<string, string>>
}

export const facetValueOf = <T,>(facet: FacetDefinition<T>, item: T): string => {
  const raw = facet.valueOf(item)
  const value = raw == null ? "" : String(raw).trim()
  return value === "" ? UNSET_FACET_VALUE : value
}

export function applyListControls<T>({
  items,
  search,
  searchFields,
  sorters,
  sortValue,
  sortDirection,
  facets,
  facetValues,
}: ApplyListControlsParams<T>): T[] {
  const query = search.trim().toLowerCase()

  const searched =
    query && searchFields
      ? items.filter((item) =>
          searchFields(item).some((field) => String(field ?? "").toLowerCase().includes(query)),
        )
      : items

  // Facets narrow after search and compose with each other: two facets set means both must match,
  // which is what "type = casuals" plus "estate = Sidapur" reads as to anyone using it.
  const filtered =
    facets && facets.length && facetValues
      ? searched.filter((item) =>
          facets.every((facet) => {
            const selected = facetValues[facet.key]
            if (!selected || selected === ALL_FACET_VALUES) return true
            return facetValueOf(facet, item) === selected
          }),
        )
      : searched

  const sorter = sorters[sortValue]
  if (!sorter) return [...filtered]

  // Copy before sorting: the input may be React state, which must not be mutated.
  return [...filtered].sort((a, b) => {
    const va = sorter(a)
    const vb = sorter(b)
    const cmp =
      typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))
    return sortDirection === "asc" ? cmp : -cmp
  })
}
