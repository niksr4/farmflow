"use client"

import { useEffect, useRef } from "react"
import posthog from "posthog-js"
import { useAuth } from "@/hooks/use-auth"
import { usePathname, useSearchParams } from "next/navigation"

function getDistinctId(username: string, tenantId: string) {
  return `${tenantId || "global"}:${username}`
}

export default function PostHogAuthSync() {
  const { user, status } = useAuth()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const lastDistinctIdRef = useRef<string | null>(null)
  const lastPageviewUrlRef = useRef<string | null>(null)

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
    const query = searchParams?.toString()
    const url = query ? `${pathname}?${query}` : pathname
    if (!url || lastPageviewUrlRef.current === url) return

    posthog.capture("$pageview", {
      $current_url: window.location.href,
      pathname,
      query: query || "",
      tenant_id: user?.tenantId || "global",
      role: user?.role || "anonymous",
    })
    lastPageviewUrlRef.current = url
  }, [pathname, searchParams, user?.role, user?.tenantId])

  return null
}
