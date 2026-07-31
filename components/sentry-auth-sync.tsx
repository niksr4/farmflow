"use client"

import { useEffect, useRef } from "react"
import * as Sentry from "@sentry/nextjs"
import { useAuth } from "@/hooks/use-auth"

/**
 * Attaches the signed-in identity to the Sentry scope.
 *
 * Without this, browser issues arrive with no indication of which estate hit them. In a
 * multi-tenant product that is the difference between "one tenant has a broken data shape"
 * and "the app is broken for everyone" — and you cannot tell them apart from the stack trace.
 * `tenant_id` is set as a tag (not just context) so it is searchable and can be used to build
 * per-tenant filters and alerts in the Sentry UI.
 *
 * Deliberately no email or personal detail: username, role and tenant are enough to triage,
 * and lib/redaction.ts strips addresses out of message bodies for the same reason.
 */
export default function SentryAuthSync() {
  const { user, status } = useAuth()
  const lastIdentityRef = useRef<string | null>(null)

  useEffect(() => {
    if (status === "loading") return

    if (!user) {
      if (lastIdentityRef.current !== null) {
        Sentry.setUser(null)
        Sentry.setTag("tenant_id", undefined)
        Sentry.setTag("user_role", undefined)
        lastIdentityRef.current = null
      }
      return
    }

    const tenantId = user.tenantId || "global"
    // The client session carries no user id, so identity is tenant-scoped username — the
    // same distinct-id convention posthog-auth-sync.tsx uses, which keeps a Sentry issue and
    // a PostHog session cross-referenceable by eye.
    const identity = `${tenantId}:${user.username}`
    if (lastIdentityRef.current === identity) return

    Sentry.setUser({ id: identity, username: user.username })
    Sentry.setTag("tenant_id", tenantId)
    Sentry.setTag("user_role", user.role)
    lastIdentityRef.current = identity
  }, [status, user])

  return null
}
