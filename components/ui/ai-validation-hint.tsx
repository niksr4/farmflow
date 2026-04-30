"use client"

import { AlertTriangle, Info, XCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ValidationSeverity } from "@/hooks/use-ai-validate"

type Props = {
  warning: string | null
  severity: ValidationSeverity
  validating: boolean
  className?: string
}

const iconMap = {
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
}

const colorMap = {
  info: "text-blue-600",
  warning: "text-amber-600",
  error: "text-red-600",
}

// Inline hint shown below a form field when AI detects an anomaly.
// Never blocks submission — always advisory.
export function AiValidationHint({ warning, severity, validating, className }: Props) {
  if (validating) {
    return (
      <p className={cn("mt-1 flex items-center gap-1 text-xs text-muted-foreground", className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking...
      </p>
    )
  }

  if (!warning || !severity) return null

  const Icon = iconMap[severity]
  const color = colorMap[severity]

  return (
    <p className={cn("mt-1 flex items-start gap-1.5 text-xs", color, className)}>
      <Icon className="mt-0.5 h-3 w-3 shrink-0" />
      {warning}
    </p>
  )
}
