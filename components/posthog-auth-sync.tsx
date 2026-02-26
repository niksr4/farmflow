"use client"

import { useEffect, useRef } from "react"
import posthog from "posthog-js"
import { useAuth } from "@/hooks/use-auth"
import { usePathname } from "next/navigation"

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST
let posthogInitialized = false

function ensurePosthogInitialized() {
  if (posthogInitialized) return
  if (!posthogKey || !posthogHost) return

  const loaded = Boolean((posthog as any).__loaded)
  if (!loaded) {
    const uiHost = posthogHost.includes("eu.") ? "https://eu.posthog.com" : "https://app.posthog.com"
    posthog.init(posthogKey, {
      api_host: "/ingest",
      ui_host: uiHost,
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
      debug: process.env.NODE_ENV === "development",
    })
  }

  posthogInitialized = true
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
      mfa_enabled: Boolean(user.mfaEnabled),
      mfa_verified: Boolean(user.mfaVerified),
    })
    posthog.group("tenant", tenantId, { tenant_id: tenantId })

    lastDistinctIdRef.current = distinctId
  }, [status, user])

  useEffect(() => {
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
