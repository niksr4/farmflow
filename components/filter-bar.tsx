"use client"

import type React from "react"
import { ArrowDown, ArrowUp, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"

export type { SortDirection } from "@/lib/list-controls"
import { ALL_FACET_VALUES, type SortDirection } from "@/lib/list-controls"

export type FilterBarSortOption = { value: string; label: string }

export type FilterBarFacet = {
  key: string
  label: string
  value: string
  options: Array<{ value: string; label: string; count: number }>
}

/**
 * Single source of truth for list filtering controls across tabs:
 * a search box, a sort field select, and an asc/desc toggle.
 * Pass extra tab-specific controls via `children` (rendered on the right).
 */
export default function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  sortOptions,
  sortValue,
  onSortChange,
  sortDirection,
  onSortDirectionChange,
  facets,
  onFacetChange,
  onClearFacets,
  activeFacetCount = 0,
  children,
  className,
}: {
  search: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  sortOptions: FilterBarSortOption[]
  sortValue: string
  onSortChange: (value: string) => void
  sortDirection: SortDirection
  onSortDirectionChange: (value: SortDirection) => void
  /** Dimensions to narrow by, derived from the data by useListControls. */
  facets?: FilterBarFacet[]
  onFacetChange?: (key: string, value: string) => void
  onClearFacets?: () => void
  activeFacetCount?: number
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="relative min-w-0 flex-1 basis-48">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-11 w-full rounded-xl border border-stone-200 bg-white pl-9 pr-8 text-sm font-medium text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-stone-200"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-stone-400 hover:text-stone-600 touch-manipulation"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <select
          value={sortValue}
          onChange={(e) => onSortChange(e.target.value)}
          aria-label="Sort by"
          className="h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-stone-200"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onSortDirectionChange(sortDirection === "desc" ? "asc" : "desc")}
          aria-label={sortDirection === "desc" ? "Sorted newest/highest first" : "Sorted oldest/lowest first"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 transition-colors hover:bg-stone-50 active:scale-95 touch-manipulation dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-stone-300"
        >
          {sortDirection === "desc" ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>

      {/* Facets sit after sort and before tab-specific children, so the row reads
          find -> narrow -> order -> anything unusual. Each option carries its count, because a
          dropdown that offers a value with nothing behind it wastes the click that discovers so. */}
      {facets?.map((facet) => (
        <div key={facet.key} className="flex min-w-0 items-center gap-1.5">
          <label htmlFor={`facet-${facet.key}`} className="sr-only">{facet.label}</label>
          <select
            id={`facet-${facet.key}`}
            value={facet.value}
            onChange={(e) => onFacetChange?.(facet.key, e.target.value)}
            className={cn(
              "h-11 min-w-0 rounded-xl border bg-white px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/40 dark:bg-white/[0.04]",
              facet.value !== ALL_FACET_VALUES
                ? "border-emerald-500/50 text-emerald-700 dark:text-emerald-400"
                : "border-stone-200 text-stone-700 dark:border-white/[0.08] dark:text-stone-300",
            )}
          >
            <option value={ALL_FACET_VALUES}>{facet.label}: all</option>
            {facet.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} ({o.count})
              </option>
            ))}
          </select>
        </div>
      ))}

      {activeFacetCount > 0 && onClearFacets && (
        <button
          type="button"
          onClick={onClearFacets}
          className="flex h-11 items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium text-stone-600 hover:bg-stone-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-stone-300"
        >
          <X className="h-3.5 w-3.5" />
          Clear {activeFacetCount}
        </button>
      )}

      {children}
    </div>
  )
}
