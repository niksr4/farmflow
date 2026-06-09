"use client"

import React from "react"
import Link from "next/link"

type Props = {
  daysRemaining: number
  onDismiss: () => void
}

export default function TrialBanner({ daysRemaining, onDismiss }: Props) {
  const isUrgent = daysRemaining <= 5
  return (
    <div className={`mb-4 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm shadow-sm ${
      isUrgent
        ? "border-amber-300/70 bg-gradient-to-r from-amber-50 to-orange-50/60 text-amber-900"
        : "border-emerald-200/70 bg-gradient-to-r from-emerald-50/80 to-sky-50/60 text-emerald-900"
    }`}>
      <div className="flex items-center gap-3 min-w-0">
        <span className={`shrink-0 text-base ${isUrgent ? "text-amber-500" : "text-emerald-600"}`}>
          {isUrgent ? "⏳" : "✨"}
        </span>
        <p className="min-w-0">
          <span className="font-semibold">
            {daysRemaining === 1
              ? "1 day left on your free trial."
              : `${daysRemaining} days left on your trial.`}
          </span>
          {" "}Your data is saved either way.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/plans"
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            isUrgent
              ? "bg-amber-600 text-white hover:bg-amber-700"
              : "bg-emerald-700 text-white hover:bg-emerald-800"
          }`}
        >
          Upgrade →
        </Link>
        <button
          type="button"
          className="text-xs opacity-50 hover:opacity-80"
          onClick={onDismiss}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
