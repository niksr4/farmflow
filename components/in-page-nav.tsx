"use client"
import type React from "react"
import { cn } from "@/lib/utils"

export type InPageNavItem = {
  label: string
  /** Scroll target — mutually exclusive with onClick */
  ref?: React.RefObject<HTMLElement | null>
  /** Toggle handler — use this instead of ref for show/hide sections */
  onClick?: () => void
  /** When true the button renders as active (filled dark) */
  active?: boolean
  icon?: React.ComponentType<{ className?: string }>
}

export default function InPageNav({
  items,
  className,
}: {
  items: InPageNavItem[]
  className?: string
}) {
  const handleClick = (item: InPageNavItem) => {
    if (item.onClick) {
      item.onClick()
    } else if (item.ref) {
      item.ref.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <div className={cn("flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1", className)}>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.label}
            type="button"
            onClick={() => handleClick(item)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all touch-manipulation active:scale-95",
              item.active
                ? "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-white/[0.07] dark:text-stone-300 dark:hover:bg-white/[0.12]",
            )}
          >
            {Icon && <Icon className="h-3 w-3 shrink-0" />}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
