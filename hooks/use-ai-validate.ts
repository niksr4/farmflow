"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type ValidationSeverity = "info" | "warning" | "error" | null

export type ValidationResult = {
  ok: boolean
  warning: string | null
  severity: ValidationSeverity
}

type UseAiValidateOptions = {
  field: string
  debounceMs?: number
  minValue?: number   // skip validation if value is below this (e.g. 0)
  enabled?: boolean
}

// Debounced AI validation hook. Fires an async API call after the user stops typing.
// Never blocks form submission — validation is advisory only.
export function useAiValidate(
  value: number | string | null | undefined,
  context: Record<string, unknown>,
  { field, debounceMs = 800, minValue = 1, enabled = true }: UseAiValidateOptions,
): { result: ValidationResult | null; validating: boolean } {
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [validating, setValidating] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const validate = useCallback(
    async (val: number | string, ctx: Record<string, unknown>) => {
      abortRef.current?.abort()
      const abort = new AbortController()
      abortRef.current = abort

      setValidating(true)
      try {
        const res = await fetch("/api/ai-validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, value: val, context: ctx }),
          signal: abort.signal,
        })
        if (abort.signal.aborted) return
        // An error body is not a ValidationResult; advisory validation just stays silent.
        if (!res.ok) return
        const data: ValidationResult = await res.json()
        if (abort.signal.aborted) return
        setResult(data)
      } catch {
        // AbortError or network failure — silently ignore
      } finally {
        if (!abort.signal.aborted) setValidating(false)
      }
    },
    [field],
  )

  useEffect(() => {
    if (!enabled) return
    if (value === null || value === undefined || value === "") {
      // Cancel any in-flight check so a late response cannot resurrect a stale warning.
      abortRef.current?.abort()
      setValidating(false)
      setResult(null)
      return
    }
    const num = Number(value)
    if (!Number.isFinite(num) || num < minValue) {
      abortRef.current?.abort()
      setValidating(false)
      setResult(null)
      return
    }

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      validate(num, context)
    }, debounceMs)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, enabled])

  // Cancel any outstanding request on unmount.
  useEffect(() => () => abortRef.current?.abort(), [])

  return { result, validating }
}
