import type React from "react"
import type { Metadata, Viewport } from "next"
import { Fraunces, Manrope } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/hooks/use-auth"
import BrandWatermark from "@/components/brand-watermark"
import { Toaster } from "@/components/ui/toaster"
import PwaRegister from "@/components/pwa-register"

const bodyFont = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-body" })
const displayFont = Fraunces({ subsets: ["latin"], weight: ["600", "700", "800"], display: "swap", variable: "--font-display" })

export const metadata: Metadata = {
  title: "FarmFlow",
  description: "Coffee estate operations with traceability, yields, and buyer-ready reporting.",
  generator: "v0.dev",
  applicationName: "FarmFlow",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FarmFlow",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-light-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icon-light-32x32.png",
    apple: "/apple-icon.png",
  },
}

export const viewport: Viewport = {
  themeColor: "#12AEB1",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${bodyFont.variable} ${displayFont.variable} font-body`} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <AuthProvider>
            {children}
            <BrandWatermark />
            <Toaster />
            <PwaRegister />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
