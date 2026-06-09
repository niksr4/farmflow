"use client"

import React from "react"
import { cn } from "@/lib/utils"

type ActivityEntry = {
  module: string
  label: string
  detail: string
  date: string
}

type ModuleStyle = {
  bg: string
  text: string
  icon: React.ReactNode
}

const MODULE_STYLES: Record<string, ModuleStyle> = {
  processing: {
    bg: "bg-emerald-50", text: "text-emerald-700",
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
      </svg>
    ),
  },
  dispatch: {
    bg: "bg-sky-50", text: "text-sky-700",
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
  },
  sales: {
    bg: "bg-amber-50", text: "text-amber-700",
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
  },
  labour: {
    bg: "bg-violet-50", text: "text-violet-700",
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  expenses: {
    bg: "bg-rose-50", text: "text-rose-700",
    icon: (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185z" />
      </svg>
    ),
  },
}

const FALLBACK_STYLE: ModuleStyle = { bg: "bg-stone-50", text: "text-stone-500", icon: null }

type Props = {
  loading: boolean
  activity: ActivityEntry[] | null
}

export default function RecentActivityFeed({ loading, activity }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card">
      <div className="border-b border-stone-100 px-5 py-4 dark:border-white/[0.05]">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-500">Latest</p>
        <p className="text-sm font-bold text-stone-900 dark:text-white">Recent Activity</p>
      </div>
      <div className="p-0">
        {loading ? (
          <div className="divide-y divide-stone-50">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 px-6 py-3">
                <div className="h-7 w-7 shrink-0 rounded-lg bg-stone-100 animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 w-32 rounded bg-stone-100 animate-pulse" />
                  <div className="h-2 w-48 rounded bg-stone-50 animate-pulse" />
                </div>
                <div className="h-2 w-12 rounded bg-stone-100 animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-stone-50">
            {(activity ?? []).map((entry, i) => {
              const cfg = MODULE_STYLES[entry.module] ?? FALLBACK_STYLE
              return (
                <div key={i} className="flex items-center gap-3 px-6 py-3">
                  <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", cfg.bg, cfg.text)}>
                    {cfg.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-stone-800 truncate">{entry.label}</p>
                    <p className="text-xs text-stone-400 truncate">{entry.detail}</p>
                  </div>
                  <span className="shrink-0 text-xs text-stone-400 tabular-nums">{entry.date}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
