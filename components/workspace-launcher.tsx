"use client"

import Link from "next/link"
import { Home, BookOpen, Receipt, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type TabItem = {
  value: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  subtabs?: string[]
}

type LauncherSection = {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  tabs: TabItem[]
  tabClassName: string
  badgeClassName: string
  iconClassName: string
}

type Props = {
  sections: LauncherSection[]
  canShowAccounts: boolean
  isMobile: boolean
  onTabChange: (tab: string) => void
  onAccountsExpense: () => void
  onAccountsLabor: () => void
  buildWorkspaceHref: (path: string) => string
}

export default function WorkspaceLauncher({
  sections,
  canShowAccounts,
  isMobile,
  onTabChange,
  onAccountsExpense,
  onAccountsLabor,
  buildWorkspaceHref,
}: Props) {
  return (
    <Card className="overflow-hidden border-black/10 bg-gradient-to-br from-white via-neutral-50 to-neutral-100/80 shadow-sm">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className={cn("leading-tight", isMobile ? "text-xl" : "text-2xl")}>
          Where do you want to go?
        </CardTitle>
        <CardDescription>
          Tap any section to jump straight there — no extra steps.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Task shortcuts */}
        {canShowAccounts && (
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onAccountsExpense}
              className={cn(
                "flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 text-left transition-colors hover:bg-emerald-100/60 touch-manipulation",
                isMobile ? "py-4" : "py-3.5",
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white shadow-sm">
                <Receipt className="h-4 w-4" />
              </div>
              <div>
                <p className={cn("font-semibold text-slate-900", isMobile ? "text-base" : "text-sm")}>Record Expense</p>
                <p className="text-xs text-emerald-700">Log a cost or input used</p>
              </div>
            </button>
            <button
              type="button"
              onClick={onAccountsLabor}
              className={cn(
                "flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 text-left transition-colors hover:bg-emerald-100/60 touch-manipulation",
                isMobile ? "py-4" : "py-3.5",
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white shadow-sm">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <p className={cn("font-semibold text-slate-900", isMobile ? "text-base" : "text-sm")}>Record Labor</p>
                <p className="text-xs text-emerald-700">Workers and daily wages</p>
              </div>
            </button>
          </div>
        )}

        {/* All tabs — grouped by section, one tap each */}
        {sections.map((section) => (
          <div key={section.id} className="space-y-2.5">
            <div className="flex items-center gap-2">
              <section.icon className={cn("h-3.5 w-3.5", section.iconClassName)} />
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-500">
                {section.label}
              </p>
              <div className="flex-1 border-t border-neutral-100" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              {section.tabs.map((tab) => {
                const TabIcon = tab.icon
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => onTabChange(tab.value)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border text-left touch-manipulation transition-colors",
                      isMobile ? "min-h-[64px] px-3.5 py-3.5" : "min-h-[52px] px-3 py-2.5",
                      section.tabClassName,
                    )}
                  >
                    <span
                      className={cn(
                        "flex shrink-0 items-center justify-center rounded-lg",
                        isMobile ? "h-9 w-9" : "h-7 w-7",
                        section.badgeClassName,
                      )}
                    >
                      <TabIcon className={cn(isMobile ? "h-4 w-4" : "h-3.5 w-3.5", section.iconClassName)} />
                    </span>
                    <div className="min-w-0">
                      <p className={cn("font-semibold leading-tight", isMobile ? "text-[15px]" : "text-[13px]")}>
                        {tab.label}
                      </p>
                      {tab.subtabs?.length ? (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {tab.subtabs.slice(0, 2).join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* Bottom links */}
        <div className="flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
          <Button
            variant="outline"
            className={cn("bg-white text-slate-700", isMobile ? "w-full min-h-[48px] text-base" : "")}
            onClick={() => onTabChange("home")}
          >
            <Home className="mr-2 h-4 w-4" />
            Open Dashboard
          </Button>
          <Button
            asChild
            variant="outline"
            className={cn("bg-white text-slate-700", isMobile ? "w-full min-h-[48px] text-base" : "")}
          >
            <Link href={buildWorkspaceHref("/manuals")}>
              <BookOpen className="mr-2 h-4 w-4" />
              Training Manuals
            </Link>
          </Button>
        </div>

      </CardContent>
    </Card>
  )
}
