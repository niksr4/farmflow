"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type { FiscalYear } from "@/lib/fiscal-year-utils"

type FiscalYearSelectProps = {
  value: FiscalYear
  options: FiscalYear[]
  onChange: (fiscalYear: FiscalYear) => void
  /** Compact: small trigger for headers/toolbars. Full: labeled, wider trigger for a dedicated control area. */
  variant?: "compact" | "full"
  label?: string
  className?: string
}

export function FiscalYearSelect({
  value,
  options,
  onChange,
  variant = "compact",
  label = "Fiscal Year",
  className,
}: FiscalYearSelectProps) {
  const handleChange = (selectedLabel: string) => {
    const fy = options.find((f) => f.label === selectedLabel)
    if (fy) onChange(fy)
  }

  if (variant === "full") {
    return (
      <div className={className}>
        <Label className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</Label>
        <Select value={value.label} onValueChange={handleChange}>
          <SelectTrigger className="mt-2 w-full min-w-[220px] bg-white sm:min-w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((fy) => (
              <SelectItem key={fy.label} value={fy.label}>
                {fy.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  return (
    <Select value={value.label} onValueChange={handleChange}>
      <SelectTrigger className={cn("h-9 w-auto rounded-xl border-stone-200 bg-stone-50 text-xs font-semibold", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((fy) => (
          <SelectItem key={fy.label} value={fy.label}>
            {fy.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
