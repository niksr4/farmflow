/**
 * Pure search + sort applied to a record list. Lives here (rather than inside
 * `useListControls`) so the behaviour every record tab depends on is unit-testable.
 */

export type SortDirection = "asc" | "desc"

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
}

export function applyListControls<T>({
  items,
  search,
  searchFields,
  sorters,
  sortValue,
  sortDirection,
}: ApplyListControlsParams<T>): T[] {
  const query = search.trim().toLowerCase()

  const filtered =
    query && searchFields
      ? items.filter((item) =>
          searchFields(item).some((field) => String(field ?? "").toLowerCase().includes(query)),
        )
      : items

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
