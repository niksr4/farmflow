"use client"

import { useEffect, useMemo, useState, type ChangeEvent } from "react"
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { FieldLabel } from "@/components/ui/field-label"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toast } from "@/components/ui/use-toast"
import { CalendarIcon, ChevronLeft, ChevronRight, CloudRain, Download, Trash2 } from "lucide-react"
import { addYears, format, subYears } from "date-fns"
import { useAuth } from "@/hooks/use-auth"
import { formatDateOnly } from "@/lib/date-utils"
import { formatNumber } from "@/lib/format"

type RainfallRecord = {
  id: number
  record_date: string
  inches: number
  cents: number
  notes?: string
  user_id: string
}

type NormalizedRainfallRecord = {
  id: number
  date: Date
  isoDate: string
  rainfallInches: number
  notes?: string
}

type RainfallTrendPoint = {
  isoDate: string
  label: string
  rainInches: number
  rolling7Avg: number
}

type RainfallTabProps = {
  username: string
  showDataToolsControls?: boolean
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const MONTHLY_RAIN_CHART_CONFIG = {
  totalInches: { label: "Monthly rain (in)", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig

const RAINFALL_TREND_CHART_CONFIG = {
  rainInches: { label: "Daily rain (in)", color: "hsl(var(--chart-2))" },
  rolling7Avg: { label: "7-day average (in)", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const parseRecordDate = (value: string): Date | null => {
  const [yearRaw, monthRaw, dayRaw] = String(value).slice(0, 10).split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return null
  return date
}

const toIsoDate = (date: Date) => format(date, "yyyy-MM-dd")

export default function RainfallTab({ username, showDataToolsControls = false }: RainfallTabProps) {
  const { user } = useAuth()
  const canDelete = user?.role === "admin" || user?.role === "owner"
  const [records, setRecords] = useState<RainfallRecord[]>([])
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date())
  const [inches, setInches] = useState("")
  const [cents, setCents] = useState("")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [drilldownMonthIndex, setDrilldownMonthIndex] = useState<number | null>(null)

  const handleWholeNumberChange = (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value
    if (!/^\d*$/.test(nextValue)) return
    setter(nextValue)
  }

  const fetchRecords = async () => {
    try {
      const response = await fetch("/api/rainfall")
      const data = await response.json()
      if (data.success) {
        setRecords(data.records || [])
      }
    } catch (error) {
      console.error("[v0] Error fetching rainfall records:", error)
    }
  }

  useEffect(() => {
    fetchRecords()
  }, [])

  const handleSaveRecord = async () => {
    const inchesNum = inches === "" ? 0 : Number(inches)
    const centsNum = cents === "" ? 0 : Number(cents)

    if (!Number.isFinite(inchesNum) || !Number.isInteger(inchesNum) || inchesNum < 0) {
      toast({
        title: "Invalid data",
        description: "Inches must be a whole number (0 or more)",
        variant: "destructive",
      })
      return
    }

    if (!Number.isFinite(centsNum) || !Number.isInteger(centsNum) || centsNum < 0 || centsNum > 99) {
      toast({
        title: "Invalid data",
        description: "Cents/points must be a whole number between 0 and 99",
        variant: "destructive",
      })
      return
    }

    if (inchesNum === 0 && centsNum === 0) {
      toast({
        title: "Invalid data",
        description: "Please enter at least 1 point (0.01 inch)",
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/rainfall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record_date: format(selectedDate, "yyyy-MM-dd"),
          inches: inchesNum,
          cents: centsNum,
          notes,
          user_id: username,
        }),
      })

      const data = await response.json()
      if (data.success) {
        toast({
          title: "Record saved",
          description: "Rainfall record has been saved successfully",
        })
        setInches("")
        setCents("")
        setNotes("")
        fetchRecords()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to save record",
          variant: "destructive",
        })
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to save rainfall record",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteRecord = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return

    try {
      const response = await fetch(`/api/rainfall?id=${id}`, { method: "DELETE" })
      const data = await response.json()
      if (data.success) {
        toast({ title: "Record deleted", description: "Rainfall record has been deleted" })
        fetchRecords()
      }
    } catch {
      toast({ title: "Error", description: "Failed to delete record", variant: "destructive" })
    }
  }

  const exportToCSV = () => {
    const rainfallValuesByYear = new Map<number, Map<string, { display: string; value: number }>>()
    const currentYear = new Date().getFullYear()
    const yearsWithData = new Set<number>()

    records.forEach((record) => {
      const date = parseRecordDate(record.record_date)
      if (!date) return
      const year = date.getFullYear()
      yearsWithData.add(year)
      const dateKey = format(date, "yyyy-MM-dd")
      const inchesValue = Math.max(0, Math.trunc(Number(record.inches) || 0))
      const centsValue = Math.max(0, Math.min(99, Math.trunc(Number(record.cents) || 0)))
      const parsedValue = round2(inchesValue + centsValue / 100)
      const displayValue = `${inchesValue}.${String(centsValue).padStart(2, "0")}`
      const yearMap = rainfallValuesByYear.get(year) || new Map<string, { display: string; value: number }>()
      if (!yearMap.has(dateKey)) {
        yearMap.set(dateKey, { display: displayValue, value: parsedValue })
      }
      rainfallValuesByYear.set(year, yearMap)
    })

    const years = yearsWithData.size > 0 ? [...yearsWithData].sort((a, b) => a - b) : [currentYear]
    const csvRows: string[] = []
    years.forEach((year, yearIndex) => {
      const yearlyValues = rainfallValuesByYear.get(year) || new Map<string, { display: string; value: number }>()
      const monthlyTotals = Array.from({ length: 12 }, () => 0)
      csvRows.push(`Year,${year}`)
      csvRows.push(["Day", ...MONTHS].join(","))

      for (let day = 1; day <= 31; day++) {
        const row = [String(day)]
        for (let month = 0; month < 12; month++) {
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
          const entry = yearlyValues.get(dateStr)
          row.push(entry?.display || "")
          if (entry) {
            monthlyTotals[month] += entry.value
          }
        }
        csvRows.push(row.join(","))
      }

      csvRows.push(["Monthly Total", ...monthlyTotals.map((total) => total.toFixed(2))].join(","))
      const totalOfTotals = monthlyTotals.reduce((sum, total) => sum + total, 0)
      csvRows.push(["Total of Totals", totalOfTotals.toFixed(2), "", "", "", "", "", "", "", "", "", "", ""].join(","))
      if (yearIndex < years.length - 1) {
        csvRows.push("")
      }
    })

    const csvContent = csvRows.join("\n")
    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const filenameSuffix = years.length === 1 ? String(years[0]) : `${years[0]}-to-${years[years.length - 1]}`
    const a = document.createElement("a")
    a.href = url
    a.download = `rainfall-${filenameSuffix}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)

    toast({
      title: "Export successful",
      description: `Rainfall data exported for ${years.join(", ")}`,
    })
  }

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonthIndex = now.getMonth()

  const normalizedRecords = useMemo<NormalizedRainfallRecord[]>(() => {
    const parsedRecords: NormalizedRainfallRecord[] = []

    records.forEach((record) => {
      const date = parseRecordDate(record.record_date)
      if (!date) return

      parsedRecords.push({
        id: record.id,
        date,
        isoDate: toIsoDate(date),
        rainfallInches: round2((Number(record.inches) || 0) + (Number(record.cents) || 0) / 100),
        notes: record.notes,
      })
    })

    return parsedRecords.sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [records])

  const monthlyTotalsData = useMemo(() => {
    const totals = Array.from({ length: 12 }, () => 0)
    normalizedRecords.forEach((record) => {
      if (record.date.getFullYear() === currentYear) {
        totals[record.date.getMonth()] += record.rainfallInches
      }
    })

    return MONTHS.map((month, index) => ({
      month,
      totalInches: round2(totals[index]),
    }))
  }, [currentYear, normalizedRecords])

  const annualTotal = useMemo(
    () => round2(monthlyTotalsData.reduce((sum, monthData) => sum + monthData.totalInches, 0)),
    [monthlyTotalsData],
  )

  const topMonths = useMemo(
    () =>
      [...monthlyTotalsData]
        .filter((monthData) => monthData.totalInches > 0)
        .sort((a, b) => b.totalInches - a.totalInches)
        .slice(0, 3),
    [monthlyTotalsData],
  )

  const dailyRainMap = useMemo(() => {
    const map = new Map<string, number>()
    normalizedRecords.forEach((record) => {
      map.set(record.isoDate, record.rainfallInches)
    })
    return map
  }, [normalizedRecords])

  // Per-day breakdown for the selected month drilldown
  const drilldownDays = useMemo(() => {
    if (drilldownMonthIndex === null) return []
    const daysInMonth = new Date(currentYear, drilldownMonthIndex + 1, 0).getDate()
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1
      const isoDate = `${currentYear}-${String(drilldownMonthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      const rain = dailyRainMap.get(isoDate) ?? null
      return { day, isoDate, rainfallInches: rain }
    })
  }, [drilldownMonthIndex, currentYear, dailyRainMap])

  const trendSeries = useMemo<RainfallTrendPoint[]>(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const lookbackDays = 56
    const rollingWindow: number[] = []
    const series: RainfallTrendPoint[] = []

    for (let offset = lookbackDays - 1; offset >= 0; offset -= 1) {
      const day = new Date(today)
      day.setDate(today.getDate() - offset)
      const isoDate = toIsoDate(day)
      const rainInches = round2(dailyRainMap.get(isoDate) || 0)

      rollingWindow.push(rainInches)
      if (rollingWindow.length > 7) {
        rollingWindow.shift()
      }

      const rolling7Avg = round2(rollingWindow.reduce((sum, value) => sum + value, 0) / rollingWindow.length)
      series.push({
        isoDate,
        label: format(day, "MMM d"),
        rainInches,
        rolling7Avg,
      })
    }

    return series
  }, [dailyRainMap])

  const insights = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start30 = new Date(today)
    start30.setDate(today.getDate() - 29)
    const start60 = new Date(today)
    start60.setDate(today.getDate() - 59)

    let last30Total = 0
    let prior30Total = 0
    let loggedDaysLast30 = 0
    let wetDaysLast30 = 0

    normalizedRecords.forEach((record) => {
      if (record.date >= start30 && record.date <= today) {
        last30Total += record.rainfallInches
        loggedDaysLast30 += 1
        if (record.rainfallInches >= 0.1) {
          wetDaysLast30 += 1
        }
      } else if (record.date >= start60 && record.date < start30) {
        prior30Total += record.rainfallInches
      }
    })

    last30Total = round2(last30Total)
    prior30Total = round2(prior30Total)

    const trendPct = prior30Total > 0 ? round2(((last30Total - prior30Total) / prior30Total) * 100) : null
    const coveragePct = round2((loggedDaysLast30 / 30) * 100)

    let longestWetStreak = 0
    let longestDryStreak = 0
    let currentWetStreak = 0
    let currentDryStreak = 0

    trendSeries.forEach((point) => {
      if (point.rainInches >= 0.1) {
        currentWetStreak += 1
        longestWetStreak = Math.max(longestWetStreak, currentWetStreak)
        currentDryStreak = 0
      } else {
        currentDryStreak += 1
        longestDryStreak = Math.max(longestDryStreak, currentDryStreak)
        currentWetStreak = 0
      }
    })

    const monthlyTotals = monthlyTotalsData.map((monthData) => monthData.totalInches)
    const sortedMonthly = [...monthlyTotals].sort((a, b) => b - a)
    const concentrationPct =
      annualTotal > 0 ? round2((((sortedMonthly[0] || 0) + (sortedMonthly[1] || 0)) / annualTotal) * 100) : 0
    const concentrationLabel =
      concentrationPct >= 60 ? "Highly seasonal" : concentrationPct >= 45 ? "Moderately seasonal" : "Spread rainfall"

    const monthTotalsByYear = new Map<number, number>()
    normalizedRecords.forEach((record) => {
      if (record.date.getMonth() === currentMonthIndex) {
        const year = record.date.getFullYear()
        monthTotalsByYear.set(year, (monthTotalsByYear.get(year) || 0) + record.rainfallInches)
      }
    })

    const currentMonthTotal = round2(monthTotalsByYear.get(currentYear) || 0)
    const historicalMonthValues = Array.from(monthTotalsByYear.entries())
      .filter(([year]) => year !== currentYear)
      .map(([, total]) => total)
    const historicalMonthAvg = historicalMonthValues.length
      ? round2(historicalMonthValues.reduce((sum, value) => sum + value, 0) / historicalMonthValues.length)
      : 0
    const monthAnomalyPct =
      historicalMonthAvg > 0 ? round2(((currentMonthTotal - historicalMonthAvg) / historicalMonthAvg) * 100) : null

    let opsSignal =
      "Rainfall pattern is steady. Keep routine drying cadence and use dashboards for weekly checks."
    if (trendPct !== null && trendPct >= 25) {
      opsSignal = "Rainfall intensity is rising. Protect drying throughput and increase moisture checkpoints."
    } else if (trendPct !== null && trendPct <= -25) {
      opsSignal = "Rainfall has dropped sharply. This is a strong window to clear pending drying work."
    } else if (longestDryStreak >= 5) {
      opsSignal = "Sustained dry window detected. Prioritize high-volume lots while conditions are stable."
    }

    return {
      last30Total,
      prior30Total,
      trendPct,
      coveragePct,
      loggedDaysLast30,
      wetDaysLast30,
      longestWetStreak,
      longestDryStreak,
      concentrationPct,
      concentrationLabel,
      currentMonthTotal,
      historicalMonthAvg,
      monthAnomalyPct,
      opsSignal,
    }
  }, [annualTotal, currentMonthIndex, currentYear, monthlyTotalsData, normalizedRecords, trendSeries])

  const trendClass =
    insights.trendPct === null
      ? "text-slate-700"
      : insights.trendPct >= 0
        ? "text-amber-700"
        : "text-emerald-700"

  const monthAnomalyClass =
    insights.monthAnomalyPct === null
      ? "text-slate-700"
      : insights.monthAnomalyPct >= 0
        ? "text-amber-700"
        : "text-emerald-700"

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CloudRain className="h-5 w-5" />
                Rainfall Dashboard - {currentYear}
              </CardTitle>
              <CardDescription>Pattern intelligence from rainfall logs and rolling trend signals.</CardDescription>
            </div>
            {showDataToolsControls && (
              <Button onClick={exportToCSV} variant="outline" className="gap-2 bg-transparent">
                <Download className="h-4 w-4" />
                Export to CSV
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border/60 bg-white/80 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Annual rainfall</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{formatNumber(annualTotal, 2)} in</p>
              <p className="mt-1 text-xs text-muted-foreground">{normalizedRecords.length} total logged day(s)</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-white/80 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Last 30 days</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{formatNumber(insights.last30Total, 2)} in</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {insights.wetDaysLast30} wet day(s) from {insights.loggedDaysLast30} logged day(s)
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-white/80 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Trend vs prior 30 days</p>
              <p className={`mt-2 text-2xl font-semibold tabular-nums ${trendClass}`}>
                {insights.trendPct === null
                  ? "No baseline"
                  : `${insights.trendPct >= 0 ? "+" : ""}${formatNumber(insights.trendPct, 1)}%`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Prior 30 days: {formatNumber(insights.prior30Total, 2)} in</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-white/80 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Data coverage (30d)</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{formatNumber(insights.coveragePct, 0)}%</p>
              <p className="mt-1 text-xs text-muted-foreground">Higher coverage improves forecast confidence</p>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-slate-50/70 p-3 text-sm text-slate-700">
            {insights.opsSignal}
          </div>

          <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
            <div className="rounded-xl border border-border/60 bg-white/80 p-3">
              <p className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Monthly distribution ({currentYear}) · <span className="text-sky-600">tap a bar to see daily breakdown</span>
              </p>
              <ChartContainer config={MONTHLY_RAIN_CHART_CONFIG} className="h-[240px] w-full">
                <BarChart data={monthlyTotalsData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => formatNumber(value, 1)} width={46} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => `${formatNumber(Number(value) || 0, 2)} in`}
                        labelFormatter={(label) => `${label} ${currentYear}`}
                      />
                    }
                  />
                  <Bar
                    dataKey="totalInches"
                    fill="var(--color-totalInches)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={24}
                    className="cursor-pointer"
                    onClick={(_data, index) => setDrilldownMonthIndex(drilldownMonthIndex === index ? null : index)}
                  />
                </BarChart>
              </ChartContainer>
              {drilldownMonthIndex !== null && (
                <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/60 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-800">
                      {MONTHS[drilldownMonthIndex]} {currentYear} — daily rainfall
                    </p>
                    <button
                      type="button"
                      className="text-xs text-sky-600 hover:text-sky-800"
                      onClick={() => setDrilldownMonthIndex(null)}
                    >
                      Close ×
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {drilldownDays.map(({ day, rainfallInches }) => {
                      const hasData = rainfallInches !== null
                      const isWet = hasData && rainfallInches > 0
                      return (
                        <div
                          key={day}
                          title={hasData ? `${formatNumber(rainfallInches!, 2)} in` : "No entry"}
                          className={[
                            "flex flex-col items-center rounded-lg px-1 py-1.5 text-center",
                            isWet
                              ? "bg-sky-200/80 text-sky-900"
                              : hasData
                                ? "bg-stone-100 text-stone-400"
                                : "bg-white/50 text-stone-300",
                          ].join(" ")}
                        >
                          <span className="text-[10px] font-medium leading-none">{day}</span>
                          {isWet && (
                            <span className="mt-0.5 text-[9px] tabular-nums leading-none">
                              {formatNumber(rainfallInches!, 1)}
                            </span>
                          )}
                          {!isWet && hasData && (
                            <span className="mt-0.5 text-[9px] leading-none">dry</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-sky-700">
                    <span>🔵 Wet days: {drilldownDays.filter(d => d.rainfallInches !== null && d.rainfallInches > 0).length}</span>
                    <span>⬜ Dry days logged: {drilldownDays.filter(d => d.rainfallInches === 0).length}</span>
                    <span>— No entry: {drilldownDays.filter(d => d.rainfallInches === null).length}</span>
                    <span className="font-medium">Total: {formatNumber(drilldownDays.reduce((s, d) => s + (d.rainfallInches ?? 0), 0), 2)} in</span>
                  </div>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-border/60 bg-white/80 p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Top rainfall months</p>
              <div className="mt-3 space-y-2">
                {topMonths.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No rainfall logged this year yet.</p>
                ) : (
                  topMonths.map((monthData, index) => (
                    <div key={monthData.month} className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2 text-sm">
                      <span className="font-medium">#{index + 1} {monthData.month}</span>
                      <span className="tabular-nums text-muted-foreground">{formatNumber(monthData.totalInches, 2)} in</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-white/90">
        <CardHeader>
          <CardTitle>Rainfall Pattern Watch (Last 8 Weeks)</CardTitle>
          <CardDescription>Daily rainfall signal vs rolling 7-day average to detect wet and dry streaks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ChartContainer config={RAINFALL_TREND_CHART_CONFIG} className="h-[280px] w-full">
            <LineChart data={trendSeries} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval={6}
                minTickGap={24}
              />
              <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => formatNumber(value, 1)} width={46} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => `${formatNumber(Number(value) || 0, 2)} in`}
                    labelFormatter={(label, payload) => {
                      const dateLabel = payload?.[0]?.payload?.isoDate
                      return dateLabel ? formatDateOnly(dateLabel) : String(label || "")
                    }}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="rainInches"
                stroke="var(--color-rainInches)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="rolling7Avg"
                stroke="var(--color-rolling7Avg)"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ChartContainer>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-border/60 bg-white/75 p-3">
              <p className="text-xs text-muted-foreground">Longest wet streak</p>
              <p className="text-lg font-semibold">{insights.longestWetStreak} day(s)</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-white/75 p-3">
              <p className="text-xs text-muted-foreground">Longest dry streak</p>
              <p className="text-lg font-semibold">{insights.longestDryStreak} day(s)</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-white/75 p-3">
              <p className="text-xs text-muted-foreground">Seasonality concentration</p>
              <p className="text-lg font-semibold">{formatNumber(insights.concentrationPct, 1)}%</p>
              <p className="text-xs text-muted-foreground">{insights.concentrationLabel}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-white/75 p-3">
              <p className="text-xs text-muted-foreground">This month vs historical avg</p>
              <p className={`text-lg font-semibold ${monthAnomalyClass}`}>
                {insights.monthAnomalyPct === null
                  ? "No baseline"
                  : `${insights.monthAnomalyPct >= 0 ? "+" : ""}${formatNumber(insights.monthAnomalyPct, 1)}%`}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatNumber(insights.currentMonthTotal, 2)} in vs {formatNumber(insights.historicalMonthAvg, 2)} in
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <RainfallHeatmap records={normalizedRecords} currentYear={currentYear} />

      <Card>
        <CardHeader>
          <CardTitle>Add Rainfall Record</CardTitle>
          <CardDescription>Record daily rainfall measurements</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-medium">Date</div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal bg-transparent">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formatDateOnly(selectedDate)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <div className="flex items-center justify-between border-b px-3 py-2">
                    <span className="text-xs text-muted-foreground">Year</span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setCalendarMonth((m) => subYears(m, 1))}
                        disabled={calendarMonth.getFullYear() <= 2015}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="w-10 text-center text-sm font-semibold tabular-nums">
                        {calendarMonth.getFullYear()}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setCalendarMonth((m) => addYears(m, 1))}
                        disabled={calendarMonth.getFullYear() >= currentYear}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    month={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    onSelect={(date) => {
                      if (date) {
                        setSelectedDate(date)
                        setCalendarMonth(date)
                      }
                    }}
                    disabled={{ after: new Date() }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Notes (optional)</label>
              <Input
                placeholder="e.g., Heavy rain in afternoon"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel
                label="Inches"
                htmlFor="rainfall-inches"
                className="mb-2"
                labelClassName="text-sm font-medium"
                tooltip="Whole inches of rainfall for the day (integer only)."
              />
              <Input
                id="rainfall-inches"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="0"
                value={inches}
                onChange={handleWholeNumberChange(setInches)}
              />
            </div>
            <div>
              <FieldLabel
                label="Cents / Points (0-99)"
                htmlFor="rainfall-cents"
                className="mb-2"
                labelClassName="text-sm font-medium"
                tooltip="1 point = 0.01 inch. Example: 0.25 in = 25 points."
              />
              <Input
                id="rainfall-cents"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="0"
                value={cents}
                onChange={handleWholeNumberChange(setCents)}
              />
            </div>
          </div>
          <Button onClick={handleSaveRecord} disabled={loading} className="w-full">
            {loading ? "Saving..." : "Save Record"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rainfall Records</CardTitle>
          <CardDescription>All recorded rainfall measurements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {records.length === 0 ? (
              <p className="py-8 text-center text-gray-500">No records yet</p>
            ) : (
              records.map((record) => (
                <div key={record.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex-1">
                    <div className="font-medium">{formatDateOnly(record.record_date)}</div>
                    <div className="text-sm text-gray-600">
                      {formatNumber(record.inches + record.cents / 100)} inches
                      {record.notes && <span className="ml-2 text-gray-500">• {record.notes}</span>}
                    </div>
                  </div>
                  {canDelete && (
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteRecord(record.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Rainfall Heatmap ──────────────────────────────────────────────────────────

function rainfallColor(inches: number | null): string {
  if (inches === null) return "bg-neutral-100 dark:bg-neutral-800"
  if (inches === 0) return "bg-neutral-200 dark:bg-neutral-700"
  if (inches < 0.5) return "bg-sky-100"
  if (inches < 1.0) return "bg-sky-200"
  if (inches < 2.0) return "bg-sky-300"
  if (inches < 3.5) return "bg-sky-500"
  if (inches < 5.0) return "bg-sky-600"
  return "bg-sky-800"
}

function RainfallHeatmap({
  records,
  currentYear,
}: {
  records: NormalizedRainfallRecord[]
  currentYear: number
}) {
  const monthlyByYear = useMemo(() => {
    const map = new Map<number, number[]>() // year → 12 monthly totals
    records.forEach((r) => {
      const y = r.date.getFullYear()
      const m = r.date.getMonth()
      if (!map.has(y)) map.set(y, Array(12).fill(null))
      const arr = map.get(y)!
      arr[m] = round2((arr[m] ?? 0) + r.rainfallInches)
    })
    return map
  }, [records])

  const years = useMemo(
    () => [...monthlyByYear.keys()].sort((a, b) => a - b),
    [monthlyByYear],
  )

  if (years.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rainfall History Heatmap</CardTitle>
        <CardDescription>Monthly totals across all years — darker blue means more rain. Grey means no entry logged.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                <th className="w-10 text-left text-muted-foreground font-normal pb-2 pr-3"></th>
                {MONTHS.map((m) => (
                  <th key={m} className="text-center text-muted-foreground font-normal pb-2 px-0.5 min-w-[2.25rem]">
                    {m}
                  </th>
                ))}
                <th className="text-right text-muted-foreground font-normal pb-2 pl-3 min-w-[3rem]">Total</th>
              </tr>
            </thead>
            <tbody>
              {years.map((year) => {
                const monthly = monthlyByYear.get(year)!
                const yearTotal = round2(monthly.reduce((s, v) => s + (v ?? 0), 0))
                return (
                  <tr key={year}>
                    <td className="pr-3 py-0.5 font-semibold text-neutral-700 tabular-nums">{year}</td>
                    {monthly.map((val, mi) => (
                      <td key={mi} className="px-0.5 py-0.5">
                        <div
                          title={val !== null ? `${MONTHS[mi]} ${year}: ${formatNumber(val, 2)} in` : `${MONTHS[mi]} ${year}: no entry`}
                          className={[
                            "h-8 w-8 rounded-md flex items-end justify-center pb-0.5 mx-auto transition-colors",
                            rainfallColor(val),
                            // grey out future months in current year
                            year === currentYear && mi > new Date().getMonth() ? "opacity-30" : "",
                          ].join(" ")}
                        >
                          {val !== null && val > 0 && (
                            <span className={`text-[9px] font-medium tabular-nums leading-none ${val >= 2 ? "text-white" : "text-sky-900"}`}>
                              {val < 10 ? val.toFixed(1) : Math.round(val)}
                            </span>
                          )}
                        </div>
                      </td>
                    ))}
                    <td className="pl-3 py-0.5 text-right font-semibold tabular-nums text-neutral-700">
                      {formatNumber(yearTotal, 1)}"
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-neutral-100 border" />No entry</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-neutral-200" />0 in (dry day logged)</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-sky-200" />&lt;1 in</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-sky-400" />1–3 in</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-sky-700" />3+ in</span>
        </div>
      </CardContent>
    </Card>
  )
}
