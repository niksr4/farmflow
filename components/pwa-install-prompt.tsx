"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Download, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

const DISMISS_KEY = "farmflow_pwa_install_dismissed_at"
const DISMISS_WINDOW_MS = 1000 * 60 * 60 * 24 * 7

const getIsStandalone = () => {
  if (typeof window === "undefined") return false
  const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches
}

const getIsMobile = () => {
  if (typeof window === "undefined") return false
  return window.matchMedia("(max-width: 1024px)").matches
}

const getIsIosSafari = () => {
  if (typeof window === "undefined") return false
  const ua = window.navigator.userAgent.toLowerCase()
  const isIos = /iphone|ipad|ipod/.test(ua)
  const isSafari = /safari/.test(ua) && !/crios|fxios|edgios|chrome|android/.test(ua)
  return isIos && isSafari
}

const wasRecentlyDismissed = () => {
  if (typeof window === "undefined") return false
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = Number(raw)
    if (!Number.isFinite(ts)) return false
    return Date.now() - ts < DISMISS_WINDOW_MS
  } catch {
    return false
  }
}

const markDismissed = () => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    // No-op if storage is blocked.
  }
}

export default function PwaInstallPrompt() {
  const pathname = usePathname()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosHint, setShowIosHint] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (getIsStandalone() || wasRecentlyDismissed() || !getIsMobile()) return

    const canShowIosHint = getIsIosSafari()
    if (canShowIosHint) {
      setShowIosHint(true)
      setIsVisible(true)
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
      setIsVisible(true)
      setShowIosHint(false)
    }

    const handleAppInstalled = () => {
      setIsVisible(false)
      setDeferredPrompt(null)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [])

  const dismissPrompt = () => {
    markDismissed()
    setIsVisible(false)
    setDeferredPrompt(null)
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return
    try {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      if (choice?.outcome === "accepted" || choice?.outcome === "dismissed") {
        markDismissed()
        setIsVisible(false)
      }
    } catch {
      // Keep prompt available if install flow fails.
    } finally {
      setDeferredPrompt(null)
    }
  }

  if (!isVisible || getIsStandalone()) return null

  const dashboardOffset = pathname?.startsWith("/dashboard")
  const showInstallAction = Boolean(deferredPrompt)

  return (
    <div
      className={cn(
        "fixed inset-x-0 z-[85] px-3",
        dashboardOffset ? "bottom-[calc(5.2rem+env(safe-area-inset-bottom))]" : "bottom-0",
      )}
    >
      <div className="mx-auto mb-[calc(0.65rem+env(safe-area-inset-bottom))] w-full max-w-md rounded-2xl border border-emerald-200 bg-white/95 p-3 shadow-[0_18px_36px_-24px_rgba(5,150,105,0.55)] backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Install FarmFlow on your phone</p>
            <p className="text-xs text-muted-foreground">
              {showInstallAction
                ? "Use the app with full-screen access and faster launch from home screen."
                : "On iPhone Safari: tap Share, then Add to Home Screen."}
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss install prompt"
            onClick={dismissPrompt}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted/50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          {showInstallAction ? (
            <>
              <Button onClick={handleInstall} className="h-10 flex-1 bg-emerald-700 hover:bg-emerald-800">
                <Download className="mr-1.5 h-4 w-4" />
                Install App
              </Button>
              <Button variant="outline" className="h-10" onClick={dismissPrompt}>
                Later
              </Button>
            </>
          ) : showIosHint ? (
            <Button variant="outline" className="h-10 w-full" onClick={dismissPrompt}>
              Got it
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
