"use client"

import { useMemo, useState } from "react"
import {
  ALL_FACET_VALUES,
  applyListControls,
  facetValueOf,
  type FacetDefinition,
  type SortDirection,
} from "@/lib/list-controls"

type ListControlsOptions<T> = {
  /**
   * Fields to match the search text against (case-insensitive substring).
   * Omit for lists whose search runs server-side — the hook then only sorts, and the
   * caller wires FilterBar's search box to its own query state.
   */
  searchFields?: (item: T) => Array<string | number | null | undefined>
  /** Sort key → accessor; string values compare lexically, numbers numerically */
  sorters: Record<string, (item: T) => string | number>
  defaultSort: string
  defaultDirection?: SortDirection
  /**
   * Dimensions the list can be narrowed by. The hook derives each facet's options from the data
   * rather than taking a fixed list, so a facet can never offer a value nothing has -- an empty
   * result from a dropdown you were just offered is the most annoying kind of empty.
   */
  facets?: ReadonlyArray<FacetDefinition<T>>
}

/**
 * Single source of truth for list search + sort state and application.
 * Pairs with <FilterBar>: spread the returned state into it and render
 * `items` instead of the raw array.
 */
export function useListControls<T>(items: T[], options: ListControlsOptions<T>) {
  const [search, setSearch] = useState("")
  const [sortValue, setSortValue] = useState(options.defaultSort)
  const [sortDirection, setSortDirection] = useState<SortDirection>(options.defaultDirection ?? "desc")
  const [facetValues, setFacetValues] = useState<Record<string, string>>({})

  const { searchFields, sorters, facets } = options

  /**
   * Options come from the data. Counts are taken against the SEARCHED list but before facets are
   * applied, so a facet still shows what selecting it would give you rather than collapsing to
   * "(1)" the moment you pick something.
   */
  const facetOptions = useMemo(() => {
    if (!facets?.length) return []
    const query = search.trim().toLowerCase()
    const base =
      query && searchFields
        ? items.filter((item) => searchFields(item).some((f) => String(f ?? "").toLowerCase().includes(query)))
        : items
    return facets.map((facet) => {
      const counts = new Map<string, number>()
      for (const item of base) {
        const v = facetValueOf(facet, item)
        counts.set(v, (counts.get(v) ?? 0) + 1)
      }
      return {
        key: facet.key,
        label: facet.label,
        value: facetValues[facet.key] ?? ALL_FACET_VALUES,
        options: [...counts.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([value, count]) => ({
            value,
            label: facet.labelOf ? facet.labelOf(value) : value,
            count,
          })),
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- facets/searchFields are stable config,
    // matching how sorters are treated below.
  }, [items, search, facetValues])

  const filtered = useMemo(
    () => applyListControls({ items, search, searchFields, sorters, sortValue, sortDirection, facets, facetValues }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see note above
    [items, search, sortValue, sortDirection, facetValues],
  )

  const setFacet = (key: string, value: string) =>
    setFacetValues((prev) => ({ ...prev, [key]: value }))

  const clearFacets = () => setFacetValues({})

  const activeFacetCount = Object.values(facetValues).filter((v) => v && v !== ALL_FACET_VALUES).length

  return {
    items: filtered,
    search,
    setSearch,
    sortValue,
    setSortValue,
    sortDirection,
    setSortDirection,
    facetOptions,
    setFacet,
    clearFacets,
    activeFacetCount,
    /** True when a client-side search is narrowing the list (never for server-side search). */
    isFiltering: Boolean(searchFields) && search.trim() !== "",
    /** True when anything at all is hiding rows -- search or a facet. */
    isNarrowed: (Boolean(searchFields) && search.trim() !== "") || activeFacetCount > 0,
    total: items.length,
  }
}
