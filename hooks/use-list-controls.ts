"use client"

import { useMemo, useRef, useState } from "react"
import type { SortDirection } from "@/components/filter-bar"

type ListControlsOptions<T> = {
  /** Fields to match the search text against (case-insensitive substring) */
  searchFields: (item: T) => Array<string | number | null | undefined>
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

  // Options hold inline functions; keep the latest without invalidating the memo
  const optionsRef = useRef(options)
  optionsRef.current = options

  const visibleItems = useMemo(() => {
    const { searchFields, sorters } = optionsRef.current
    const query = search.trim().toLowerCase()
    let list = query
      ? items.filter((item) =>
          searchFields(item).some((field) => String(field ?? "").toLowerCase().includes(query)),
        )
      : items

    const sorter = sorters[sortValue]
    if (sorter) {
      list = [...list].sort((a, b) => {
        const va = sorter(a)
        const vb = sorter(b)
        const cmp =
          typeof va === "number" && typeof vb === "number"
            ? va - vb
            : String(va).localeCompare(String(vb))
        return sortDirection === "asc" ? cmp : -cmp
      })
    }
    return list
  }, [items, search, sortValue, sortDirection])

  return {
    items: visibleItems,
    search,
    setSearch,
    sortValue,
    setSortValue,
    sortDirection,
    setSortDirection,
    isFiltering: search.trim() !== "",
  }
}
