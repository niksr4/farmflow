import { useEffect, useRef, useState } from "react"
import posthog from "posthog-js"
import type { IntelligenceBrief } from "@/components/inventory-system/types"
import { parseJsonResponse } from "@/components/inventory-system/utils"

type ProactiveInsight = { text: string; severity: "good" | "warning" | "info" }
type RecentActivityEntry = { module: string; label: string; detail: string; date: string }

export type UseHomeInsightsInput = {
  tenantId: string | null | undefined
  canShowIntelligence: boolean
  canShowAiAnalysis: boolean
  shouldLoadHomeMetrics: boolean
  currentFiscalYear: { startDate: string; endDate: string }
  effectiveRole: string | null | undefined
}

/**
 * Owns the Home-tab "insights" data: the cross-module intelligence brief, activity streak,
 * proactive AI insights, season-over-season comparison, and the recent-activity feed. Each is
 * fetched once per tenant per session (guarded by a loaded-ref) when Home metrics should load.
 * Extracted out of the dashboard shell so the shell stays lean; behaviour is unchanged.
 */
export function useHomeInsights(input: UseHomeInsightsInput) {
  const { tenantId, canShowIntelligence, canShowAiAnalysis, shouldLoadHomeMetrics, currentFiscalYear, effectiveRole } =
    input

  const [intelligenceBrief, setIntelligenceBrief] = useState<IntelligenceBrief | null>(null)
  const [intelligenceLoading, setIntelligenceLoading] = useState(false)
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null)
  const [proactiveInsights, setProactiveInsights] = useState<ProactiveInsight[] | null>(null)
  const [proactiveInsightsLoading, setProactiveInsightsLoading] = useState(false)
  const [proactiveInsightsError, setProactiveInsightsError] = useState<string | null>(null)
  const [seasonCompareNarrative, setSeasonCompareNarrative] = useState<string | null>(null)
  const [seasonCompareLoading, setSeasonCompareLoading] = useState(false)
  const [seasonCompareError, setSeasonCompareError] = useState<string | null>(null)
  const [seasonCompareFYLabels, setSeasonCompareFYLabels] = useState<{ curr: string; prev: string } | null>(null)
  const [recentActivity, setRecentActivity] = useState<RecentActivityEntry[] | null>(null)
  const [recentActivityLoading, setRecentActivityLoading] = useState(false)
  const [activityStreak, setActivityStreak] = useState<number>(0)

  const hasTrackedInsightViewRef = useRef(false)
  const intelligenceBriefLoadedRef = useRef<string | null | undefined>(null)
  const activityStreakLoadedRef = useRef<string | null | undefined>(null)
  const proactiveInsightsLoadedRef = useRef<string | null | undefined>(null)
  const seasonCompareLoadedRef = useRef<string | null | undefined>(null)
  const recentActivityLoadedRef = useRef<string | null | undefined>(null)

  // Reset the one-time insight-view tracking flag when the tenant/role changes.
  useEffect(() => {
    hasTrackedInsightViewRef.current = false
  }, [effectiveRole, tenantId])

  useEffect(() => {
    if (!tenantId || !canShowIntelligence) {
      setIntelligenceBrief(null)
      setIntelligenceError(null)
      return
    }
    if (!shouldLoadHomeMetrics) return
    if (intelligenceBriefLoadedRef.current === tenantId) return
    const controller = new AbortController()

    const loadIntelligenceBrief = async () => {
      setIntelligenceLoading(true)
      setIntelligenceError(null)
      try {
        const params = new URLSearchParams({
          startDate: currentFiscalYear.startDate,
          endDate: currentFiscalYear.endDate,
        })
        const response = await fetch(`/api/intelligence-brief?${params.toString()}`, { cache: "no-store", signal: controller.signal })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !data?.success) {
          throw new Error(data?.error || "Failed to load intelligence brief")
        }
        if (!controller.signal.aborted) {
          const brief = data as IntelligenceBrief
          setIntelligenceBrief(brief)
          const highlightCount = Array.isArray(brief.highlights) ? brief.highlights.length : 0
          const actionCount = Array.isArray(brief.actions) ? brief.actions.length : 0
          const hasInsight = highlightCount > 0 || actionCount > 0 || Boolean(brief.reconciliation)
          if (!hasTrackedInsightViewRef.current && hasInsight) {
            posthog.capture("funnel_first_dashboard_insight_viewed", {
              source: "intelligence-brief",
              highlight_count: highlightCount,
              action_count: actionCount,
              has_reconciliation: Boolean(brief.reconciliation),
              fiscal_year_start: currentFiscalYear.startDate,
              fiscal_year_end: currentFiscalYear.endDate,
              tenant_id: tenantId || "global",
              role: effectiveRole || "unknown",
            })
            hasTrackedInsightViewRef.current = true
          }
        }
      } catch (error: any) {
        if (!controller.signal.aborted) {
          setIntelligenceBrief(null)
          setIntelligenceError(error?.message || "Failed to load intelligence brief")
        }
      } finally {
        if (!controller.signal.aborted) {
          setIntelligenceLoading(false)
          intelligenceBriefLoadedRef.current = tenantId
        }
      }
    }

    loadIntelligenceBrief()
    return () => controller.abort()
  }, [canShowIntelligence, currentFiscalYear.endDate, currentFiscalYear.startDate, effectiveRole, shouldLoadHomeMetrics, tenantId])

  useEffect(() => {
    if (!tenantId || !shouldLoadHomeMetrics) return
    if (activityStreakLoadedRef.current === tenantId) return
    activityStreakLoadedRef.current = tenantId
    const controller = new AbortController()
    fetch("/api/activity-streak", { cache: "no-store", signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (controller.signal.aborted) return
        if (d.success && d.streak > 0) setActivityStreak(d.streak)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [shouldLoadHomeMetrics, tenantId])

  useEffect(() => {
    if (!canShowAiAnalysis || !shouldLoadHomeMetrics) return
    if (proactiveInsightsLoadedRef.current === tenantId) return
    const controller = new AbortController()
    const loadProactiveInsights = async () => {
      setProactiveInsightsLoading(true)
      setProactiveInsightsError(null)
      try {
        const response = await fetch("/api/ai-proactive-insights", { cache: "no-store", signal: controller.signal })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !data?.success) throw new Error(data?.error || "Failed to load insights")
        if (!controller.signal.aborted) setProactiveInsights(Array.isArray(data.insights) ? data.insights : [])
      } catch (error: any) {
        if (!controller.signal.aborted) setProactiveInsightsError(error?.message || "Failed to load insights")
      } finally {
        if (!controller.signal.aborted) {
          setProactiveInsightsLoading(false)
          proactiveInsightsLoadedRef.current = tenantId
        }
      }
    }
    loadProactiveInsights()
    return () => controller.abort()
  }, [canShowAiAnalysis, shouldLoadHomeMetrics, tenantId])

  useEffect(() => {
    if (!canShowAiAnalysis || !shouldLoadHomeMetrics) return
    if (seasonCompareLoadedRef.current === tenantId) return
    const controller = new AbortController()
    const loadSeasonCompare = async () => {
      setSeasonCompareLoading(true)
      setSeasonCompareError(null)
      try {
        const response = await fetch("/api/ai-season-compare", { cache: "no-store", signal: controller.signal })
        const { json, text } = await parseJsonResponse(response)
        if (!response.ok || !json?.success) {
          throw new Error(json?.error || json?.message || text || "Season comparison is temporarily unavailable.")
        }
        if (!controller.signal.aborted) {
          setSeasonCompareNarrative(json.narrative || null)
          setSeasonCompareFYLabels(json.currentFY && json.prevFY ? { curr: json.currentFY, prev: json.prevFY } : null)
        }
      } catch (error: any) {
        if (!controller.signal.aborted) {
          setSeasonCompareNarrative(null)
          setSeasonCompareFYLabels(null)
          setSeasonCompareError(error?.message || "Season comparison is temporarily unavailable.")
        }
      } finally {
        if (!controller.signal.aborted) {
          setSeasonCompareLoading(false)
          seasonCompareLoadedRef.current = tenantId
        }
      }
    }
    loadSeasonCompare()
    return () => controller.abort()
  }, [canShowAiAnalysis, shouldLoadHomeMetrics, tenantId])

  useEffect(() => {
    if (!shouldLoadHomeMetrics) return
    if (recentActivityLoadedRef.current === tenantId) return
    const controller = new AbortController()
    const load = async () => {
      setRecentActivityLoading(true)
      try {
        const res = await fetch("/api/recent-activity", { cache: "no-store", signal: controller.signal })
        const data = await res.json().catch(() => ({}))
        if (!controller.signal.aborted && data?.success && Array.isArray(data.entries)) {
          setRecentActivity(data.entries)
        }
      } catch {
        // silent — feed just stays hidden
      } finally {
        if (!controller.signal.aborted) {
          setRecentActivityLoading(false)
          recentActivityLoadedRef.current = tenantId
        }
      }
    }
    load()
    return () => controller.abort()
  }, [shouldLoadHomeMetrics, tenantId])

  return {
    intelligenceBrief,
    intelligenceLoading,
    intelligenceError,
    proactiveInsights,
    proactiveInsightsLoading,
    proactiveInsightsError,
    seasonCompareNarrative,
    seasonCompareLoading,
    seasonCompareError,
    seasonCompareFYLabels,
    recentActivity,
    recentActivityLoading,
    activityStreak,
  }
}
