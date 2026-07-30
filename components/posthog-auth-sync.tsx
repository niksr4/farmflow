"use client"

import { useEffect, useRef } from "react"
import posthog from "posthog-js"
import { useAuth } from "@/hooks/use-auth"
import { usePathname } from "next/navigation"

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST
const posthogAllowLocal = process.env.NEXT_PUBLIC_POSTHOG_ALLOW_LOCAL === "true"

function isLocalHost(hostname: string) {
  const normalized = String(hostname || "").toLowerCase()
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "[::1]" || normalized.endsWith(".local")
}

/**
 * PostHog is initialised in instrumentation-client.ts — the Next.js 15.3+ client hook, which runs
 * before this component mounts. This file used to call posthog.init() again with a near-identical
 * config; the __loaded guard stopped a double-init, but the two copies could drift, and the copy
 * here was already missing the before_send filter that drops known-noisy browser exceptions.
 * So this only reports whether the real init took effect.
 */
function isPosthogConfigured() {
  if (!posthogKey || !posthogHost) return false
  if (typeof window === "undefined") return false
  if (isLocalHost(window.location.hostname) && !posthogAllowLocal) return false
  return Boolean((posthog as any).__loaded)
}

function isPosthogActive() {
  return isPosthogConfigured()
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
