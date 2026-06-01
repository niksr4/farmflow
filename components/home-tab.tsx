"use client"

import Link from "next/link"
import { Brain, AlertTriangle, CheckCircle2, BookOpen, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import WorkspaceHints from "@/components/workspace-hints"
import type { HeroContent, SmartNextStep, SmartNextStepTone, DrilldownOptions } from "@/components/inventory-system/types"
import type { WorkspaceHintAction } from "@/lib/tenant-guidance"

type HomeTabProps = {
  visibleHeroContent: HeroContent
  canShowAccounts: boolean
  canShowRainfallSection: boolean
  isOwner: boolean
  showOnboarding: boolean
  smartNextSteps: SmartNextStep[]
  canLaunchAssistant: boolean
  buildWorkspaceHref: (path: string) => string
  onTabChange: (tab: string) => void
  onDrilldown: (options: DrilldownOptions) => void
  onWorkspaceHintAction: (action: WorkspaceHintAction) => void
  onLaunchAssistantPrompt: (prompt: string) => void
}

const TONE_CLASSES: Record<SmartNextStepTone, { bar: string; icon: string; badge: string; label: string }> = {
  progress: {
    bar: "bg-emerald-500",
    icon: "bg-emerald-50 text-emerald-700",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    label: "Momentum",
  },
  attention: {
    bar: "bg-amber-400",
    icon: "bg-amber-50 text-amber-700",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    label: "Action needed",
  },
  help: {
    bar: "bg-sky-400",
    icon: "bg-sky-50 text-sky-700",
    badge: "bg-sky-50 text-sky-700 border-sky-200",
    label: "Tip",
  },
}

export default function HomeTab({
  visibleHeroContent,
  canShowAccounts,
  canShowRainfallSection,
  isOwner,
  showOnboarding,
  smartNextSteps,
  canLaunchAssistant,
  buildWorkspaceHref,
  onTabChange,
  onDrilldown,
  onWorkspaceHintAction,
  onLaunchAssistantPrompt,
}: HomeTabProps) {
  return (
    <>
      {/* Hero — split dark/light panel */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-stone-200 shadow-sm dark:border-white/[0.08]">
        <div className="grid lg:grid-cols-[1fr_280px]">
          {/* Left: dark operations panel */}
          <div className="bg-emerald-900 px-7 py-7 dark:bg-emerald-950">
            <span className="inline-flex items-center rounded-md bg-emerald-900/70 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-emerald-300">
              {visibleHeroContent.badge}
            </span>
            <h2 className="mt-3 text-2xl font-black leading-tight tracking-tight text-white">
              {visibleHeroContent.title}
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-emerald-100/55">
              {visibleHeroContent.description}
            </p>
            {visibleHeroContent.chips.length > 0 && (
              <p className="mt-3 text-[11px] font-medium text-emerald-100/35">
                {visibleHeroContent.chips.slice(0, 3).map((c) => c.label).join("  ·  ")}
              </p>
            )}
            {canShowAccounts && (
              <div className="mt-6 flex flex-wrap gap-2.5 border-t border-white/10 pt-5">
                <button
                  type="button"
                  onClick={() => onDrilldown({ tab: "accounts", panel: "labour" })}
                  className="flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 active:scale-[0.98] touch-manipulation"
                >
                  👷 Log labour
                </button>
                <button
                  type="button"
                  onClick={() => onDrilldown({ tab: "accounts", panel: "expenses" })}
                  className="flex min-h-[44px] items-center gap-2 rounded-lg bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-500 active:scale-[0.98] touch-manipulation"
                >
                  🧾 Log other expense
                </button>
                {canShowRainfallSection && (
                  <button
                    type="button"
                    onClick={() => onTabChange("rainfall")}
                    className="flex min-h-[44px] items-center gap-2 rounded-lg bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-500 active:scale-[0.98] touch-manipulation"
                  >
                    🌧️ Log rainfall
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right: clean stats panel */}
          <div className="flex flex-col divide-y divide-stone-100 bg-white dark:divide-white/[0.06] dark:bg-card">
            {visibleHeroContent.stats.slice(0, 3).map((stat) => (
              <div key={stat.label} className="flex flex-1 flex-col justify-center px-6 py-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-500">
                  {stat.label}
                </p>
                <p className="mt-1 text-2xl font-black tabular-nums text-stone-900 dark:text-white">
                  {stat.value}
                </p>
                {stat.subValue && (
                  <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500">{stat.subValue}</p>
                )}
              </div>
            ))}
            {visibleHeroContent.stats.length === 0 && (
              <div className="flex flex-1 items-center justify-center px-6 py-8">
                <p className="text-xs text-stone-400">Data loads as you log records</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Workspace hints */}
      {!isOwner && !showOnboarding && <WorkspaceHints onAction={onWorkspaceHintAction} />}

      {/* Smart Next Steps */}
      {smartNextSteps.length > 0 && (
        <div
          data-testid="home-smart-next-steps"
          className="mb-5 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card"
        >
          <div className="flex flex-col gap-3 border-b border-stone-100 px-5 py-4 dark:border-white/[0.05] lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-500">
                Suggested actions
              </p>
              <p className="mt-1 text-lg font-black text-stone-900 dark:text-white">What to do next</p>
              <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
                Based on what&apos;s been logged and what&apos;s still pending on your estate.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {canLaunchAssistant && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="bg-white dark:bg-transparent"
                  onClick={() => onLaunchAssistantPrompt("What should I do next in my estate today?")}
                >
                  <Brain className="mr-2 h-3.5 w-3.5 text-emerald-700" />
                  Ask FarmFlow
                </Button>
              )}
              <Button asChild size="sm" variant="ghost">
                <Link href={buildWorkspaceHref("/manuals")}>
                  <BookOpen className="mr-2 h-3.5 w-3.5" />
                  Open manuals
                </Link>
              </Button>
            </div>
          </div>
          <div className="space-y-2 p-4">
            {smartNextSteps.map((step, i) => {
              const tone = TONE_CLASSES[step.tone]
              const ActionIcon =
                step.tone === "attention" ? AlertTriangle : step.tone === "help" ? Brain : CheckCircle2
              return (
                <div
                  key={step.id}
                  data-testid={`smart-next-step-${i + 1}`}
                  className="group relative flex gap-4 overflow-hidden rounded-xl border border-stone-100 bg-white px-4 py-4 transition-colors hover:bg-stone-50/60 dark:border-white/[0.06] dark:bg-card dark:hover:bg-white/[0.03]"
                >
                  {/* Left tone bar */}
                  <div className={cn("absolute inset-y-0 left-0 w-1 rounded-l-xl", tone.bar)} />

                  {/* Icon */}
                  <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tone.icon)}>
                    <ActionIcon className="h-4 w-4" />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-stone-900 dark:text-white">{step.title}</p>
                      {i === 0 && (
                        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", tone.badge)}>
                          {tone.label}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                      {step.description}
                    </p>
                    {i === 0 && step.reason && (
                      <p className="mt-1.5 text-xs text-stone-400 dark:text-stone-500">{step.reason}</p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onDrilldown({ tab: step.actionTab })}
                        className={cn(
                          "inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors touch-manipulation",
                          i === 0
                            ? "bg-emerald-700 text-white hover:bg-emerald-600"
                            : "bg-stone-100 text-stone-700 hover:bg-stone-200",
                        )}
                      >
                        {step.actionLabel}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                      {canLaunchAssistant && step.askPrompt && (
                        <button
                          type="button"
                          onClick={() => onLaunchAssistantPrompt(step.askPrompt!)}
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 touch-manipulation dark:text-emerald-400"
                        >
                          <Brain className="h-3.5 w-3.5" />
                          Ask FarmFlow
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
