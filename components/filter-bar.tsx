"use client"

import type React from "react"
import { ArrowDown, ArrowUp, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"

export type SortDirection = "asc" | "desc"
export type FilterBarSortOption = { value: string; label: string }

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

      {children}
    </div>
  )
}
