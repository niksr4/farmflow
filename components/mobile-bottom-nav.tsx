"use client"

/**
 * MobileBottomNav — redesigned for phone-first, low-literacy users.
 *
 * Design principles:
 *  - 5 slots: 4 primary tabs + More. Always visible.
 *  - Active tab: large filled pill, emerald. Impossible to miss.
 *  - Labels: short (1 word), large enough to read at arm's length.
 *  - Touch targets: full height of the bar (~68px).
 *  - Mirrors the mental model of WhatsApp / familiar Indian apps.
 */

import { cn } from "@/lib/utils"
import { MoreHorizontal } from "lucide-react"
import { getMobileBottomNavTabs, isTabOffSeason } from "@/lib/season-utils"

type MobileBottomNavProps = {
  activeTab: string
  visibleTabs: string[]
  tabMeta: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }>
  onTabChange: (tab: string) => void
  onOpenSidebar: () => void
}

const SHORT_LABELS: Record<string, string> = {
  home: "Home",
  accounts: "Labour",
  rainfall: "Rain",
  inventory: "Stock",
  processing: "Pulping",
  dispatch: "Dispatch",
  sales: "Sales",
  season: "Season",
  "season-pl": "P&L",
  "balance-sheet": "Finance",
  "ai-analysis": "Insights",
  "plant-health": "Crop",
}

export default function MobileBottomNav({
  activeTab,
  visibleTabs,
  tabMeta,
  onTabChange,
  onOpenSidebar,
}: MobileBottomNavProps) {
  const primaryTabs = getMobileBottomNavTabs(visibleTabs)

  return (
    <nav
      className={cn(
        "fixed bottom-0 inset-x-0 z-40",
        "bg-white border-t-2 border-stone-300",
        "pb-[env(safe-area-inset-bottom)]",
        "shadow-[0_-4px_24px_rgba(0,0,0,0.14)]",
      )}
    >
      <div className="flex items-stretch h-[68px]">
        {primaryTabs.map((tabId) => {
          const meta = tabMeta[tabId]
          if (!meta) return null
          const Icon = meta.icon
          const isActive = activeTab === tabId
          const offSeason = isTabOffSeason(tabId)
          const label = SHORT_LABELS[tabId] || meta.label.split(" ")[0]

          return (
            <button
              key={tabId}
              type="button"
              onClick={() => onTabChange(tabId)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 min-w-0 px-1",
                "touch-manipulation active:scale-95 transition-transform",
              )}
            >
              {/* Icon container — solid filled pill when active */}
              <div className={cn(
                "flex h-9 w-14 items-center justify-center rounded-full transition-all",
                isActive
                  ? "bg-emerald-700 shadow-[0_2px_8px_rgba(5,120,70,0.35)]"
                  : "",
              )}>
                <Icon className={cn(
                  "h-[22px] w-[22px] transition-all stroke-[2.5]",
                  isActive
                    ? "text-white"
                    : offSeason
                      ? "text-stone-500"
                      : "text-stone-800",
                )} />
              </div>
              <span className={cn(
                "text-[11px] font-black tracking-wide truncate max-w-full px-1 leading-none",
                isActive
                  ? "text-emerald-700"
                  : offSeason
                    ? "text-stone-500"
                    : "text-stone-800",
              )}>
                {label}
              </span>
            </button>
          )
        })}

        {/* More */}
        <button
          type="button"
          onClick={onOpenSidebar}
          className="flex-1 flex flex-col items-center justify-center gap-1 min-w-0 px-1 touch-manipulation active:scale-95 transition-transform"
        >
          <div className="flex h-9 w-14 items-center justify-center rounded-full">
            <MoreHorizontal className="h-[22px] w-[22px] stroke-[2.5] text-stone-800" />
          </div>
          <span className="text-[11px] font-black tracking-wide leading-none text-stone-800">More</span>
        </button>
      </div>
    </nav>
  )
}
