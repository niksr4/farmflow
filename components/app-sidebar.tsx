"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { LogOut, Settings } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

type SubItem = { emoji: string; label: string; accountsPanel?: string; section?: string }

const TAB_SUB_SECTIONS: Record<string, SubItem[]> = {
  accounts: [
    { emoji: "📊", label: "Dashboard", accountsPanel: "labour" },
    { emoji: "👷", label: "Labour", accountsPanel: "labour" },
    { emoji: "💸", label: "Expenses", accountsPanel: "expenses" },
    { emoji: "🏷️", label: "Codes", accountsPanel: "activities" },
    { emoji: "📤", label: "Export", accountsPanel: "expenses" },
  ],
  rainfall: [
    { emoji: "🌧️", label: "Log", section: "log" },
    { emoji: "📋", label: "Records", section: "records" },
    { emoji: "📊", label: "Stats", section: "stats" },
  ],
  processing: [
    { emoji: "📊", label: "Season Totals", section: "season-totals" },
    { emoji: "✏️", label: "Entry Form", section: "entry-form" },
    { emoji: "📋", label: "Recent Entries", section: "recent-entries" },
  ],
  dispatch: [
    { emoji: "📦", label: "Stock Flow", section: "stock-flow" },
    { emoji: "🚚", label: "New Dispatch", section: "new-dispatch" },
    { emoji: "📋", label: "Records", section: "records" },
  ],
  sales: [
    { emoji: "📊", label: "Overview", section: "overview" },
    { emoji: "💰", label: "New Sale", section: "new-sale" },
    { emoji: "📦", label: "Stock Available", section: "stock-available" },
    { emoji: "📋", label: "Records", section: "records" },
  ],
}

type AppSidebarProps = {
  activeTab: string
  visibleTabs: string[]
  tabMeta: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }>
  onTabChange: (tab: string) => void
  onSubNavClick?: (tabId: string, sub: SubItem) => void
  launcherTab: string
  username: string
  estateName?: string
  roleBadgeLabel: string
  onLogout: () => void
  isAdmin?: boolean
  isOwner?: boolean
  buildWorkspaceHref: (path: string) => string
}

const NAV_GROUPS: Array<{ id: string; label?: string; items: string[] }> = [
  { id: "home", items: ["home"] },
  {
    id: "operations",
    label: "Operations",
    items: ["rainfall", "inventory", "processing", "curing", "quality", "dispatch", "sales", "picking", "pepper", "rubber"],
  },
  {
    id: "finance",
    label: "Finance",
    items: ["accounts", "balance-sheet", "season-pl", "receivables", "billing", "market-pricing"],
  },
  {
    id: "insights",
    label: "Reports",
    items: [
      "season",
      "yield-forecast",
      "plant-health",
      "ai-analysis",
      "news",
      "documents",
      "journal",
      "resources",
      "compliance",
      "activity-log",
    ],
  },
]

/* Tooltip content is rendered in a Radix portal at the body level, so it
   inherits the page theme. We force our own dark background + white text
   with !important (the Tailwind `!` prefix) so it always looks correct
   regardless of the active theme. */
const TOOLTIP_CLS =
  "!bg-[#1a2420] !text-white !border-[rgba(255,255,255,0.1)] text-xs font-medium"

export default function AppSidebar({
  activeTab,
  visibleTabs,
  tabMeta,
  onTabChange,
  onSubNavClick,
  launcherTab,
  username,
  estateName,
  roleBadgeLabel,
  onLogout,
  isAdmin,
  isOwner,
  buildWorkspaceHref,
}: AppSidebarProps) {
  const initial = username.charAt(0).toUpperCase()

  return (
    <TooltipProvider delayDuration={80}>
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-[76px] flex-col border-r",
        "bg-[#0a0f0d] border-white/[0.05] shadow-[2px_0_24px_-6px_rgba(0,0,0,0.10),1px_0_0_rgba(0,0,0,0.03)]",
        "dark:shadow-[4px_0_40px_-8px_rgba(0,0,0,0.6)]",
      )}>
        {/* Logo */}
        <div className="flex h-[58px] shrink-0 items-center justify-center border-b border-white/[0.04]">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onTabChange(launcherTab)}
                className={cn(
                  "relative flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200",
                  "bg-gradient-to-br from-emerald-500/12 to-emerald-600/6 ring-1 ring-emerald-500/25",
                  "hover:ring-emerald-400/40 hover:shadow-[0_0_20px_-2px_rgba(52,211,153,0.3)]",
                )}
              >
                <Image src="/icon.svg" alt="FarmFlow" width={22} height={22} className="rounded-sm" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10} className={TOOLTIP_CLS}>
              {estateName ? `${estateName} — home` : "Go to home"}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-px overflow-y-auto overflow-x-hidden px-2 py-2 no-scrollbar">
          {NAV_GROUPS.map((group, groupIdx) => {
            const groupItems = group.items.filter(
              (itemId) => (visibleTabs.includes(itemId) || itemId === "home") && tabMeta[itemId],
            )
            if (groupItems.length === 0) return null

            return (
              <div
                key={group.id}
                className={cn(
                  "flex flex-col gap-px",
                  groupIdx > 0 && "mt-2 border-t border-white/[0.06] pt-2",
                )}
              >
                {group.label && (
                  <p className="mb-0.5 select-none px-1 text-center text-[7px] font-bold uppercase tracking-[0.12em] text-white/30">
                    {group.label}
                  </p>
                )}
                {groupItems.map((itemId) => {
                  const meta = tabMeta[itemId]
                  if (!meta) return null
                  const Icon = meta.icon
                  const isActive = activeTab === itemId
                  const subItems = TAB_SUB_SECTIONS[itemId]

                  // Shorten labels to fit in narrow sidebar
                  const shortLabel = meta.label
                    .replace("Stock & ", "")
                    .replace("Curing & Drying", "Curing")
                    .replace("Quality Grading", "Quality")
                    .replace("Season Summary", "Season")
                    .replace("Harvest Forecast", "Forecast")
                    .replace("Rain & Weather", "Weather")
                    .replace("Crop Health", "Health")
                    .replace("AI Insights", "AI")
                    .replace("Market News", "News")
                    .replace("Market Rates", "Rates")
                    .replace("Live Balance", "Balance")
                    .replace("P&L Report", "P&L")
                    .replace("Audit Log", "Audit")
                    .replace("Picking Log", "Picking")

                  return (
                    <div key={itemId}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => onTabChange(itemId)}
                            className={cn(
                              "group relative flex h-auto w-full flex-col items-center justify-center gap-0.5 rounded-xl py-2 transition-all duration-200",
                              isActive
                                ? [
                                    "bg-gradient-to-b from-emerald-500/18 to-emerald-500/6 text-emerald-300",
                                    "shadow-[inset_0_1px_0_rgba(52,211,153,0.08),0_4px_16px_-4px_rgba(52,211,153,0.2)]",
                                  ].join(" ")
                                : "text-white/40 hover:bg-white/[0.07] hover:text-white/80",
                            )}
                          >
                            {isActive && (
                              <span className={cn(
                                "absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full",
                                "h-5 w-[3px] bg-gradient-to-b from-emerald-300/90 to-emerald-500/80",
                                "shadow-[0_0_8px_1px_rgba(52,211,153,0.55)]",
                              )} />
                            )}
                            <Icon className="h-[17px] w-[17px]" />
                            <span className={cn(
                              "text-center leading-none",
                              isActive ? "text-[8.5px] font-semibold" : "text-[8px] font-medium",
                            )}>
                              {shortLabel}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" sideOffset={10} className={TOOLTIP_CLS}>
                          {meta.label}
                        </TooltipContent>
                      </Tooltip>
                      {isActive && subItems && (
                        <div className="flex flex-col gap-0.5 mt-0.5 mb-1 px-1">
                          {subItems.map((sub) => (
                            <button
                              key={sub.label}
                              type="button"
                              onClick={() => onSubNavClick ? onSubNavClick(itemId, sub) : onTabChange(itemId)}
                              className={cn(
                                "w-full text-center text-[8px] font-semibold leading-none py-1.5 rounded-lg transition-all duration-150",
                                "text-emerald-400/70 hover:text-emerald-200 hover:bg-emerald-500/12",
                              )}
                            >
                              {sub.emoji} {sub.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Profile section */}
        <div className="shrink-0 border-t border-white/[0.04] px-2 py-2.5">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Profile"
                className={cn(
                  "flex h-9 w-full items-center justify-center rounded-xl transition-all duration-200",
                  "text-white/40 hover:bg-white/[0.07]",
                )}
              >
                <span className={cn(
                  "flex h-[28px] w-[28px] items-center justify-center rounded-full text-[11px] font-bold",
                  "bg-gradient-to-br from-emerald-500/20 to-emerald-600/8 text-emerald-300",
                  "ring-1 ring-emerald-500/30 shadow-[0_0_12px_-2px_rgba(52,211,153,0.3)]",
                )}>
                  {initial}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent side="right" sideOffset={12} align="end" className="w-56 p-2">
              {/* Identity */}
              <div className="flex items-center gap-2.5 px-2 py-2">
                <span className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
                  "dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/25",
                )}>
                  {initial}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{username}</p>
                  {estateName && (
                    <p className="truncate text-xs text-muted-foreground">{estateName}</p>
                  )}
                </div>
              </div>
              <div className="px-2 pb-2">
                <Badge variant="outline" className="text-[11px] font-medium">
                  {roleBadgeLabel}
                </Badge>
              </div>

              <div className="my-1 border-t border-border" />

              {(isAdmin || isOwner) && (
                <Link
                  href={buildWorkspaceHref("/settings")}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                    "text-foreground hover:bg-accent transition-colors duration-100",
                  )}
                >
                  <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                  Settings
                </Link>
              )}

              <div className="my-1 border-t border-border" />

              <button
                type="button"
                onClick={onLogout}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                  "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10 transition-colors duration-100",
                )}
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </aside>
    </TooltipProvider>
  )
}
