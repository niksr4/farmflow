"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, X, AlertCircle, Lightbulb, Settings } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { WorkspaceHint, WorkspaceHintAction } from "@/lib/tenant-guidance"

const DISMISSED_KEY = "farmflow:dismissed-hints"

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

function saveDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]))
  } catch {}
}

const icons = {
  setup: Settings,
  tip: Lightbulb,
  warning: AlertCircle,
}

const styles = {
  setup: {
    card: "border-amber-200/90 bg-amber-50/80 text-amber-950",
    badge: "border-amber-200 bg-white text-amber-700",
    accent: "bg-amber-500",
    icon: "bg-amber-100 text-amber-700",
    action: "border-amber-200 text-amber-800 hover:bg-amber-50",
  },
  tip: {
    card: "border-emerald-200/90 bg-emerald-50/80 text-emerald-950",
    badge: "border-emerald-200 bg-white text-emerald-700",
    accent: "bg-emerald-500",
    icon: "bg-emerald-100 text-emerald-700",
    action: "border-emerald-200 text-emerald-800 hover:bg-emerald-50",
  },
  warning: {
    card: "border-rose-200/90 bg-rose-50/80 text-rose-950",
    badge: "border-rose-200 bg-white text-rose-700",
    accent: "bg-rose-500",
    icon: "bg-rose-100 text-rose-700",
    action: "border-rose-200 text-rose-700 hover:bg-rose-50",
  },
}

const typeLabel = {
  setup: "Setup",
  tip: "Tip",
  warning: "Attention",
} as const

type WorkspaceHintsProps = {
  onAction?: (action: WorkspaceHintAction) => void
}

export default function WorkspaceHints({ onAction }: WorkspaceHintsProps) {
  const [hints, setHints] = useState<WorkspaceHint[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)
  const [fetchFailed, setFetchFailed] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    setDismissed(getDismissed())
    setFetchFailed(false)
    fetch("/api/dashboard/hints", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.hints)) {
          setHints(data.hints)
        }
      })
      .catch(() => setFetchFailed(true))
      .finally(() => setLoaded(true))
  }, [retryCount])

  const visible = hints.filter((hint) => hint.dismissible === false || !dismissed.has(hint.id))

  if (!loaded) return null

  if (fetchFailed) {
    return (
      <Card className="mb-5 border border-stone-200 bg-white/90 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-500">
            <AlertCircle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-stone-900">Couldn&apos;t load workspace tips</p>
            <p className="mt-0.5 text-xs leading-relaxed text-stone-600">
              The guidance panel will retry when you refresh, or you can try again now.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setLoaded(false)
                setRetryCount((n) => n + 1)
              }}
              className="mt-3 h-8 rounded-full border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
            >
              Retry
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  if (visible.length === 0) return null

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(id)
      saveDismissed(next)
      return next
    })
  }

  return (
    <section className="mb-5 rounded-3xl border border-stone-200/80 bg-gradient-to-br from-white via-white to-amber-50/30 p-4 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-stone-200/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Badge variant="outline" className="border-stone-200 bg-white text-stone-700">
            Actionable tips
          </Badge>
          <h3 className="text-base font-semibold text-stone-900">Next steps for this workspace</h3>
          <p className="max-w-2xl text-sm leading-relaxed text-stone-600">
            These appear when setup needs attention or when the workspace is still waiting on its first real data.
          </p>
        </div>
        <div className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-600 shadow-sm">
          {visible.length} {visible.length === 1 ? "item" : "items"}
        </div>
      </div>
      <div className="mt-4 grid gap-3">
      {visible.map((hint) => {
        const Icon = icons[hint.type]
        const tone = styles[hint.type]
        const hasButtonAction = Boolean(hint.action && onAction)
        const hasHrefAction = Boolean(hint.action?.href && !onAction)
        return (
          <div
            key={hint.id}
            className={cn(
              "relative overflow-hidden rounded-2xl border px-4 py-4 text-sm shadow-sm",
              tone.card,
            )}
          >
            <div className={cn("absolute inset-y-0 left-0 w-1", tone.accent)} />
            <div className="flex items-start gap-3 pl-1">
              <div className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tone.icon)}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold leading-snug text-stone-900">{hint.title}</p>
                  <Badge variant="outline" className={cn("text-[11px] uppercase tracking-[0.18em]", tone.badge)}>
                    {typeLabel[hint.type]}
                  </Badge>
                </div>
                <p className="mt-1.5 leading-relaxed text-stone-700">{hint.body}</p>
                {hint.action && hasButtonAction && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn("mt-3 h-9 rounded-full px-3.5", tone.action)}
                    onClick={() => onAction?.(hint.action!)}
                  >
                    {hint.action.label}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                )}
                {hint.action && hasHrefAction && hint.action.href && (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className={cn("mt-3 h-9 rounded-full px-3.5", tone.action)}
                  >
                    <Link href={hint.action.href}>
                      {hint.action.label}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
            {hint.dismissible !== false && (
              <button
                onClick={() => dismiss(hint.id)}
                className="absolute right-3 top-3 rounded-full p-1.5 text-stone-500 transition-colors hover:bg-white/80 hover:text-stone-800"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )
      })}
      </div>
    </section>
  )
}
