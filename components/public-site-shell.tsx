"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Fraunces, Manrope } from "next/font/google"
import { useLocale } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"

const display = Fraunces({ subsets: ["latin"], weight: ["600", "700", "800"] })
const body = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"] })

type PublicSiteShellProps = {
  children: ReactNode
}

const isActiveLink = (pathname: string, href: string) => {
  if (href === "/") {
    return pathname === "/"
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function PublicSiteShell({ children }: PublicSiteShellProps) {
  const pathname = usePathname()
  const { t } = useLocale()
  const navItems = [
    { href: "/plans", label: t("public.landing.navPlans") },
    { href: "/capabilities", label: t("public.landing.navCapabilities") },
    { href: "/journey", label: t("public.landing.navJourney") },
    { href: "/trust", label: t("public.landing.navTrust") },
  ]

  return (
    <div
      className={`${body.className} min-h-[100svh] bg-[radial-gradient(circle_at_top_left,rgba(15,111,102,0.18),transparent_24%),linear-gradient(180deg,#f7fbfa_0%,#eef6f3_48%,#f8fafc_100%)] text-slate-900`}
    >
      <header className="px-4 pt-4 sm:px-6 sm:pt-6">
        <nav className="mx-auto flex w-full max-w-6xl flex-col gap-3 rounded-2xl border border-white/70 bg-white/85 px-3 py-3 shadow-[0_24px_50px_-32px_rgba(15,23,42,0.45)] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <Image src="/brand-logo.svg" alt="FarmFlow" width={220} height={86} className="h-12 w-auto" priority />
            </Link>
            <p className={`${display.className} hidden text-sm text-slate-600 sm:block`}>Coffee operations, without spreadsheet drift</p>
          </div>
          <div className="hidden items-center gap-4 text-sm text-slate-600 lg:flex">
            {navItems.map((item) => {
              const active = isActiveLink(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "font-semibold text-emerald-800" : "hover:text-slate-900"}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">{t("common.login")}</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">{t("public.landing.ctaPrimary")}</Link>
            </Button>
          </div>
        </nav>
        <div className="mx-auto mt-3 flex w-full max-w-6xl gap-2 overflow-x-auto no-scrollbar lg:hidden">
          {navItems.map((item) => {
            const active = isActiveLink(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
                  active
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-white/70 bg-white/80 text-slate-700"
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      </header>

      <main className="px-4 pb-16 pt-8 sm:px-6 sm:pb-20 sm:pt-12">{children}</main>

      <footer className="border-t border-white/70 bg-white/70 px-4 py-8 backdrop-blur sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className={`${display.className} text-base text-slate-900`}>FarmFlow</p>
            <p className="mt-1">Built for coffee estates that need clean operational truth every day.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/plans" className="hover:text-slate-900">
              {t("public.landing.navPlans")}
            </Link>
            <Link href="/capabilities" className="hover:text-slate-900">
              {t("public.landing.navCapabilities")}
            </Link>
            <Link href="/journey" className="hover:text-slate-900">
              {t("public.landing.navJourney")}
            </Link>
            <Link href="/trust" className="hover:text-slate-900">
              {t("public.landing.navTrust")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
