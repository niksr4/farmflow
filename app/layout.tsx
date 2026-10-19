import React, { Suspense } from "react"
import type { Metadata, Viewport } from "next"
import { cookies } from "next/headers"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/hooks/use-auth"
import BrandWatermark from "@/components/brand-watermark"
import FloatingAiAssistant from "@/components/floating-ai-assistant"
import FeedbackWidget from "@/components/feedback-widget"
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "sonner"
import PwaRegister from "@/components/pwa-register"
import CrashBeacon from "@/components/crash-beacon"
import ChunkRecovery from "@/components/chunk-recovery"
import PostHogAuthSync from "@/components/posthog-auth-sync"
import SentryAuthSync from "@/components/sentry-auth-sync"
import WebVitals from "@/components/web-vitals"
import { LocaleProvider } from "@/components/locale-provider"
import { LOCALE_COOKIE_KEY, normalizeAppLocale } from "@/lib/i18n"
import { resolveMetadataBase } from "@/lib/site-url"

// Self-hosted, and shared with components/public-site-shell.tsx so the app and the marketing site
// cannot drift onto different weights of the same typeface. See app/fonts/index.ts for why.
import { bodyFont, displayFont } from "@/app/fonts"


export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  /**
   * `template` lets every page supply its own title and get the brand appended, so /plans is
   * "Pricing for coffee estates | FarmFlow" rather than the bare "FarmFlow" that nine public
   * pages were serving. `default` covers anything that declares none.
   */
  title: {
    default: "FarmFlow: coffee estate management software",
    template: "%s | FarmFlow",
  },
  description:
    "Coffee estate management software for Arabica and Robusta planters. The muster, outturn, the store, and cost per kilo of parchment in one book.",
  // `generator: "v0.dev"` was here and shipped a <meta name="generator" content="v0.dev"> on every
  // page. It tells a reader nothing useful and advertises the scaffolding this started from.
  keywords: [
    "coffee estate management software",
    "coffee plantation software India",
    "estate muster roll software",
    "coffee outturn tracking",
    "Arabica Robusta estate records",
    "coffee estate payroll Karnataka",
  ],
  applicationName: "FarmFlow",
  appleWebApp: {
    capable: true,
    title: "FarmFlow",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-light-32x32.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark-32x32.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: dark)" },
      { url: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icon-light-32x32.png",
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
}

export const viewport: Viewport = {
  themeColor: "#12AEB1",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const initialLocale = normalizeAppLocale(cookieStore.get(LOCALE_COOKIE_KEY)?.value || "en")

  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* Warm up connections to third-party origins used on every page */}
        {/* Must be the DSN's real host — the region-less `ingest.sentry.io` this used to
            point at is never contacted, so the prefetch warmed the wrong connection. */}
        <link rel="dns-prefetch" href="https://o4511210874339328.ingest.de.sentry.io" />
        <link rel="dns-prefetch" href="https://cdn.weatherapi.com" />
      </head>
      <body className={`${bodyFont.variable} ${displayFont.variable} font-body`} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
          <AuthProvider>
            <LocaleProvider>
              <Suspense fallback={null}>
                <PostHogAuthSync />
              </Suspense>
              {/*
                GA4 WAS REMOVED HERE ON 2026-10-14, AND IT HAD NEVER WORKED.
                The tag loaded fine; the beacon goes to the REGIONAL host
                `region1.google-analytics.com`, and CONNECT_SRC only ever listed
                `https://www.google-analytics.com`. So every hit was refused by CSP, silently --
                the browser drops the request and logs nothing anywhere. Found by the 2026-10-14 UX
                audit as console noise on every page.

                This is the third time this exact class has bitten this project, after the
                malformed `https://o*.ingest.sentry.io` wildcard that cost months of client-side
                Sentry, and Vercel Analytics being rendered while CSP refused its script.

                Deleted rather than fixed, deliberately: PostHog already collects this (including
                $web_vitals, see components/web-vitals.tsx), so GA added a second analytics
                pipeline, a subprocessor, two more CSP hosts and a cookie banner obligation in
                exchange for data nobody read. Fixing the policy would have bought all of that for
                the first time rather than restoring something that worked.
              */}
              {children}
              <Suspense fallback={null}>
                <FloatingAiAssistant />
              </Suspense>
              <Suspense fallback={null}>
                <FeedbackWidget />
              </Suspense>
              <BrandWatermark />
              <Toaster />
              {/* Several components toast via sonner — without this mount those messages never render */}
              <SonnerToaster position="top-center" richColors closeButton />
              <PwaRegister />
              {/* Detects sessions killed by the OS — see lib/crash-beacon.ts */}
              <CrashBeacon />
              {/* Reloads a tab left holding chunks a later deploy replaced — see lib/chunk-recovery.ts */}
              <ChunkRecovery />
              {/* Tags Sentry issues with tenant/user so they can be triaged */}
              <SentryAuthSync />
              <Suspense fallback={null}>
                <WebVitals />
              </Suspense>
              <Analytics />
            </LocaleProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
