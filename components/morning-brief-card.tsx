"use client"

import type { CSSProperties } from "react"
import { Brain, CloudRain, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/format"
import type { WeatherFarmAdvice } from "@/lib/coffee-agronomy"

type BriefAction = { label: string; tab: string }
type CostCode = { code: string; reference: string; totalAmount: number; entryCount: number }
type Insight = { observation: string; reasoning: string }

const formatCount = (n: number) => formatNumber(n, 0)

const FARM_ADVICE_STYLES: Record<WeatherFarmAdvice["signal"], { bg: string; text: string }> = {
  "apply-now":     { bg: "bg-emerald-400/12 border-emerald-400/25",  text: "text-emerald-200" },
  "wait-for-rain": { bg: "bg-sky-400/12 border-sky-400/25",          text: "text-sky-200"     },
  "avoid-rain":    { bg: "bg-amber-400/12 border-amber-400/25",      text: "text-amber-200"   },
  "neutral":       { bg: "bg-white/[0.06] border-white/10",          text: "text-white/75"    },
}

const grainStyle: CSSProperties = {
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")",
  opacity: 0.16,
  mixBlendMode: "soft-light" as const,
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
        "relative overflow-hidden rounded-[28px] border",
        hasContent
          ? [
              "border-emerald-500/20",
              "bg-[radial-gradient(ellipse_at_top_right,_rgba(5,150,80,0.32),_transparent_55%),radial-gradient(ellipse_at_bottom_left,_rgba(2,70,45,0.22),_transparent_50%),linear-gradient(160deg,_#0b2018,_#071510_50%,_#091a12)]",
              "text-white",
              "shadow-[0_20px_56px_-16px_rgba(5,100,60,0.60),0_0_0_1px_rgba(52,211,153,0.10),inset_0_1px_0_rgba(52,211,153,0.14)]",
            ].join(" ")
          : "border-stone-200/60 bg-gradient-to-br from-stone-50 to-stone-50/80",
      )}
    >
      {hasContent && (
        <>
          <div className="absolute inset-0 pointer-events-none" style={grainStyle} />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/35 to-transparent pointer-events-none" />
        </>
      )}

      {/* Header */}
      <div
        className={cn(
          "relative flex items-center justify-between px-5 py-3.5",
          hasContent ? "border-b border-emerald-400/[0.12]" : "border-b border-stone-200/50",
        )}
      >
        <div className="flex items-center gap-2.5">
          {hasContent ? (
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-400/15 ring-1 ring-emerald-400/35 shadow-[0_0_12px_-2px_rgba(52,211,153,0.45)]">
              <Brain className="h-3.5 w-3.5 text-emerald-300" />
            </div>
          ) : (
            <Brain className="h-4 w-4 shrink-0 text-emerald-600" />
          )}
          <p className={cn("text-sm font-semibold", hasContent ? "text-white/90" : "text-neutral-800")}>
            What to focus on today
          </p>
        </div>
        {loading && (
          <div className="flex items-center gap-1.5">
            <Loader2 className={cn("h-3.5 w-3.5 animate-spin", hasContent ? "text-emerald-300" : "text-neutral-400")} />
            <span className={cn("text-xs", hasContent ? "text-emerald-300/80" : "text-neutral-400")}>
              Analysing…
            </span>
          </div>
        )}
        {!loading && hasContent && (
          <span className="rounded-full bg-emerald-400/[0.12] px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-300 ring-1 ring-emerald-400/20">
            {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="relative px-5 py-4">
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
                <div className={cn(
                  "flex items-start gap-2.5 rounded-2xl border px-3 py-2.5 backdrop-blur-sm",
                  s.bg,
                )}>
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/10">
                    <CloudRain className="h-3.5 w-3.5 text-white/70" />
                  </div>
                  <div className="min-w-0">
                    <p className={cn("text-xs font-semibold", s.text)}>{farmAdvice.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-white/60">{farmAdvice.body}</p>
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
                  <span className={cn(
                    "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                    "bg-emerald-400/15 ring-1 ring-emerald-400/40",
                    "shadow-[0_0_8px_rgba(52,211,153,0.30)]",
                    "text-[10px] font-bold text-emerald-200",
                  )}>
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-white/85 transition-colors group-hover:text-white">
                      {insight ? (
                        <>
                          {insight.observation}{" "}
                          <span className="text-emerald-300/90">{insight.reasoning}</span>
                        </>
                      ) : (
                        highlight
                      )}
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-emerald-400/70 transition-colors group-hover:text-emerald-300">
                      Review →
                    </p>
                  </div>
                </button>
              )
            })}

            {/* Cost code pins */}
            {(topCostCode || topFrequencyCode) && (
              <div className="mt-1 grid grid-cols-1 gap-2 border-t border-emerald-400/[0.10] pt-3 sm:grid-cols-2">
                {topCostCode && (
                  <button
                    type="button"
                    onClick={() => onDrilldown({ tab: "accounts", transactionSearch: topCostCode.code })}
                    className="rounded-2xl border border-emerald-400/15 bg-white/[0.06] px-3 py-2.5 text-left backdrop-blur-sm transition-colors hover:bg-white/[0.10]"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Top cost</p>
                    <p className="mt-0.5 text-sm font-semibold text-white">
                      {topCostCode.code} — ₹{formatNumber(topCostCode.totalAmount, 0)}
                    </p>
                    <p className="text-[11px] text-white/45">{topCostCode.reference}</p>
                  </button>
                )}
                {topFrequencyCode && (
                  <button
                    type="button"
                    onClick={() => onDrilldown({ tab: "accounts", transactionSearch: topFrequencyCode.code })}
                    className="rounded-2xl border border-emerald-400/15 bg-white/[0.06] px-3 py-2.5 text-left backdrop-blur-sm transition-colors hover:bg-white/[0.10]"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Most frequent</p>
                    <p className="mt-0.5 text-sm font-semibold text-white">
                      {topFrequencyCode.code} — {formatCount(topFrequencyCode.entryCount)} entries
                    </p>
                    <p className="text-[11px] text-white/45">{topFrequencyCode.reference}</p>
                  </button>
                )}
              </div>
            )}

            {/* Actions */}
            {actions.filter((a) => visibleTabs.includes(a.tab)).length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-emerald-400/[0.10] pt-3">
                {actions
                  .filter((a) => visibleTabs.includes(a.tab))
                  .map((action) => (
                    <Button
                      key={`${action.tab}-${action.label}`}
                      size="sm"
                      onClick={() => onDrilldown({ tab: action.tab })}
                      className="h-8 border-emerald-400/25 bg-emerald-400/12 text-xs text-emerald-200 hover:bg-emerald-400/20 hover:text-white"
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
