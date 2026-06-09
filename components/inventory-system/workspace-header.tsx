"use client"

import React from "react"
import Image from "next/image"
import Link from "next/link"
import {
  BookOpen,
  Factory,
  Leaf,
  LifeBuoy,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { DASHBOARD_LAUNCHER_TAB } from "@/components/inventory-system/constants"

type TabMeta = Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }>

type Props = {
  isMobile: boolean
  username: string
  estateName: string
  isAdmin: boolean
  isOwner: boolean
  isPreviewMode: boolean
  roleBadgeLabel: string
  activeTab: string
  theme: string | undefined
  tabMeta: TabMeta
  buildWorkspaceHref: (path: string) => string
  onTabChange: (tab: string) => void
  onLogout: () => void
  onToggleTheme: () => void
  onOpenSearch: () => void
  onOpenSidebar: () => void
}

export default function WorkspaceHeader({
  isMobile,
  username,
  estateName,
  isAdmin,
  isOwner,
  isPreviewMode,
  roleBadgeLabel,
  activeTab,
  theme,
  tabMeta,
  buildWorkspaceHref,
  onTabChange,
  onLogout,
  onToggleTheme,
  onOpenSearch,
  onOpenSidebar,
}: Props) {
  return (
    <header className={cn(
      "relative mb-4 overflow-hidden",
      isMobile
        ? "rounded-2xl border border-black/[0.06] bg-white/70 backdrop-blur-xl backdrop-saturate-150 p-4 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/[0.07] dark:bg-card/80"
        : "flex items-center justify-between rounded-xl border border-black/[0.06] bg-white/70 backdrop-blur-xl backdrop-saturate-150 px-4 py-2.5 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/[0.07] dark:bg-card/70",
    )}>
      {/* Prismatic shimmer line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-emerald-400/50 via-amber-300/40 to-sky-400/40" />
      {/* Inner glass highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent rounded-t-2xl" />

      {isMobile ? (
        /* Mobile header: lean bar — hamburger + estate name + theme toggle */
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenSidebar}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white/80 text-neutral-700 shadow-sm transition-colors hover:bg-stone-50 touch-manipulation"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => onTabChange("home")}
                className="flex items-center focus:outline-none"
                aria-label="Go to home"
              >
                <Image
                  src="/brand-logo.svg"
                  alt="FarmFlow"
                  width={120}
                  height={47}
                  className="h-7 w-auto"
                />
              </button>
              {!isPreviewMode && estateName && (
                <span className="hidden text-sm font-semibold text-emerald-700 sm:block truncate max-w-[140px]">
                  {estateName}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleTheme}
              className="h-9 w-9 px-0"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Profile"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-stone-200 bg-white/80 shadow-sm touch-manipulation"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-emerald-50 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200/90">
                    {username.charAt(0).toUpperCase()}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="flex items-center gap-2.5 px-2 py-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200">
                    {username.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{username}</p>
                    {estateName && (
                      <p className="truncate text-xs text-muted-foreground">{estateName}</p>
                    )}
                  </div>
                </div>
                <div className="px-2 pb-2">
                  <Badge variant="outline" className="text-[11px] font-medium">{roleBadgeLabel}</Badge>
                </div>
                <DropdownMenuSeparator />
                {(isAdmin || isOwner) && (
                  <DropdownMenuItem asChild>
                    <Link href={buildWorkspaceHref("/settings")}>
                      <Settings className="h-4 w-4 mr-2" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onLogout}
                  className="text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:text-rose-400 dark:focus:bg-rose-500/10"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      ) : (
        /* Desktop slim topbar: estate name + breadcrumb + actions */
        <>
          <div className="flex items-center gap-2.5 min-w-0">
            {!isPreviewMode && estateName ? (
              <div className="flex items-center gap-2">
                <Leaf className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="font-semibold text-sm text-foreground truncate">{estateName}</span>
              </div>
            ) : (
              <span className="font-semibold text-sm text-foreground">FarmFlow</span>
            )}
            {activeTab !== DASHBOARD_LAUNCHER_TAB && activeTab !== "home" && tabMeta[activeTab] && (
              <>
                <span className="text-muted-foreground/30 text-sm select-none">/</span>
                <span className="text-sm text-muted-foreground truncate">{tabMeta[activeTab]?.label}</span>
              </>
            )}
            {isPreviewMode && (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-xs ml-1">
                Preview
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenSearch}
              className="text-muted-foreground hover:text-foreground h-8 px-3 hidden sm:flex"
            >
              <Search className="h-3.5 w-3.5 mr-1.5" />
              Search
              <kbd className="ml-2 hidden lg:inline-flex h-4 select-none items-center gap-0.5 rounded border bg-muted px-1 text-[10px] font-medium text-muted-foreground">
                ⌘K
              </kbd>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleTheme}
              className="text-muted-foreground hover:text-foreground h-8 w-8 px-0"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground h-8 px-3">
              <Link href={buildWorkspaceHref("/manuals")}>
                <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                Help
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-8 px-3"
              onClick={() => window.dispatchEvent(new CustomEvent("farmflow:open-feedback"))}
            >
              <LifeBuoy className="h-3.5 w-3.5 mr-1.5" />
              Support
            </Button>
            {isOwner && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground h-8 px-3">
                    <Settings className="h-3.5 w-3.5 mr-1.5" />
                    Console
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Platform Console</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <Settings className="h-4 w-4 mr-2" />
                      Platform Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin/init-pepper-tables">
                      <Leaf className="h-4 w-4 mr-2" />
                      Initialize Pepper Tables
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin/init-processing-table">
                      <Factory className="h-4 w-4 mr-2" />
                      Initialize Processing Tables
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin/tenants">
                      <Users className="h-4 w-4 mr-2" />
                      Manage Tenants
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin/inspect-databases">
                      <Settings className="h-4 w-4 mr-2" />
                      Inspect Databases
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {/* Profile avatar */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Profile"
                  className="ml-1 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-emerald-50 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200/90 transition-shadow hover:shadow-[0_0_0_2px_rgba(52,211,153,0.35)] dark:from-emerald-500/20 dark:to-emerald-600/8 dark:text-emerald-300 dark:ring-emerald-500/30"
                >
                  {username.charAt(0).toUpperCase()}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="flex items-center gap-2.5 px-2 py-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:ring-emerald-500/25">
                    {username.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{username}</p>
                    {estateName && (
                      <p className="truncate text-xs text-muted-foreground">{estateName}</p>
                    )}
                  </div>
                </div>
                <div className="px-2 pb-2">
                  <Badge variant="outline" className="text-[11px] font-medium">{roleBadgeLabel}</Badge>
                </div>
                <DropdownMenuSeparator />
                {(isAdmin || isOwner) && (
                  <DropdownMenuItem asChild>
                    <Link href={buildWorkspaceHref("/settings")}>
                      <Settings className="h-4 w-4 mr-2" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onLogout}
                  className="text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:text-rose-400 dark:focus:bg-rose-500/10"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      )}
    </header>
  )
}
