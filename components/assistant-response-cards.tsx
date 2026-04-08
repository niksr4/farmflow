"use client"

import type { ComponentType } from "react"
import Link from "next/link"
import { ArrowUpRight, BookOpenText, MapPinned, Package2, Receipt, ScrollText, Truck, Wallet } from "lucide-react"

import type { AssistantActionLink, AssistantSearchResult } from "@/lib/ai-assistant"
import { cn } from "@/lib/utils"

const RESULT_META: Record<
  AssistantSearchResult["type"],
  { label: string; icon: ComponentType<{ className?: string }> }
> = {
  inventory: { label: "Inventory", icon: Package2 },
  transaction: { label: "Movement", icon: ScrollText },
  expense: { label: "Expense", icon: Receipt },
  location: { label: "Location", icon: MapPinned },
  dispatch: { label: "Dispatch", icon: Truck },
  sale: { label: "Sale", icon: Wallet },
  receivable: { label: "Receivable", icon: Wallet },
  journal: { label: "Journal", icon: BookOpenText },
}

type AssistantResponseCardsProps = {
  actions?: AssistantActionLink[]
  results?: AssistantSearchResult[]
  className?: string
  resolveHref?: (href: string) => string
}

export default function AssistantResponseCards({
  actions = [],
  results = [],
  className,
  resolveHref,
}: AssistantResponseCardsProps) {
  if (!actions.length && !results.length) {
    return null
  }

  const hrefFor = (href: string) => {
    const nextHref = typeof resolveHref === "function" ? resolveHref(href) : href
    return nextHref || href
  }

  return (
    <div className={cn("space-y-3", className)}>
      {actions.length ? (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Suggested places</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {actions.map((action) => (
              <Link
                key={`${action.href}-${action.label}`}
                href={hrefFor(action.href)}
                className="group rounded-2xl border border-emerald-100 bg-emerald-50/60 px-3 py-3 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-slate-900">{action.label}</div>
                    {action.description ? <div className="text-xs leading-5 text-slate-600">{action.description}</div> : null}
                  </div>
                  <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {results.length ? (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Matching records</div>
          <div className="space-y-2">
            {results.map((result) => {
              const meta = RESULT_META[result.type]
              const Icon = meta.icon

              return (
                <Link
                  key={result.id}
                  href={hrefFor(result.href)}
                  className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 transition-colors hover:border-emerald-200 hover:bg-emerald-50/40"
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{result.title}</span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {meta.label}
                      </span>
                    </span>
                    <span className="block text-xs leading-5 text-slate-600">{result.detail}</span>
                  </span>
                  <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-emerald-700" />
                </Link>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
