"use client"

import { useEffect, useRef } from "react"
import posthog from "posthog-js"
import { useAuth } from "@/hooks/use-auth"

function getDistinctId(username: string, tenantId: string) {
  return `${tenantId || "global"}:${username}`
}

export default function PostHogAuthSync() {
  const { user, status } = useAuth()
  const lastDistinctIdRef = useRef<string | null>(null)

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

  return null
}
