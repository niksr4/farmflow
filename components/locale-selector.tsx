"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { APP_LOCALES, type AppLocale } from "@/lib/i18n"
import { useLocale } from "@/components/locale-provider"

type LocaleSelectorProps = {
  value?: AppLocale
  onValueChange?: (value: AppLocale) => void
  className?: string
  compact?: boolean
}

export function LocaleSelector({ value, onValueChange, className, compact = false }: LocaleSelectorProps) {
  const { locale, setLocale } = useLocale()
  const currentValue = value || locale

  const handleChange = (nextValue: string) => {
    const normalized = nextValue as AppLocale
    if (onValueChange) {
      onValueChange(normalized)
      return
    }
    setLocale(normalized)
  }

  return (
    <Select value={currentValue} onValueChange={handleChange}>
      <SelectTrigger className={className || (compact ? "h-9 w-[170px] bg-white/80" : "w-full bg-white/90")}>
        <SelectValue placeholder="Language" />
      </SelectTrigger>
      <SelectContent>
        {APP_LOCALES.map((option) => (
          <SelectItem key={option.code} value={option.code}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
