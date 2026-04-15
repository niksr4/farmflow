"use client"

import React from "react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { LogOut, Settings } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

type AppSidebarProps = {
  activeTab: string
  visibleTabs: string[]
  tabMeta: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }>
  onTabChange: (tab: string) => void
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
    label: "Ops",
    items: ["processing", "curing", "quality", "dispatch", "sales", "inventory", "pepper"],
  },
  {
    id: "finance",
    label: "Finance",
    items: ["accounts", "balance-sheet", "receivables", "billing"],
  },
  {
    id: "insights",
    label: "Insights",
    items: [
      "season",
      "yield-forecast",
      "activity-log",
      "rainfall",
      "documents",
      "journal",
      "resources",
      "plant-health",
      "ai-analysis",
      "news",
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
  username,
  estateName,
  roleBadgeLabel,
  onLogout,
  isAdmin,
  isOwner,
  buildWorkspaceHref,
}: AppSidebarProps) {
  return (
    <TooltipProvider delayDuration={80}>
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-[68px] flex-col border-r",
        /* Light mode */
        "bg-white border-slate-200 shadow-[2px_0_16px_-4px_rgba(0,0,0,0.08)]",
        /* Dark mode */
        "dark:bg-[#0c110e] dark:border-white/[0.06] dark:shadow-[4px_0_32px_-4px_rgba(0,0,0,0.5)]",
      )}>
        {/* Logo */}
        <div className="flex h-[58px] shrink-0 items-center justify-center border-b border-slate-200 dark:border-white/[0.05]">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onTabChange("home")}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-150",
                  "bg-emerald-50 ring-1 ring-emerald-200 hover:bg-emerald-100 hover:ring-emerald-300",
                  "dark:bg-emerald-500/10 dark:ring-1 dark:ring-emerald-500/20 dark:hover:bg-emerald-500/18 dark:hover:ring-emerald-400/35",
                )}
              >
                <Image src="/icon.svg" alt="FarmFlow" width={22} height={22} className="rounded-sm" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10} className={TOOLTIP_CLS}>
              {estateName ?? "FarmFlow"}
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
                  groupIdx > 0 && "mt-2 border-t border-slate-100 pt-2 dark:border-white/[0.06]",
                )}
              >
                {group.label && (
                  <p className="mb-1 select-none px-2 text-[7.5px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-white/35">
                    {group.label}
                  </p>
                )}
                {groupItems.map((itemId) => {
                  const meta = tabMeta[itemId]
                  if (!meta) return null
                  const Icon = meta.icon
                  const isActive = activeTab === itemId

                  return (
                    <Tooltip key={itemId}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onTabChange(itemId)}
                          className={cn(
                            "group relative flex h-9 w-full items-center justify-center rounded-lg transition-all duration-150",
                            isActive
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/14 dark:text-emerald-400"
                              : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-white/55 dark:hover:bg-white/[0.08] dark:hover:text-white/90",
                          )}
                        >
                          {isActive && (
                            <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-emerald-500 dark:bg-emerald-400/80" />
                          )}
                          <Icon className="h-[17px] w-[17px]" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={10} className={TOOLTIP_CLS}>
                        {meta.label}
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Bottom actions */}
        <div className="shrink-0 border-t border-slate-100 px-2 py-2.5 flex flex-col gap-px dark:border-white/[0.05]">
          {(isAdmin || isOwner) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={buildWorkspaceHref("/settings")}
                  className="flex h-9 w-full items-center justify-center rounded-lg text-slate-500 transition-all duration-150 hover:bg-slate-100 hover:text-slate-800 dark:text-white/55 dark:hover:bg-white/[0.08] dark:hover:text-white/90"
                >
                  <Settings className="h-[17px] w-[17px]" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10} className={TOOLTIP_CLS}>
                Settings
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onLogout}
                className="flex h-9 w-full items-center justify-center rounded-lg text-slate-500 transition-all duration-150 hover:bg-rose-50 hover:text-rose-600 dark:text-white/55 dark:hover:bg-rose-500/12 dark:hover:text-rose-400"
              >
                <LogOut className="h-[17px] w-[17px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10} className={TOOLTIP_CLS}>
              <p className="font-semibold">{username}</p>
              <p className="text-[11px] text-white/55">{roleBadgeLabel} · Sign out</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  )
}
