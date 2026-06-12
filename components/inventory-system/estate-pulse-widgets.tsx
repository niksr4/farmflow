"use client"

import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  XAxis,
  BarChart,
  LineChart,
} from "recharts"
import {
  TrendingUp,
  TrendingDown,
  CloudRain,
  Trophy,
  Coffee,
  Wallet,
  ArrowUpRight,
  Flame,
} from "lucide-react"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { cn } from "@/lib/utils"
import { formatNumber, formatCurrency } from "@/lib/format"

const fmtKg = (n: number) => `${formatNumber(n, 0)} kg`

// ── Shared card shell ─────────────────────────────────────────────────────

export function PulseCard({
  title,
  eyebrow,
  icon: Icon,
  className,
  children,
}: {
  title: string
  eyebrow: string
  icon?: React.ElementType
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-card", className)}>
      <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-4 dark:border-white/[0.05]">
        {Icon && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-500">{eyebrow}</p>
          <p className="text-sm font-bold text-stone-900 dark:text-white">{title}</p>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── Production trend chart ────────────────────────────────────────────

const productionConfig: ChartConfig = {
  thisSeason: { label: "This season" },
  lastSeason: { label: "Last season" },
}

export function ProductionTrendChart({
  data,
}: {
  data: Array<{ week: string; thisSeason: number | null; lastSeason: number }>
}) {
  return (
    <PulseCard title="Cherry Processed — Weekly" eyebrow="Production Trend" icon={Coffee}>
      <ChartContainer config={productionConfig} className="aspect-auto h-64 w-full">
        <ComposedChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="thisSeasonFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#059669" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-stone-100 dark:stroke-white/[0.06]" />
          <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} interval={3} />
          <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
          <Area type="monotone" dataKey="thisSeason" stroke="#059669" strokeWidth={2.5} fill="url(#thisSeasonFill)" connectNulls={false} />
          <Line type="monotone" dataKey="lastSeason" stroke="#a8a29e" strokeWidth={2} strokeDasharray="4 4" dot={false} />
        </ComposedChart>
      </ChartContainer>
      <div className="mt-3 flex items-center gap-5 text-xs font-medium text-stone-500 dark:text-stone-400">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-600" /> This season</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-stone-400 border-dashed" /> Last season</span>
      </div>
    </PulseCard>
  )
}

// ── Cost breakdown donut ─────────────────────────────────────────────

export function CostRevenueCard({
  categories,
  costPerKg,
  revenuePerKg,
  marginPerKg,
}: {
  categories: Array<{ category: string; amount: number; color: string }>
  costPerKg: number | null
  revenuePerKg: number | null
  marginPerKg: number | null
}) {
  const total = categories.reduce((sum, item) => sum + item.amount, 0)
  const config: ChartConfig = Object.fromEntries(categories.map((item) => [item.category, { label: item.category }]))
  const showMargin = costPerKg !== null && revenuePerKg !== null && marginPerKg !== null
  const profitable = (marginPerKg ?? 0) >= 0

  return (
    <PulseCard title="Cost Breakdown — Season to Date" eyebrow="Cost vs Revenue" icon={Wallet}>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <ChartContainer config={config} className="aspect-square h-44 w-44 shrink-0">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(value) => formatCurrency(Number(value), 0)} />} />
            <Pie data={categories} dataKey="amount" nameKey="category" innerRadius={50} outerRadius={78} paddingAngle={2} strokeWidth={0}>
              {categories.map((entry) => (
                <Cell key={entry.category} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>

        <div className="flex-1 space-y-2">
          {categories.map((item) => (
            <div key={item.category} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-2 text-stone-600 dark:text-stone-300">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
                {item.category}
              </span>
              <span className="font-bold tabular-nums text-stone-900 dark:text-white">
                {formatCurrency(item.amount, 0)} <span className="font-normal text-stone-400">({total > 0 ? Math.round((item.amount / total) * 100) : 0}%)</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {showMargin && (
        <div className={cn(
          "mt-5 flex items-center justify-between rounded-lg border px-4 py-3",
          profitable
            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-900/15"
            : "border-rose-200 bg-rose-50 dark:border-rose-800/40 dark:bg-rose-900/15",
        )}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Cost / kg vs Revenue / kg</p>
            <p className="text-sm font-bold text-stone-900 dark:text-white">
              {formatCurrency(costPerKg ?? 0, 2)} cost · {formatCurrency(revenuePerKg ?? 0, 2)} revenue
            </p>
          </div>
          <div className={cn("flex items-center gap-1 text-lg font-black tabular-nums", profitable ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700")}>
            {profitable ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
            {profitable ? "+" : ""}{formatCurrency(marginPerKg ?? 0, 2)}/kg
          </div>
        </div>
      )}
    </PulseCard>
  )
}

// ── Rainfall + field signal ───────────────────────────────────────────

const rainfallConfig: ChartConfig = { inches: { label: "Rainfall (in)" } }

export function RainfallSignalCard({
  data,
  signal,
}: {
  data: Array<{ day: string; inches: number }>
  signal: { title: string; detail: string }
}) {
  return (
    <PulseCard title="Rainfall — Last 14 Days" eyebrow="Field Signal" icon={CloudRain}>
      <ChartContainer config={rainfallConfig} className="aspect-auto h-36 w-full">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-stone-100 dark:stroke-white/[0.06]" />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} interval={1} />
          <ChartTooltip content={<ChartTooltipContent indicator="dot" formatter={(value) => `${value} in`} />} />
          <Bar dataKey="inches" fill="#38bdf8" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>

      <div className="mt-4 flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 dark:border-sky-800/40 dark:bg-sky-900/15">
        <CloudRain className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <div>
          <p className="text-xs font-bold text-sky-900 dark:text-sky-300">{signal.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-sky-800/80 dark:text-sky-300/70">{signal.detail}</p>
        </div>
      </div>
    </PulseCard>
  )
}

// ── Market timing ──────────────────────────────────────────────────────

const priceConfig: ChartConfig = { price: { label: "Price (USD/kg)" } }

export function MarketTimingCard({
  trend,
  currentUsdPerKg,
  signalSummary,
  estimatedUnsoldKg,
}: {
  trend: Array<{ month: string; price: number }>
  currentUsdPerKg: number
  signalSummary: string
  estimatedUnsoldKg: number
}) {
  return (
    <PulseCard title="Coffee Price — ICO Benchmark" eyebrow="Market Timing" icon={ArrowUpRight}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-black tabular-nums text-stone-900 dark:text-white">${currentUsdPerKg.toFixed(2)}<span className="text-base font-bold text-stone-400">/kg</span></p>
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400">Last 6 months</p>
        </div>
        {trend.length > 1 && (
          <ChartContainer config={priceConfig} className="aspect-auto h-16 w-32">
            <LineChart data={trend} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
              <ChartTooltip content={<ChartTooltipContent indicator="line" formatter={(value) => `$${value}/kg`} />} />
              <Line type="monotone" dataKey="price" stroke="#059669" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ChartContainer>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800/40 dark:bg-emerald-900/15">
        <p className="text-xs font-bold text-emerald-900 dark:text-emerald-300">{signalSummary}</p>
        {estimatedUnsoldKg > 0 && (
          <p className="mt-0.5 text-xs leading-relaxed text-emerald-800/80 dark:text-emerald-300/70">
            Estimated unsold stock this season: {fmtKg(estimatedUnsoldKg)}
          </p>
        )}
      </div>
    </PulseCard>
  )
}

// ── Rankings ────────────────────────────────────────────────────────────

export function RankingCard({
  title,
  eyebrow,
  icon,
  items,
  formatValue,
  barColorClassName = "bg-emerald-600",
}: {
  title: string
  eyebrow: string
  icon: React.ElementType
  items: Array<{ label: string; value: number }>
  formatValue: (value: number) => string
  barColorClassName?: string
}) {
  const max = Math.max(...items.map((item) => item.value))

  return (
    <PulseCard title={title} eyebrow={eyebrow} icon={icon}>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-semibold text-stone-700 dark:text-stone-200">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-100 text-[10px] font-black text-stone-500 dark:bg-white/[0.06] dark:text-stone-400">
                  {index + 1}
                </span>
                {item.label}
              </span>
              <span className="font-black tabular-nums text-stone-900 dark:text-white">{formatValue(item.value)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-white/[0.06]">
              <div className={cn("h-full rounded-full", barColorClassName)} style={{ width: `${max > 0 ? (item.value / max) * 100 : 0}%` }} />
            </div>
          </div>
        ))}
      </div>
    </PulseCard>
  )
}

export function BestWeekCard({ label, cherryKg, note }: { label: string; cherryKg: number; note: string }) {
  return (
    <PulseCard title="Best Week This Season" eyebrow="Highlight" icon={Trophy}>
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500 dark:bg-amber-900/20">
          <Trophy className="h-7 w-7" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">{label}</p>
          <p className="text-2xl font-black tabular-nums text-stone-900 dark:text-white">{fmtKg(cherryKg)}</p>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{note}</p>
        </div>
      </div>
    </PulseCard>
  )
}

// ── Activity heatmap ───────────────────────────────────────────────────

const HEATMAP_COLORS = [
  "bg-stone-100 dark:bg-white/[0.05]",
  "bg-emerald-100 dark:bg-emerald-900/30",
  "bg-emerald-300 dark:bg-emerald-700/60",
  "bg-emerald-500 dark:bg-emerald-600",
  "bg-emerald-700 dark:bg-emerald-500",
]

export function ActivityHeatmap({ weeks }: { weeks: number[][] }) {
  return (
    <PulseCard title="Daily Logging Activity — Last 26 Weeks" eyebrow="Engagement" icon={Flame}>
      <div className="overflow-x-auto">
        <div className="flex w-max gap-1">
          {weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="flex flex-col gap-1">
              {week.map((level, dayIdx) => (
                <div key={dayIdx} className={cn("h-3 w-3 rounded-sm", HEATMAP_COLORS[level])} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] font-medium text-stone-400">
        <span>Less</span>
        {HEATMAP_COLORS.map((color, i) => (
          <span key={i} className={cn("h-3 w-3 rounded-sm", color)} />
        ))}
        <span>More</span>
      </div>
    </PulseCard>
  )
}
