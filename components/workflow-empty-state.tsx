"use client"

import Link from "next/link"
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type WorkflowAction = {
  label: string
  onClick?: () => void
  href?: string
}

type WorkflowEmptyStateProps = {
  title: string
  description: string
  steps: string[]
  tip?: string
  askPrompt?: string
  primaryAction?: WorkflowAction
  secondaryAction?: WorkflowAction
  className?: string
}

function WorkflowActionButton({
  action,
  variant = "default",
}: {
  action: WorkflowAction
  variant?: "default" | "outline"
}) {
  const className =
    variant === "default" ? "bg-emerald-700 hover:bg-emerald-800" : "border-white bg-white text-slate-700 hover:bg-slate-50"

  if (action.href) {
    return (
      <Button asChild variant={variant} className={className}>
        <Link href={action.href}>
          {action.label}
          <ArrowRight className="ml-2 h-3.5 w-3.5" />
        </Link>
      </Button>
    )
  }

  return (
    <Button type="button" variant={variant} className={className} onClick={action.onClick}>
      {action.label}
      <ArrowRight className="ml-2 h-3.5 w-3.5" />
    </Button>
  )
}

export default function WorkflowEmptyState({
  title,
  description,
  steps,
  tip,
  askPrompt,
  primaryAction,
  secondaryAction,
  className,
}: WorkflowEmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-[24px] border border-emerald-200/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.82)_0%,rgba(255,255,255,0.98)_100%)] p-5 shadow-sm",
        className,
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            <Sparkles className="h-3.5 w-3.5" />
            First record guide
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">{title}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          </div>
        </div>
        {(primaryAction || secondaryAction) && (
          <div className="flex flex-wrap gap-2">
            {primaryAction ? <WorkflowActionButton action={primaryAction} /> : null}
            {secondaryAction ? <WorkflowActionButton action={secondaryAction} variant="outline" /> : null}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {steps.map((step, index) => (
          <div key={step} className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
                {index + 1}
              </span>
              <p className="text-sm leading-6 text-slate-700">{step}</p>
            </div>
          </div>
        ))}
      </div>

      {tip || askPrompt ? (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-white/90 px-4 py-3 text-sm text-slate-700 shadow-sm">
          {tip ? (
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p className="leading-6">{tip}</p>
            </div>
          ) : null}
          {askPrompt ? (
            <p className={cn("leading-6 text-slate-600", tip ? "mt-2" : "")}>
              If stuck, ask FarmFlow: <span className="font-medium text-slate-900">&ldquo;{askPrompt}&rdquo;</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
