"use client"

import React from "react"
import Image from "next/image"
import Link from "next/link"
import { BookOpen, Home, LogOut, Settings, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { DASHBOARD_LAUNCHER_TAB } from "@/components/inventory-system/constants"

type SidebarTabItem = {
  value: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

type SidebarSection = {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  iconClassName?: string
  tabs: SidebarTabItem[]
}

type Props = {
  isOpen: boolean
  onClose: () => void
  estateName: string
  username: string
  roleBadgeLabel: string
  activeTab: string
  sections: SidebarSection[]
  onTabChange: (tab: string) => void
  buildWorkspaceHref: (path: string) => string
  isAdmin: boolean
  onNavigateDashboard: () => void
  onLogout: () => void
}

export default function MobileSidebarDrawer({
  isOpen,
  onClose,
  estateName,
  username,
  roleBadgeLabel,
  activeTab,
  sections,
  onTabChange,
  buildWorkspaceHref,
  isAdmin,
  onNavigateDashboard,
  onLogout,
}: Props) {
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
          onClick={onClose}
        />
      )}

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out dark:bg-neutral-900",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Image src="/icon.svg" alt="FarmFlow" width={28} height={28} className="rounded-lg" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-neutral-900 dark:text-white truncate">
                {estateName || "FarmFlow"}
              </p>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">{username} · {roleBadgeLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors touch-manipulation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          <button
            type="button"
            onClick={() => { onNavigateDashboard(); onClose() }}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold transition-colors touch-manipulation",
              (activeTab === DASHBOARD_LAUNCHER_TAB || activeTab === "home")
                ? "bg-emerald-50 text-emerald-700"
                : "text-neutral-700 hover:bg-stone-50",
            )}
          >
            <Home className="h-4.5 w-4.5 shrink-0" />
            Dashboard
          </button>

          {sections.map((section) => (
            <div key={section.id} className="mt-3">
              <div className="flex items-center gap-2 px-4 pb-1">
                <section.icon className={cn("h-3 w-3 shrink-0", section.iconClassName)} />
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">
                  {section.label}
                </p>
              </div>
              {section.tabs.map((tab) => {
                const TabIcon = tab.icon
                const isActive = activeTab === tab.value
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => { onTabChange(tab.value); onClose() }}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] font-medium transition-colors touch-manipulation",
                      isActive
                        ? "bg-emerald-50 text-emerald-700 font-semibold"
                        : "text-neutral-600 hover:bg-stone-50 hover:text-neutral-900",
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 h-6 w-[3px] rounded-r-full bg-emerald-500" />
                    )}
                    <TabIcon className={cn("h-4 w-4 shrink-0", isActive ? "text-emerald-600" : "text-stone-400")} />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-stone-200 px-3 py-3 space-y-1">
          <Link
            href={buildWorkspaceHref("/manuals")}
            onClick={onClose}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-stone-50 touch-manipulation"
          >
            <BookOpen className="h-4 w-4 text-stone-400" />
            Training Manuals
          </Link>
          {isAdmin && (
            <Link
              href={buildWorkspaceHref("/settings")}
              onClick={onClose}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-stone-50 touch-manipulation"
            >
              <Settings className="h-4 w-4 text-stone-400" />
              Settings
            </Link>
          )}
          <button
            type="button"
            onClick={() => { onClose(); onLogout() }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-rose-600 transition-colors hover:bg-rose-50 touch-manipulation"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    </>
  )
}
