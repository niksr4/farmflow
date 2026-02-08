import type React from "react"
import type { Metadata } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/hooks/use-auth"
import BrandWatermark from "@/components/brand-watermark"

const inter = Inter({ 
  subsets: ["latin"], 
  display: "swap",
  variable: "--font-inter"
})

const spaceGrotesk = Space_Grotesk({ 
  subsets: ["latin"], 
  display: "swap",
  variable: "--font-space-grotesk"
})

export const metadata: Metadata = {
  title: "FarmFlow",
  description: "Traceability and operations for coffee, tea, cocoa, and specialty crops.",
  generator: "v0.dev",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${spaceGrotesk.variable} font-sans`}>
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
