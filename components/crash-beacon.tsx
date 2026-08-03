"use client"

import { useEffect, useRef } from "react"
import * as Sentry from "@sentry/nextjs"
import posthog from "posthog-js"

import { useAuth } from "@/hooks/use-auth"

import {
  CRASH_BEACON_STORAGE_KEY,
  HEARTBEAT_INTERVAL_MS,
  buildCrashReport,
  classifySession,
  parseRecords,
  pruneRecords,
  type SessionRecord,
} from "@/lib/crash-beacon"

/**
 * Records a heartbeat for the current page session and, on startup, reports any previous
 * session that stopped beating in the foreground without a clean teardown.
 *
 * See lib/crash-beacon.ts for why this exists — in short, a process kill cannot be observed
 * from inside the process, so it has to be detected on the following load.
 *
 * Everything here is defensive: storage can be unavailable (Safari private mode, quota
 * exhaustion), and a reporter that throws is strictly worse than no reporter at all.
 */

const APP_VERSION = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? null

/** Don't write to storage on every tap during a burst; once a second is plenty. */
const INTERACTION_FLUSH_INTERVAL_MS = 1_000

const newSessionId = (): string => {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID()
    }
  } catch {
    // fall through
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const readMemory = (): { usedHeapMb: number | null; heapLimitMb: number | null } => {
  try {
    // Chromium-only. Absent on iOS Safari, which is exactly where we want it — but when it
    // is present it tells us whether we died near the heap ceiling.
    const memory = (performance as any)?.memory
    if (!memory) return { usedHeapMb: null, heapLimitMb: null }
    return {
      usedHeapMb: Math.round(memory.usedJSHeapSize / 1_048_576),
      heapLimitMb: Math.round(memory.jsHeapSizeLimit / 1_048_576),
    }
  } catch {
    return { usedHeapMb: null, heapLimitMb: null }
  }
}

const safeRead = (): SessionRecord[] => {
  try {
    return parseRecords(window.localStorage.getItem(CRASH_BEACON_STORAGE_KEY))
  } catch {
    return []
  }
}

const safeWrite = (records: SessionRecord[]): void => {
  try {
    window.localStorage.setItem(CRASH_BEACON_STORAGE_KEY, JSON.stringify(records))
  } catch {
    // Storage unavailable or full — degrade to no crash detection rather than break the app.
  }
}

function reportCrashedSessions(current: SessionRecord, now: number): SessionRecord[] {
  const records = safeRead()
  const survivors: SessionRecord[] = []

  for (const record of records) {
    if (record.id === current.id) continue

    const outcome = classifySession(record, now)

    if (outcome === "crashed") {
      const report = buildCrashReport(record, now)
      // Two independent transports on purpose. The bug that hid these in the first place was
      // a blocked transport; if one is blocked or sampled away, the other still lands.
      try {
        Sentry.captureMessage("PWA session ended without teardown (suspected crash)", {
          level: "error",
          tags: {
            crash_beacon: "true",
            burst_suspected: String(report.burstSuspected),
            // A tag, not just context, so crashes are searchable and alertable per tenant —
            // the same reason toSessionUser tags tenant_id server-side. Taken from the DEAD
            // session, never the current one: this fires on the next load, which is usually
            // the logged-out landing page, and on a shared device would otherwise attribute
            // the crash to whoever logged in next.
            tenant_id: report.tenantId ?? "unknown",
          },
          user: report.username
            ? { id: `${report.tenantId ?? "global"}:${report.username}`, username: report.username }
            : undefined,
          contexts: { crash_beacon: report },
        })
      } catch {
        // never let the reporter throw
      }
      try {
        posthog.capture("app_crash_detected", report)
      } catch {
        // never let the reporter throw
      }
      // Reported — drop it so it is not reported again on the next load.
      continue
    }

    // "active" records belong to other live tabs; keep them. "clean" and "backgrounded"
    // are uninteresting and get pruned by age.
    if (outcome === "active") survivors.push(record)
  }

  return survivors
}

export default function CrashBeacon() {
  const { user } = useAuth()

  /**
   * Auth is read through a ref, never through the lifecycle effect's dependency array.
   *
   * That effect must keep `[]` deps: its cleanup marks the session `closedAt` (a clean
   * teardown). If it re-ran whenever auth resolved — which it does on every single load, a
   * moment after mount — each session would be closed and replaced within the first second,
   * so no session would ever be left open long enough to look stale. That would silently
   * disable crash detection altogether, which is a strictly worse outcome than the missing
   * attribution this change exists to fix.
   */
  const authRef = useRef<{ tenantId: string | null; username: string | null }>({
    tenantId: null,
    username: null,
  })

  useEffect(() => {
    authRef.current = {
      tenantId: user?.tenantId || null,
      username: user?.username || null,
    }
  }, [user])

  useEffect(() => {
    if (typeof window === "undefined") return

    const now = Date.now()
    const session: SessionRecord = {
      id: newSessionId(),
      startedAt: now,
      lastSeenAt: now,
      visibility: document.visibilityState === "hidden" ? "hidden" : "visible",
      closedAt: null,
      url: window.location.pathname,
      interactions: 0,
      lastInteractionAt: null,
      ...readMemory(),
      appVersion: APP_VERSION,
      // Null at mount — the session hook has not resolved yet. Every flush refreshes these, so
      // a session is attributed within a heartbeat of login and long before it could go stale.
      tenantId: authRef.current.tenantId,
      username: authRef.current.username,
    }

    // Report anything left over from a previous session before we start our own.
    const survivors = reportCrashedSessions(session, now)
    safeWrite(pruneRecords([...survivors, session], now))

    let lastFlushedAt = now

    const flush = () => {
      session.lastSeenAt = Date.now()
      const memory = readMemory()
      session.usedHeapMb = memory.usedHeapMb
      session.heapLimitMb = memory.heapLimitMb
      session.url = window.location.pathname
      session.tenantId = authRef.current.tenantId
      session.username = authRef.current.username

      const others = safeRead().filter((record) => record.id !== session.id)
      safeWrite(pruneRecords([...others, { ...session }], session.lastSeenAt))
      lastFlushedAt = session.lastSeenAt
    }

    const handleInteraction = () => {
      session.interactions += 1
      session.lastInteractionAt = Date.now()
      // Throttled: during a burst we want the count to survive the crash, but not at the
      // cost of a synchronous storage write per tap.
      if (Date.now() - lastFlushedAt >= INTERACTION_FLUSH_INTERVAL_MS) flush()
    }

    const handleVisibilityChange = () => {
      session.visibility = document.visibilityState === "hidden" ? "hidden" : "visible"
      // Flush immediately: this value is the crash/backgrounded discriminator, and if the
      // process is reclaimed while hidden we need the "hidden" already committed to storage.
      flush()
    }

    const handlePageHide = () => {
      session.closedAt = Date.now()
      flush()
    }

    const handlePageShow = () => {
      // Restored from bfcache — the session is alive again after all.
      session.closedAt = null
      flush()
    }

    const interval = window.setInterval(() => {
      // No heartbeat while hidden: it wastes battery, and a gap while backgrounded is
      // exactly what lets us tell an OS reclaim apart from a foreground crash.
      if (document.visibilityState === "hidden") return
      flush()
    }, HEARTBEAT_INTERVAL_MS)

    window.addEventListener("pointerdown", handleInteraction, { passive: true, capture: true })
    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("pagehide", handlePageHide)
    window.addEventListener("pageshow", handlePageShow)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener("pointerdown", handleInteraction, { capture: true })
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("pagehide", handlePageHide)
      window.removeEventListener("pageshow", handlePageShow)
      // React unmount is a clean teardown (navigation away, HMR) — mark it so, or every
      // client-side navigation out of the app would look like a crash.
      session.closedAt = Date.now()
      flush()
    }
  }, [])

  return null
}
