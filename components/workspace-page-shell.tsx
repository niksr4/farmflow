"use client"

import type { CSSProperties, ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Info } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type WorkspaceShellAccent = "emerald" | "amber" | "sky" | "slate" | "violet"
type WorkspaceShellStatTone = "default" | "positive" | "warning" | "critical"

export type WorkspaceShellStat = {
  label: string
  value: string
  detail?: string
  tone?: WorkspaceShellStatTone
  tooltip?: string
}

type WorkspacePageShellProps = {
  badge?: string
  title: string
  description: string
  actions?: ReactNode
  supportingContent?: ReactNode
  stats?: WorkspaceShellStat[]
  accent?: WorkspaceShellAccent
  className?: string
  contentClassName?: string
  children: ReactNode
}

const MotionSection = motion.section as any
const MotionDiv = motion.div as any

const accentStyles: Record<
  WorkspaceShellAccent,
  {
    shell: string
    darkShell: string
    glow: string
    badge: string
    text: string
    statCard: string
  }
> = {
  emerald: {
    shell: "border-emerald-200/60 bg-gradient-to-br from-stone-50 via-emerald-50/70 to-stone-50/90",
    darkShell: "dark:border-emerald-500/20 dark:bg-card dark:[background-image:none]",
    glow: "bg-[radial-gradient(ellipse_at_top_right,_rgba(16,185,129,0.22),_transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(180,140,80,0.1),_transparent_45%)]",
    badge: "border-emerald-200/80 bg-emerald-100/90 text-emerald-700",
    text: "text-stone-900",
    statCard: "border-stone-200/50",
  },
  amber: {
    shell: "border-amber-200/60 bg-gradient-to-br from-amber-50/80 via-stone-50 to-amber-50/40",
    darkShell: "dark:border-amber-500/20 dark:bg-card dark:[background-image:none]",
    glow: "bg-[radial-gradient(ellipse_at_top_right,_rgba(245,158,11,0.26),_transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(120,80,20,0.08),_transparent_45%)]",
    badge: "border-amber-200/80 bg-amber-100/90 text-amber-700",
    text: "text-stone-900",
    statCard: "border-stone-200/50",
  },
  sky: {
    shell: "border-sky-200/60 bg-gradient-to-br from-stone-50 via-sky-50/70 to-stone-50/90",
    darkShell: "dark:border-sky-500/20 dark:bg-card dark:[background-image:none]",
    glow: "bg-[radial-gradient(ellipse_at_top_right,_rgba(14,165,233,0.20),_transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(100,150,180,0.1),_transparent_45%)]",
    badge: "border-sky-200/80 bg-sky-100/90 text-sky-700",
    text: "text-stone-900",
    statCard: "border-stone-200/50",
  },
  slate: {
    shell: "border-stone-200/70 bg-gradient-to-br from-stone-50 via-stone-100/60 to-stone-50/90",
    darkShell: "dark:border-white/[0.08] dark:bg-card dark:[background-image:none]",
    glow: "bg-[radial-gradient(ellipse_at_top_right,_rgba(120,100,80,0.12),_transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(100,90,80,0.08),_transparent_45%)]",
    badge: "border-stone-200/80 bg-stone-100/90 text-stone-600",
    text: "text-stone-900",
    statCard: "border-stone-200/50",
  },
  violet: {
    shell: "border-violet-200/60 bg-gradient-to-br from-stone-50 via-violet-50/70 to-stone-50/90",
    darkShell: "dark:border-violet-500/20 dark:bg-card dark:[background-image:none]",
    glow: "bg-[radial-gradient(ellipse_at_top_right,_rgba(139,92,246,0.18),_transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(217,70,239,0.10),_transparent_45%)]",
    badge: "border-violet-200/80 bg-violet-100/90 text-violet-700",
    text: "text-stone-900",
    statCard: "border-stone-200/50",
  },
}

const statToneClasses: Record<WorkspaceShellStatTone, string> = {
  default: "text-foreground",
  positive: "text-emerald-700",
  warning: "text-amber-700",
  critical: "text-rose-700",
}

const statToneStyles: Record<
  WorkspaceShellStatTone,
  {
    card: string
    label: string
    accent: string
    detail: string
  }
> = {
  default: {
    card: "border-stone-200/70 bg-white/80 dark:bg-card/70 dark:border-white/[0.07]",
    label: "text-stone-500",
    accent: "bg-stone-300/70 dark:bg-white/20",
    detail: "text-stone-500",
  },
  positive: {
    card: "border-emerald-200/80 bg-emerald-50/80 dark:bg-emerald-500/10 dark:border-emerald-500/25",
    label: "text-emerald-700",
    accent: "bg-emerald-400/80 dark:bg-emerald-400/50",
    detail: "text-emerald-700/85",
  },
  warning: {
    card: "border-amber-200/80 bg-amber-50/80 dark:bg-amber-500/10 dark:border-amber-500/25",
    label: "text-amber-700",
    accent: "bg-amber-400/80 dark:bg-amber-400/50",
    detail: "text-amber-700/85",
  },
  critical: {
    card: "border-rose-200/80 bg-rose-50/80 dark:bg-rose-500/10 dark:border-rose-500/25",
    label: "text-rose-700",
    accent: "bg-rose-400/80 dark:bg-rose-400/50",
    detail: "text-rose-700/85",
  },
}

const textureStyle: CSSProperties = {
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")",
  opacity: 0.12,
  mixBlendMode: "overlay" as const,
}

export default function WorkspacePageShell({
  badge,
  title,
  description,
  actions,
  supportingContent,
  stats = [],
  accent = "emerald",
  className,
  contentClassName,
  children,
}: WorkspacePageShellProps) {
  const reduceMotion = useReducedMotion()
  const accentStyle = accentStyles[accent]
  const hasStats = stats.length > 0
  const headerAnimation = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.28, ease: "easeOut" },
      }
  const contentAnimation = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.32, delay: 0.05, ease: "easeOut" },
      }

  return (
    <div className={cn("space-y-6", className)}>
      <MotionSection
        {...headerAnimation}
        className={cn(
          "relative overflow-hidden rounded-[32px] border",
          "shadow-[0_24px_60px_-28px_rgba(120,80,30,0.18),0_0_0_1px_rgba(200,160,80,0.05),inset_0_1px_0_rgba(255,255,255,0.55)]",
          accentStyle.shell,
          accentStyle.darkShell,
        )}
      >
        <div className={cn("absolute inset-0", accentStyle.glow)} />
        {/* SVG grain noise — finer and blended */}
        <div className="absolute inset-0 pointer-events-none" style={textureStyle} />
        {/* Top-edge shimmer line */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent pointer-events-none" />
        <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-3">
              {badge ? (
                <Badge variant="outline" className={cn("w-fit rounded-full px-3 py-1", accentStyle.badge)}>
                  {badge}
                </Badge>
              ) : null}
              <div className="space-y-2">
                <h1 className={cn("text-2xl font-black tracking-tight sm:text-[2rem] leading-tight", accentStyle.text)}>{title}</h1>
                <p className="max-w-3xl text-xs text-stone-400">{description}</p>
              </div>
            </div>
            {actions ? (
              <div className="shrink-0 rounded-[28px] border border-stone-200/60 bg-white/70 p-3 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.35)] backdrop-blur">
                {actions}
              </div>
            ) : null}
          </div>

          {hasStats ? (
            <div className={cn("grid gap-3", stats.length >= 4 ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3")}>
              {stats.map((stat) => (
                <div
                  key={`${stat.label}-${stat.value}`}
                  className={cn(
                    "rounded-2xl border p-4",
                    "shadow-[0_4px_16px_-6px_rgba(120,80,30,0.14),0_0_0_1px_rgba(200,160,80,0.04)]",
                    "hover:shadow-[0_8px_24px_-6px_rgba(120,80,30,0.2)] transition-shadow duration-200",
                    statToneStyles[stat.tone || "default"].card, accentStyle.statCard
                  )}
                >
                  <div className={cn("h-1.5 w-12 rounded-full", statToneStyles[stat.tone || "default"].accent)} />
                  <div className="mt-3 flex items-center gap-1.5">
                    <p className={cn("text-[11px] uppercase tracking-[0.18em]", statToneStyles[stat.tone || "default"].label)}>{stat.label}</p>
                    {stat.tooltip && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className={cn("h-3 w-3 shrink-0 cursor-help opacity-60", statToneStyles[stat.tone || "default"].label)} />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[220px]">{stat.tooltip}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  <p className={cn("mt-2 text-xl font-black tracking-tight tabular-nums", statToneClasses[stat.tone || "default"])}>
                    {stat.value}
                  </p>
                  {stat.detail ? (
                    <p className={cn("mt-1 text-xs leading-5", statToneStyles[stat.tone || "default"].detail)}>{stat.detail}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </MotionSection>

      <MotionDiv {...contentAnimation} className={cn("space-y-6", contentClassName)}>
        {children}
      </MotionDiv>
    </div>
  )
}
