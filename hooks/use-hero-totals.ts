"use client"

import { useEffect, useRef, useState } from "react"
import type { ExceptionSummaryAlert } from "@/components/inventory-system/types"

type FiscalYear = { startDate: string; endDate: string }

type Params = {
  tenantId: string | null
  shouldLoadHomeMetrics: boolean
  shouldLoadExceptionSummary: boolean
  isPreviewMode: boolean
  previewTenantId: string | null
  currentFiscalYear: FiscalYear
  canShowProcessing: boolean
  canShowDispatch: boolean
  canShowSales: boolean
  canShowOtherSales: boolean
  canShowReceivables: boolean
  canShowCuring: boolean
  canShowQuality: boolean
  canShowPepper: boolean
  canShowRubber: boolean
  canShowRainfall: boolean
  canShowSeason: boolean
}

export type HeroTotals = {
  processingTotals: { arabicaKg: number; arabicaBags: number; robustaKg: number; robustaBags: number; loading: boolean; error: string | null }
  dispatchHeroTotals: { arabicaBags: number; arabicaKgs: number; robustaBags: number; robustaKgs: number; totalDispatches: number; loading: boolean; error: string | null }
  salesHeroTotals: { arabicaBags: number; arabicaKgs: number; robustaBags: number; robustaKgs: number; totalSales: number; totalRevenue: number; loading: boolean; error: string | null }
  otherSalesHeroTotals: { totalRevenue: number; totalCount: number; loading: boolean; error: string | null }
  curingHeroTotals: { totalRecords: number; totalOutputKg: number; avgDryingDays: number; avgMoistureDrop: number; loading: boolean; error: string | null }
  qualityHeroTotals: { totalRecords: number; avgCupScore: number; avgOutturnPct: number; avgDefects: number; loading: boolean; error: string | null }
  pepperHeroTotals: { totalRecords: number; totalPickedKg: number; totalDryKg: number; avgDryPercent: number; loading: boolean; error: string | null }
  rubberHeroTotals: { totalRecords: number; totalLatexKg: number; totalSheetsKg: number; avgDrcPct: number; loading: boolean; error: string | null }
  rainfallHeroTotals: { totalRecords: number; totalInches: number; latestDate: string | null; loading: boolean; error: string | null }
  receivablesHeroTotals: { totalInvoiced: number; totalOutstanding: number; totalOverdue: number; totalPaid: number; totalCount: number; loading: boolean; error: string | null }
  exceptionsSummary: { count: number; highlights: string[]; alerts: ExceptionSummaryAlert[] }
  exceptionsLoading: boolean
  exceptionsError: string | null
}

export function useHeroTotals({
  tenantId,
  shouldLoadHomeMetrics,
  shouldLoadExceptionSummary,
  isPreviewMode,
  previewTenantId,
  currentFiscalYear,
  canShowProcessing,
  canShowDispatch,
  canShowSales,
  canShowOtherSales,
  canShowReceivables,
  canShowCuring,
  canShowQuality,
  canShowPepper,
  canShowRubber,
  canShowRainfall,
  canShowSeason,
}: Params): HeroTotals {
  const [processingTotals, setProcessingTotals] = useState({ arabicaKg: 0, arabicaBags: 0, robustaKg: 0, robustaBags: 0, loading: false, error: null as string | null })
  const [dispatchHeroTotals, setDispatchHeroTotals] = useState({ arabicaBags: 0, arabicaKgs: 0, robustaBags: 0, robustaKgs: 0, totalDispatches: 0, loading: false, error: null as string | null })
  const [salesHeroTotals, setSalesHeroTotals] = useState({ arabicaBags: 0, arabicaKgs: 0, robustaBags: 0, robustaKgs: 0, totalSales: 0, totalRevenue: 0, loading: false, error: null as string | null })
  const [otherSalesHeroTotals, setOtherSalesHeroTotals] = useState({ totalRevenue: 0, totalCount: 0, loading: false, error: null as string | null })
  const [curingHeroTotals, setCuringHeroTotals] = useState({ totalRecords: 0, totalOutputKg: 0, avgDryingDays: 0, avgMoistureDrop: 0, loading: false, error: null as string | null })
  const [qualityHeroTotals, setQualityHeroTotals] = useState({ totalRecords: 0, avgCupScore: 0, avgOutturnPct: 0, avgDefects: 0, loading: false, error: null as string | null })
  const [pepperHeroTotals, setPepperHeroTotals] = useState({ totalRecords: 0, totalPickedKg: 0, totalDryKg: 0, avgDryPercent: 0, loading: false, error: null as string | null })
  const [rubberHeroTotals, setRubberHeroTotals] = useState({ totalRecords: 0, totalLatexKg: 0, totalSheetsKg: 0, avgDrcPct: 0, loading: false, error: null as string | null })
  const [rainfallHeroTotals, setRainfallHeroTotals] = useState({ totalRecords: 0, totalInches: 0, latestDate: null as string | null, loading: false, error: null as string | null })
  const [receivablesHeroTotals, setReceivablesHeroTotals] = useState({ totalInvoiced: 0, totalOutstanding: 0, totalOverdue: 0, totalPaid: 0, totalCount: 0, loading: false, error: null as string | null })
  const [exceptionsSummary, setExceptionsSummary] = useState<{ count: number; highlights: string[]; alerts: ExceptionSummaryAlert[] }>({ count: 0, highlights: [], alerts: [] })
  const [exceptionsLoading, setExceptionsLoading] = useState(false)
  const [exceptionsError, setExceptionsError] = useState<string | null>(null)

  // Each ref remembers the tenant it last loaded successfully for, so revisiting the
  // Home tab within the same session doesn't re-fire all ~10 hero fetches every time.
  const processingLoadedRef = useRef<string | null>(null)
  const dispatchLoadedRef = useRef<string | null>(null)
  const salesLoadedRef = useRef<string | null>(null)
  const otherSalesLoadedRef = useRef<string | null>(null)
  const receivablesLoadedRef = useRef<string | null>(null)
  const curingLoadedRef = useRef<string | null>(null)
  const qualityLoadedRef = useRef<string | null>(null)
  const pepperLoadedRef = useRef<string | null>(null)
  const rubberLoadedRef = useRef<string | null>(null)
  const rainfallLoadedRef = useRef<string | null>(null)
  const exceptionsLoadedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!tenantId || !canShowProcessing) return
    if (!shouldLoadHomeMetrics) return
    if (processingLoadedRef.current === tenantId) return
    let ignore = false
    const load = async () => {
      setProcessingTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const res = await fetch("/api/processing-records?summary=dashboard")
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to load processing totals")
        const records = Array.isArray(json.records) ? json.records : []
        const totals = records.reduce(
          (acc: { arabicaKg: number; arabicaBags: number; robustaKg: number; robustaBags: number }, record: any) => {
            const type = String(record?.coffee_type || "").toLowerCase()
            const kg = (Number(record?.dry_parch_total) || 0) + (Number(record?.dry_cherry_total) || 0)
            const bags = (Number(record?.dry_p_bags_total) || 0) + (Number(record?.dry_cherry_bags_total) || 0)
            if (type.includes("arab")) { acc.arabicaKg += kg; acc.arabicaBags += bags }
            else if (type.includes("rob")) { acc.robustaKg += kg; acc.robustaBags += bags }
            return acc
          },
          { arabicaKg: 0, arabicaBags: 0, robustaKg: 0, robustaBags: 0 },
        )
        if (!ignore) { setProcessingTotals({ ...totals, loading: false, error: null }); processingLoadedRef.current = tenantId }
      } catch (error: any) {
        if (!ignore) setProcessingTotals((prev) => ({ ...prev, loading: false, error: error?.message || "Failed to load processing totals" }))
      }
    }
    load()
    return () => { ignore = true }
  }, [tenantId, canShowProcessing, shouldLoadHomeMetrics])

  useEffect(() => {
    if (!tenantId || !canShowDispatch) return
    if (!shouldLoadHomeMetrics) return
    if (dispatchLoadedRef.current === tenantId) return
    let ignore = false
    const load = async () => {
      setDispatchHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const res = await fetch("/api/dispatch?summaryOnly=true")
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to load dispatch totals")
        const totalsByType = Array.isArray(json?.totalsByType) ? json.totalsByType : []
        const totals = totalsByType.reduce(
          (acc: { arabicaBags: number; arabicaKgs: number; robustaBags: number; robustaKgs: number }, row: any) => {
            const type = String(row?.coffee_type || "").toLowerCase()
            const bags = Number(row?.bags_dispatched) || 0
            const kgs = Number(row?.kgs_received) || 0
            if (type.includes("arab")) { acc.arabicaBags += bags; acc.arabicaKgs += kgs }
            else if (type.includes("rob")) { acc.robustaBags += bags; acc.robustaKgs += kgs }
            return acc
          },
          { arabicaBags: 0, arabicaKgs: 0, robustaBags: 0, robustaKgs: 0 },
        )
        if (!ignore) { setDispatchHeroTotals({ ...totals, totalDispatches: Number(json?.totalCount) || 0, loading: false, error: null }); dispatchLoadedRef.current = tenantId }
      } catch (error: any) {
        if (!ignore) setDispatchHeroTotals((prev) => ({ ...prev, loading: false, error: error?.message || "Failed to load dispatch totals" }))
      }
    }
    load()
    return () => { ignore = true }
  }, [tenantId, canShowDispatch, shouldLoadHomeMetrics])

  useEffect(() => {
    if (!tenantId || !canShowSales) return
    if (!shouldLoadHomeMetrics) return
    if (salesLoadedRef.current === tenantId) return
    let ignore = false
    const load = async () => {
      setSalesHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const res = await fetch("/api/sales?summaryOnly=true")
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to load sales totals")
        const totalsByType = Array.isArray(json?.totalsByType) ? json.totalsByType : []
        const totals = totalsByType.reduce(
          (acc: { arabicaBags: number; arabicaKgs: number; robustaBags: number; robustaKgs: number }, row: any) => {
            const type = String(row?.coffee_type || "").toLowerCase()
            const bags = Number(row?.bags_sold) || 0
            const kgs = Number(row?.kgs_sold) || 0
            if (type.includes("arab")) { acc.arabicaBags += bags; acc.arabicaKgs += kgs }
            else if (type.includes("rob")) { acc.robustaBags += bags; acc.robustaKgs += kgs }
            return acc
          },
          { arabicaBags: 0, arabicaKgs: 0, robustaBags: 0, robustaKgs: 0 },
        )
        if (!ignore) { setSalesHeroTotals({ ...totals, totalSales: Number(json?.totalCount) || 0, totalRevenue: Number(json?.totalRevenue) || 0, loading: false, error: null }); salesLoadedRef.current = tenantId }
      } catch (error: any) {
        if (!ignore) setSalesHeroTotals((prev) => ({ ...prev, loading: false, error: error?.message || "Failed to load sales totals" }))
      }
    }
    load()
    return () => { ignore = true }
  }, [tenantId, canShowSales, shouldLoadHomeMetrics])

  useEffect(() => {
    if (!tenantId || !canShowOtherSales) {
      setOtherSalesHeroTotals({ totalRevenue: 0, totalCount: 0, loading: false, error: null })
      return
    }
    if (!shouldLoadHomeMetrics) return
    if (otherSalesLoadedRef.current === tenantId) return
    let ignore = false
    const load = async () => {
      setOtherSalesHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const res = await fetch("/api/other-sales?all=true", { cache: "no-store" })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to load other sales totals")
        if (!ignore) { setOtherSalesHeroTotals({ totalRevenue: Number(json?.totals?.totalRevenue) || 0, totalCount: Number(json?.totalCount) || 0, loading: false, error: null }); otherSalesLoadedRef.current = tenantId }
      } catch (error: any) {
        if (!ignore) setOtherSalesHeroTotals((prev) => ({ ...prev, loading: false, error: error?.message || "Failed to load other sales totals" }))
      }
    }
    load()
    return () => { ignore = true }
  }, [tenantId, canShowOtherSales, shouldLoadHomeMetrics])

  useEffect(() => {
    if (!tenantId || !canShowReceivables) return
    if (!shouldLoadHomeMetrics) return
    if (receivablesLoadedRef.current === tenantId) return
    let ignore = false
    const load = async () => {
      setReceivablesHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const params = new URLSearchParams()
        if (isPreviewMode && previewTenantId) params.set("tenantId", previewTenantId)
        const endpoint = params.toString() ? `/api/receivables?${params.toString()}` : "/api/receivables"
        const res = await fetch(endpoint, { cache: "no-store" })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to load receivables totals")
        const payload = json?.summary || {}
        if (!ignore) {
          setReceivablesHeroTotals({
            totalInvoiced: Number(payload.totalInvoiced) || 0,
            totalOutstanding: Number(payload.totalOutstanding) || 0,
            totalOverdue: Number(payload.totalOverdue) || 0,
            totalPaid: Number(payload.totalPaid) || 0,
            totalCount: Number(payload.totalCount) || 0,
            loading: false, error: null,
          })
          receivablesLoadedRef.current = tenantId
        }
      } catch (error: any) {
        if (!ignore) setReceivablesHeroTotals((prev) => ({ ...prev, loading: false, error: error?.message || "Failed to load receivables totals" }))
      }
    }
    load()
    return () => { ignore = true }
  }, [canShowReceivables, isPreviewMode, previewTenantId, shouldLoadHomeMetrics, tenantId])

  useEffect(() => {
    if (!tenantId || !canShowCuring) return
    if (!shouldLoadHomeMetrics) return
    if (curingLoadedRef.current === tenantId) return
    let ignore = false
    const load = async () => {
      setCuringHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const params = new URLSearchParams({ fiscalYearStart: currentFiscalYear.startDate, fiscalYearEnd: currentFiscalYear.endDate, all: "true" })
        const res = await fetch(`/api/curing-records?${params.toString()}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to load curing totals")
        const records = Array.isArray(json.records) ? json.records : []
        const totals = records.reduce(
          (acc: { outputKg: number; dryingDaysTotal: number; dryingDaysCount: number; moistureDropTotal: number; moistureDropCount: number }, record: any) => {
            const outputKg = Number(record?.output_kg)
            if (Number.isFinite(outputKg)) acc.outputKg += outputKg
            const dryingDays = Number(record?.drying_days)
            if (Number.isFinite(dryingDays)) { acc.dryingDaysTotal += dryingDays; acc.dryingDaysCount += 1 }
            const moistureStart = Number(record?.moisture_start_pct)
            const moistureEnd = Number(record?.moisture_end_pct)
            if (Number.isFinite(moistureStart) && Number.isFinite(moistureEnd)) { acc.moistureDropTotal += moistureStart - moistureEnd; acc.moistureDropCount += 1 }
            return acc
          },
          { outputKg: 0, dryingDaysTotal: 0, dryingDaysCount: 0, moistureDropTotal: 0, moistureDropCount: 0 },
        )
        if (!ignore) {
          setCuringHeroTotals({
            totalRecords: records.length,
            totalOutputKg: totals.outputKg,
            avgDryingDays: totals.dryingDaysCount ? totals.dryingDaysTotal / totals.dryingDaysCount : 0,
            avgMoistureDrop: totals.moistureDropCount ? totals.moistureDropTotal / totals.moistureDropCount : 0,
            loading: false, error: null,
          })
          curingLoadedRef.current = tenantId
        }
      } catch (error: any) {
        if (!ignore) setCuringHeroTotals((prev) => ({ ...prev, loading: false, error: error?.message || "Failed to load curing totals" }))
      }
    }
    load()
    return () => { ignore = true }
  }, [tenantId, canShowCuring, currentFiscalYear.endDate, currentFiscalYear.startDate, shouldLoadHomeMetrics])

  useEffect(() => {
    if (!tenantId || !canShowQuality) return
    if (!shouldLoadHomeMetrics) return
    if (qualityLoadedRef.current === tenantId) return
    let ignore = false
    const load = async () => {
      setQualityHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const params = new URLSearchParams({ fiscalYearStart: currentFiscalYear.startDate, fiscalYearEnd: currentFiscalYear.endDate, all: "true" })
        const res = await fetch(`/api/quality-grading-records?${params.toString()}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to load quality totals")
        const records = Array.isArray(json.records) ? json.records : []
        const totals = records.reduce(
          (acc: { cupScoreTotal: number; cupScoreCount: number; outturnTotal: number; outturnCount: number; defectsTotal: number; defectsCount: number }, record: any) => {
            const cupScore = Number(record?.cup_score)
            if (Number.isFinite(cupScore)) { acc.cupScoreTotal += cupScore; acc.cupScoreCount += 1 }
            const outturnPct = Number(record?.outturn_pct)
            if (Number.isFinite(outturnPct)) { acc.outturnTotal += outturnPct; acc.outturnCount += 1 }
            const defectsCount = Number(record?.defects_count)
            if (Number.isFinite(defectsCount)) { acc.defectsTotal += defectsCount; acc.defectsCount += 1 }
            return acc
          },
          { cupScoreTotal: 0, cupScoreCount: 0, outturnTotal: 0, outturnCount: 0, defectsTotal: 0, defectsCount: 0 },
        )
        if (!ignore) {
          setQualityHeroTotals({
            totalRecords: records.length,
            avgCupScore: totals.cupScoreCount ? totals.cupScoreTotal / totals.cupScoreCount : 0,
            avgOutturnPct: totals.outturnCount ? totals.outturnTotal / totals.outturnCount : 0,
            avgDefects: totals.defectsCount ? totals.defectsTotal / totals.defectsCount : 0,
            loading: false, error: null,
          })
          qualityLoadedRef.current = tenantId
        }
      } catch (error: any) {
        if (!ignore) setQualityHeroTotals((prev) => ({ ...prev, loading: false, error: error?.message || "Failed to load quality totals" }))
      }
    }
    load()
    return () => { ignore = true }
  }, [tenantId, canShowQuality, currentFiscalYear.endDate, currentFiscalYear.startDate, shouldLoadHomeMetrics])

  useEffect(() => {
    if (!tenantId || !canShowPepper) return
    if (!shouldLoadHomeMetrics) return
    if (pepperLoadedRef.current === tenantId) return
    let ignore = false
    const load = async () => {
      setPepperHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const params = new URLSearchParams({ fiscalYearStart: currentFiscalYear.startDate, fiscalYearEnd: currentFiscalYear.endDate })
        const res = await fetch(`/api/pepper-records?${params.toString()}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to load pepper totals")
        const records = Array.isArray(json.records) ? json.records : []
        const totals = records.reduce(
          (acc: { picked: number; dry: number; dryPctTotal: number; dryPctCount: number }, record: any) => {
            const pickedKg = Number(record?.kg_picked)
            if (Number.isFinite(pickedKg)) acc.picked += pickedKg
            const dryKg = Number(record?.dry_pepper)
            if (Number.isFinite(dryKg)) acc.dry += dryKg
            const dryPct = Number(record?.dry_pepper_percent)
            if (Number.isFinite(dryPct)) { acc.dryPctTotal += dryPct; acc.dryPctCount += 1 }
            return acc
          },
          { picked: 0, dry: 0, dryPctTotal: 0, dryPctCount: 0 },
        )
        if (!ignore) {
          setPepperHeroTotals({
            totalRecords: records.length, totalPickedKg: totals.picked, totalDryKg: totals.dry,
            avgDryPercent: totals.dryPctCount ? totals.dryPctTotal / totals.dryPctCount : 0,
            loading: false, error: null,
          })
          pepperLoadedRef.current = tenantId
        }
      } catch (error: any) {
        if (!ignore) setPepperHeroTotals((prev) => ({ ...prev, loading: false, error: error?.message || "Failed to load pepper totals" }))
      }
    }
    load()
    return () => { ignore = true }
  }, [tenantId, canShowPepper, currentFiscalYear.endDate, currentFiscalYear.startDate, shouldLoadHomeMetrics])

  useEffect(() => {
    if (!tenantId || !canShowRubber) return
    if (!shouldLoadHomeMetrics) return
    if (rubberLoadedRef.current === tenantId) return
    let ignore = false
    const load = async () => {
      setRubberHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const params = new URLSearchParams({ fiscalYearStart: currentFiscalYear.startDate, fiscalYearEnd: currentFiscalYear.endDate })
        const res = await fetch(`/api/rubber-records?${params.toString()}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to load rubber totals")
        const records = Array.isArray(json.records) ? json.records : []
        const totals = records.reduce(
          (acc: { latex: number; sheets: number; drcTotal: number; drcCount: number }, record: any) => {
            const latexKg = Number(record?.latex_kg)
            if (Number.isFinite(latexKg)) acc.latex += latexKg
            const sheetsKg = Number(record?.sheets_kg)
            if (Number.isFinite(sheetsKg)) acc.sheets += sheetsKg
            const drcPct = Number(record?.drc_pct)
            if (Number.isFinite(drcPct) && drcPct > 0) { acc.drcTotal += drcPct; acc.drcCount += 1 }
            return acc
          },
          { latex: 0, sheets: 0, drcTotal: 0, drcCount: 0 },
        )
        if (!ignore) {
          setRubberHeroTotals({
            totalRecords: records.length, totalLatexKg: totals.latex, totalSheetsKg: totals.sheets,
            avgDrcPct: totals.drcCount ? totals.drcTotal / totals.drcCount : 0,
            loading: false, error: null,
          })
          rubberLoadedRef.current = tenantId
        }
      } catch (error: any) {
        if (!ignore) setRubberHeroTotals((prev) => ({ ...prev, loading: false, error: error?.message || "Failed to load rubber totals" }))
      }
    }
    load()
    return () => { ignore = true }
  }, [tenantId, canShowRubber, currentFiscalYear.endDate, currentFiscalYear.startDate, shouldLoadHomeMetrics])

  useEffect(() => {
    if (!tenantId || !canShowRainfall) return
    if (!shouldLoadHomeMetrics) return
    if (rainfallLoadedRef.current === tenantId) return
    let ignore = false
    const load = async () => {
      setRainfallHeroTotals((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const res = await fetch("/api/rainfall")
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to load rainfall totals")
        const records = Array.isArray(json.records) ? json.records : []
        const fyStart = currentFiscalYear.startDate
        const fyEnd = currentFiscalYear.endDate
        let totalInches = 0, totalRecords = 0
        let latestDate: string | null = null
        for (const record of records) {
          const recordDateStr = String(record?.record_date || "").slice(0, 10)
          if (!recordDateStr || recordDateStr < fyStart || recordDateStr > fyEnd) continue
          totalInches += (Number(record?.inches) || 0) + (Number(record?.cents) || 0) / 100
          totalRecords += 1
          if (!latestDate || recordDateStr > String(latestDate).slice(0, 10)) latestDate = String(record?.record_date || "")
        }
        if (!ignore) { setRainfallHeroTotals({ totalRecords, totalInches, latestDate, loading: false, error: null }); rainfallLoadedRef.current = tenantId }
      } catch (error: any) {
        if (!ignore) setRainfallHeroTotals((prev) => ({ ...prev, loading: false, error: error?.message || "Failed to load rainfall totals" }))
      }
    }
    load()
    return () => { ignore = true }
  }, [tenantId, canShowRainfall, currentFiscalYear.endDate, currentFiscalYear.startDate, shouldLoadHomeMetrics])

  useEffect(() => {
    if (!canShowSeason || !shouldLoadExceptionSummary) return
    if (exceptionsLoadedRef.current === tenantId) return
    let isActive = true
    const load = async () => {
      setExceptionsLoading(true)
      setExceptionsError(null)
      try {
        const response = await fetch("/api/exception-alerts")
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.error || "Failed to load exceptions")
        const alerts = Array.isArray(data.alerts) ? data.alerts : []
        const severityRank: Record<string, number> = { high: 3, medium: 2, low: 1 }
        const sortedAlerts = [...alerts].sort((a: any, b: any) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0))
        const topAlerts = sortedAlerts.slice(0, 3)
        const highlights = topAlerts.map((alert: any) => {
          const context = [alert.location, alert.coffeeType].filter(Boolean).join(" • ")
          return context ? `${context}: ${alert.title}` : alert.title
        })
        if (!isActive) return
        setExceptionsSummary({
          count: alerts.length,
          highlights,
          alerts: topAlerts.map((alert: any) => ({
            id: String(alert.id || `${alert.metric || "alert"}-${alert.title || "item"}`),
            title: String(alert.title || "Alert"),
            severity: (String(alert.severity || "medium") as ExceptionSummaryAlert["severity"]) || "medium",
            location: alert.location ? String(alert.location) : undefined,
            coffeeType: alert.coffeeType ? String(alert.coffeeType) : undefined,
            metric: alert.metric ? String(alert.metric) : undefined,
          })),
        })
      } catch (error: any) {
        if (!isActive) return
        setExceptionsSummary({ count: 0, highlights: [], alerts: [] })
        setExceptionsError(error.message || "Failed to load exceptions")
      } finally {
        if (isActive) {
          setExceptionsLoading(false)
          exceptionsLoadedRef.current = tenantId
        }
      }
    }
    load()
    return () => { isActive = false }
  }, [canShowSeason, shouldLoadExceptionSummary, tenantId])

  return {
    processingTotals, dispatchHeroTotals, salesHeroTotals, otherSalesHeroTotals,
    curingHeroTotals, qualityHeroTotals, pepperHeroTotals, rubberHeroTotals,
    rainfallHeroTotals, receivablesHeroTotals,
    exceptionsSummary, exceptionsLoading, exceptionsError,
  }
}
