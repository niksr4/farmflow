import type React from "react"
import type { Metadata } from "next"
import { Fraunces, Manrope } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/hooks/use-auth"
import BrandWatermark from "@/components/brand-watermark"

const bodyFont = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-body" })
const displayFont = Fraunces({ subsets: ["latin"], weight: ["600", "700", "800"], display: "swap", variable: "--font-display" })

export const metadata: Metadata = {
  title: "FarmFlow",
  description: "Coffee estate operations with traceability, yields, and buyer-ready reporting.",
  generator: "v0.dev",
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
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
