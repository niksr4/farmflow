"use client"

import { useEffect, useRef } from "react"
import posthog from "posthog-js"
import { useAuth } from "@/hooks/use-auth"
import { usePathname } from "next/navigation"

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST
const posthogDebug = process.env.NEXT_PUBLIC_POSTHOG_DEBUG === "true"
const posthogAllowLocal = process.env.NEXT_PUBLIC_POSTHOG_ALLOW_LOCAL === "true"
let posthogInitialized = false
let posthogEnabled = false

function isLocalHost(hostname: string) {
  const normalized = String(hostname || "").toLowerCase()
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]" || normalized.endsWith(".local")
}

function resolveUiHost(host: string) {
  return host.includes("eu.") ? "https://eu.posthog.com" : "https://app.posthog.com"
}

function resolveApiHost(host: string) {
  if (typeof window !== "undefined" && isLocalHost(window.location.hostname)) {
    return host
  }
  return "/ingest"
}

function ensurePosthogInitialized() {
  if (posthogInitialized) return posthogEnabled
  posthogInitialized = true

  if (!posthogKey || !posthogHost) {
    posthogEnabled = false
    return false
  }

  if (typeof window !== "undefined" && isLocalHost(window.location.hostname) && !posthogAllowLocal) {
    posthogEnabled = false
    return false
  }

  const loaded = Boolean((posthog as any).__loaded)
  if (!loaded) {
    posthog.init(posthogKey, {
      api_host: resolveApiHost(posthogHost),
      ui_host: resolveUiHost(posthogHost),
      defaults: "2026-01-30",
      capture_pageview: false,
      capture_pageleave: "if_capture_pageview",
      autocapture: true,
      capture_exceptions: true,
      person_profiles: "identified_only",
      session_recording: {
        maskAllInputs: true,
        maskInputOptions: {
          password: true,
        },
        maskTextClass: "ph-mask",
        blockClass: "ph-no-capture",
      },
      debug: posthogDebug,
    })
  }

  posthogEnabled = true
  return true
}

function isPosthogActive() {
  return posthogEnabled
}

function getDistinctId(username: string, tenantId: string) {
  return `${tenantId || "global"}:${username}`
}

export default function PostHogAuthSync() {
  const { user, status } = useAuth()
  const pathname = usePathname()
  const lastDistinctIdRef = useRef<string | null>(null)
  const lastPageviewUrlRef = useRef<string | null>(null)

  useEffect(() => {
    ensurePosthogInitialized()
  }, [])

  useEffect(() => {
    if (!isPosthogActive()) return
    if (status === "loading") return

    if (!user) {
      if (lastDistinctIdRef.current) {
        posthog.reset()
        lastDistinctIdRef.current = null
      }
      return
    }

    const tenantId = user.tenantId || "global"
    const distinctId = getDistinctId(user.username, tenantId)

    if (lastDistinctIdRef.current === distinctId) return

    posthog.identify(distinctId, {
      username: user.username,
      role: user.role,
      tenant_id: tenantId,
    })
    posthog.group("tenant", tenantId, { tenant_id: tenantId })

    lastDistinctIdRef.current = distinctId
  }, [status, user])

  useEffect(() => {
    if (!isPosthogActive()) return
    if (typeof window === "undefined") return

    const capturePageview = () => {
      const currentPathname = window.location.pathname || pathname
      const query = window.location.search.startsWith("?") ? window.location.search.slice(1) : window.location.search
      const url = query ? `${currentPathname}?${query}` : currentPathname
      if (!url || lastPageviewUrlRef.current === url) return

      posthog.capture("$pageview", {
        $current_url: window.location.href,
        pathname: currentPathname,
        query,
        tenant_id: user?.tenantId || "global",
        role: user?.role || "anonymous",
      })
      lastPageviewUrlRef.current = url
    }

    const originalPushState = window.history.pushState.bind(window.history)
    const originalReplaceState = window.history.replaceState.bind(window.history)

    window.history.pushState = ((data: any, unused: string, url?: string | URL | null) => {
      const result = originalPushState(data, unused, url)
      capturePageview()
      return result
    }) as History["pushState"]

    window.history.replaceState = ((data: any, unused: string, url?: string | URL | null) => {
      const result = originalReplaceState(data, unused, url)
      capturePageview()
      return result
    }) as History["replaceState"]

    const onPopState = () => capturePageview()
    window.addEventListener("popstate", onPopState)

    capturePageview()

    return () => {
      window.history.pushState = originalPushState
      window.history.replaceState = originalReplaceState
      window.removeEventListener("popstate", onPopState)
    }
  }, [pathname, user?.role, user?.tenantId])

  return null
}
