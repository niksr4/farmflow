"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { getCurrentEstatePhase } from "@/lib/coffee-estate-calendar"
import LottieAnimation from "@/components/ui/lottie-animation"
import successAnimation from "@/public/animations/success.json"

type Props = {
  onTabChange: (tab: string) => void
}

const PHASE_ACTIONS: Record<string, { label: string; description: string; tab: string }> = {
  "harvest-peak":         { label: "Log today's picking",       description: "Record cherry weight by plot for each picking team.",                        tab: "accounts" },
  "pre-harvest":          { label: "Record a harvest expense",   description: "Log picker wages, nets, or equipment costs before harvest begins.",          tab: "accounts" },
  "post-harvest-pruning": { label: "Track pruning labour",       description: "Log wages and activity codes for post-harvest pruning work.",                tab: "accounts" },
  "blossom":              { label: "Record the blossom date",    description: "Note the blossom shower date — it sets your harvest window.",                tab: "inventory" },
  "berry-formation":      { label: "Log an estate expense",      description: "Record weed management, fertiliser, or maintenance costs for this period.", tab: "accounts" },
  "monsoon":              { label: "Record rainfall",            description: "Log daily rainfall — monsoon tracking feeds your season report.",            tab: "rainfall" },
}

export default function SetupCompleteCard({ onTabChange }: Props) {
  const phase = getCurrentEstatePhase()
  const action = PHASE_ACTIONS[phase.season] ?? PHASE_ACTIONS["berry-formation"]

  return (
    <div className="mb-6 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <LottieAnimation
            animationData={successAnimation}
            loop={false}
            style={{ width: 44, height: 44 }}
            className="shrink-0"
          />
          <div>
            <p className="text-sm font-semibold text-emerald-900">Estate setup complete</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {phase.label} — {action.description}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50"
          onClick={() => onTabChange(action.tab)}
        >
          {action.label}
        </Button>
      </div>
    </div>
  )
}
