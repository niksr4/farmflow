"use client"

import { getCurrentEstatePhase, getEstatePhaseForMonth, type EstateSeason } from "./coffee-estate-calendar"

export type TabSeasonality = "always" | "harvest" | "post-harvest" | "analytics"

// Ground truth from HoneyFarm usage data:
// - Labour: 701 records (year-round, every week)
// - Expenses: 349 records (year-round, 2-3x/week)
// - Processing: active Oct-Jan only
// - Dispatch: active Dec-Mar only
// - Sales: active Dec-Mar only
// - Pepper: active Feb only
// - Rainfall: year-round, occasional

const HARVEST_SEASONS: EstateSeason[] = ["pre-harvest", "harvest-peak"]
const POST_HARVEST_SEASONS: EstateSeason[] = ["post-harvest-pruning"]
const PEPPER_SEASONS: EstateSeason[] = ["post-harvest-pruning", "harvest-peak"]

// Tab ordering by priority for each phase
const SEASON_TAB_ORDER: Record<string, string[]> = {
  "harvest-peak": [
    "home", "accounts", "processing", "dispatch", "sales", "pepper",
    "inventory", "rainfall", "season", "season-pl", "balance-sheet",
    "yield-forecast", "ai-analysis", "quality", "curing", "picking",
    "activity-log", "plant-health", "news", "market-pricing",
    "resources", "documents", "journal", "compliance", "receivables", "billing",
  ],
  "pre-harvest": [
    "home", "accounts", "processing", "inventory", "season", "rainfall",
    "dispatch", "sales", "season-pl", "balance-sheet", "yield-forecast",
    "ai-analysis", "activity-log", "plant-health", "news", "market-pricing",
    "resources", "documents", "journal", "quality", "curing", "picking",
    "compliance", "receivables", "billing",
  ],
  "post-harvest-pruning": [
    "home", "accounts", "processing", "dispatch", "sales", "pepper",
    "inventory", "rainfall", "season", "season-pl", "balance-sheet",
    "activity-log", "ai-analysis", "quality", "curing", "yield-forecast",
    "plant-health", "news", "market-pricing", "resources", "documents",
    "journal", "picking", "compliance", "receivables", "billing",
  ],
  // Off-season (berry-formation, monsoon, blossom) — labour & maintenance dominant
  "default": [
    "home", "accounts", "rainfall", "inventory", "season", "balance-sheet",
    "season-pl", "ai-analysis", "activity-log", "plant-health", "news",
    "market-pricing", "yield-forecast", "resources", "documents", "journal",
    "processing", "dispatch", "sales", "pepper", "quality", "curing", "picking",
    "compliance", "receivables", "billing",
  ],
}

// Tabs that should be de-emphasised (shown but greyed/secondary) when not in season
export const SEASONAL_TABS = new Set(["processing", "dispatch", "sales", "pepper", "curing", "quality", "picking"])

// Tabs that are always primary regardless of season
export const ALWAYS_PRIMARY_TABS = new Set(["home", "accounts", "inventory", "rainfall", "season"])

export function getSeasonAwareTabOrder(availableTabs: string[]): string[] {
  const phase = getCurrentEstatePhase()
  const order = SEASON_TAB_ORDER[phase.season] ?? SEASON_TAB_ORDER["default"]
  const ordered = order.filter((t) => availableTabs.includes(t))
  const extras = availableTabs.filter((t) => !ordered.includes(t))
  return [...ordered, ...extras]
}

// Mobile quick-action tiles on home screen — max 6, season-prioritised
export function getSeasonQuickActions(availableTabs: string[]): string[] {
  const phase = getCurrentEstatePhase()
  const isHarvest = [...HARVEST_SEASONS, ...POST_HARVEST_SEASONS].includes(phase.season)
  const isPepper = PEPPER_SEASONS.includes(phase.season)

  const candidates = isHarvest
    ? ["processing", "dispatch", "sales", ...(isPepper ? ["pepper"] : []), "accounts", "rainfall", "inventory", "season"]
    : ["accounts", "rainfall", "inventory", "season", "ai-analysis", "resources", "plant-health"]

  return candidates.filter((t) => availableTabs.includes(t)).slice(0, 6)
}

// Whether a tab should be visually de-emphasised given current season
export function isTabOffSeason(tabId: string): boolean {
  if (!SEASONAL_TABS.has(tabId)) return false
  const phase = getCurrentEstatePhase()
  const isHarvest = [...HARVEST_SEASONS, ...POST_HARVEST_SEASONS].includes(phase.season)
  if (tabId === "processing" || tabId === "dispatch" || tabId === "sales") return !isHarvest
  if (tabId === "pepper") return !PEPPER_SEASONS.includes(phase.season)
  if (tabId === "curing") return !isHarvest
  if (tabId === "quality") return !isHarvest
  if (tabId === "picking") return !isHarvest
  return false
}

export type SeasonBadge = {
  label: string
  color: "amber" | "green" | "blue" | "pink" | "emerald"
  urgency: "high" | "medium" | "low"
}

export function getSeasonBadge(): SeasonBadge {
  const phase = getCurrentEstatePhase()
  const map: Record<EstateSeason, SeasonBadge> = {
    "harvest-peak":        { label: "Harvest season", color: "amber", urgency: "high" },
    "pre-harvest":         { label: "Harvest prep", color: "amber", urgency: "medium" },
    "post-harvest-pruning":{ label: "Pruning season", color: "green", urgency: "medium" },
    "blossom":             { label: "Blossom season", color: "pink", urgency: "high" },
    "berry-formation":     { label: "Berry season", color: "emerald", urgency: "low" },
    "monsoon":             { label: "Monsoon", color: "blue", urgency: "low" },
  }
  return map[phase.season]
}

export function getSeasonContextLine(): string {
  const phase = getCurrentEstatePhase()
  const lines: Record<EstateSeason, string> = {
    "harvest-peak":        "Peak harvest. Log picking and pulping daily — accuracy matters most now.",
    "pre-harvest":         "Harvest starting soon. Check pulping equipment and roster picking crews.",
    "post-harvest-pruning":"Pruning crews active. Log labour carefully — this is your biggest cost month.",
    "blossom":             "Blossom season. Record the shower date — it sets your harvest window.",
    "berry-formation":     "Log fertiliser applications and borer checks. Monsoon prep starts soon.",
    "monsoon":             "Maintenance season. Focus on drainage, weeding, and second fertiliser dose.",
  }
  return lines[phase.season]
}

// Which bottom nav tabs to show on mobile (max 4 + More)
export function getMobileBottomNavTabs(availableTabs: string[]): string[] {
  const phase = getCurrentEstatePhase()
  const isHarvest = [...HARVEST_SEASONS, ...POST_HARVEST_SEASONS].includes(phase.season)

  // Always show accounts (labour+expenses) and rainfall
  // In harvest: swap one slot for processing
  if (isHarvest) {
    return ["home", "processing", "accounts", "rainfall"].filter((t) => availableTabs.includes(t))
  }
  return ["home", "accounts", "rainfall", "inventory"].filter((t) => availableTabs.includes(t))
}

// Peak logging hours from HoneyFarm data: Mon 11am-12pm, Fri 5pm, Sat 10am
// Used to show contextual prompts ("Ready to log this week's work?")
export function isBatchLoggingWindow(): boolean {
  const now = new Date()
  const dow = now.getDay() // 0=Sun 1=Mon...6=Sat
  const hour = now.getHours()
  if (dow === 6 && hour >= 9 && hour <= 11) return true   // Sat 9-11am
  if (dow === 1 && hour >= 10 && hour <= 13) return true  // Mon 10am-1pm
  if (dow === 5 && hour >= 16 && hour <= 18) return true  // Fri 4-6pm
  return false
}
