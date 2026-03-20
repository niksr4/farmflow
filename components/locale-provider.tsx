"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import {
  DEFAULT_APP_LOCALE,
  LOCALE_COOKIE_KEY,
  LOCALE_STORAGE_KEY,
  type AppLocale,
  normalizeAppLocale,
  translate,
} from "@/lib/i18n"

type LocaleContextValue = {
  locale: AppLocale
  setLocale: (locale: AppLocale) => void
  t: (key: string, values?: Record<string, string | number>) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

const isEnglishOnlyPublicPath = (pathname: string) =>
  pathname === "/" ||
  pathname === "/plans" ||
  pathname === "/capabilities" ||
  pathname === "/journey" ||
  pathname === "/trust" ||
  pathname === "/login" ||
  pathname === "/signup" ||
  pathname === "/verify-email" ||
  pathname === "/privacy" ||
  pathname === "/standards" ||
  pathname === "/offline" ||
  pathname.startsWith("/legal/")

const persistLocale = (locale: AppLocale) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale
    document.cookie = `${LOCALE_COOKIE_KEY}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
  }
}

const readStoredLocale = () => {
  if (typeof window === "undefined") return null
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
  if (stored) return normalizeAppLocale(stored)
  if (window.navigator?.language) return normalizeAppLocale(window.navigator.language)
  return null
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const sessionLocale = normalizeAppLocale(session?.user?.preferredLocale || "", DEFAULT_APP_LOCALE)
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_APP_LOCALE)

  useEffect(() => {
    const nextLocale = isEnglishOnlyPublicPath(pathname || "")
      ? DEFAULT_APP_LOCALE
      : session?.user?.preferredLocale
        ? sessionLocale
        : readStoredLocale() || DEFAULT_APP_LOCALE
    setLocaleState(nextLocale)
    if (isEnglishOnlyPublicPath(pathname || "")) {
      if (typeof document !== "undefined") {
        document.documentElement.lang = DEFAULT_APP_LOCALE
      }
      return
    }
    persistLocale(nextLocale)
  }, [pathname, session?.user?.preferredLocale, sessionLocale])

  const setLocale = (nextLocale: AppLocale) => {
    const normalized = normalizeAppLocale(nextLocale)
    setLocaleState(normalized)
    persistLocale(normalized)
  }

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, values) => translate(locale, key, values),
    }),
    [locale],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider")
  }
  return context
}
