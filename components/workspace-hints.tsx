"use client"

import { useEffect, useState } from "react"
import { X, AlertCircle, Lightbulb, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import type { WorkspaceHint } from "@/app/api/dashboard/hints/route"

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
  setup: "border-amber-200 bg-amber-50 text-amber-900",
  tip: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-red-200 bg-red-50 text-red-900",
}

const iconStyles = {
  setup: "text-amber-600",
  tip: "text-emerald-600",
  warning: "text-red-600",
}

type WorkspaceHintsProps = {
  onTabChange?: (tab: string) => void
}

export default function WorkspaceHints({ onTabChange }: WorkspaceHintsProps) {
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

  const visible = hints.filter((h) => !dismissed.has(h.id))

  if (!loaded) return null

  if (fetchFailed) {
    return (
      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 opacity-60" />
        <span>Couldn&apos;t load workspace tips.</span>
        <button
          className="underline underline-offset-2 hover:opacity-80"
          onClick={() => { setLoaded(false); setRetryCount((n) => n + 1) }}
        >
          Retry
        </button>
      </div>
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
    <div className="mb-5 flex flex-col gap-2">
      {visible.map((hint) => {
        const Icon = icons[hint.type]
        return (
          <div
            key={hint.id}
            className={cn(
              "flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm",
              styles[hint.type],
            )}
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconStyles[hint.type])} />
            <div className="flex-1 min-w-0">
              <p className="font-medium leading-snug">{hint.title}</p>
              <p className="mt-0.5 text-xs opacity-80 leading-relaxed">{hint.body}</p>
              {hint.action && onTabChange && (
                <button
                  className="mt-1.5 text-xs font-semibold underline underline-offset-2 opacity-90 hover:opacity-100"
                  onClick={() => onTabChange(hint.action!.tab)}
                >
                  {hint.action.label} →
                </button>
              )}
            </div>
            <button
              onClick={() => dismiss(hint.id)}
              className="shrink-0 mt-0.5 opacity-50 hover:opacity-80 transition-opacity"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
