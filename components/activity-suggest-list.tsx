"use client"

export type ActivitySuggestOption = {
  code: string
  reference: string
}

// Shared by the labour and expenses activity-code fields so typing a code and
// typing a category name both search the same list the same way, in both
// directions — selecting a suggestion fills the code and reference together.
export function filterActivitySuggestions<T extends ActivitySuggestOption>(
  query: string,
  defaultOptions: T[],
  searchOptions: T[],
  limit = 8,
): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return defaultOptions.slice(0, limit)
  return searchOptions
    .filter((a) => a.code.toLowerCase().includes(q) || a.reference.toLowerCase().includes(q))
    .slice(0, limit)
}

export default function ActivitySuggestList<T extends ActivitySuggestOption>({
  options,
  onSelect,
}: {
  options: T[]
  onSelect: (option: T) => void
}) {
  if (options.length === 0) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-500 shadow-md dark:border-white/10 dark:bg-stone-900 dark:text-stone-400">
        No matching codes — you can still save this as a new one.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white shadow-md overflow-hidden divide-y divide-stone-100 max-h-72 overflow-y-auto dark:border-white/10 dark:bg-stone-900 dark:divide-white/5">
      {options.map((option) => (
        <button
          key={option.code}
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onSelect(option)}
          className="w-full flex items-center gap-2.5 px-4 py-3 text-left active:bg-emerald-50 transition-colors touch-manipulation dark:active:bg-emerald-900/20"
        >
          <span className="text-sm font-black tabular-nums text-emerald-700 dark:text-emerald-400 shrink-0">
            {option.code}
          </span>
          <span className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">{option.reference}</span>
        </button>
      ))}
    </div>
  )
}
