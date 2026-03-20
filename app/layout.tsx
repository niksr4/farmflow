import React, { Suspense } from "react"
import type { Metadata, Viewport } from "next"
import { cookies } from "next/headers"
import { Fraunces, Manrope } from "next/font/google"
import Script from "next/script"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/hooks/use-auth"
import BrandWatermark from "@/components/brand-watermark"
import FloatingAiAssistant from "@/components/floating-ai-assistant"
import { Toaster } from "@/components/ui/toaster"
import PwaRegister from "@/components/pwa-register"
import PostHogAuthSync from "@/components/posthog-auth-sync"
import { LocaleProvider } from "@/components/locale-provider"
import { LOCALE_COOKIE_KEY, normalizeAppLocale } from "@/lib/i18n"

const bodyFont = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-body" })
const displayFont = Fraunces({ subsets: ["latin"], weight: ["600", "700", "800"], display: "swap", variable: "--font-display" })

const resolveMetadataBase = () => {
  const explicitUrl = String(process.env.NEXT_PUBLIC_APP_URL || "").trim()
  if (explicitUrl) {
    try {
      return new URL(explicitUrl)
    } catch {
      // fall through to Vercel/local fallbacks.
    }
  }

  const vercelUrl = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "").trim()
  if (vercelUrl) {
    const normalized = vercelUrl.startsWith("http://") || vercelUrl.startsWith("https://") ? vercelUrl : `https://${vercelUrl}`
    try {
      return new URL(normalized)
    } catch {
      // fall through to localhost.
    }
  }

  return new URL("http://localhost:3000")
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: "FarmFlow",
  description: "Coffee estate operations with traceability, yields, and buyer-ready reporting.",
  generator: "v0.dev",
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
      </head>
      <body className={`${bodyFont.variable} ${displayFont.variable} font-body`} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <AuthProvider>
            <LocaleProvider>
              <Suspense fallback={null}>
                <PostHogAuthSync />
              </Suspense>
              <Script async src="https://www.googletagmanager.com/gtag/js?id=G-X0RB06WXE9" />
              <Script id="ga4-google-tag">
                {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-X0RB06WXE9');`}
              </Script>
              {children}
              <Suspense fallback={null}>
                <FloatingAiAssistant />
              </Suspense>
              <BrandWatermark />
              <Toaster />
              <PwaRegister />
              <Analytics />
            </LocaleProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
