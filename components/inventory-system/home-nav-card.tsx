"use client"

import React from "react"
import { cn } from "@/lib/utils"

type NavAction = {
  tab: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

type Props = {
  actions: NavAction[]
  isMobile: boolean
  onTabChange: (tab: string) => void
}

export default function HomeNavCard({ actions, isMobile, onTabChange }: Props) {
  if (actions.length === 0) return null
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card">
      <div className="border-b border-stone-100 px-5 py-4 dark:border-white/[0.05]">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-500">Navigation</p>
        <p className={cn("font-bold text-stone-900 dark:text-white", isMobile ? "text-base" : "text-sm")}>Jump to a section</p>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {actions.map((action) => {
            const ActionIcon = action.icon
            return (
              <button
                key={action.tab}
                type="button"
                onClick={() => onTabChange(action.tab)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3.5 text-left shadow-sm transition-colors hover:bg-stone-50 touch-manipulation",
                  isMobile ? "min-h-[60px] py-3.5" : "min-h-[52px] py-2.5",
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                  <ActionIcon className="h-4 w-4 text-emerald-700" />
                </span>
                <span className={cn("font-semibold text-stone-800", isMobile ? "text-[15px]" : "text-sm")}>
                  {action.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
