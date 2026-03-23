"use client"

import type { CSSProperties, ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type WorkspaceShellAccent = "emerald" | "amber" | "sky" | "slate" | "violet"
type WorkspaceShellStatTone = "default" | "positive" | "warning" | "critical"

export type WorkspaceShellStat = {
  label: string
  value: string
  detail?: string
  tone?: WorkspaceShellStatTone
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
    glow: string
    badge: string
    text: string
    statCard: string
  }
> = {
  emerald: {
    shell: "border-emerald-200/80 bg-gradient-to-br from-white via-emerald-50/80 to-slate-50/90",
    glow: "bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.18),_transparent_42%),radial-gradient(circle_at_bottom_left,_rgba(52,211,153,0.14),_transparent_38%)]",
    badge: "border-emerald-200 bg-white text-emerald-700",
    text: "text-emerald-900",
    statCard: "border-emerald-100/80 bg-white/85",
  },
  amber: {
    shell: "border-amber-200/80 bg-gradient-to-br from-white via-amber-50/80 to-stone-50/90",
    glow: "bg-[radial-gradient(circle_at_top_right,_rgba(245,158,11,0.2),_transparent_42%),radial-gradient(circle_at_bottom_left,_rgba(251,191,36,0.16),_transparent_38%)]",
    badge: "border-amber-200 bg-white text-amber-700",
    text: "text-amber-950",
    statCard: "border-amber-100/80 bg-white/85",
  },
  sky: {
    shell: "border-sky-200/80 bg-gradient-to-br from-white via-sky-50/80 to-cyan-50/90",
    glow: "bg-[radial-gradient(circle_at_top_right,_rgba(14,165,233,0.16),_transparent_42%),radial-gradient(circle_at_bottom_left,_rgba(34,211,238,0.14),_transparent_38%)]",
    badge: "border-sky-200 bg-white text-sky-700",
    text: "text-sky-950",
    statCard: "border-sky-100/80 bg-white/85",
  },
  slate: {
    shell: "border-slate-200/90 bg-gradient-to-br from-white via-slate-50/85 to-zinc-50/90",
    glow: "bg-[radial-gradient(circle_at_top_right,_rgba(148,163,184,0.16),_transparent_42%),radial-gradient(circle_at_bottom_left,_rgba(203,213,225,0.14),_transparent_38%)]",
    badge: "border-slate-200 bg-white text-slate-700",
    text: "text-slate-900",
    statCard: "border-slate-100/80 bg-white/85",
  },
  violet: {
    shell: "border-violet-200/80 bg-gradient-to-br from-white via-violet-50/80 to-fuchsia-50/85",
    glow: "bg-[radial-gradient(circle_at_top_right,_rgba(139,92,246,0.16),_transparent_42%),radial-gradient(circle_at_bottom_left,_rgba(217,70,239,0.12),_transparent_38%)]",
    badge: "border-violet-200 bg-white text-violet-700",
    text: "text-violet-950",
    statCard: "border-violet-100/80 bg-white/85",
  },
}

const statToneClasses: Record<WorkspaceShellStatTone, string> = {
  default: "text-foreground",
  positive: "text-emerald-700",
  warning: "text-amber-700",
  critical: "text-rose-700",
}

const textureStyle: CSSProperties = {
  backgroundImage: "radial-gradient(circle at 1px 1px, rgba(15, 23, 42, 0.08) 1px, transparent 0)",
  backgroundSize: "20px 20px",
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
        className={cn("relative overflow-hidden rounded-[28px] border shadow-[0_18px_40px_-28px_rgba(15,23,42,0.32)]", accentStyle.shell)}
      >
        <div className={cn("absolute inset-0", accentStyle.glow)} />
        <div className="absolute inset-0 opacity-35" style={textureStyle} />
        <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              {badge ? (
                <Badge variant="outline" className={cn("w-fit", accentStyle.badge)}>
                  {badge}
                </Badge>
              ) : null}
              <div className="space-y-2">
                <h1 className={cn("text-2xl font-semibold tracking-tight sm:text-[2rem]", accentStyle.text)}>{title}</h1>
                <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-[15px]">{description}</p>
              </div>
              {supportingContent ? <div className="text-sm text-slate-600">{supportingContent}</div> : null}
            </div>
            {actions ? <div className="shrink-0">{actions}</div> : null}
          </div>

          {hasStats ? (
            <div className={cn("grid gap-3", stats.length >= 4 ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3")}>
              {stats.map((stat) => (
                <div key={`${stat.label}-${stat.value}`} className={cn("rounded-2xl border p-4 shadow-sm", accentStyle.statCard)}>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{stat.label}</p>
                  <p className={cn("mt-2 text-xl font-semibold tracking-tight", statToneClasses[stat.tone || "default"])}>
                    {stat.value}
                  </p>
                  {stat.detail ? <p className="mt-1 text-xs leading-5 text-slate-500">{stat.detail}</p> : null}
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
