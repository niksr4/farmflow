"use client"

import { useMemo, useState } from "react"
import { applyListControls, type SortDirection } from "@/lib/list-controls"

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

  // `options` holds inline functions with a fresh identity every render. We intentionally
  // depend only on the data + search/sort state below and treat the accessors as stable
  // config, so the memo doesn't recompute on every parent render. (Accessing them via a ref
  // is disallowed during render by the React Compiler, so we close over them directly.)
  const { searchFields, sorters } = options

  const visibleItems = useMemo(
    () => applyListControls({ items, search, searchFields, sorters, sortValue, sortDirection }),
    // searchFields/sorters are treated as stable config (see note above); depending on them
    // would defeat the memo since they get a new identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, search, sortValue, sortDirection],
  )

  return {
    items: visibleItems,
    search,
    setSearch,
    sortValue,
    setSortValue,
    sortDirection,
    setSortDirection,
    /** True when a client-side search is narrowing the list (never for server-side search). */
    isFiltering: Boolean(searchFields) && search.trim() !== "",
  }
}
