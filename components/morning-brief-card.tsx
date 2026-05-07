"use client"

import { Brain, CloudRain, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/format"
import type { WeatherFarmAdvice } from "@/lib/coffee-agronomy"

type BriefAction = { label: string; tab: string }
type CostCode = { code: string; reference: string; totalAmount: number; entryCount: number }
type Insight = { observation: string; reasoning: string }

const formatCount = (n: number) => formatNumber(n, 0)

const FARM_ADVICE_STYLES: Record<WeatherFarmAdvice["signal"], { bg: string; text: string; icon: string }> = {
  "apply-now":    { bg: "bg-emerald-500/20 border-emerald-300/30", text: "text-emerald-100", icon: "🌱" },
  "wait-for-rain":{ bg: "bg-sky-500/20 border-sky-300/30",     text: "text-sky-100",     icon: "⏳" },
  "avoid-rain":   { bg: "bg-amber-500/20 border-amber-300/30", text: "text-amber-100",   icon: "🌧️" },
  "neutral":      { bg: "bg-white/10 border-white/20",         text: "text-white/80",    icon: "🌤️" },
}

type Props = {
  highlights: string[]
  insights: Insight[]
  actions: BriefAction[]
  topCostCode: CostCode | null
  topFrequencyCode: CostCode | null
  loading: boolean
  error: string | null
  visibleTabs: string[]
  farmAdvice?: WeatherFarmAdvice | null
  onDrilldown: (opts: { tab: string; transactionSearch?: string }) => void
  inferTab: (text: string) => string
}

export default function MorningBriefCard({
  highlights,
  insights,
  actions,
  topCostCode,
  topFrequencyCode,
  loading,
  error,
  visibleTabs,
  farmAdvice,
  onDrilldown,
  inferTab,
}: Props) {
  const hasContent = highlights.length > 0

  return (
    <div
      className={cn(
        "rounded-2xl border overflow-hidden",
        hasContent
          ? "border-emerald-200/70 bg-gradient-to-br from-emerald-700 to-emerald-800 text-white shadow-[0_8px_32px_-12px_rgba(5,100,70,0.45)]"
          : "border-black/5 bg-white/90",
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between px-5 py-3.5",
          hasContent ? "border-b border-white/10" : "border-b border-black/5",
        )}
      >
        <div className="flex items-center gap-2.5">
          <Brain className={cn("h-4 w-4 shrink-0", hasContent ? "text-emerald-300" : "text-emerald-600")} />
          <p className={cn("text-sm font-semibold", hasContent ? "text-white" : "text-neutral-800")}>
            What to focus on today
          </p>
        </div>
        {loading && (
          <div className="flex items-center gap-1.5">
            <Loader2 className={cn("h-3.5 w-3.5 animate-spin", hasContent ? "text-emerald-300" : "text-neutral-400")} />
            <span className={cn("text-xs", hasContent ? "text-emerald-300" : "text-neutral-400")}>
              Analysing...
            </span>
          </div>
        )}
        {!loading && hasContent && (
          <span className="text-[11px] font-medium text-emerald-300">
            {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {loading && !hasContent ? (
          <div className="space-y-3">
            <div className="h-4 w-3/4 animate-pulse rounded-lg bg-neutral-100" />
            <div className="h-4 w-5/6 animate-pulse rounded-lg bg-neutral-100" />
            <div className="h-4 w-2/3 animate-pulse rounded-lg bg-neutral-100" />
          </div>
        ) : error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : hasContent ? (
          <div className="space-y-3">
            {/* Weather farm advice chip */}
            {farmAdvice && (() => {
              const s = FARM_ADVICE_STYLES[farmAdvice.signal]
              return (
                <div className={cn("flex items-start gap-2.5 rounded-xl border px-3 py-2.5", s.bg)}>
                  <CloudRain className="mt-0.5 h-4 w-4 shrink-0 text-white/70" />
                  <div className="min-w-0">
                    <p className={cn("text-xs font-semibold", s.text)}>
                      {farmAdvice.title}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-white/70">
                      {farmAdvice.body}
                    </p>
                  </div>
                </div>
              )
            })()}
            {highlights.slice(0, 4).map((highlight, index) => {
              const insight = insights[index]
              const linkedAction = actions.find(
                (a) => visibleTabs.includes(a.tab) && highlight.toLowerCase().includes(a.label.toLowerCase()),
              )
              const actionTab = linkedAction?.tab || inferTab(highlight)

              return (
                <button
                  key={`brief-${index}`}
                  type="button"
                  data-testid={`home-brief-insight-${index + 1}`}
                  onClick={() => onDrilldown({ tab: actionTab })}
                  className="group flex w-full items-start gap-3 text-left"
                >
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15 text-[10px] font-bold text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-white/90 group-hover:text-white">
                      {/* When Claude reasoning is available, show it inline after the observation */}
                      {insight ? (
                        <>
                          {insight.observation}{" "}
                          <span className="text-emerald-200">{insight.reasoning}</span>
                        </>
                      ) : (
                        highlight
                      )}
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-emerald-300 group-hover:text-emerald-200">
                      Review →
                    </p>
                  </div>
                </button>
              )
            })}

            {/* Cost code pins */}
            {(topCostCode || topFrequencyCode) && (
              <div className="mt-1 grid grid-cols-1 gap-2 border-t border-white/10 pt-3 sm:grid-cols-2">
                {topCostCode && (
                  <button
                    type="button"
                    onClick={() => onDrilldown({ tab: "accounts", transactionSearch: topCostCode.code })}
                    className="rounded-xl bg-white/10 px-3 py-2 text-left hover:bg-white/15 transition-colors"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">Top cost</p>
                    <p className="mt-0.5 text-sm font-semibold text-white">
                      {topCostCode.code} — ₹{formatNumber(topCostCode.totalAmount, 0)}
                    </p>
                    <p className="text-[11px] text-white/60">{topCostCode.reference}</p>
                  </button>
                )}
                {topFrequencyCode && (
                  <button
                    type="button"
                    onClick={() => onDrilldown({ tab: "accounts", transactionSearch: topFrequencyCode.code })}
                    className="rounded-xl bg-white/10 px-3 py-2 text-left hover:bg-white/15 transition-colors"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">Most frequent</p>
                    <p className="mt-0.5 text-sm font-semibold text-white">
                      {topFrequencyCode.code} — {formatCount(topFrequencyCode.entryCount)} entries
                    </p>
                    <p className="text-[11px] text-white/60">{topFrequencyCode.reference}</p>
                  </button>
                )}
              </div>
            )}

            {/* Actions */}
            {actions.filter((a) => visibleTabs.includes(a.tab)).length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
                {actions
                  .filter((a) => visibleTabs.includes(a.tab))
                  .map((action) => (
                    <Button
                      key={`${action.tab}-${action.label}`}
                      size="sm"
                      onClick={() => onDrilldown({ tab: action.tab })}
                      className="border-white/20 bg-white/15 text-white hover:bg-white/25 text-xs h-8"
                      variant="outline"
                    >
                      {action.label}
                    </Button>
                  ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No patterns detected yet. The brief activates once you have processing, accounts, and dispatch data for the current season.
          </p>
        )}
      </div>
    </div>
  )
}
