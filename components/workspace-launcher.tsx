"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { getSeasonBadge, getSeasonContextLine } from "@/lib/season-utils"
import { format } from "date-fns"

type TabItem = {
  value: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

type LauncherSection = {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  tabs: TabItem[]
}

type Props = {
  sections: LauncherSection[]
  canShowAccounts: boolean
  canShowRainfall?: boolean
  isMobile: boolean
  onTabChange: (tab: string) => void
  onAccountsExpense: () => void
  onAccountsLabor: () => void
  buildWorkspaceHref: (path: string) => string
  estateName?: string
}

const SECTION_STYLES: Record<string, { tileBase: string; iconWrap: string; iconColor: string; headerColor: string }> = {
  operations: {
    tileBase: "bg-emerald-50/70 border-emerald-200/60 hover:bg-emerald-50",
    iconWrap: "bg-emerald-100/60",
    iconColor: "text-emerald-700",
    headerColor: "text-emerald-700",
  },
  finance: {
    tileBase: "bg-amber-50/70 border-amber-200/60 hover:bg-amber-50",
    iconWrap: "bg-amber-100/60",
    iconColor: "text-amber-700",
    headerColor: "text-amber-700",
  },
  insights: {
    tileBase: "bg-stone-50/80 border-stone-200/60 hover:bg-stone-100/60",
    iconWrap: "bg-stone-100/80",
    iconColor: "text-stone-600",
    headerColor: "text-stone-500",
  },
}

const BADGE_COLORS: Record<string, string> = {
  amber:   "bg-amber-100   text-amber-800   border-amber-300/60",
  green:   "bg-emerald-100 text-emerald-800 border-emerald-300/60",
  blue:    "bg-sky-100     text-sky-800     border-sky-300/60",
  pink:    "bg-pink-100    text-pink-800    border-pink-300/60",
  emerald: "bg-emerald-100 text-emerald-800 border-emerald-300/60",
}

export default function WorkspaceLauncher({
  sections,
  canShowAccounts,
  canShowRainfall,
  isMobile,
  onTabChange,
  onAccountsExpense,
  onAccountsLabor,
  buildWorkspaceHref,
  estateName,
}: Props) {
  const [dateLabel, setDateLabel] = useState("")
  const [seasonBadge, setSeasonBadge] = useState<{ label: string; color: string } | null>(null)
  const [contextLine, setContextLine] = useState("")

  useEffect(() => {
    setDateLabel(format(new Date(), "EEEE, d MMMM"))
    setSeasonBadge(getSeasonBadge())
    setContextLine(getSeasonContextLine())
  }, [])

  return (
    <div className={cn("space-y-6", isMobile ? "pb-24" : "pb-8")}>

      {/* ── Estate hero header ───────────────────────────────── */}
      <div className={cn(
        "relative overflow-hidden rounded-3xl border border-stone-200/80",
        "bg-gradient-to-br from-stone-900 via-stone-800 to-emerald-900",
        isMobile ? "px-5 py-5" : "px-7 py-6",
      )}>
        {/* subtle coffee-leaf texture hint */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "radial-gradient(ellipse at 80% 20%, #d4a574 0%, transparent 60%), radial-gradient(ellipse at 10% 80%, #4ade80 0%, transparent 50%)" }}
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-stone-400/90 text-[10px] font-bold uppercase tracking-[0.2em] mb-1.5">
              {dateLabel || "Estate dashboard"}
            </p>
            <h1 className={cn("font-black text-white leading-tight truncate", isMobile ? "text-2xl" : "text-3xl")}>
              {estateName || "FarmFlow"}
            </h1>
            {contextLine && (
              <p className="text-stone-400/80 text-[11px] mt-2 leading-relaxed max-w-xs">{contextLine}</p>
            )}
          </div>
          {seasonBadge && (
            <span className={cn(
              "shrink-0 inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold",
              BADGE_COLORS[seasonBadge.color] || BADGE_COLORS.green,
            )}>
              {seasonBadge.label}
            </span>
          )}
        </div>
      </div>

      {/* ── Today's primary actions ──────────────────────────── */}
      {canShowAccounts && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 mb-3 px-0.5">
            Log today
          </p>
          <div className={cn(
            "grid gap-3",
            canShowRainfall ? "grid-cols-3" : "grid-cols-2",
          )}>
            <button
              type="button"
              onClick={onAccountsLabor}
              className={cn(
                "flex flex-col rounded-2xl bg-emerald-800 text-white text-left px-4 shadow-[0_8px_20px_-8px_rgba(20,83,45,0.5)] touch-manipulation active:scale-[0.97] transition-transform",
                isMobile ? "py-4" : "py-3.5",
              )}
            >
              <span className="text-xl mb-2 leading-none">👷</span>
              <p className={cn("font-black leading-tight", isMobile ? "text-[15px]" : "text-sm")}>Labor</p>
              <p className="text-[10px] text-emerald-300/70 mt-0.5">Workers & wages</p>
            </button>

            <button
              type="button"
              onClick={onAccountsExpense}
              className={cn(
                "flex flex-col rounded-2xl bg-amber-700 text-white text-left px-4 shadow-[0_8px_20px_-8px_rgba(180,83,9,0.45)] touch-manipulation active:scale-[0.97] transition-transform",
                isMobile ? "py-4" : "py-3.5",
              )}
            >
              <span className="text-xl mb-2 leading-none">💸</span>
              <p className={cn("font-black leading-tight", isMobile ? "text-[15px]" : "text-sm")}>Expense</p>
              <p className="text-[10px] text-amber-200/70 mt-0.5">Costs & inputs</p>
            </button>

            {canShowRainfall && (
              <button
                type="button"
                onClick={() => onTabChange("rainfall")}
                className={cn(
                  "flex flex-col rounded-2xl bg-sky-700 text-white text-left px-4 shadow-[0_8px_20px_-8px_rgba(3,105,161,0.4)] touch-manipulation active:scale-[0.97] transition-transform",
                  isMobile ? "py-4" : "py-3.5",
                )}
              >
                <span className="text-xl mb-2 leading-none">🌧️</span>
                <p className={cn("font-black leading-tight", isMobile ? "text-[15px]" : "text-sm")}>Rainfall</p>
                <p className="text-[10px] text-sky-200/70 mt-0.5">Daily measurement</p>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Module navigation ────────────────────────────────── */}
      {sections.map((section) => {
        const style = SECTION_STYLES[section.id] || SECTION_STYLES.insights
        return (
          <div key={section.id}>
            <div className="flex items-center gap-2 mb-3">
              <section.icon className={cn("h-3.5 w-3.5 shrink-0", style.iconColor)} />
              <p className={cn("text-[10px] font-bold uppercase tracking-[0.18em]", style.headerColor)}>
                {section.label}
              </p>
              <div className="flex-1 border-t border-stone-100" />
            </div>
            <div className={cn("grid gap-2", isMobile ? "grid-cols-2" : "grid-cols-3 xl:grid-cols-4")}>
              {section.tabs.map((tab) => {
                const TabIcon = tab.icon
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => onTabChange(tab.value)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border text-left touch-manipulation transition-colors",
                      isMobile ? "min-h-[60px] px-3.5 py-3.5" : "min-h-[52px] px-3 py-2.5",
                      style.tileBase,
                    )}
                  >
                    <span className={cn(
                      "flex shrink-0 items-center justify-center rounded-lg",
                      isMobile ? "h-8 w-8" : "h-7 w-7",
                      style.iconWrap,
                    )}>
                      <TabIcon className={cn(isMobile ? "h-4 w-4" : "h-3.5 w-3.5", style.iconColor)} />
                    </span>
                    <p className={cn("font-semibold text-stone-800 leading-tight", isMobile ? "text-[14px]" : "text-[13px]")}>
                      {tab.label}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* ── Footer links ─────────────────────────────────────── */}
      <div className={cn("flex gap-2.5 pt-1 border-t border-stone-100", isMobile && "flex-col")}>
        <button
          type="button"
          onClick={() => onTabChange("home")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white text-stone-600 text-sm font-semibold transition-colors hover:bg-stone-50",
            isMobile ? "h-12 w-full" : "px-4 py-2",
          )}
        >
          Open Dashboard
        </button>
        <Link
          href={buildWorkspaceHref("/manuals")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white text-stone-600 text-sm font-semibold transition-colors hover:bg-stone-50",
            isMobile ? "h-12 w-full" : "px-4 py-2",
          )}
        >
          <BookOpen className="h-3.5 w-3.5" />
          Training Manuals
        </Link>
      </div>

    </div>
  )
}
