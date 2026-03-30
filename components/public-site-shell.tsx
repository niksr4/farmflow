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
  theme?: "light" | "dark"
}

const isActiveLink = (pathname: string, href: string) => {
  if (href === "/") {
    return pathname === "/"
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function PublicSiteShell({ children, theme = "light" }: PublicSiteShellProps) {
  const pathname = usePathname()
  const { t } = useLocale()
  const isDark = theme === "dark"
  const navItems = [
    { href: "/plans", label: t("public.landing.navPlans") },
    { href: "/capabilities", label: t("public.landing.navCapabilities") },
    { href: "/journey", label: t("public.landing.navJourney") },
    { href: "/trust", label: t("public.landing.navTrust") },
    { href: "/contact", label: "Contact" },
  ]

  return (
    <div
      className={
        isDark
          ? `${body.className} min-h-[100svh] bg-[#07110f] text-stone-100`
          : `${body.className} min-h-[100svh] bg-[radial-gradient(circle_at_top_left,rgba(15,111,102,0.18),transparent_24%),linear-gradient(180deg,#f7fbfa_0%,#eef6f3_48%,#f8fafc_100%)] text-slate-900`
      }
    >
      {isDark ? (
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_26%),radial-gradient(circle_at_80%_12%,rgba(245,158,11,0.14),transparent_20%),linear-gradient(180deg,#07110f_0%,#091916_38%,#081310_100%)]" />
          <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px)", backgroundSize: "120px 120px" }} />
          <div className="absolute -top-40 right-[-10%] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.22),transparent_70%)] blur-3xl" />
          <div className="absolute top-[24%] left-[-12%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(217,119,6,0.18),transparent_72%)] blur-3xl" />
        </div>
      ) : null}
      <header className="px-4 pt-4 sm:px-6 sm:pt-6">
        <nav
          className={`mx-auto flex w-full max-w-6xl flex-col gap-3 rounded-2xl px-3 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-4 ${
            isDark
              ? "border border-white/10 bg-[#081613]/70 shadow-[0_24px_70px_-34px_rgba(0,0,0,0.75)]"
              : "border border-white/70 bg-white/85 shadow-[0_24px_50px_-32px_rgba(15,23,42,0.45)]"
          }`}
        >
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <Image src="/brand-logo.svg" alt="FarmFlow" width={220} height={86} className="h-12 w-auto" priority />
            </Link>
            <p className={`${display.className} hidden text-sm sm:block ${isDark ? "text-stone-300" : "text-slate-600"}`}>
              Coffee operations, without spreadsheet drift
            </p>
          </div>
          <div className={`hidden items-center gap-4 text-sm lg:flex ${isDark ? "text-stone-300/80" : "text-slate-600"}`}>
            {navItems.map((item) => {
              const active = isActiveLink(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? isDark
                        ? "font-semibold text-emerald-200"
                        : "font-semibold text-emerald-800"
                      : isDark
                        ? "hover:text-white"
                        : "hover:text-slate-900"
                  }
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className={isDark ? "border-white/10 text-stone-200 hover:bg-white/10 hover:text-white" : undefined}
              asChild
            >
              <Link href="/login">{t("common.login")}</Link>
            </Button>
            <Button
              className={
                isDark
                  ? "border-emerald-300/40 bg-emerald-300/90 text-[#06110f] shadow-[0_18px_36px_-18px_rgba(110,231,183,0.65)] hover:bg-emerald-200"
                  : undefined
              }
              asChild
            >
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
                    ? isDark
                      ? "border-emerald-300/50 bg-emerald-300/12 text-emerald-100"
                      : "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : isDark
                      ? "border-white/10 bg-white/5 text-stone-300"
                      : "border-white/70 bg-white/80 text-slate-700"
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      </header>

      <main className={`relative z-10 px-4 pb-16 pt-8 sm:px-6 sm:pb-20 sm:pt-12 ${isDark ? "" : ""}`}>{children}</main>

      <footer
        className={`px-4 py-8 backdrop-blur sm:px-6 ${
          isDark ? "border-t border-white/10 bg-black/20" : "border-t border-white/70 bg-white/70"
        }`}
      >
        <div className={`mx-auto flex w-full max-w-6xl flex-col gap-4 text-sm sm:flex-row sm:items-center sm:justify-between ${isDark ? "text-stone-300/80" : "text-slate-600"}`}>
          <div>
            <p className={`${display.className} text-base ${isDark ? "text-stone-100" : "text-slate-900"}`}>FarmFlow</p>
            <p className="mt-1">Built for coffee estates that need clean operational truth every day.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/plans" className={isDark ? "hover:text-white" : "hover:text-slate-900"}>
              {t("public.landing.navPlans")}
            </Link>
            <Link href="/capabilities" className={isDark ? "hover:text-white" : "hover:text-slate-900"}>
              {t("public.landing.navCapabilities")}
            </Link>
            <Link href="/journey" className={isDark ? "hover:text-white" : "hover:text-slate-900"}>
              {t("public.landing.navJourney")}
            </Link>
            <Link href="/trust" className={isDark ? "hover:text-white" : "hover:text-slate-900"}>
              {t("public.landing.navTrust")}
            </Link>
            <Link href="/contact" className={isDark ? "hover:text-white" : "hover:text-slate-900"}>
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
