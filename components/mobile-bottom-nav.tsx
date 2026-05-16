"use client"

/**
 * MobileBottomNav — replaces the hamburger+drawer pattern on mobile.
 *
 * Shows 4 season-aware primary tabs + a "More" trigger that opens the existing
 * sidebar drawer. The 4 tabs are determined by getMobileBottomNavTabs() which
 * surfaces the right tabs based on the current estate season.
 *
 * Off-season (May–Sep): Home, Labor+Costs, Rain & Weather, Stock & Inventory
 * Harvest season (Oct–Mar): Home, Pulping, Labor+Costs, Rain & Weather
 */

import { cn } from "@/lib/utils"
import { MoreHorizontal } from "lucide-react"
import { getMobileBottomNavTabs } from "@/lib/season-utils"
import { isTabOffSeason } from "@/lib/season-utils"

type MobileBottomNavProps = {
  activeTab: string
  visibleTabs: string[]
  tabMeta: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }>
  onTabChange: (tab: string) => void
  onOpenSidebar: () => void
}

// Shorten labels for the tiny bottom nav
const SHORT_LABELS: Record<string, string> = {
  "home": "Home",
  "accounts": "Labor & Costs",
  "rainfall": "Rain",
  "inventory": "Stock",
  "processing": "Pulping",
  "dispatch": "Dispatch",
  "sales": "Sales",
  "season": "Season",
  "season-pl": "P&L",
  "balance-sheet": "Finance",
  "ai-analysis": "AI",
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
        "bg-white/80 backdrop-blur-xl backdrop-saturate-150",
        "border-t border-black/[0.06]",
        "shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.08)]",
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      {/* Subtle glass shimmer line at top */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />

      <div className="flex items-stretch h-14">
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
                "flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0 px-1 relative transition-all",
                "touch-manipulation active:scale-95",
                isActive ? "text-emerald-700" : offSeason ? "text-neutral-300" : "text-neutral-500 hover:text-neutral-700",
              )}
            >
              {/* Active pill indicator */}
              {isActive && (
                <span className="absolute top-0 inset-x-[30%] h-0.5 rounded-full bg-emerald-600" />
              )}
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-xl transition-all",
                isActive
                  ? "bg-emerald-100 shadow-[0_1px_4px_rgba(16,185,129,0.2)]"
                  : "group-hover:bg-neutral-100",
              )}>
                <Icon className={cn("h-4 w-4", isActive ? "text-emerald-700" : "")} />
              </div>
              <span className={cn(
                "text-[9px] font-medium tracking-wide truncate max-w-full px-1",
                isActive ? "text-emerald-700" : "",
              )}>
                {label}
              </span>
            </button>
          )
        })}

        {/* More → opens sidebar drawer */}
        <button
          type="button"
          onClick={onOpenSidebar}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0 px-1 text-neutral-400 hover:text-neutral-600 transition-all touch-manipulation active:scale-95"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl">
            <MoreHorizontal className="h-4 w-4" />
          </div>
          <span className="text-[9px] font-medium tracking-wide">More</span>
        </button>
      </div>
    </nav>
  )
}
