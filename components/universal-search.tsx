"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Command } from "cmdk"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Search, Package, ReceiptText, Users, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SearchResultItem } from "@/app/api/search/route"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (tab: string) => void
}

const TYPE_META: Record<SearchResultItem["type"], { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  inventory: { label: "Inventory", icon: Package },
  expense:   { label: "Expenses",  icon: ReceiptText },
  labor:      { label: "Labour",    icon: Users },
}

function formatDate(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

function formatAmount(n: number | null): string {
  if (n == null || n === 0) return ""
  return `₹${n.toLocaleString("en-IN")}`
}

function formatQty(qty: number | null, unit: string | null): string {
  if (qty == null) return ""
  return unit ? `${qty} ${unit}` : String(qty)
}

export default function UniversalSearch({ open, onOpenChange, onNavigate }: Props) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error("Search failed")
      const data = await res.json()
      setResults(data.results ?? [])
    } catch (err: any) {
      if (err.name !== "AbortError") setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, search])

  useEffect(() => {
    if (!open) {
      setQuery("")
      setResults([])
      setLoading(false)
    }
  }, [open])

  const grouped = results.reduce<Record<string, SearchResultItem[]>>((acc, r) => {
    const key = r.type
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

  const typeOrder: SearchResultItem["type"][] = ["inventory", "expense", "labor"]

  const handleSelect = (item: SearchResultItem) => {
    onOpenChange(false)
    onNavigate(item.tab)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-2xl max-w-xl">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-muted-foreground">
          {/* Search input */}
          <div className="flex items-center gap-2.5 border-b px-4 py-3.5">
            {loading
              ? <Loader2 className="h-4 w-4 shrink-0 text-muted-foreground animate-spin" />
              : <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            }
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search transactions, expenses, labour..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                Esc
              </kbd>
            )}
          </div>

          <Command.List className="max-h-[360px] overflow-y-auto p-2">
            {/* Empty state */}
            {query.length >= 2 && !loading && results.length === 0 && (
              <Command.Empty className="py-10 text-center text-sm text-muted-foreground">
                No results for &ldquo;{query}&rdquo;
              </Command.Empty>
            )}

            {/* Placeholder before typing */}
            {query.length < 2 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Type at least 2 characters to search
              </div>
            )}

            {/* Results grouped by type */}
            {typeOrder.map((type) => {
              const items = grouped[type]
              if (!items?.length) return null
              const meta = TYPE_META[type]
              const Icon = meta.icon

              return (
                <Command.Group key={type} heading={meta.label}>
                  {items.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={`${type}-${item.id}`}
                      onSelect={() => handleSelect(item)}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 text-sm",
                        "aria-selected:bg-accent aria-selected:text-accent-foreground",
                        "transition-colors duration-75",
                      )}
                    >
                      <span className={cn(
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                        type === "inventory" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
                        type === "expense"   && "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
                        type === "labor"     && "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
                      )}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{item.title}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          {item.subtitle && <span className="truncate">{item.subtitle}</span>}
                          {item.subtitle && (item.date || item.quantity || item.amount) && (
                            <span className="select-none opacity-40">·</span>
                          )}
                          {item.quantity != null && <span>{formatQty(item.quantity, item.unit)}</span>}
                          {item.amount != null && item.amount > 0 && <span>{formatAmount(item.amount)}</span>}
                          {item.date && <span>{formatDate(item.date)}</span>}
                        </div>
                      </div>

                      <span className={cn(
                        "mt-1 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                        type === "inventory" && "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
                        type === "expense"   && "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
                        type === "labor"     && "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
                      )}>
                        → {item.tab}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )
            })}
          </Command.List>

          {/* Footer */}
          <div className="border-t px-3 py-2 flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              {results.length > 0 ? `${results.length} result${results.length === 1 ? "" : "s"}` : ""}
            </p>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <kbd className="inline-flex h-4 select-none items-center rounded border bg-muted px-1 text-[10px]">↑↓</kbd>
              <span>navigate</span>
              <kbd className="inline-flex h-4 select-none items-center rounded border bg-muted px-1 text-[10px]">↵</kbd>
              <span>go</span>
            </div>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
